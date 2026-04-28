import { describe, expect, it } from "vitest";

import { buildSimulationComparison } from "@/lib/simulationDiff";

describe("buildSimulationComparison", () => {
  it("marks modified and added entries without drift when live state matches the simulation baseline", () => {
    const comparison = buildSimulationComparison({
      simulation: {
        stateChanges: [
          { key: "key-1", before: "entry-a", after: "entry-b" },
          { key: "key-2", before: null, after: "entry-c" },
        ],
        minResourceFee: "120",
        resourceUsage: {
          cpuInstructions: 2048,
          memoryBytes: 512,
        },
      },
      currentEntries: [
        { key: "key-1", xdr: "entry-a" },
      ],
      latestLedger: 12345,
    });

    expect(comparison.summary.total).toBe(2);
    expect(comparison.summary.modified).toBe(1);
    expect(comparison.summary.added).toBe(1);
    expect(comparison.summary.drifted).toBe(0);
    expect(comparison.warningLevel).toBe("none");
    expect(comparison.feeBreakdown.minResourceFee).toBe("120");
    expect(comparison.resourceBreakdown.cpuInstructions).toBe(2048);
  });

  it("raises a warning when live on-chain state drifted from the simulated baseline", () => {
    const comparison = buildSimulationComparison({
      simulation: {
        stateChanges: [
          { key: "key-1", before: "entry-a", after: "entry-b" },
        ],
      },
      currentEntries: [
        { key: "key-1", xdr: "entry-z" },
      ],
    });

    expect(comparison.summary.drifted).toBe(1);
    expect(comparison.warningLevel).toBe("medium");
    expect(comparison.warningText).toContain("differs");
    expect(comparison.stateChanges[0]?.driftDetected).toBe(true);
  });
});
