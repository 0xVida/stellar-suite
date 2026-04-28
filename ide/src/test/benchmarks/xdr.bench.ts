import { bench, describe, expect } from "vitest";

import {
  decodeFromXdr,
  decodeMap,
  decodeVec,
  encodeMap,
  encodeToXdr,
  encodeVec,
} from "@/utils/XdrUtils";
import { buildSimulationComparison } from "@/lib/simulationDiff";

const createLargeMapPayload = (size: number) => {
  const payload: Record<string, unknown> = {};
  for (let i = 0; i < size; i++) {
    payload[`k_${String(i).padStart(5, "0")}`] = {
      id: i,
      active: i % 2 === 0,
      amount: i * 19,
      tag: `entry-${i}`,
    };
  }
  return payload;
};

const createLargeVecPayload = (size: number) =>
  Array.from({ length: size }, (_, i) => ({
    index: i,
    address: `GMOCK${String(i).padStart(8, "0")}`,
    balance: i * 997,
    ok: i % 3 === 0,
  }));

const createStateChanges = (size: number) =>
  Array.from({ length: size }, (_, i) => ({
    key: `key-${i}`,
    before: `entry-before-${i}`,
    after: i % 10 === 0 ? null : `entry-after-${i}`,
  }));

const mapXdrLarge = encodeMap(createLargeMapPayload(1_500));
const vecXdrLarge = encodeVec(createLargeVecPayload(2_500));
const scalarXdr = encodeToXdr({ ok: true, version: 1, label: "xdr-benchmark" }).xdrBase64;

const bigSimulationPayload = {
  stateChanges: createStateChanges(2_000),
  minResourceFee: "120000",
  estimatedFee: "140000",
  resourceUsage: {
    cpuInstructions: 125_000,
    memoryBytes: 24_000,
  },
};

const currentEntries = Array.from({ length: 2_000 }, (_, i) => ({
  key: `key-${i}`,
  xdr: `entry-before-${i}`,
}));

describe("xdr benchmark correctness", () => {
  bench("decode large map and vector are structurally valid", () => {
    const decodedMap = decodeMap(mapXdrLarge);
    const decodedVec = decodeVec(vecXdrLarge);

    expect(Object.keys(decodedMap).length).toBe(1_500);
    expect(decodedVec.length).toBe(2_500);
  });

  bench("decode scalar scval round-trip", () => {
    const decoded = decodeFromXdr(scalarXdr);
    expect(decoded.scvType).toBeDefined();
  });
});

describe("xdr parsing throughput", () => {
  bench("decodeMap on 1.5k-entry blob", () => {
    decodeMap(mapXdrLarge);
  });

  bench("decodeVec on 2.5k-entry blob", () => {
    decodeVec(vecXdrLarge);
  });

  bench("decodeFromXdr small payload repeated x200", () => {
    for (let i = 0; i < 200; i++) {
      decodeFromXdr(scalarXdr);
    }
  });
});

describe("simulation state diff throughput", () => {
  bench("buildSimulationComparison for 2k state changes", () => {
    buildSimulationComparison({
      simulation: bigSimulationPayload,
      currentEntries,
      latestLedger: 123456,
    });
  });
});

describe("regression guards", () => {
  bench(
    "decodeMap 1.5k-entry blob stays under 400ms",
    () => {
      const start = performance.now();
      decodeMap(mapXdrLarge);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(400);
    },
    { iterations: 5 },
  );

  bench(
    "state diff 2k entries stays under 600ms",
    () => {
      const start = performance.now();
      buildSimulationComparison({
        simulation: bigSimulationPayload,
        currentEntries,
        latestLedger: 123456,
      });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(600);
    },
    { iterations: 5 },
  );
});
