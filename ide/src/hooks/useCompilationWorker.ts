import { useCallback, useEffect, useRef } from 'react';
import { useUserSettingsStore } from '@/store/useUserSettingsStore';
import { CompilationWorker, type CompileResult } from '@/lib/compilationWorker';
import { formatTerminalChunk } from '@/utils/compileStream';
import {
  createDiagnosticsSession,
  type Diagnostic,
  type DiagnosticsSession,
} from '@/lib/diagnostics/MonacoDiagnostics';

interface CompileOptions {
  url: string;
  payload: unknown;
  /** Called for each raw output chunk; formatTerminalChunk is applied automatically. */
  onChunk: (chunk: string) => void;
  /**
   * Optional virtual contract folder name used by the diagnostics parser.
   * If omitted, diagnostics streaming is disabled.
   */
  contractName?: string;
  /**
   * Called whenever new diagnostics are parsed from the streaming output.
   * The argument is the cumulative diagnostic set for the active compile;
   * subscribers should replace, not merge.
   */
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  /**
   * Called once when the build starts so callers can clear stale markers
   * before any new diagnostics arrive. Fires synchronously before the worker
   * is invoked.
   */
  onCompileStart?: () => void;
}

interface UseCompilationWorkerResult {
  compile: (options: CompileOptions) => Promise<CompileResult>;
  cancel: () => void;
}

/**
 * Provides a stable compile/cancel interface backed by a persistent Web Worker.
 * The worker is created lazily on first use and torn down when the component
 * that owns this hook unmounts. Automatically switches between remote and local
 * compiler based on experimentalLocalBuild setting.
 */
export function useCompilationWorker(): UseCompilationWorkerResult {
  const workerRef = useRef<CompilationWorker | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const { experimentalLocalBuild } = useUserSettingsStore();

  // Lazily create the worker the first time it is needed.
  const getWorker = useCallback((): CompilationWorker => {
    if (!workerRef.current) {
      workerRef.current = new CompilationWorker(experimentalLocalBuild);
    }
    return workerRef.current;
  }, [experimentalLocalBuild]);

  // Terminate the worker when the owning component unmounts or when settings change.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Recreate worker when experimentalLocalBuild setting changes
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, [experimentalLocalBuild]);

  const compile = useCallback(
    async (options: CompileOptions): Promise<CompileResult> => {
      const id = `compile-${Date.now()}`;
      activeIdRef.current = id;

      // Always clear before starting a new build so previous markers can't
      // linger if the new build never emits any output.
      options.onCompileStart?.();

      const session: DiagnosticsSession | null = options.contractName
        ? createDiagnosticsSession({
            contractName: options.contractName,
            onDiagnostics: options.onDiagnostics,
          })
        : null;

      try {
        const result = await getWorker().compile(id, options.url, options.payload, (raw) => {
          // Feed raw (pre-CRLF) bytes to the parser; pre-CRLF preserves the
          // original line boundaries the rustc emitter used.
          session?.pushChunk(raw);
          options.onChunk(formatTerminalChunk(raw));
        });
        session?.finalize();
        return result;
      } catch (err: unknown) {
        session?.finalize();
        if (err instanceof Error && err.name === 'SRIIntegrityError') {
          options.onChunk(formatTerminalChunk(err.message + '\n'));
        }
        throw err;
      } finally {
        if (activeIdRef.current === id) {
          activeIdRef.current = null;
        }
      }
    },
    [getWorker],
  );

  const cancel = useCallback((): void => {
    const id = activeIdRef.current;
    if (id) {
      workerRef.current?.cancel(id);
    }
  }, []);

  return { compile, cancel };
}
