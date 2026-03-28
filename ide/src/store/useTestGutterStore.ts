import { create } from "zustand";

export type TestStatus = "idle" | "running" | "passed" | "failed";

export interface TestRunResult {
  testName: string;
  status: TestStatus;
  output: string;
  durationMs?: number;
  ranAt: number;
}

interface TestGutterState {
  results: Record<string, TestRunResult>;
  running: Set<string>;
  runTest: (testName: string, filePath: string) => Promise<void>;
  clearResults: () => void;
}

export const useTestGutterStore = create<TestGutterState>((set, get) => ({
  results: {},
  running: new Set(),

  runTest: async (testName: string, filePath: string) => {
    if (get().running.has(testName)) return;

    set((s) => {
      const running = new Set(s.running);
      running.add(testName);
      return {
        running,
        results: {
          ...s.results,
          [testName]: { testName, status: "running", output: "", ranAt: Date.now() },
        },
      };
    });

    const start = Date.now();

    try {
      const res = await fetch("/api/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testName, filePath }),
      });
      const data = await res.json();
      set((s) => ({
        results: {
          ...s.results,
          [testName]: {
            testName,
            status: data.passed ? "passed" : "failed",
            output: data.output ?? "",
            durationMs: Date.now() - start,
            ranAt: Date.now(),
          },
        },
      }));
    } catch (err) {
      set((s) => ({
        results: {
          ...s.results,
          [testName]: {
            testName,
            status: "failed",
            output: String(err),
            durationMs: Date.now() - start,
            ranAt: Date.now(),
          },
        },
      }));
    } finally {
      set((s) => {
        const running = new Set(s.running);
        running.delete(testName);
        return { running };
      });
    }
  },

  clearResults: () => set({ results: {}, running: new Set() }),
}));
