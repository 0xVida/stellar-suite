import { useEffect, useRef, useCallback } from 'react';
import type { Diagnostic, WorkerOutboundMessage } from '@/features/ide/workers/AnalysisWorker';

interface UseAnalysisWorkerOptions {
  wasmUrl: string;
  onResult: (fileUri: string, version: number, diagnostics: Diagnostic[]) => void;
  onError?: (fileUri: string, message: string) => void;
}

export function useAnalysisWorker({ wasmUrl, onResult, onError }: UseAnalysisWorkerOptions) {
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<Array<{ code: string; fileUri: string; version: number }>>([]);

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/AnalysisWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'READY':
          readyRef.current = true;
          queueRef.current.forEach((queued) => worker.postMessage({ type: 'ANALYZE', payload: queued }));
          queueRef.current = [];
          break;
        case 'ANALYSIS_RESULT':
          onResult(msg.payload.fileUri, msg.payload.version, msg.payload.diagnostics);
          break;
        case 'ANALYSIS_ERROR':
          onError?.(msg.payload.fileUri, msg.payload.message);
          break;
        case 'DISPOSED':
          break;
      }
    };

    worker.onerror = (err) => {
      onError?.('', err.message);
    };

    workerRef.current = worker;

    worker.postMessage({ type: 'INIT', payload: { wasmUrl } });

    return () => {
      worker.postMessage({ type: 'DISPOSE' });
      workerRef.current = null;
      readyRef.current = false;
    };
  }, [wasmUrl, onResult, onError]);

  const analyze = useCallback((code: string, fileUri: string, version: number) => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({ type: 'CANCEL', payload: { fileUri } });

    const payload = { code, fileUri, version };

    if (readyRef.current) {
      workerRef.current.postMessage({ type: 'ANALYZE', payload });
    } else {
      queueRef.current.push(payload);
    }
  }, []);

  const cancel = useCallback((fileUri: string) => {
    workerRef.current?.postMessage({ type: 'CANCEL', payload: { fileUri } });
  }, []);

  return { analyze, cancel };
}