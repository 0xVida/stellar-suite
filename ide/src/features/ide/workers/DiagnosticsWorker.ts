// DiagnosticsWorker.ts - Web Worker wrapper for offloading Rust diagnostics parsing

import type { Diagnostic } from "@/utils/cargoParser";
import type { ClippyLint } from "@/utils/clippyParser";

// Re-export types for worker usage
export type { Diagnostic, ClippyLint };

// Worker message types
export interface ParseDiagnosticsMessage {
  type: 'parseDiagnostics';
  output: string;
  contractName: string;
}

export interface ParseClippyMessage {
  type: 'parseClippy';
  output: string;
  contractName: string;
}

export type WorkerMessage = ParseDiagnosticsMessage | ParseClippyMessage;

export interface DiagnosticsResult {
  diagnostics: Diagnostic[];
}

export interface ClippyResult {
  diagnostics: Diagnostic[];
  lints: ClippyLint[];
}

export type WorkerResponse = DiagnosticsResult | ClippyResult | { error: string };

// Worker wrapper class
export class DiagnosticsWorker {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: WorkerResponse) => void;
    reject: (error: Error) => void;
  }>();

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    try {
      this.worker = new Worker('/workers/diagnostics.worker.js');
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        // Handle responses (worker doesn't send request IDs, so we resolve the first pending request)
        const entries = Array.from(this.pendingRequests.entries());
        if (entries.length > 0) {
          const [id, { resolve }] = entries[0];
          this.pendingRequests.delete(id);
          resolve(event.data);
        }
      };

      this.worker.onerror = (error) => {
        // Reject all pending requests on worker error
        for (const [, { reject }] of this.pendingRequests) {
          reject(new Error('Worker error: ' + error.message));
        }
        this.pendingRequests.clear();
      };
    } catch (error) {
      console.error('Failed to initialize diagnostics worker:', error);
    }
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  async parseDiagnostics(output: string, contractName = "hello_world"): Promise<Diagnostic[]> {
    if (!this.worker) {
      throw new Error('Diagnostics worker not initialized');
    }

    return new Promise<Diagnostic[]>((resolve, reject) => {
      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve: (response: WorkerResponse) => {
          if ('error' in response) {
            reject(new Error(response.error));
          } else if (isDiagnosticsResult(response)) {
            resolve(response.diagnostics);
          } else {
            reject(new Error('Unexpected response type'));
          }
        },
        reject
      });

      const message: ParseDiagnosticsMessage = {
        type: 'parseDiagnostics',
        output,
        contractName
      };

      this.worker!.postMessage(message);
    });
  }

  async parseClippy(output: string, contractName = "hello_world"): Promise<{ diagnostics: Diagnostic[]; lints: ClippyLint[] }> {
    if (!this.worker) {
      throw new Error('Diagnostics worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      this.pendingRequests.set(requestId, {
        resolve: (response: WorkerResponse) => {
          if ('error' in response) {
            reject(new Error(response.error));
          } else if (isClippyResult(response)) {
            resolve(response);
          } else {
            reject(new Error('Unexpected response type'));
          }
        },
        reject
      });

      const message: ParseClippyMessage = {
        type: 'parseClippy',
        output,
        contractName
      };

      this.worker!.postMessage(message);
    });
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      // Reject any pending requests
      for (const [, { reject }] of this.pendingRequests) {
        reject(new Error('Worker terminated'));
      }
      this.pendingRequests.clear();
    }
  }
}

// Type guard functions
export const isDiagnosticsResult = (response: WorkerResponse): response is DiagnosticsResult => {
  return 'diagnostics' in response && !('lints' in response) && !('error' in response);
};

export const isClippyResult = (response: WorkerResponse): response is ClippyResult => {
  return 'lints' in response && !('error' in response);
};

// Singleton instance
let diagnosticsWorker: DiagnosticsWorker | null = null;

export const getDiagnosticsWorker = (): DiagnosticsWorker => {
  if (!diagnosticsWorker) {
    diagnosticsWorker = new DiagnosticsWorker();
  }
  return diagnosticsWorker;
};