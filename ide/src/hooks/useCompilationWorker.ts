import { useCallback, useEffect, useRef } from 'react';
import { useUserSettingsStore } from '@/store/useUserSettingsStore';
import { CompilationWorker, type CompileResult } from '@/lib/compilationWorker';
import { formatTerminalChunk } from '@/utils/compileStream';

interface CompileOptions {
  url: string;
  payload: unknown;
  /** Called for each raw output chunk; formatTerminalChunk is applied automatically. */
  onChunk: (chunk: string) => void;
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

      try {
        return await getWorker().compile(id, options.url, options.payload, (raw) => {
          options.onChunk(formatTerminalChunk(raw));
        });
      } catch (err: any) {
        if (err.name === 'SRIIntegrityError') {
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
