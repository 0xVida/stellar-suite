import { describe, bench } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import {
  filterByKeyType,
  searchEntries,
  formatScValAsJson,
  transformLedgerEntry,
  type DecodedLedgerEntry,
} from "@/lib/scvalTransformer";

// Pre-built XDR fixtures — constructed once so construction cost is excluded from bench loops
const XDR_VOID = xdr.ScVal.scvVoid().toXDR("base64");
const XDR_U32 = xdr.ScVal.scvU32(42).toXDR("base64");
const XDR_BOOL = xdr.ScVal.scvBool(true).toXDR("base64");
const XDR_SYMBOL = xdr.ScVal.scvSymbol("balance").toXDR("base64");
const XDR_STRING = xdr.ScVal.scvString("stellar-contract-storage-key").toXDR("base64");
const XDR_BYTES = xdr.ScVal.scvBytes(Buffer.alloc(32, 0xab)).toXDR("base64");

const XDR_MAP = xdr.ScVal.scvMap([
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("owner"), val: xdr.ScVal.scvU32(1) }),
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("amount"), val: xdr.ScVal.scvU32(999999) }),
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("locked"), val: xdr.ScVal.scvBool(false) }),
]).toXDR("base64");

const XDR_VEC = xdr.ScVal.scvVec([
  xdr.ScVal.scvU32(1),
  xdr.ScVal.scvU32(2),
  xdr.ScVal.scvU32(3),
  xdr.ScVal.scvU32(4),
  xdr.ScVal.scvU32(5),
]).toXDR("base64");

// Large map blob — simulates a realistic storage entry with many fields
const XDR_LARGE_MAP = xdr.ScVal.scvMap(
  Array.from({ length: 50 }, (_, i) =>
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol(`field_${i}`),
      val: xdr.ScVal.scvU32(i * 1000),
    })
  )
).toXDR("base64");

const RAW_XDR_POOL = [XDR_U32, XDR_BOOL, XDR_SYMBOL, XDR_STRING, XDR_BYTES, XDR_MAP, XDR_VEC];

function buildMockEntries(count: number): DecodedLedgerEntry[] {
  const keys: DecodedLedgerEntry["key"][] = ["u32", "bool", "symbol", "string", "bytes", "map", "vec"];
  const durs: DecodedLedgerEntry["durability"][] = ["persistent", "temporary", "instance"];

  return Array.from({ length: count }, (_, i) => ({
    key: keys[i % keys.length],
    keyValue: `storage_key_${i}_contract_state`,
    value: keys[(i + 2) % keys.length],
    valueData: `balance_${i}_amount_${(i * 1_234_567) % 1_000_000}_locked_${i % 2 === 0}`,
    rawKey: RAW_XDR_POOL[i % RAW_XDR_POOL.length],
    rawValue: RAW_XDR_POOL[(i + 1) % RAW_XDR_POOL.length],
    durability: durs[i % durs.length],
  }));
}

function diffEntries(
  prev: DecodedLedgerEntry[],
  next: DecodedLedgerEntry[],
): { added: DecodedLedgerEntry[]; removed: DecodedLedgerEntry[]; changed: DecodedLedgerEntry[] } {
  const prevMap = new Map(prev.map((e) => [e.rawKey, e]));
  const nextMap = new Map(next.map((e) => [e.rawKey, e]));
  return {
    added: next.filter((e) => !prevMap.has(e.rawKey)),
    removed: prev.filter((e) => !nextMap.has(e.rawKey)),
    changed: next.filter((e) => {
      const p = prevMap.get(e.rawKey);
      return p !== undefined && p.rawValue !== e.rawValue;
    }),
  };
}

// Fixture sets built outside benchmarks
const ENTRIES_100 = buildMockEntries(100);
const ENTRIES_1000 = buildMockEntries(1000);

// Simulate a state transition: 10% of entries change value between snapshots
const ENTRIES_1000_NEXT = ENTRIES_1000.map((e, i) =>
  i % 10 === 0 ? { ...e, rawValue: XDR_BOOL } : e,
);

describe("XDR decode — single values", () => {
  bench("formatScValAsJson void", () => {
    formatScValAsJson(XDR_VOID);
  });

  bench("formatScValAsJson u32", () => {
    formatScValAsJson(XDR_U32);
  });

  bench("formatScValAsJson symbol", () => {
    formatScValAsJson(XDR_SYMBOL);
  });

  bench("formatScValAsJson string", () => {
    formatScValAsJson(XDR_STRING);
  });

  bench("formatScValAsJson bytes (32 B)", () => {
    formatScValAsJson(XDR_BYTES);
  });

  bench("formatScValAsJson map (3 entries)", () => {
    formatScValAsJson(XDR_MAP);
  });

  bench("formatScValAsJson vec (5 elements)", () => {
    formatScValAsJson(XDR_VEC);
  });

  bench("formatScValAsJson large map (50 entries)", () => {
    formatScValAsJson(XDR_LARGE_MAP);
  });
});

describe("XDR decode — transformLedgerEntry", () => {
  bench("transformLedgerEntry u32 key + symbol val", () => {
    transformLedgerEntry({ key: XDR_U32, val: XDR_SYMBOL });
  });

  bench("transformLedgerEntry symbol key + string val", () => {
    transformLedgerEntry({ key: XDR_SYMBOL, val: XDR_STRING });
  });

  bench("transformLedgerEntry map key + bytes val", () => {
    transformLedgerEntry({ key: XDR_MAP, val: XDR_BYTES });
  });

  bench("transformLedgerEntry large map key + vec val", () => {
    transformLedgerEntry({ key: XDR_LARGE_MAP, val: XDR_VEC });
  });
});

describe("filterByKeyType — 100 entries", () => {
  bench("filter all", () => {
    filterByKeyType(ENTRIES_100, "all");
  });

  bench("filter persistent", () => {
    filterByKeyType(ENTRIES_100, "persistent");
  });

  bench("filter temporary", () => {
    filterByKeyType(ENTRIES_100, "temporary");
  });

  bench("filter instance", () => {
    filterByKeyType(ENTRIES_100, "instance");
  });
});

describe("filterByKeyType — 1 000 entries", () => {
  bench("filter all", () => {
    filterByKeyType(ENTRIES_1000, "all");
  });

  bench("filter persistent", () => {
    filterByKeyType(ENTRIES_1000, "persistent");
  });

  bench("filter temporary", () => {
    filterByKeyType(ENTRIES_1000, "temporary");
  });
});

describe("searchEntries — 100 entries", () => {
  bench("search hit (prefix match)", () => {
    searchEntries(ENTRIES_100, "storage_key_5");
  });

  bench("search miss (no match)", () => {
    searchEntries(ENTRIES_100, "zzz_nonexistent_key");
  });

  bench("search broad term (many hits)", () => {
    searchEntries(ENTRIES_100, "balance");
  });
});

describe("searchEntries — 1 000 entries", () => {
  bench("search hit (prefix match)", () => {
    searchEntries(ENTRIES_1000, "storage_key_50");
  });

  bench("search miss (no match)", () => {
    searchEntries(ENTRIES_1000, "zzz_nonexistent_key");
  });

  bench("search broad term (many hits)", () => {
    searchEntries(ENTRIES_1000, "balance");
  });
});

describe("state diff — 1 000 entries (10 % mutation)", () => {
  bench("diffEntries baseline → mutated", () => {
    diffEntries(ENTRIES_1000, ENTRIES_1000_NEXT);
  });

  bench("diffEntries identical snapshots", () => {
    diffEntries(ENTRIES_1000, ENTRIES_1000);
  });
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
