/**
 * invocationSnapshotVerifier.ts
 * Record-and-replay snapshot verification for contract invocations — Issue #840
 *
 * Bridges the InteractionRecorder (recorded sessions) with the SnapshotManager
 * (expected outputs) to provide automated regression testing for contract calls.
 */

import { snapshotManager, type SnapshotDiff } from "./snapshotManager";
import { interactionRecorder, type RecordingSession, type RecordedInteraction } from "./interactionRecorder";

export interface InvocationSnapshot {
  /** Unique key: "<sessionId>::<interactionId>" */
  key: string;
  sessionId: string;
  interactionId: string;
  contractId: string;
  functionName: string;
  args: string;
  /** The recorded result that serves as the expected baseline */
  expectedResult: RecordedInteraction["result"];
  createdAt: string;
}

export interface VerificationResult {
  interactionId: string;
  functionName: string;
  contractId: string;
  args: string;
  passed: boolean;
  /** Present when the replay result differs from the snapshot */
  diffs?: SnapshotDiff[];
  /** The actual result from the replay */
  actualResult?: RecordedInteraction["result"];
  /** The expected result from the snapshot */
  expectedResult?: RecordedInteraction["result"];
  error?: string;
}

export interface SessionVerificationReport {
  sessionId: string;
  sessionName: string;
  totalInteractions: number;
  passed: number;
  failed: number;
  errors: number;
  results: VerificationResult[];
  ranAt: string;
}

const SNAPSHOT_PATH_PREFIX = "invocation-snapshots";

function makeSnapshotPath(sessionId: string): string {
  return `${SNAPSHOT_PATH_PREFIX}/${sessionId}`;
}

function makeSnapshotName(interaction: RecordedInteraction): string {
  return `${interaction.functionName}(${interaction.args})@${interaction.contractId.slice(0, 8)}`;
}

/**
 * Record a session's interactions as snapshot baselines.
 * Call this after a successful "golden run" to establish expected outputs.
 */
export async function recordSessionSnapshots(session: RecordingSession): Promise<number> {
  let saved = 0;
  for (const interaction of session.interactions) {
    if (!interaction.result) continue;
    const testPath = makeSnapshotPath(session.id);
    const testName = makeSnapshotName(interaction);
    await snapshotManager.saveSnapshot(testPath, testName, interaction.result);
    saved++;
  }
  return saved;
}

/**
 * Verify a replay session against previously recorded snapshots.
 * Returns a full report with per-interaction pass/fail results.
 */
export async function verifySessionAgainstSnapshots(
  replaySession: RecordingSession,
  baselineSessionId: string
): Promise<SessionVerificationReport> {
  const results: VerificationResult[] = [];
  const testPath = makeSnapshotPath(baselineSessionId);

  for (const interaction of replaySession.interactions) {
    const testName = makeSnapshotName(interaction);
    const base: VerificationResult = {
      interactionId: interaction.id,
      functionName: interaction.functionName,
      contractId: interaction.contractId,
      args: interaction.args,
      passed: false,
      actualResult: interaction.result,
    };

    try {
      const snapshot = await snapshotManager.getSnapshot(testPath, testName);
      if (!snapshot) {
        results.push({
          ...base,
          error: `No baseline snapshot found for "${testName}". Run a golden session first.`,
        });
        continue;
      }

      base.expectedResult = snapshot.data as RecordedInteraction["result"];
      const match = await snapshotManager.matchSnapshot(testPath, testName, interaction.result);

      results.push({
        ...base,
        passed: match.matches,
        diffs: match.diffs,
      });
    } catch (err) {
      results.push({
        ...base,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed && !r.error).length;
  const errors = results.filter((r) => !!r.error).length;

  return {
    sessionId: replaySession.id,
    sessionName: replaySession.name,
    totalInteractions: replaySession.interactions.length,
    passed,
    failed,
    errors,
    results,
    ranAt: new Date().toISOString(),
  };
}

/**
 * List all sessions that have snapshot baselines recorded.
 */
export async function getSessionsWithSnapshots(): Promise<string[]> {
  const allSnapshots = await snapshotManager.getAllSnapshots();
  const sessionIds = new Set<string>();
  for (const snap of allSnapshots) {
    if (snap.metadata.testPath.startsWith(SNAPSHOT_PATH_PREFIX + "/")) {
      const sessionId = snap.metadata.testPath.slice(SNAPSHOT_PATH_PREFIX.length + 1);
      sessionIds.add(sessionId);
    }
  }
  return [...sessionIds];
}

/**
 * Delete all snapshots for a given session baseline.
 */
export async function clearSessionSnapshots(sessionId: string): Promise<void> {
  const testPath = makeSnapshotPath(sessionId);
  const allSnapshots = await snapshotManager.getAllSnapshots();
  for (const snap of allSnapshots) {
    if (snap.metadata.testPath === testPath) {
      await snapshotManager.deleteSnapshot(testPath, snap.metadata.testName);
    }
  }
}

/**
 * Convenience: record the current active session as a baseline.
 */
export async function recordCurrentSessionAsBaseline(): Promise<number> {
  const session = interactionRecorder.getCurrentSession();
  if (!session) throw new Error("No active recording session");
  return recordSessionSnapshots(session);
}
