import type { InvocationDebugData } from "@/lib/invokeResult";
import {
  snapshotManager,
  type Snapshot,
  type SnapshotDiff,
} from "@/lib/testing/snapshotManager";

const INVOCATION_SNAPSHOT_PREFIX = "invocation";

export interface SaveInvocationSnapshotInput {
  contractId: string | null;
  snapshotName: string;
  invocation: InvocationDebugData;
}

export interface InvocationSnapshotComparison {
  matches: boolean;
  diffs?: SnapshotDiff[];
  expected?: InvocationDebugData;
  received: InvocationDebugData;
}

class InvocationSnapshotManager {
  private buildTestPath(contractId: string | null, network: string): string {
    const safeContractId = contractId?.trim() ? contractId : "unknown-contract";
    return `${INVOCATION_SNAPSHOT_PREFIX}/${network}/${safeContractId}`;
  }

  async saveInvocationSnapshot(input: SaveInvocationSnapshotInput): Promise<void> {
    const testPath = this.buildTestPath(input.contractId, input.invocation.network);
    await snapshotManager.saveSnapshot(testPath, input.snapshotName, input.invocation);
  }

  async getInvocationSnapshot(
    contractId: string | null,
    network: string,
    snapshotName: string,
  ): Promise<Snapshot | null> {
    const testPath = this.buildTestPath(contractId, network);
    return snapshotManager.getSnapshot(testPath, snapshotName);
  }

  async compareInvocationSnapshot(input: SaveInvocationSnapshotInput): Promise<InvocationSnapshotComparison> {
    const testPath = this.buildTestPath(input.contractId, input.invocation.network);
    const existing = await snapshotManager.getSnapshot(testPath, input.snapshotName);
    const result = await snapshotManager.matchSnapshot(testPath, input.snapshotName, input.invocation);

    return {
      matches: result.matches,
      diffs: result.diffs,
      expected: (existing?.data ?? undefined) as InvocationDebugData | undefined,
      received: input.invocation,
    };
  }

  async listInvocationSnapshots(): Promise<Snapshot[]> {
    const snapshots = await snapshotManager.getAllSnapshots();
    return snapshots.filter((snapshot) =>
      snapshot.metadata.testPath.startsWith(INVOCATION_SNAPSHOT_PREFIX),
    );
  }
}

export const invocationSnapshotManager = new InvocationSnapshotManager();
