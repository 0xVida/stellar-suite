import { create } from "zustand";
import { type NetworkKey } from "@/lib/networkConfig";
import type { SimulationComparisonData } from "@/lib/simulationDiff";

export type TransactionResultStatus = "success" | "error";
export type TransactionSource = "simulate" | "send" | "server-action" | "rpc";

export interface TransactionResultEntry {
  id: string;
  timestamp: string;
  network: NetworkKey;
  contractId: string | null;
  fnName: string;
  argsJson: string;
  status: TransactionResultStatus;
  txHash: string | null;
  resultScValBase64: string | null;
  decodedResult: unknown | null;
  errorMessage: string | null;
  durationMs?: number;
  source?: TransactionSource;
  simulationComparison?: SimulationComparisonData | null;
}

interface TransactionResultsState {
  logs: TransactionResultEntry[];
  appendLog: (entry: TransactionResultEntry) => void;
  clearLogs: () => void;
}

const MAX_LOGS = 100;

export const useTransactionResultsStore = create<TransactionResultsState>(
  (set) => ({
    logs: [],
    appendLog: (entry) =>
      set((state) => {
        const next = [...state.logs, entry];
        const trimmed =
          next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
        return { logs: trimmed };
      }),
    clearLogs: () => set({ logs: [] }),
  }),
);
