// ============================================================
// src/services/simulationChartDataService.ts
// Transforms SimulationResult / ResourceProfile data into
// chart-ready structures for SVG rendering.
// ============================================================

import { SimulationResult } from "./sorobanCliService";
import {
  ResourceProfile,
  ExecutionTimeBreakdown,
} from "../types/resourceProfile";

// ── Chart Data Structures ────────────────────────────────────

/** A single bar in a horizontal bar chart. */
export interface BarChartItem {
  label: string;
  value: number;
  /** Maximum possible value (used for bar width ratio). */
  max: number;
  /** Display unit, e.g. "bytes" or "instructions". */
  unit: string;
  /** CSS colour for the bar. */
  color: string;
  /** Human-readable formatted value. */
  displayValue: string;
}

/** A slice in a doughnut chart. */
export interface DoughnutSlice {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

/** A point on a sparkline. */
export interface SparklinePoint {
  x: number;
  y: number;
  label?: string;
}

// ── Theme-aware colour tokens ────────────────────────────────
// These will be used in the SVG as CSS custom property fallbacks
// so they automatically adapt to VS Code dark/light themes.

const COLORS = {
  cpu: "#4fc3f7",
  memory: "#81c784",
  storageReads: "#ffb74d",
  storageWrites: "#e57373",
  setup: "#ba68c8",
  execution: "#4fc3f7",
  storage: "#ffb74d",
  created: "#81c784",
  modified: "#ffb74d",
  deleted: "#e57373",
  unchanged: "#90a4ae",
} as const;

// ── Service ──────────────────────────────────────────────────

export class SimulationChartDataService {
  // ── Resource Usage Bar Chart ─────────────────────────────

  /**
   * Build bar-chart items from a SimulationResult.
   * Returns an empty array when no resource data exists.
   */
  static getResourceUsageBars(result: SimulationResult): BarChartItem[] {
    const ru = result.resourceUsage;
    if (!ru) {
      return [];
    }

    const items: BarChartItem[] = [];

    if (ru.cpuInstructions !== undefined) {
      items.push({
        label: "CPU Instructions",
        value: ru.cpuInstructions,
        max: ru.cpuInstructions * 1.5 || 1,
        unit: "instructions",
        color: COLORS.cpu,
        displayValue: SimulationChartDataService.formatNumber(
          ru.cpuInstructions,
        ),
      });
    }

    if (ru.memoryBytes !== undefined) {
      items.push({
        label: "Memory",
        value: ru.memoryBytes,
        max: ru.memoryBytes * 1.5 || 1,
        unit: "bytes",
        color: COLORS.memory,
        displayValue: SimulationChartDataService.formatBytes(ru.memoryBytes),
      });
    }

    return items;
  }

  // ── Resource Proportion Doughnut ─────────────────────────

  /**
   * Build a doughnut showing the relative proportion of
   * CPU vs Memory resource usage from a SimulationResult.
   * Useful as an "execution time" proxy when full timing data
   * is not available.  Returns empty for missing data.
   */
  static getResourceProportionDoughnut(
    result: SimulationResult,
  ): DoughnutSlice[] {
    const ru = result.resourceUsage;
    if (!ru) {
      return [];
    }

    const cpu = ru.cpuInstructions ?? 0;
    const mem = ru.memoryBytes ?? 0;
    const total = cpu + mem;

    if (total <= 0) {
      return [];
    }

    return [
      {
        label: `CPU (${SimulationChartDataService.formatNumber(cpu)})`,
        value: cpu,
        percentage: Math.round((cpu / total) * 1000) / 10,
        color: COLORS.cpu,
      },
      {
        label: `Memory (${SimulationChartDataService.formatBytes(mem)})`,
        value: mem,
        percentage: Math.round((mem / total) * 1000) / 10,
        color: COLORS.memory,
      },
    ].filter((s) => s.value > 0);
  }

  // ── Execution Time Breakdown (Doughnut) ──────────────────

  /**
   * Build doughnut slices from an ExecutionTimeBreakdown.
   * Returns an empty array when totalMs is 0.
   */
  static getTimeBreakdown(breakdown: ExecutionTimeBreakdown): DoughnutSlice[] {
    if (breakdown.totalMs <= 0) {
      return [];
    }

    const total = breakdown.totalMs;
    const parts: { label: string; value: number; color: string }[] = [
      { label: "Setup", value: breakdown.setupMs, color: COLORS.setup },
      {
        label: "Execution",
        value: breakdown.executionMs,
        color: COLORS.execution,
      },
      { label: "Storage", value: breakdown.storageMs, color: COLORS.storage },
    ];

    return parts
      .filter((p) => p.value > 0)
      .map((p) => ({
        label: p.label,
        value: p.value,
        percentage: Math.round((p.value / total) * 1000) / 10,
        color: p.color,
      }));
  }

  // ── State Diff Summary (Bar Chart) ───────────────────────

  /**
   * Build bar-chart items from the state diff summary.
   * Returns an empty array when no state diff exists.
   */
  static getStateDiffSummary(result: SimulationResult): BarChartItem[] {
    const sd = result.stateDiff;
    if (!sd) {
      return [];
    }

    const summary = sd.summary;
    const maxVal = Math.max(
      summary.created,
      summary.modified,
      summary.deleted,
      summary.unchanged,
      1,
    );

    const entries: { label: string; value: number; color: string }[] = [
      { label: "Created", value: summary.created, color: COLORS.created },
      { label: "Modified", value: summary.modified, color: COLORS.modified },
      { label: "Deleted", value: summary.deleted, color: COLORS.deleted },
      { label: "Unchanged", value: summary.unchanged, color: COLORS.unchanged },
    ];

    return entries.map((e) => ({
      label: e.label,
      value: e.value,
      max: maxVal,
      unit: "entries",
      color: e.color,
      displayValue: String(e.value),
    }));
  }

  // ── Resource Trend (Sparkline) ───────────────────────────

  /**
   * Build sparkline points from a list of resource profiles
   * for a given metric.
   */
  static getResourceTrend(
    profiles: ResourceProfile[],
    metric:
      | "cpuInstructions"
      | "memoryBytes"
      | "storageReads"
      | "storageWrites"
      | "executionTimeMs",
    maxPoints: number = 100,
  ): SparklinePoint[] {
    if (profiles.length === 0) {
      return [];
    }

    // Sort by creation time ascending
    const sorted = [...profiles].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    let points: SparklinePoint[] = sorted.map((p, i) => ({
      x: i,
      y: p.usage[metric],
      label: new Date(p.createdAt).toLocaleString(),
    }));

    // Downsample large datasets (bucket-based, preserves extremes)
    if (points.length > maxPoints) {
      points = SimulationChartDataService.downsample(points, maxPoints);
    }

    return points;
  }

  /**
   * Downsample an array of points to at most `target` points,
   * preserving the first, last, and per-bucket extreme values
   * so chart shape and peaks are retained.
   */
  static downsample(
    points: SparklinePoint[],
    target: number,
  ): SparklinePoint[] {
    if (points.length <= target) {
      return points;
    }

    const result: SparklinePoint[] = [points[0]]; // always keep first
    const bucketSize = (points.length - 2) / (target - 2);

    for (let i = 0; i < target - 2; i++) {
      const start = Math.floor(i * bucketSize) + 1;
      const end = Math.min(
        Math.floor((i + 1) * bucketSize) + 1,
        points.length - 1,
      );

      let minP = points[start];
      let maxP = points[start];
      for (let j = start; j < end; j++) {
        if (points[j].y < minP.y) {
          minP = points[j];
        }
        if (points[j].y > maxP.y) {
          maxP = points[j];
        }
      }

      // Keep the point with the most extreme delta from the average
      const avg = (minP.y + maxP.y) / 2;
      result.push(
        Math.abs(maxP.y - avg) >= Math.abs(minP.y - avg) ? maxP : minP,
      );
    }

    result.push(points[points.length - 1]); // always keep last
    return result;
  }

  // ── Formatting Helpers ───────────────────────────────────

  static formatNumber(n: number): string {
    if (n >= 1_000_000_000) {
      return `${(n / 1_000_000_000).toFixed(1)}B`;
    }
    if (n >= 1_000_000) {
      return `${(n / 1_000_000).toFixed(1)}M`;
    }
    if (n >= 1_000) {
      return `${(n / 1_000).toFixed(1)}K`;
    }
    return String(n);
  }

  static formatBytes(bytes: number): string {
    if (bytes >= 1_073_741_824) {
      return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    }
    if (bytes >= 1_048_576) {
      return `${(bytes / 1_048_576).toFixed(2)} MB`;
    }
    if (bytes >= 1_024) {
      return `${(bytes / 1_024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  }

  static formatMs(ms: number): string {
    if (ms >= 1_000) {
      return `${(ms / 1_000).toFixed(2)}s`;
    }
    return `${ms}ms`;
  }
}
