import { create } from "zustand";
import { flattenWorkspaceFiles, useWorkspaceStore } from "@/store/workspaceStore";

const toCompilePath = (path: string) => {
  const parts = path.split("/");
  if (parts.length === 2 && parts[1].endsWith(".rs")) {
    return [parts[0], "src", parts[1]].join("/");
  }
  return path;
};

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

  runTest: async (testName: string, _filePath: string) => {
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
      const workspace = useWorkspaceStore.getState();
      const payloadFiles = flattenWorkspaceFiles(workspace.files).map((file) => ({
        path: toCompilePath(file.path),
        content: file.content,
      }));

      const res = await fetch("/api/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractName: workspace.activeTabPath[0] ?? workspace.files[0]?.name ?? "hello_world",
          files: payloadFiles,
          mode: "failed-only",
          failedTestNames: [testName],
        }),
      });
      const data = await res.json();
      set((s) => ({
        results: {
          ...s.results,
          [testName]: {
            testName,
            status: data.success ? "passed" : "failed",
            output: `${data.stdout ?? ""}${data.stderr ?? ""}`,
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
