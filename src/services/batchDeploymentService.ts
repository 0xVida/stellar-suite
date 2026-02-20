import { ContractDeployer, DeploymentResult } from './contractDeployer';
import {
  BatchDeploymentItem,
  BatchDeploymentItemResult,
  BatchDeploymentResult,
  BatchMode,
} from '../types/batchDeployment';

export interface BatchProgressEvent {
  batchId: string;
  itemId?: string;
  message?: string;
  overall?: { done: number; total: number };
  itemStatus?: { id: string; status: BatchDeploymentItemResult['status'] };
}

// Minimal cancellation types so this works in plain Node tests AND VS Code.
export interface CancellationTokenLike {
  readonly isCancellationRequested: boolean;
  onCancellationRequested?(listener: () => void): { dispose(): void };
}

class SimpleCancellationTokenSource {
  private _isCancelled = false;
  private listeners = new Set<() => void>();

  public get token(): CancellationTokenLike {
    return {
      isCancellationRequested: this._isCancelled,
      onCancellationRequested: (listener: () => void) => {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
      },
    };
  }

  public cancel(): void {
    if (this._isCancelled) return;
    this._isCancelled = true;
    for (const l of [...this.listeners]) {
      try { l(); } catch { /* ignore */ }
    }
  }

  public dispose(): void {
    this.listeners.clear();
  }
}

export class BatchDeploymentService {
  private currentCancelSource: SimpleCancellationTokenSource | undefined;

  /** Cancel the active batch (if any). This prevents starting new items. */
  public cancelActiveBatch(): void {
    this.currentCancelSource?.cancel();
  }

  /** Runs a batch deployment. */
  public async runBatch(params: {
    batchId: string;
    mode: BatchMode;
    items: BatchDeploymentItem[];
    cliPath: string;
    source: string;
    network: string;
    concurrency?: number; // only used in parallel mode
    onProgress?: (ev: BatchProgressEvent) => void;
    cancellationToken?: CancellationTokenLike; // accepts VS Code token OR our minimal token
  }): Promise<BatchDeploymentResult> {
    const {
      batchId,
      mode,
      items,
      cliPath,
      source,
      network,
      concurrency = 3,
      onProgress,
      cancellationToken,
    } = params;

    // Internal cancellation always exists (works in Node tests).
    const internal = new SimpleCancellationTokenSource();
    this.currentCancelSource = internal;

    // If an external token is supplied (e.g. VS Code), link it.
    const externalSub = cancellationToken?.onCancellationRequested?.(() => internal.cancel());

    const startedAt = new Date().toISOString();
    const results: BatchDeploymentItemResult[] = [];
    const statusById = new Map<string, BatchDeploymentItemResult['status']>();

    const deployer = new ContractDeployer(cliPath, source, network);

    const total = items.length;
    let done = 0;

    const emit = (ev: BatchProgressEvent) => onProgress?.(ev);

    const finish = (cancelled?: boolean): BatchDeploymentResult => ({
      batchId,
      mode,
      startedAt,
      finishedAt: new Date().toISOString(),
      cancelled,
      results,
    });

    const shouldSkipForDeps = (item: BatchDeploymentItem): string | undefined => {
      const deps = item.dependsOn ?? [];
      for (const depId of deps) {
        const depStatus = statusById.get(depId);
        if (!depStatus) {
          // dependency not finished yet (or not part of this batch)
          continue;
        }
        if (depStatus === 'failed' || depStatus === 'cancelled' || depStatus === 'skipped') {
          return depId;
        }
      }
      return undefined;
    };

    const pushSkipped = (item: BatchDeploymentItem, blockingDep: string) => {
      const now = new Date().toISOString();
      const r: BatchDeploymentItemResult = {
        id: item.id,
        status: 'skipped',
        startedAt: now,
        finishedAt: now,
        error: `Skipped because dependency "${blockingDep}" did not succeed`,
        errorSummary: 'Skipped due to dependency failure',
        errorType: 'dependency',
      };
      results.push(r);
      statusById.set(item.id, r.status);
      done += 1;
      emit({ batchId, itemId: item.id, itemStatus: { id: item.id, status: r.status } });
      emit({ batchId, overall: { done, total } });
    };

    try {
      emit({ batchId, message: `Starting batch (${mode})`, overall: { done, total } });

      if (mode === 'sequential') {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          if (internal.token.isCancellationRequested) {
            // mark remaining as cancelled
            for (const remaining of items.slice(i)) {
              results.push({ id: remaining.id, status: 'cancelled' });
            }
            return finish(true);
          }

          const blockingDep = shouldSkipForDeps(item);
          if (blockingDep) {
            pushSkipped(item, blockingDep);
            continue;
          }

          const r = await this.runOneItem(deployer, item, internal.token, emit, batchId);
          results.push(r);
          statusById.set(item.id, r.status);
          done += 1;
          emit({ batchId, overall: { done, total } });
        }

        return finish(false);
      }

      // parallel: execute by dependency waves.
      const waves = this.groupIntoWaves(items);

      for (let w = 0; w < waves.length; w++) {
        const wave = waves[w];

        if (internal.token.isCancellationRequested) {
          // mark remaining as cancelled (current wave + later waves)
          for (const remainingWave of waves.slice(w)) {
            for (const remaining of remainingWave) {
              results.push({ id: remaining.id, status: 'cancelled' });
            }
          }
          return finish(true);
        }

        // Pre-skip items whose dependencies already failed/cancelled/skipped
        const runnable: BatchDeploymentItem[] = [];
        for (const item of wave) {
          const blockingDep = shouldSkipForDeps(item);
          if (blockingDep) {
            pushSkipped(item, blockingDep);
          } else {
            runnable.push(item);
          }
        }

        if (!runnable.length) {
          continue; // entire wave skipped
        }

        await this.runParallel({
          batchId,
          items: runnable,
          deployer,
          concurrency,
          token: internal.token,
          emit,
          results,
          onItemResult: (r) => statusById.set(r.id, r.status),
          onDone: () => {
            done += 1;
            emit({ batchId, overall: { done, total } });
          },
        });
      }

      return finish(internal.token.isCancellationRequested);
    } finally {
      externalSub?.dispose?.();
      internal.dispose();
      this.currentCancelSource = undefined;
    }
  }

  private async runOneItem(
    deployer: ContractDeployer,
    item: BatchDeploymentItem,
    token: CancellationTokenLike,
    emit: (ev: BatchProgressEvent) => void,
    batchId: string
  ): Promise<BatchDeploymentItemResult> {
    const startedAt = new Date().toISOString();
    emit({
      batchId,
      itemId: item.id,
      message: `Deploying ${item.name}…`,
      itemStatus: { id: item.id, status: 'running' },
    });

    if (token.isCancellationRequested) {
      return { id: item.id, status: 'cancelled', startedAt, finishedAt: new Date().toISOString() };
    }

    let result: DeploymentResult;
    try {
      const streamingOptions = {
        cancellationToken: token as any,
      };
      if (item.wasmPath) {
        result = await deployer.deployFromWasm(item.wasmPath, streamingOptions);
      } else if (item.contractDir) {
        result = await deployer.buildAndDeploy(item.contractDir, streamingOptions);
      } else {
        return {
          id: item.id,
          status: 'failed',
          startedAt,
          finishedAt: new Date().toISOString(),
          error: 'Invalid batch item: missing contractDir/wasmPath',
          errorSummary: 'Batch item validation error',
          errorType: 'validation',
        };
      }
    } catch (err) {
      return {
        id: item.id,
        status: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        errorSummary: 'Unhandled exception during deployment',
        errorType: 'execution',
      };
    }

    const finishedAt = new Date().toISOString();

    if (!result.success) {
      emit({ batchId, itemId: item.id, itemStatus: { id: item.id, status: 'failed' } });
      return {
        id: item.id,
        status: token.isCancellationRequested ? 'cancelled' : 'failed',
        startedAt,
        finishedAt,
        error: result.error,
        errorSummary: result.errorSummary,
        errorType: result.errorType,
        errorCode: result.errorCode,
        errorSuggestions: result.errorSuggestions,
        rawError: result.rawError,
        buildOutput: result.buildOutput,
        deployOutput: result.deployOutput,
      };
    }

    emit({ batchId, itemId: item.id, itemStatus: { id: item.id, status: 'succeeded' } });
    return {
      id: item.id,
      status: 'succeeded',
      startedAt,
      finishedAt,
      contractId: result.contractId,
      transactionHash: result.transactionHash,
      buildOutput: result.buildOutput,
      deployOutput: result.deployOutput,
    };
  }

  private async runParallel(params: {
    batchId: string;
    items: BatchDeploymentItem[];
    deployer: ContractDeployer;
    concurrency: number;
    token: CancellationTokenLike;
    emit: (ev: BatchProgressEvent) => void;
    results: BatchDeploymentItemResult[];
    onItemResult: (r: BatchDeploymentItemResult) => void;
    onDone: () => void;
  }): Promise<void> {
    const { batchId, items, deployer, concurrency, token, emit, results, onItemResult, onDone } = params;

    // simple worker pool
    let idx = 0;
    const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
      while (true) {
        if (token.isCancellationRequested) { return; }
        const my = idx++;
        if (my >= items.length) { return; }

        const item = items[my];
        const r = await this.runOneItem(deployer, item, token, emit, batchId);
        results.push(r);
        onItemResult(r);
        onDone();
      }
    });

    await Promise.all(workers);
  }

  /**
   * Group items into dependency “waves”.
   * Wave 0: items with no dependsOn or dependsOn not in batch
   * Wave 1+: items whose deps are in earlier waves
   * Cycles: if a cycle exists, we still place remaining items in a final wave.
   */
  private groupIntoWaves(items: BatchDeploymentItem[]): BatchDeploymentItem[][] {
    const byId = new Map(items.map(i => [i.id, i]));
    const remaining = new Set(items.map(i => i.id));
    const waves: BatchDeploymentItem[][] = [];

    while (remaining.size) {
      const wave: BatchDeploymentItem[] = [];
      for (const id of [...remaining]) {
        const item = byId.get(id)!;
        const deps = (item.dependsOn ?? []).filter(d => byId.has(d)); // only deps within batch
        const depsRemaining = deps.some(d => remaining.has(d));
        if (!depsRemaining) {
          wave.push(item);
        }
      }

      if (!wave.length) {
        // cycle or unresolved deps — dump remaining as last wave (they will be skipped if deps fail)
        waves.push([...remaining].map(id => byId.get(id)!));
        break;
      }

      for (const it of wave) remaining.delete(it.id);
      waves.push(wave);
    }

    return waves;
  }
}
