import { z } from "zod";
import { idbStorage } from "@/utils/idbStorage";

const STORAGE_RECOVERY_EVENT = "stellar-suite:workspace-storage-recovered";

const tabInfoSchema = z.object({
  path: z.array(z.string()),
  name: z.string(),
});

interface PersistedFileNode {
  name: string;
  type: "file" | "folder";
  children?: PersistedFileNode[];
  content?: string;
  language?: string;
}

const fileNodeSchema: z.ZodType<PersistedFileNode> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    type: z.enum(["file", "folder"]),
    children: z.array(fileNodeSchema).optional(),
    content: z.string().optional(),
    language: z.string().optional(),
  }),
);

const mockLedgerEntrySchema = z.object({
  id: z.string(),
  type: z.enum(["account", "contractData", "tokenBalance"]),
  key: z.string(),
  value: z.string(),
  metadata: z.record(z.string()).optional(),
});

const persistedWorkspaceStateSchema = z
  .object({
    network: z.enum(["testnet", "futurenet", "mainnet", "local"]).optional(),
    customRpcUrl: z.string().optional(),
    customHeaders: z.record(z.string()).optional(),
    showExplorer: z.boolean().optional(),
    showPanel: z.boolean().optional(),
    terminalExpanded: z.boolean().optional(),
    files: z.array(fileNodeSchema).optional(),
    openTabs: z.array(tabInfoSchema).optional(),
    activeTabPath: z.array(z.string()).optional(),
    mockLedgerState: z
      .object({
        entries: z.array(mockLedgerEntrySchema),
      })
      .optional(),
  })
  .passthrough();

const persistedEnvelopeSchema = z.object({
  state: persistedWorkspaceStateSchema,
  version: z.number().optional(),
});

type RecoveryReason = "parse-error" | "schema-error" | "storage-error";

function reportRecovery(reason: RecoveryReason, detail: unknown): void {
  const message =
    detail instanceof Error ? detail.message : "Workspace state was reset.";

  console.warn(
    `[workspace persistence] Ignoring invalid persisted state (${reason}): ${message}`,
  );

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(STORAGE_RECOVERY_EVENT, {
        detail: { reason, message },
      }),
    );
  }
}

async function discardCorruptState(name: string): Promise<void> {
  try {
    await idbStorage.removeItem(name);
  } catch (error) {
    console.warn("[workspace persistence] Failed to remove corrupt state.", error);
  }
}

export const safeWorkspaceStorage = {
  async getItem(name: string) {
    let raw: string | null = null;

    try {
      raw = await idbStorage.getItem(name);
    } catch (error) {
      reportRecovery("storage-error", error);
      return null;
    }

    if (raw === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      reportRecovery("parse-error", error);
      await discardCorruptState(name);
      return null;
    }

    const validation = persistedEnvelopeSchema.safeParse(parsed);
    if (!validation.success) {
      reportRecovery("schema-error", validation.error);
      await discardCorruptState(name);
      return null;
    }

    return validation.data;
  },

  async setItem(name: string, value: unknown): Promise<void> {
    await idbStorage.setItem(name, JSON.stringify(value));
  },

  async removeItem(name: string): Promise<void> {
    await idbStorage.removeItem(name);
  },
};
