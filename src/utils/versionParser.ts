// ============================================================
// src/utils/versionParser.ts
// Utilities for parsing, comparing, and validating semantic
// versions extracted from Cargo.toml files.
// ============================================================

/** A parsed semantic version (major.minor.patch with optional pre-release / build). */
export interface SemanticVersion {
    major: number;
    minor: number;
    patch: number;
    /** Optional pre-release label, e.g. "alpha.1" or "rc.2" */
    preRelease?: string;
    /** Optional build metadata, e.g. "20260220" */
    buildMeta?: string;
    /** Canonical string representation, e.g. "1.2.3-alpha.1+20260220" */
    raw: string;
}

/** Result of a version comparison between two SemanticVersion objects. */
export type VersionCompareResult = 'greater' | 'equal' | 'lesser';

/** Result object returned by compareVersionStrings(). */
export interface VersionComparisonDetail {
    result: VersionCompareResult;
    /** Human-readable description, e.g. "1.2.0 is greater than 1.1.0 (minor bump)". */
    description: string;
    /** Whether the major component changed. */
    majorChange: boolean;
    /** Whether the minor component changed. */
    minorChange: boolean;
    /** Whether the patch component changed. */
    patchChange: boolean;
    /** Whether it is only a pre-release change with identical core version. */
    preReleaseChange: boolean;
}

// ── Internal helpers ──────────────────────────────────────────

/** Semver-like regex.  We intentionally accept loose forms (e.g. "1.0"). */
const SEMVER_RE =
    /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** Cargo.toml `version = "x.y.z"` pattern (handles both single and double quotes). */
const CARGO_VERSION_RE = /^\s*version\s*=\s*["']([^"']+)["']/m;

/**
 * Compare two pre-release strings according to semver precedence rules.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function comparePreRelease(a: string | undefined, b: string | undefined): number {
    // No pre-release has higher precedence than any pre-release.
    if (a === undefined && b === undefined) { return 0; }
    if (a === undefined) { return 1; }   // a is release, b is pre-release → a > b
    if (b === undefined) { return -1; }  // b is release, a is pre-release → a < b

    const aParts = a.split('.');
    const bParts = b.split('.');
    const len = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < len; i++) {
        const ap = aParts[i];
        const bp = bParts[i];

        if (ap === undefined) { return -1; }
        if (bp === undefined) { return 1; }

        const aNum = /^\d+$/.test(ap) ? parseInt(ap, 10) : NaN;
        const bNum = /^\d+$/.test(bp) ? parseInt(bp, 10) : NaN;

        if (!isNaN(aNum) && !isNaN(bNum)) {
            if (aNum !== bNum) { return aNum - bNum; }
        } else if (!isNaN(aNum)) {
            return -1; // numeric < alphanumeric
        } else if (!isNaN(bNum)) {
            return 1;
        } else {
            const cmp = ap.localeCompare(bp);
            if (cmp !== 0) { return cmp; }
        }
    }

    return 0;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Parse a version string into a SemanticVersion object.
 * Returns `undefined` if the string is not a recognisable semver.
 */
export function parseVersion(raw: string): SemanticVersion | undefined {
    if (!raw || typeof raw !== 'string') { return undefined; }

    const trimmed = raw.trim();
    const match = SEMVER_RE.exec(trimmed);
    if (!match) { return undefined; }

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = match[3] !== undefined ? parseInt(match[3], 10) : 0;
    const preRelease = match[4] ?? undefined;
    const buildMeta  = match[5] ?? undefined;

    return { major, minor, patch, preRelease, buildMeta, raw: trimmed };
}

/**
 * Validate whether a string is a valid semantic version.
 */
export function isValidVersion(version: string): boolean {
    return parseVersion(version) !== undefined;
}

/**
 * Extract the version string from Cargo.toml content.
 * Returns `undefined` when the field is absent.
 */
export function extractVersionFromCargoToml(cargoContent: string): string | undefined {
    const match = CARGO_VERSION_RE.exec(cargoContent);
    return match ? match[1].trim() : undefined;
}

/**
 * Compare two SemanticVersion objects.
 * Follows semver precedence: major > minor > patch > pre-release.
 */
export function compareVersions(a: SemanticVersion, b: SemanticVersion): VersionCompareResult {
    if (a.major !== b.major) {
        return a.major > b.major ? 'greater' : 'lesser';
    }
    if (a.minor !== b.minor) {
        return a.minor > b.minor ? 'greater' : 'lesser';
    }
    if (a.patch !== b.patch) {
        return a.patch > b.patch ? 'greater' : 'lesser';
    }

    const preCmp = comparePreRelease(a.preRelease, b.preRelease);
    if (preCmp !== 0) {
        return preCmp > 0 ? 'greater' : 'lesser';
    }

    return 'equal';
}

/**
 * Compare two raw version strings, returning detailed comparison information.
 * Use this when you do not need full SemanticVersion objects.
 */
export function compareVersionStrings(
    versionA: string,
    versionB: string
): VersionComparisonDetail {
    const a = parseVersion(versionA);
    const b = parseVersion(versionB);

    if (!a || !b) {
        return {
            result: 'equal',
            description: `Cannot compare "${versionA}" and "${versionB}" — one or both are not valid semver.`,
            majorChange: false,
            minorChange: false,
            patchChange: false,
            preReleaseChange: false,
        };
    }

    const result = compareVersions(a, b);
    const majorChange = a.major !== b.major;
    const minorChange = !majorChange && a.minor !== b.minor;
    const patchChange = !majorChange && !minorChange && a.patch !== b.patch;
    const preReleaseChange = !majorChange && !minorChange && !patchChange && a.preRelease !== b.preRelease;

    let bumpKind = 'identical';
    if (majorChange)      { bumpKind = 'major bump'; }
    else if (minorChange) { bumpKind = 'minor bump'; }
    else if (patchChange) { bumpKind = 'patch bump'; }
    else if (preReleaseChange) { bumpKind = 'pre-release change'; }

    const direction =
        result === 'greater' ? 'greater than' :
        result === 'lesser'  ? 'less than'    :
        'equal to';

    const description = `${versionA} is ${direction} ${versionB}${bumpKind !== 'identical' ? ` (${bumpKind})` : ''}`;

    return { result, description, majorChange, minorChange, patchChange, preReleaseChange };
}

/**
 * Returns `true` when `candidate` is a strictly newer version than `baseline`.
 */
export function isNewerVersion(candidate: string, baseline: string): boolean {
    return compareVersionStrings(candidate, baseline).result === 'greater';
}

/**
 * Sort an array of version strings in ascending order (oldest → newest).
 * Strings that cannot be parsed are placed at the front.
 */
export function sortVersions(versions: string[]): string[] {
    return [...versions].sort((a, b) => {
        const pa = parseVersion(a);
        const pb = parseVersion(b);
        if (!pa && !pb) { return 0; }
        if (!pa) { return -1; }
        if (!pb) { return 1; }
        const cmp = compareVersions(pa, pb);
        return cmp === 'greater' ? 1 : cmp === 'lesser' ? -1 : 0;
    });
}

/**
 * Detect a potential version conflict:
 * returns `true` when the deployed version is NEWER than the local source version
 * (i.e. the workspace source has been rolled back or is behind what is on-chain).
 */
export function detectVersionMismatch(
    localVersion: string,
    deployedVersion: string
): boolean {
    const cmp = compareVersionStrings(deployedVersion, localVersion);
    return cmp.result === 'greater';
}

/**
 * Format a SemanticVersion as a canonical string, e.g. "1.2.3-alpha.1+build.42".
 */
export function formatVersion(v: SemanticVersion): string {
    let base = `${v.major}.${v.minor}.${v.patch}`;
    if (v.preRelease) { base += `-${v.preRelease}`; }
    if (v.buildMeta)  { base += `+${v.buildMeta}`; }
    return base;
}
