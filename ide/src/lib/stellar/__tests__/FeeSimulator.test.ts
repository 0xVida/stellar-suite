/**
 * src/lib/stellar/__tests__/FeeSimulator.test.ts
 * ============================================================
 * Unit tests for the Fee Strategy Simulator — Issue #831
 * ============================================================
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeeSimulator, type FeeStats } from "../FeeSimulator";

const mockFeeStats: FeeStats = {
  last_ledger: "12345",
  last_ledger_base_fee: "100",
  ledger_capacity_usage: "0.25",
  fee_charged: {
    max: "1000",
    min: "100",
    mode: "100",
    p10: "100",
    p20: "100",
    p30: "100",
    p40: "100",
    p50: "120",
    p60: "150",
    p70: "200",
    p80: "250",
    p90: "300",
    p95: "400",
    p99: "500",
  },
  max_fee: {
    max: "5000",
    min: "100",
    mode: "100",
    p10: "100",
    p20: "100",
    p30: "100",
    p40: "100",
    p50: "200",
    p60: "300",
    p70: "500",
    p80: "800",
    p90: "1000",
    p95: "2000",
    p99: "3000",
  },
};

describe("FeeSimulator", () => {
  it("extracts percentile anchors correctly", () => {
    const simulator = new FeeSimulator(mockFeeStats);
    const anchors = simulator.getPercentileAnchors();

    expect(anchors.p10).toBe(100);
    expect(anchors.p50).toBe(120);
    expect(anchors.p75).toBe(200); // parsed from p70 or p50
    expect(anchors.p95).toBe(400);
    expect(anchors.p99).toBe(500);
    expect(anchors.baseFee).toBe(100);
  });

  it("classifies congestion correctly", () => {
    expect(FeeSimulator.classifyCongestion(0.1)).toBe("low");
    expect(FeeSimulator.classifyCongestion(0.5)).toBe("medium");
    expect(FeeSimulator.classifyCongestion(0.8)).toBe("high");
    expect(FeeSimulator.classifyCongestion(0.95)).toBe("critical");
  });

  it("simulates conservative, moderate, aggressive, and surge strategies", () => {
    const simulator = new FeeSimulator(mockFeeStats);

    const conservative = simulator.simulate("conservative");
    expect(conservative.proposedFee).toBe(120); // p50

    const moderate = simulator.simulate("moderate");
    expect(moderate.proposedFee).toBe(200); // p75

    const aggressive = simulator.simulate("aggressive");
    expect(aggressive.proposedFee).toBe(400); // p95

    const surge = simulator.simulate("surge");
    expect(surge.proposedFee).toBe(600); // p99 * 1.2
  });

  it("handles custom fee option", () => {
    const simulator = new FeeSimulator(mockFeeStats);
    const custom = simulator.simulate("custom", { maxFeeStroops: 2500 });
    expect(custom.proposedFee).toBe(2500);
  });

  it("throws error for custom strategy without required options", () => {
    const simulator = new FeeSimulator(mockFeeStats);
    expect(() => simulator.simulate("custom")).toThrow();
    expect(() => simulator.simulate("custom", { maxFeeStroops: 50 })).toThrow();
  });

  it("simulates all built-in strategies and generates report", () => {
    const simulator = new FeeSimulator(mockFeeStats);
    const report = simulator.simulateAll("testnet");

    expect(report.network).toBe("testnet");
    expect(report.congestionLevel).toBe("low");
    expect(report.results.length).toBe(4);
    expect(report.recommendation).toBe("conservative");
    expect(report.feeHistory.length).toBe(1);
  });

  it("compares two strategies side-by-side", () => {
    const simulator = new FeeSimulator(mockFeeStats);
    const comparison = simulator.compareStrategies("conservative", "aggressive");

    expect(comparison.feeDifference).toBe(280); // 400 - 120
    expect(comparison.probabilityDifference).toBeGreaterThan(0);
  });

  it("finds minimum fee needed for target probability", () => {
    const simulator = new FeeSimulator(mockFeeStats);
    const result = simulator.findMinFeeForProbability(0.9);

    expect(result.achievedProbability).toBeGreaterThanOrEqual(0.9);
    expect(result.minFee).toBeGreaterThanOrEqual(100);
  });

  it("formats fees correctly", () => {
    expect(FeeSimulator.formatFee(100)).toBe("100 stroops");
    expect(FeeSimulator.formatFee(10_000_000)).toBe("1.0000000 XLM");
  });
});
