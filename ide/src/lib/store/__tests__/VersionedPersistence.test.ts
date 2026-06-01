/**
 * src/lib/store/__tests__/VersionedPersistence.test.ts
 * Unit tests for the versioned state serialization engine — Issue #648
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  migrateState,
  wrapSnapshot,
  parseSnapshot,
  createVersionedStorage,
  MigrationBuilder,
  VersionedPersistenceError,
  peekStoredVersion,
  type MigrationMap,
  type StorageBackend,
} from "../VersionedPersistence";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory storage backend for tests
// ─────────────────────────────────────────────────────────────────────────────

function makeMemoryStorage(): StorageBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v); },
    removeItem: (k) => { store.delete(k); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// wrapSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("wrapSnapshot", () => {
  it("wraps state in a versioned envelope", () => {
    const snap = wrapSnapshot({ foo: "bar" }, 3);
    expect(snap._version).toBe(3);
    expect(snap.state).toEqual({ foo: "bar" });
  });

  it("works with primitive state values", () => {
    expect(wrapSnapshot(42, 1)._version).toBe(1);
    expect(wrapSnapshot(null, 0).state).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("parseSnapshot", () => {
  it("parses a valid versioned JSON string", () => {
    const json = JSON.stringify({ _version: 2, state: { x: 1 } });
    const snap = parseSnapshot(json);
    expect(snap?._version).toBe(2);
    expect((snap?.state as { x: number }).x).toBe(1);
  });

  it("returns null for null input", () => {
    expect(parseSnapshot(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSnapshot("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseSnapshot("not json")).toBeNull();
  });

  it("returns null when _version is missing", () => {
    expect(parseSnapshot(JSON.stringify({ state: {} }))).toBeNull();
  });

  it("returns null when state is missing", () => {
    expect(parseSnapshot(JSON.stringify({ _version: 1 }))).toBeNull();
  });

  it("returns null when _version is not a number", () => {
    expect(parseSnapshot(JSON.stringify({ _version: "v1", state: {} }))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// migrateState
// ─────────────────────────────────────────────────────────────────────────────

describe("migrateState", () => {
  const migrations: MigrationMap = {
    2: (s: unknown) => ({ ...(s as object), b: "added-in-v2" }),
    3: (s: unknown) => ({ ...(s as object), c: "added-in-v3" }),
  };

  it("returns state unchanged when already at target version", () => {
    const result = migrateState({ a: 1 }, 3, 3, migrations);
    expect(result.stepsApplied).toBe(0);
    expect(result.state).toEqual({ a: 1 });
  });

  it("applies a single migration step", () => {
    const result = migrateState({ a: 1 }, 1, 2, migrations);
    expect(result.stepsApplied).toBe(1);
    expect((result.state as Record<string, unknown>).b).toBe("added-in-v2");
  });

  it("chains multiple migration steps in order", () => {
    const result = migrateState({ a: 1 }, 1, 3, migrations);
    expect(result.stepsApplied).toBe(2);
    const s = result.state as Record<string, unknown>;
    expect(s.b).toBe("added-in-v2");
    expect(s.c).toBe("added-in-v3");
  });

  it("throws FUTURE_VERSION if stored version > target", () => {
    expect(() => migrateState({}, 5, 3, migrations)).toThrow(VersionedPersistenceError);
    try {
      migrateState({}, 5, 3, migrations);
    } catch (e) {
      expect((e as VersionedPersistenceError).code).toBe("FUTURE_VERSION");
    }
  });

  it("throws MISSING_MIGRATION if a step is absent", () => {
    const partial: MigrationMap = { 2: migrations[2] }; // missing v3
    expect(() => migrateState({}, 1, 3, partial)).toThrow(VersionedPersistenceError);
    try {
      migrateState({}, 1, 3, partial);
    } catch (e) {
      expect((e as VersionedPersistenceError).code).toBe("MISSING_MIGRATION");
    }
  });

  it("sets the correct final version", () => {
    const result = migrateState({}, 1, 3, migrations);
    expect(result.version).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createVersionedStorage
// ─────────────────────────────────────────────────────────────────────────────

describe("createVersionedStorage", () => {
  const migrations: MigrationMap = {
    2: (s: unknown) => ({ ...(s as object), migrated: true }),
  };

  it("getItem returns null when storage is empty", async () => {
    const mem = makeMemoryStorage();
    const storage = createVersionedStorage(() => mem, 2, migrations);
    const result = await storage.getItem("key");
    expect(result).toBeNull();
  });

  it("setItem writes a versioned envelope", async () => {
    const mem = makeMemoryStorage();
    const storage = createVersionedStorage(() => mem, 2, migrations);
    await storage.setItem("key", { state: { x: 1 } });
    const raw = JSON.parse(mem.store.get("key")!) as { _version: number; state: unknown };
    expect(raw._version).toBe(2);
    expect((raw.state as { x: number }).x).toBe(1);
  });

  it("getItem retrieves and returns stored state at current version", async () => {
    const mem = makeMemoryStorage();
    const storage = createVersionedStorage<{ x: number }>(() => mem, 2, migrations);
    await storage.setItem("key", { state: { x: 99 } });
    const result = await storage.getItem("key");
    expect(result?.state.x).toBe(99);
  });

  it("getItem migrates state from older version", async () => {
    const mem = makeMemoryStorage();
    // Write v1 data directly
    mem.store.set("key", JSON.stringify({ _version: 1, state: { original: true } }));
    const onMigrate = vi.fn();
    const storage = createVersionedStorage(() => mem, 2, migrations, { onMigrate });
    const result = await storage.getItem("key");
    expect((result?.state as Record<string, unknown>).migrated).toBe(true);
    expect(onMigrate).toHaveBeenCalledWith(1, 2, "key");
  });

  it("persists migrated state back to storage so re-hydration skips migration", async () => {
    const mem = makeMemoryStorage();
    mem.store.set("key", JSON.stringify({ _version: 1, state: { x: 5 } }));
    const storage = createVersionedStorage(() => mem, 2, migrations);
    await storage.getItem("key");
    const after = JSON.parse(mem.store.get("key")!) as { _version: number; _migratedAt: string };
    expect(after._version).toBe(2);
    expect(after._migratedAt).toBeTruthy();
  });

  it("handles legacy unversioned payloads (treated as v0)", async () => {
    const mem = makeMemoryStorage();
    const legacyMigrations: MigrationMap = {
      1: (s) => ({ ...(s as object), upgraded: true }),
    };
    // Write raw JSON with no _version field (pre-versioning data)
    mem.store.set("key", JSON.stringify({ state: { legacy: true } }));
    const storage = createVersionedStorage(() => mem, 1, legacyMigrations);
    const result = await storage.getItem("key");
    // The whole legacy blob is treated as v0 state and upgraded to v1
    expect((result?.state as Record<string, unknown>).upgraded).toBe(true);
  });

  it("calls onCorrupt and returns null for truly corrupt JSON", async () => {
    const mem = makeMemoryStorage();
    mem.store.set("key", "{ this is not json");
    const onCorrupt = vi.fn();
    const storage = createVersionedStorage(() => mem, 2, {}, { onCorrupt });
    const result = await storage.getItem("key");
    expect(result).toBeNull();
    expect(onCorrupt).toHaveBeenCalled();
  });

  it("calls onCorrupt and returns null when migration is missing", async () => {
    const mem = makeMemoryStorage();
    mem.store.set("key", JSON.stringify({ _version: 1, state: {} }));
    const onCorrupt = vi.fn();
    // No migrations provided — cannot upgrade v1 → v3
    const storage = createVersionedStorage(() => mem, 3, {}, { onCorrupt });
    const result = await storage.getItem("key");
    expect(result).toBeNull();
    expect(onCorrupt).toHaveBeenCalled();
  });

  it("removeItem deletes the key from storage", async () => {
    const mem = makeMemoryStorage();
    mem.store.set("key", "data");
    const storage = createVersionedStorage(() => mem, 1, {});
    await storage.removeItem("key");
    expect(mem.store.has("key")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MigrationBuilder
// ─────────────────────────────────────────────────────────────────────────────

describe("MigrationBuilder", () => {
  it("builds a MigrationMap from chained add() calls", () => {
    const map = new MigrationBuilder()
      .add(2, (s) => ({ ...(s as object), b: 2 }))
      .add(3, (s) => ({ ...(s as object), c: 3 }))
      .build();
    expect(Object.keys(map)).toHaveLength(2);
    expect(map[2]).toBeTruthy();
    expect(map[3]).toBeTruthy();
  });

  it("migrations are correct functions", () => {
    const map = new MigrationBuilder()
      .add(2, (s) => ({ ...(s as object), added: true }))
      .build();
    const result = (map[2]({ x: 1 }) as Record<string, unknown>);
    expect(result.added).toBe(true);
    expect(result.x).toBe(1);
  });

  it("chains work end-to-end with migrateState", () => {
    const map = new MigrationBuilder()
      .add(2, (s) => ({ ...(s as object), v2: true }))
      .add(3, (s) => ({ ...(s as object), v3: true }))
      .build();
    const result = migrateState({}, 1, 3, map);
    const st = result.state as Record<string, unknown>;
    expect(st.v2).toBe(true);
    expect(st.v3).toBe(true);
  });

  it("throws if a duplicate version is added", () => {
    const builder = new MigrationBuilder().add(2, (s) => s);
    expect(() => builder.add(2, (s) => s)).toThrow(VersionedPersistenceError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// peekStoredVersion
// ─────────────────────────────────────────────────────────────────────────────

describe("peekStoredVersion", () => {
  it("returns the stored version number", async () => {
    const mem = makeMemoryStorage();
    mem.store.set("key", JSON.stringify({ _version: 4, state: {} }));
    const v = await peekStoredVersion(mem, "key");
    expect(v).toBe(4);
  });

  it("returns null when the key does not exist", async () => {
    const mem = makeMemoryStorage();
    const v = await peekStoredVersion(mem, "missing");
    expect(v).toBeNull();
  });

  it("returns null for unversioned data", async () => {
    const mem = makeMemoryStorage();
    mem.store.set("key", JSON.stringify({ state: {} }));
    const v = await peekStoredVersion(mem, "key");
    expect(v).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VersionedPersistenceError
// ─────────────────────────────────────────────────────────────────────────────

describe("VersionedPersistenceError", () => {
  it("has correct name and code", () => {
    const err = new VersionedPersistenceError("test", "CORRUPT_DATA");
    expect(err.name).toBe("VersionedPersistenceError");
    expect(err.code).toBe("CORRUPT_DATA");
    expect(err instanceof Error).toBe(true);
  });

  it("all error codes are valid", () => {
    const codes = ["FUTURE_VERSION", "MISSING_MIGRATION", "CORRUPT_DATA", "STORAGE_ERROR"] as const;
    for (const code of codes) {
      expect(new VersionedPersistenceError("msg", code).code).toBe(code);
    }
  });
});
