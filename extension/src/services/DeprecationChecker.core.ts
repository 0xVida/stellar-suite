/**
 * Issue #933 — Soroban SDK deprecation: pure parsing + comparison core.
 *
 * This module deliberately has NO `vscode` import so it can be unit-tested and
 * run from a plain Node script (scripts/check-deprecation.js). The VS Code
 * diagnostic integration lives in DeprecationChecker.ts and consumes this core.
 */

/**
 * Latest known soroban-sdk version used as the offline comparison floor.
 * Bump this as the SDK advances; it is the fallback when crates.io is unreachable.
 */
export const LATEST_KNOWN_SOROBAN_SDK = '22.0.0';

/**
 * The minimum version below which we actively warn (Warning severity). Versions
 * at or above `LATEST_KNOWN` are never flagged; versions in between are surfaced
 * as informational "outdated" notices.
 */
export const DEPRECATED_BELOW_SOROBAN_SDK = '21.0.0';

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export interface SdkVersionMatch {
  /** The raw version requirement string as written in Cargo.toml, e.g. "^20.0.0". */
  raw: string;
  /** Parsed semver (caret/tilde/`=` prefixes and quotes stripped). */
  version: SemVer;
  /** 0-based line index within the manifest where the dependency was declared. */
  line: number;
  /** Column range [start, end) of the version string on that line. */
  startCol: number;
  endCol: number;
}

/** Parse a semver-ish string ("^20.1", "=20.0.3", "20") into a SemVer. */
export function parseSemVer(input: string): SemVer | null {
  const cleaned = input.trim().replace(/^[\^~=>=<\s]*/, '').replace(/['"]/g, '');
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(cleaned);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
}

/** Compare two SemVers: -1 if a<b, 0 if equal, 1 if a>b. */
export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/**
 * Locate the `soroban-sdk` dependency version in a Cargo.toml manifest.
 *
 * Handles both forms:
 *   soroban-sdk = "20.0.0"
 *   soroban-sdk = { version = "20.0.0", features = [...] }
 *
 * Returns `null` when soroban-sdk is not a dependency or has no pinned version
 * (e.g. a git/path dependency, which we cannot meaningfully compare).
 */
export function findSorobanSdkVersion(manifest: string): SdkVersionMatch | null {
  const lines = manifest.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only consider a dependency declaration line for soroban-sdk.
    if (!/^\s*"?soroban-sdk"?\s*=/.test(line)) continue;

    // Find the first quoted version string on the line.
    const versionMatch = /version\s*=\s*"([^"]+)"|=\s*"([^"]+)"/.exec(line);
    const raw = versionMatch?.[1] ?? versionMatch?.[2];
    if (!raw) return null; // git/path dependency or unparseable

    const version = parseSemVer(raw);
    if (!version) return null;

    const startCol = line.indexOf(raw);
    return {
      raw,
      version,
      line: i,
      startCol,
      endCol: startCol + raw.length,
    };
  }
  return null;
}

export type DeprecationLevel = 'ok' | 'outdated' | 'deprecated';

export interface DeprecationResult {
  level: DeprecationLevel;
  current: SemVer;
  latest: string;
  message: string;
}

/**
 * Classify a pinned soroban-sdk version against the latest known release.
 *   - `deprecated` — below DEPRECATED_BELOW_SOROBAN_SDK (Warning).
 *   - `outdated`   — below latest but not deprecated (Information).
 *   - `ok`         — at or above latest known.
 */
export function checkDeprecation(
  current: SemVer,
  latest: string = LATEST_KNOWN_SOROBAN_SDK,
): DeprecationResult {
  const latestSemVer = parseSemVer(latest)!;
  const deprecatedBelow = parseSemVer(DEPRECATED_BELOW_SOROBAN_SDK)!;
  const cur = `${current.major}.${current.minor}.${current.patch}`;

  if (compareSemVer(current, latestSemVer) >= 0) {
    return { level: 'ok', current, latest, message: `soroban-sdk ${cur} is up to date.` };
  }
  if (compareSemVer(current, deprecatedBelow) < 0) {
    return {
      level: 'deprecated',
      current,
      latest,
      message: `soroban-sdk ${cur} is deprecated. Upgrade to ${latest} for security and performance fixes.`,
    };
  }
  return {
    level: 'outdated',
    current,
    latest,
    message: `soroban-sdk ${cur} is outdated. The latest release is ${latest}.`,
  };
}

/**
 * Fetch the latest soroban-sdk version from crates.io, falling back to the
 * hardcoded {@link LATEST_KNOWN_SOROBAN_SDK} on any error (offline support).
 * `fetchImpl` is injectable for testing.
 */
export async function fetchLatestSorobanSdk(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  try {
    const res = await fetchImpl('https://crates.io/api/v1/crates/soroban-sdk', {
      headers: { Accept: 'application/json', 'User-Agent': 'stellar-suite-extension' },
    });
    if (!res.ok) return LATEST_KNOWN_SOROBAN_SDK;
    const data = (await res.json()) as { crate?: { max_stable_version?: string } };
    return data.crate?.max_stable_version ?? LATEST_KNOWN_SOROBAN_SDK;
  } catch {
    return LATEST_KNOWN_SOROBAN_SDK;
  }
}
