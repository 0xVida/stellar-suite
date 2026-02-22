// ============================================================
// src/test/simulationChartData.test.ts
// Unit tests for SimulationChartDataService and SimulationChartRenderer.
//
// Run with:  npm run test:simulation-charts
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require("assert");

import {
  SimulationChartDataService,
  BarChartItem,
  DoughnutSlice,
  SparklinePoint,
} from "../services/simulationChartDataService";

import { SimulationChartRenderer } from "../services/simulationChartRenderer";

import { SimulationResult } from "../services/sorobanCliService";
import {
  ResourceProfile,
  ExecutionTimeBreakdown,
  ResourceUsageSnapshot,
} from "../types/resourceProfile";

// ── Helpers ──────────────────────────────────────────────────

function makeSimulationResult(
  overrides: Partial<SimulationResult> = {},
): SimulationResult {
  return {
    success: true,
    result: "ok",
    resourceUsage: {
      cpuInstructions: 50_000,
      memoryBytes: 8192,
    },
    ...overrides,
  };
}

function makeStateDiffResult(): SimulationResult {
  return makeSimulationResult({
    stateDiff: {
      before: { capturedAt: new Date().toISOString(), entries: [] },
      after: { capturedAt: new Date().toISOString(), entries: [] },
      created: [
        { type: "created", key: "k1" },
        { type: "created", key: "k2" },
      ],
      modified: [
        { type: "modified", key: "k3", beforeValue: 1, afterValue: 2 },
      ],
      deleted: [],
      unchangedKeys: ["k4", "k5", "k6"],
      summary: {
        totalEntriesBefore: 4,
        totalEntriesAfter: 5,
        created: 2,
        modified: 1,
        deleted: 0,
        unchanged: 3,
        totalChanges: 3,
      },
      hasChanges: true,
    },
  });
}

function makeProfile(
  overrides: Partial<ResourceProfile> = {},
): ResourceProfile {
  return {
    id: `profile_${Date.now()}_${Math.random()}`,
    contractId: "CABC",
    functionName: "hello",
    network: "testnet",
    usage: {
      cpuInstructions: 1000,
      memoryBytes: 2048,
      storageReads: 5,
      storageWrites: 2,
      executionTimeMs: 100,
      timestamp: new Date().toISOString(),
    },
    timeBreakdown: {
      setupMs: 10,
      executionMs: 70,
      storageMs: 20,
      totalMs: 100,
    },
    warnings: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests: getResourceUsageBars ──────────────────────────────

function testResourceUsageBarsBasic() {
  const result = makeSimulationResult();
  const bars = SimulationChartDataService.getResourceUsageBars(result);

  assert.strictEqual(bars.length, 2, "should return 2 bars (CPU + memory)");

  const cpu = bars.find((b) => b.label === "CPU Instructions");
  assert.ok(cpu, "should have CPU bar");
  assert.strictEqual(cpu!.value, 50_000);
  assert.strictEqual(cpu!.unit, "instructions");
  assert.ok(cpu!.displayValue.length > 0, "should have a display value");

  const mem = bars.find((b) => b.label === "Memory");
  assert.ok(mem, "should have Memory bar");
  assert.strictEqual(mem!.value, 8192);
  assert.strictEqual(mem!.unit, "bytes");

  console.log("  [ok] getResourceUsageBars returns correct bars");
}

function testResourceUsageBarsNoData() {
  const result = makeSimulationResult({ resourceUsage: undefined });
  const bars = SimulationChartDataService.getResourceUsageBars(result);
  assert.strictEqual(bars.length, 0);
  console.log("  [ok] getResourceUsageBars returns empty for no resource data");
}

function testResourceUsageBarsPartial() {
  const result = makeSimulationResult({
    resourceUsage: { cpuInstructions: 100 },
  });
  const bars = SimulationChartDataService.getResourceUsageBars(result);
  assert.strictEqual(bars.length, 1);
  assert.strictEqual(bars[0].label, "CPU Instructions");
  console.log("  [ok] getResourceUsageBars handles partial resource data");
}

// ── Tests: getTimeBreakdown ──────────────────────────────────

function testTimeBreakdownBasic() {
  const breakdown: ExecutionTimeBreakdown = {
    setupMs: 10,
    executionMs: 70,
    storageMs: 20,
    totalMs: 100,
  };
  const slices = SimulationChartDataService.getTimeBreakdown(breakdown);

  assert.strictEqual(slices.length, 3);
  const setup = slices.find((s) => s.label === "Setup");
  assert.ok(setup);
  assert.strictEqual(setup!.value, 10);
  assert.strictEqual(setup!.percentage, 10);

  const exec = slices.find((s) => s.label === "Execution");
  assert.ok(exec);
  assert.strictEqual(exec!.percentage, 70);

  console.log("  [ok] getTimeBreakdown returns correct slices");
}

function testTimeBreakdownZeroTotal() {
  const breakdown: ExecutionTimeBreakdown = {
    setupMs: 0,
    executionMs: 0,
    storageMs: 0,
    totalMs: 0,
  };
  const slices = SimulationChartDataService.getTimeBreakdown(breakdown);
  assert.strictEqual(slices.length, 0);
  console.log("  [ok] getTimeBreakdown returns empty for zero totalMs");
}

function testTimeBreakdownSkipsZeroPhases() {
  const breakdown: ExecutionTimeBreakdown = {
    setupMs: 0,
    executionMs: 100,
    storageMs: 0,
    totalMs: 100,
  };
  const slices = SimulationChartDataService.getTimeBreakdown(breakdown);
  assert.strictEqual(slices.length, 1);
  assert.strictEqual(slices[0].label, "Execution");
  assert.strictEqual(slices[0].percentage, 100);
  console.log("  [ok] getTimeBreakdown skips zero-value phases");
}

// ── Tests: getStateDiffSummary ───────────────────────────────

function testStateDiffSummaryBasic() {
  const result = makeStateDiffResult();
  const bars = SimulationChartDataService.getStateDiffSummary(result);

  assert.strictEqual(bars.length, 4);
  const created = bars.find((b) => b.label === "Created");
  assert.ok(created);
  assert.strictEqual(created!.value, 2);

  const modified = bars.find((b) => b.label === "Modified");
  assert.ok(modified);
  assert.strictEqual(modified!.value, 1);

  const deleted = bars.find((b) => b.label === "Deleted");
  assert.ok(deleted);
  assert.strictEqual(deleted!.value, 0);

  const unchanged = bars.find((b) => b.label === "Unchanged");
  assert.ok(unchanged);
  assert.strictEqual(unchanged!.value, 3);

  console.log("  [ok] getStateDiffSummary returns correct bars");
}

function testStateDiffSummaryNoStateDiff() {
  const result = makeSimulationResult();
  const bars = SimulationChartDataService.getStateDiffSummary(result);
  assert.strictEqual(bars.length, 0);
  console.log("  [ok] getStateDiffSummary returns empty for no state diff");
}

// ── Tests: getResourceTrend ──────────────────────────────────

function testResourceTrendBasic() {
  const profiles = [
    makeProfile({
      createdAt: "2026-01-01T00:00:00Z",
      usage: {
        cpuInstructions: 100,
        memoryBytes: 1024,
        storageReads: 1,
        storageWrites: 0,
        executionTimeMs: 10,
        timestamp: "",
      },
    }),
    makeProfile({
      createdAt: "2026-01-02T00:00:00Z",
      usage: {
        cpuInstructions: 200,
        memoryBytes: 2048,
        storageReads: 2,
        storageWrites: 1,
        executionTimeMs: 20,
        timestamp: "",
      },
    }),
    makeProfile({
      createdAt: "2026-01-03T00:00:00Z",
      usage: {
        cpuInstructions: 150,
        memoryBytes: 1536,
        storageReads: 3,
        storageWrites: 2,
        executionTimeMs: 15,
        timestamp: "",
      },
    }),
  ];

  const trend = SimulationChartDataService.getResourceTrend(
    profiles,
    "cpuInstructions",
  );
  assert.strictEqual(trend.length, 3);
  assert.strictEqual(trend[0].y, 100);
  assert.strictEqual(trend[1].y, 200);
  assert.strictEqual(trend[2].y, 150);
  console.log("  [ok] getResourceTrend returns sorted points");
}

function testResourceTrendEmpty() {
  const trend = SimulationChartDataService.getResourceTrend(
    [],
    "cpuInstructions",
  );
  assert.strictEqual(trend.length, 0);
  console.log("  [ok] getResourceTrend returns empty for no profiles");
}

// ── Tests: Formatting ────────────────────────────────────────

function testFormatNumber() {
  assert.strictEqual(SimulationChartDataService.formatNumber(500), "500");
  assert.strictEqual(SimulationChartDataService.formatNumber(1500), "1.5K");
  assert.strictEqual(
    SimulationChartDataService.formatNumber(1_500_000),
    "1.5M",
  );
  assert.strictEqual(
    SimulationChartDataService.formatNumber(1_500_000_000),
    "1.5B",
  );
  console.log("  [ok] formatNumber abbreviates correctly");
}

function testFormatBytes() {
  assert.strictEqual(SimulationChartDataService.formatBytes(512), "512 B");
  assert.strictEqual(SimulationChartDataService.formatBytes(1536), "1.50 KB");
  assert.strictEqual(
    SimulationChartDataService.formatBytes(1_572_864),
    "1.50 MB",
  );
  console.log("  [ok] formatBytes formats correctly");
}

function testFormatMs() {
  assert.strictEqual(SimulationChartDataService.formatMs(100), "100ms");
  assert.strictEqual(SimulationChartDataService.formatMs(1500), "1.50s");
  console.log("  [ok] formatMs formats correctly");
}

// ── Tests: SimulationChartRenderer ───────────────────────────

function testRenderHorizontalBarChartEmpty() {
  const svg = SimulationChartRenderer.renderHorizontalBarChart([]);
  assert.strictEqual(svg, "");
  console.log(
    "  [ok] renderHorizontalBarChart returns empty string for no data",
  );
}

function testRenderHorizontalBarChartBasic() {
  const bars: BarChartItem[] = [
    {
      label: "CPU",
      value: 1000,
      max: 1500,
      unit: "instr",
      color: "#4fc3f7",
      displayValue: "1K",
    },
    {
      label: "Mem",
      value: 500,
      max: 1500,
      unit: "bytes",
      color: "#81c784",
      displayValue: "500 B",
    },
  ];
  const svg = SimulationChartRenderer.renderHorizontalBarChart(bars, {
    title: "Test",
  });

  assert.ok(svg.includes("<svg"), "should contain SVG element");
  assert.ok(svg.includes("CPU"), "should contain CPU label");
  assert.ok(svg.includes("Mem"), "should contain Mem label");
  assert.ok(svg.includes("1K"), "should contain formatted value");
  assert.ok(svg.includes("Test"), "should contain title");
  console.log("  [ok] renderHorizontalBarChart produces valid SVG");
}

function testRenderDoughnutChartEmpty() {
  const svg = SimulationChartRenderer.renderDoughnutChart([]);
  assert.strictEqual(svg, "");
  console.log("  [ok] renderDoughnutChart returns empty string for no data");
}

function testRenderDoughnutChartBasic() {
  const slices: DoughnutSlice[] = [
    { label: "Setup", value: 10, percentage: 10, color: "#ba68c8" },
    { label: "Exec", value: 90, percentage: 90, color: "#4fc3f7" },
  ];
  const svg = SimulationChartRenderer.renderDoughnutChart(slices, {
    title: "Time",
  });

  assert.ok(svg.includes("<svg"), "should contain SVG element");
  assert.ok(svg.includes("Setup"), "should contain Setup label");
  assert.ok(svg.includes("Exec"), "should contain Exec label");
  assert.ok(svg.includes("circle"), "should contain circle elements");
  console.log("  [ok] renderDoughnutChart produces valid SVG");
}

function testRenderSparklineEmpty() {
  const svg = SimulationChartRenderer.renderSparkline([]);
  assert.strictEqual(svg, "");
  console.log("  [ok] renderSparkline returns empty string for no data");
}

function testRenderSparklineSinglePoint() {
  const svg = SimulationChartRenderer.renderSparkline([{ x: 0, y: 100 }]);
  assert.strictEqual(svg, "", "needs at least 2 points");
  console.log("  [ok] renderSparkline returns empty for single point");
}

function testRenderSparklineBasic() {
  const points: SparklinePoint[] = [
    { x: 0, y: 100 },
    { x: 1, y: 200 },
    { x: 2, y: 150 },
  ];
  const svg = SimulationChartRenderer.renderSparkline(points, {
    title: "Trend",
  });

  assert.ok(svg.includes("<svg"), "should contain SVG element");
  assert.ok(svg.includes("polyline"), "should contain polyline");
  assert.ok(svg.includes("Trend"), "should contain title");
  console.log("  [ok] renderSparkline produces valid SVG");
}

// ── Tests: getResourceProportionDoughnut ─────────────────────

function testResourceProportionDoughnutBasic() {
  const result = makeSimulationResult();
  const slices =
    SimulationChartDataService.getResourceProportionDoughnut(result);
  assert.strictEqual(slices.length, 2, "should return CPU + Memory slices");
  assert.ok(slices[0].label.includes("CPU"), "first slice should be CPU");
  assert.ok(
    slices[1].label.includes("Memory"),
    "second slice should be Memory",
  );
  const totalPct = slices.reduce((sum, s) => sum + s.percentage, 0);
  assert.ok(
    totalPct > 99 && totalPct <= 100.1,
    "percentages should sum to ~100",
  );
  console.log("  [ok] getResourceProportionDoughnut returns correct slices");
}

function testResourceProportionDoughnutNoData() {
  const result = makeSimulationResult({ resourceUsage: undefined });
  const slices =
    SimulationChartDataService.getResourceProportionDoughnut(result);
  assert.strictEqual(slices.length, 0);
  console.log("  [ok] getResourceProportionDoughnut returns empty for no data");
}

// ── Tests: downsample (large dataset handling) ───────────────

function testDownsamplePreservesSmallSets() {
  const points: SparklinePoint[] = [
    { x: 0, y: 10 },
    { x: 1, y: 20 },
    { x: 2, y: 30 },
  ];
  const result = SimulationChartDataService.downsample(points, 10);
  assert.strictEqual(result.length, 3, "should not downsample small sets");
  console.log("  [ok] downsample preserves small datasets");
}

function testDownsampleReducesLargeSets() {
  const points: SparklinePoint[] = [];
  for (let i = 0; i < 500; i++) {
    points.push({ x: i, y: Math.sin(i / 10) * 100 });
  }
  const result = SimulationChartDataService.downsample(points, 50);
  assert.strictEqual(result.length, 50, "should reduce to target size");
  assert.strictEqual(result[0].x, 0, "should preserve first point");
  assert.strictEqual(
    result[result.length - 1].x,
    499,
    "should preserve last point",
  );
  console.log("  [ok] downsample reduces large datasets to target");
}

// ── Tests: Interactive SVG ───────────────────────────────────

function testBarChartHasInteractiveAttributes() {
  const bars: BarChartItem[] = [
    {
      label: "CPU",
      value: 1000,
      max: 1500,
      unit: "instr",
      color: "#4fc3f7",
      displayValue: "1K",
    },
  ];
  const svg = SimulationChartRenderer.renderHorizontalBarChart(bars);
  assert.ok(svg.includes("onmouseover"), "should have mouseover handler");
  assert.ok(svg.includes("onmouseout"), "should have mouseout handler");
  assert.ok(svg.includes("cursor:pointer"), "should have pointer cursor");
  assert.ok(svg.includes("transition:opacity"), "should have transition");
  console.log("  [ok] bar chart has interactive hover attributes");
}

function testDoughnutChartHasInteractiveAttributes() {
  const slices: DoughnutSlice[] = [
    { label: "A", value: 50, percentage: 50, color: "#4fc3f7" },
    { label: "B", value: 50, percentage: 50, color: "#81c784" },
  ];
  const svg = SimulationChartRenderer.renderDoughnutChart(slices);
  assert.ok(svg.includes("onmouseover"), "should have mouseover handler");
  assert.ok(svg.includes("onmouseout"), "should have mouseout handler");
  assert.ok(svg.includes("cursor:pointer"), "should have pointer cursor");
  console.log("  [ok] doughnut chart has interactive hover attributes");
}

// ── Test runner ──────────────────────────────────────────────

async function runAll() {
  console.log("\n=== SimulationChartDataService Tests ===\n");

  console.log("Resource Usage Bars:");
  testResourceUsageBarsBasic();
  testResourceUsageBarsNoData();
  testResourceUsageBarsPartial();

  console.log("\nResource Proportion Doughnut:");
  testResourceProportionDoughnutBasic();
  testResourceProportionDoughnutNoData();

  console.log("\nTime Breakdown:");
  testTimeBreakdownBasic();
  testTimeBreakdownZeroTotal();
  testTimeBreakdownSkipsZeroPhases();

  console.log("\nState Diff Summary:");
  testStateDiffSummaryBasic();
  testStateDiffSummaryNoStateDiff();

  console.log("\nResource Trend:");
  testResourceTrendBasic();
  testResourceTrendEmpty();

  console.log("\nLarge Dataset Handling:");
  testDownsamplePreservesSmallSets();
  testDownsampleReducesLargeSets();

  console.log("\nFormatting:");
  testFormatNumber();
  testFormatBytes();
  testFormatMs();

  console.log("\n=== SimulationChartRenderer Tests ===\n");

  console.log("Horizontal Bar Chart:");
  testRenderHorizontalBarChartEmpty();
  testRenderHorizontalBarChartBasic();
  testBarChartHasInteractiveAttributes();

  console.log("\nDoughnut Chart:");
  testRenderDoughnutChartEmpty();
  testRenderDoughnutChartBasic();
  testDoughnutChartHasInteractiveAttributes();

  console.log("\nSparkline:");
  testRenderSparklineEmpty();
  testRenderSparklineSinglePoint();
  testRenderSparklineBasic();

  console.log("\n✅ All simulation chart tests passed.\n");
}

runAll().catch((err) => {
  console.error("❌ Test failure:", err);
  process.exitCode = 1;
});
