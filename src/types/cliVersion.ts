import { SemanticVersion } from '../utils/versionParser';

/** Cached information about a detected CLI version. */
export interface CliVersionInfo {
    /** Raw version string from CLI output (e.g., "stellar 21.5.0"). */
    version: string;
    /** Parsed semver, undefined if output was not parseable. */
    parsed: SemanticVersion | undefined;
    /** Timestamp (Date.now()) when this version was detected. */
    detectedAt: number;
    /** Path to the CLI binary that was checked. */
    cliPath: string;
}

/** Result of a compatibility check between detected and required CLI version. */
export interface CliCompatibilityResult {
    compatible: boolean;
    currentVersion: string;
    requiredVersion: string;
    /** User-friendly message describing the compatibility status. */
    message: string;
    /** Shell command to upgrade the CLI, when applicable. */
    upgradeCommand?: string;
}

/** Configuration for CLI version checking behaviour. */
export interface CliVersionConfig {
    /** Whether CLI version checking is enabled. */
    enabled: boolean;
    /** Minimum required Stellar CLI version (e.g., "21.0.0"). */
    minimumVersion: string;
    /** How often (minutes) to re-check the CLI version. 0 = on activation only. */
    checkIntervalMinutes: number;
}
