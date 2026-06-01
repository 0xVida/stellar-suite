/**
 * src/lib/store/VersionedPersistence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scalable State Serialization — Issue #648
 *
 * Provides a generic, versioned persistence layer that wraps any storage
 * backend (localStorage, IndexedDB, etc.) and adds:
 *
 *  1. VERSION TAGGING — every serialized snapshot carries a `_version` field
 *     so stale data is always identifiable.
 *
 *  2. MIGRATION ENGINE — a declarative chain of migration functions transforms
 *     old state forward, one version at a time, until it reaches the current
 *     schema version.
 *
 *  3. BACKWARDS COMPATIBILITY — unrecognised or corrupt data is never silently
 *     swallowed; the engine falls back to `null` (which triggers store
 *     initialisation with defaults) and fires a recoverable error event.
 *
 *  4. ZUSTAND INTEGRATION — `createVersionedStorage()` returns a drop-in
 *     replacement for `createJSONStorage(...)` so any Zustand store can opt
 *     into versioned persistence in one line.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Usage example
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   import { createVersionedStorage } from "@/lib/store/VersionedPersistence";
 *
 *   const CURRENT_VERSION = 3;
 *
 *   const migrations: MigrationMap = {
 *     // v1 → v2: rename 'rpc' to 'rpcUrl'
 *     2: (old) => ({ ...old, rpcUrl: old.rpc, rpc: undefined }),
 *     // v2 → v3: add default 'customHeaders' field
 *     3: (old) => ({ ...old, customHeaders: old.customHeaders ?? {} }),
 *   };
 *
 *   export const useMyStore = create()(
 *     persist(
 *       (set) => ({ ... }),
 *       {
 *         name: "my-store-key",
 *         storage: createVersionedStorage(
 *           () => localStorage,
 *           CURRENT_VERSION,
 *           migrations
 *         ),
 *       }
 *     )
 *   );
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single migration function.
 * Receives the raw state at the *previous* version and returns the state
 * transformed to the *target* version.
 *
 * The `unknown` input type is intentional — migrations must be defensive
 * because the incoming data may be malformed.
 */
export type MigrationFn = (state: unknown) => unknown;

/**
 * A map of version number → migration function.
 * Key `n` means "migrate state from version n-1 to version n".
 *
 * @example
 * const migrations: MigrationMap = {
 *   2: (s) => ({ ...(s as Record<string,unknown>), newField: "default" }),
 *   3: (s) => { const next = { ...(s as Record<string,unknown>) }; delete next.legacyField; return next; },
 * };
 */
export type MigrationMap = Record<number, MigrationFn>;

/**
 * The envelope written to storage.
 * `_version` is the schema version at the time of writing.
 * `state` is the partial store state (after `partialize`, if any).
 */
export interface VersionedSnapshot<T = unknown> {
  _version: number;
  state: T;
  _migratedAt?: string;  // ISO timestamp, set after a migration pass
}

/** Result returned by `migrateState` */
export interface MigrationResult<T = unknown> {
  state: T;
  /** Number of migration steps actually applied (0 = already current) */
  stepsApplied: number;
  /** Final version after migration */
  version: number;
}

/**
 * Options for `createVersionedStorage`.
 */
export interface VersionedStorageOptions {
  /**
   * Called when a migration is applied.
   * Useful for analytics / logging without coupling to a logger.
   */
  onMigrate?: (fromVersion: number, toVersion: number, key: string) => void;
  /**
   * Called when data is corrupt or unrecoverable.
   * The storage layer discards the data and returns `null`.
   */
  onCorrupt?: (reason: string, key: string, raw: unknown) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all necessary migrations to bring `state` from `fromVersion` up to
 * `targetVersion`.
 *
 * Migration functions are applied in ascending version order, so adding a
 * version 5 migration never requires touching the version 3 or 4 functions.
 *
 * @throws {VersionedPersistenceError} if a required migration step is missing
 */
export function migrateState<T = unknown>(
  state: unknown,
  fromVersion: number,
  targetVersion: number,
  migrations: MigrationMap
): MigrationResult<T> {
  if (fromVersion === targetVersion) {
    return { state: state as T, stepsApplied: 0, version: targetVersion };
  }

  if (fromVersion > targetVersion) {
    throw new VersionedPersistenceError(
      `Stored version (${fromVersion}) is newer than the current schema version (${targetVersion}). ` +
        "This usually means the app was downgraded. Clear storage to continue.",
      "FUTURE_VERSION"
    );
  }

  let current = state;
  let stepsApplied = 0;

  for (let v = fromVersion + 1; v <= targetVersion; v++) {
    const fn = migrations[v];
    if (!fn) {
      throw new VersionedPersistenceError(
        `Missing migration for version ${v}. ` +
          `Cannot migrate from v${fromVersion} to v${targetVersion}.`,
        "MISSING_MIGRATION"
      );
    }
    current = fn(current);
    stepsApplied++;
  }

  return { state: current as T, stepsApplied, version: targetVersion };
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap a state value in a versioned envelope.
 * This is what gets written to storage.
 */
export function wrapSnapshot<T>(state: T, version: number): VersionedSnapshot<T> {
  return { _version: version, state };
}

/**
 * Parse and validate a raw storage string into a `VersionedSnapshot`.
 * Returns `null` if the string is empty, invalid JSON, or missing required fields.
 */
export function parseSnapshot(raw: string | null): VersionedSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("state" in parsed) ||
      !("_version" in parsed) ||
      typeof (parsed as VersionedSnapshot)._version !== "number"
    ) {
      return null;
    }
    return parsed as VersionedSnapshot;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed error
// ─────────────────────────────────────────────────────────────────────────────

export type VersionedPersistenceErrorCode =
  | "FUTURE_VERSION"
  | "MISSING_MIGRATION"
  | "CORRUPT_DATA"
  | "STORAGE_ERROR";

export class VersionedPersistenceError extends Error {
  readonly code: VersionedPersistenceErrorCode;
  constructor(message: string, code: VersionedPersistenceErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "VersionedPersistenceError";
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage backend interface (compatible with Zustand's StateStorage)
// ─────────────────────────────────────────────────────────────────────────────

export interface StorageBackend {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zustand-compatible versioned storage factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a Zustand-compatible storage object that transparently handles
 * versioning and migrations.
 *
 * Drop this in as the `storage` option of any Zustand `persist` middleware:
 *
 * ```ts
 * persist(fn, {
 *   name: "my-key",
 *   storage: createVersionedStorage(() => localStorage, 3, migrations),
 * })
 * ```
 *
 * @param getStorage  Lazy factory returning the underlying storage backend
 * @param version     Current schema version (increment when state shape changes)
 * @param migrations  Map of version → migration function
 * @param options     Optional callbacks for migrate/corrupt events
 */
export function createVersionedStorage<T = unknown>(
  getStorage: () => StorageBackend,
  version: number,
  migrations: MigrationMap = {},
  options: VersionedStorageOptions = {}
) {
  const { onMigrate, onCorrupt } = options;

  return {
    async getItem(key: string): Promise<{ state: T; version?: number } | null> {
      let raw: string | null;
      try {
        raw = (await getStorage().getItem(key)) as string | null;
      } catch (err) {
        onCorrupt?.("storage-read-error", key, err);
        return null;
      }

      if (!raw) return null;

      // ── Detect legacy (unversioned) payloads ─────────────────────────────
      // Older stores wrote raw JSON without _version — treat them as version 0.
      let snapshot = parseSnapshot(raw);
      if (snapshot === null) {
        // Try treating the entire raw value as a pre-versioning state blob
        try {
          const legacy = JSON.parse(raw) as unknown;
          snapshot = { _version: 0, state: legacy };
        } catch {
          onCorrupt?.("corrupt-json", key, raw);
          return null;
        }
      }

      const storedVersion = snapshot._version;

      if (storedVersion === version) {
        // Already current — fast path
        return { state: snapshot.state as T, version };
      }

      // ── Run migration engine ──────────────────────────────────────────────
      try {
        const result = migrateState<T>(
          snapshot.state,
          storedVersion,
          version,
          migrations
        );

        if (result.stepsApplied > 0) {
          onMigrate?.(storedVersion, version, key);
          // Persist the migrated state immediately so a refresh doesn't re-migrate
          const upgraded: VersionedSnapshot<T> = {
            _version: version,
            state: result.state,
            _migratedAt: new Date().toISOString(),
          };
          await getStorage().setItem(key, JSON.stringify(upgraded));
        }

        return { state: result.state, version };
      } catch (err) {
        const msg =
          err instanceof VersionedPersistenceError
            ? err.message
            : "Migration failed unexpectedly.";
        onCorrupt?.(msg, key, snapshot);
        console.error("[VersionedPersistence] Migration failed:", err);
        return null;
      }
    },

    async setItem(key: string, value: { state: T; version?: number }): Promise<void> {
      const snapshot: VersionedSnapshot<T> = {
        _version: version,
        state: value.state,
      };
      await getStorage().setItem(key, JSON.stringify(snapshot));
    },

    async removeItem(key: string): Promise<void> {
      await getStorage().removeItem(key);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: migration builder DSL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fluent builder for assembling a `MigrationMap` step-by-step.
 * Ensures no version is registered twice and versions are sequential.
 *
 * @example
 * const migrations = new MigrationBuilder()
 *   .add(2, (s) => ({ ...s, newField: "default" }))
 *   .add(3, (s) => { const n = { ...s }; delete n.oldField; return n; })
 *   .build();
 */
export class MigrationBuilder {
  private readonly map: MigrationMap = {};
  private lastVersion = 1;

  /**
   * Register a migration function that upgrades state TO the given `targetVersion`.
   * Versions must be registered in ascending order.
   */
  add(targetVersion: number, fn: MigrationFn): this {
    if (targetVersion <= this.lastVersion && Object.keys(this.map).length > 0) {
      throw new VersionedPersistenceError(
        `Migration versions must be registered in ascending order. ` +
          `Got ${targetVersion} after ${this.lastVersion}.`,
        "MISSING_MIGRATION"
      );
    }
    if (this.map[targetVersion]) {
      throw new VersionedPersistenceError(
        `A migration for version ${targetVersion} is already registered.`,
        "MISSING_MIGRATION"
      );
    }
    this.map[targetVersion] = fn;
    this.lastVersion = targetVersion;
    return this;
  }

  /** Returns the assembled MigrationMap. */
  build(): MigrationMap {
    return { ...this.map };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: check if a stored key needs migration (without hydrating)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Peek at a storage key and return the stored version number,
 * or `null` if the key doesn't exist / is unversioned / is corrupt.
 */
export async function peekStoredVersion(
  storage: StorageBackend,
  key: string
): Promise<number | null> {
  try {
    const raw = (await storage.getItem(key)) as string | null;
    const snapshot = parseSnapshot(raw);
    return snapshot?._version ?? null;
  } catch {
    return null;
  }
}
