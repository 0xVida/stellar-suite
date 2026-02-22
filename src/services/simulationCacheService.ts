// src/services/simulationCacheService.ts
import * as vscode from 'vscode';
import { SimulationCacheCore } from './simulationCacheCore';
import { makeSimulationCacheKey, SimulationBackend } from './simulationCacheKey';

// IMPORTANT: we import SimulationResult from RpcService because you pasted that type.
// If your SorobanCliService exports a slightly different SimulationResult,
// we can unify later, but this works safely with your current UI usage.
import { SimulationResult } from './rpcService';

export interface CacheLookupParams {
  backend: SimulationBackend;
  contractId: string;
  functionName: string;
  args: any[];
  network?: string;
  source?: string;
  rpcUrl?: string;
}

export class SimulationCacheService {
  private static instance: SimulationCacheService | undefined;

  public static getInstance(context: vscode.ExtensionContext): SimulationCacheService {
    if (!SimulationCacheService.instance) {
      SimulationCacheService.instance = new SimulationCacheService(context);
    }
    return SimulationCacheService.instance;
  }

  private readonly context: vscode.ExtensionContext;
  private readonly core: SimulationCacheCore<SimulationResult>;
  private watcher: vscode.FileSystemWatcher | undefined;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;

    const opts = this.readOptions();
    this.core = new SimulationCacheCore<SimulationResult>(opts);

    this.setupWatcher();
    this.setupConfigListener();
  }

  public dispose(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
  }

  public readOptions() {
    const config = vscode.workspace.getConfiguration('stellarSuite');
    const enabled = config.get<boolean>('simulationCacheEnabled', true);
    const ttlSeconds = config.get<number>('simulationCacheTtlSeconds', 60);
    const maxEntries = config.get<number>('simulationCacheMaxEntries', 200);

    return {
      enabled,
      ttlMs: Math.max(0, ttlSeconds) * 1000,
      maxEntries: Math.max(0, maxEntries),
    };
  }

  public getStats() {
    const stats = this.core.getStats();
    return {
      ...stats,
      size: this.core.size(),
      options: this.core.getOptions(),
    };
  }

  public clear(): void {
    this.core.clear();
  }

  public invalidateAll(reason?: string): void {
    this.core.clear();
    if (reason) {
      // best-effort debug logging; never throw
      try {
        console.log(`[SimulationCache] invalidated all: ${reason}`);
      } catch {
        // ignore
      }
    }
  }

  public invalidateContract(contractId: string): number {
    // Our cache key always contains contractId field (stableStringify)
    return this.core.invalidateWhere(k => k.includes(`"contractId":"${contractId}"`));
  }

  public tryGet(params: CacheLookupParams): SimulationResult | undefined {
    try {
      const key = makeSimulationCacheKey(params);
      return this.core.get(key);
    } catch {
      // never block simulation
      return undefined;
    }
  }

  public set(params: CacheLookupParams, value: SimulationResult): void {
    try {
      const key = makeSimulationCacheKey(params);
      this.core.set(key, value);
    } catch {
      // never block simulation
    }
  }

  // ---- internals ----

  private setupWatcher(): void {
    // Invalidate cache when contract source/build artifacts change
    // This is a safe-but-broad invalidation strategy.
    this.watcher = vscode.workspace.createFileSystemWatcher('**/{Cargo.toml,*.wasm}');
    const invalidate = (why: string) => this.invalidateAll(why);

    this.watcher.onDidChange(() => invalidate('workspace contract file changed'));
    this.watcher.onDidCreate(() => invalidate('workspace contract file created'));
    this.watcher.onDidDelete(() => invalidate('workspace contract file deleted'));
  }

  private setupConfigListener(): void {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('stellarSuite.simulationCacheEnabled') ||
        e.affectsConfiguration('stellarSuite.simulationCacheTtlSeconds') ||
        e.affectsConfiguration('stellarSuite.simulationCacheMaxEntries')
      ) {
        const opts = this.readOptions();
        this.core.updateOptions(opts);
      }
    });
  }
}