import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { CliVersionInfo, CliCompatibilityResult, CliVersionConfig } from '../types/cliVersion';
import { parseVersion, compareVersions, formatVersion } from '../utils/versionParser';

const execFileAsync = promisify(execFile);

/** Default configuration when no VS Code settings are available. */
export const DEFAULT_CLI_VERSION_CONFIG: CliVersionConfig = {
    enabled: true,
    minimumVersion: '21.0.0',
    checkIntervalMinutes: 60,
};

/** Regex to extract the version number from `stellar --version` output. */
const CLI_VERSION_RE = /(?:stellar|stellar-cli)\s+(\d+\.\d+\.\d+\S*)/i;

/**
 * Core CLI version detection, caching, and compatibility service.
 * No VS Code dependency — can be tested and used standalone.
 */
export class CliVersionService {
    private cache: CliVersionInfo | undefined;
    private config: CliVersionConfig;
    private intervalHandle: ReturnType<typeof setInterval> | undefined;
    private onWarningCallback: ((result: CliCompatibilityResult) => void) | undefined;
    private logFn: (msg: string) => void;

    constructor(
        config?: Partial<CliVersionConfig>,
        logger?: (msg: string) => void,
    ) {
        this.config = { ...DEFAULT_CLI_VERSION_CONFIG, ...config };
        this.logFn = logger ?? (() => {});
    }

    // ── Configuration ────────────────────────────────────────

    updateConfig(config: Partial<CliVersionConfig>): void {
        this.config = { ...this.config, ...config };
    }

    getConfig(): Readonly<CliVersionConfig> {
        return this.config;
    }

    /** Register a callback invoked when an incompatible version is detected. */
    onWarning(cb: (result: CliCompatibilityResult) => void): void {
        this.onWarningCallback = cb;
    }

    // ── Version detection ────────────────────────────────────

    /** Build a process environment with common CLI binary paths added. */
    getEnvironmentWithPath(): NodeJS.ProcessEnv {
        const env = { ...process.env };
        const homeDir = os.homedir();
        const cargoBin = path.join(homeDir, '.cargo', 'bin');

        const additionalPaths = [
            cargoBin,
            path.join(homeDir, '.local', 'bin'),
            '/usr/local/bin',
            '/opt/homebrew/bin',
            '/opt/homebrew/sbin',
        ];

        const currentPath = env.PATH || env.Path || '';
        env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(path.delimiter);
        env.Path = env.PATH;
        return env;
    }

    /**
     * Run `<cliPath> --version` and parse the output.
     * Returns a `CliVersionInfo` or `undefined` on failure.
     */
    async detectVersion(cliPath: string): Promise<CliVersionInfo | undefined> {
        try {
            const { stdout } = await execFileAsync(cliPath, ['--version'], {
                env: this.getEnvironmentWithPath(),
                timeout: 10_000,
            });

            const raw = (stdout || '').trim();
            if (!raw) {
                this.logFn('[CliVersion] Empty output from --version');
                return undefined;
            }

            const match = CLI_VERSION_RE.exec(raw);
            const versionString = match ? match[1] : raw;
            const parsed = parseVersion(versionString);

            const info: CliVersionInfo = {
                version: raw,
                parsed,
                detectedAt: Date.now(),
                cliPath,
            };

            this.cache = info;
            this.logFn(`[CliVersion] Detected: ${raw}`);
            return info;
        } catch (err: unknown) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
                this.logFn(`[CliVersion] CLI not found at: ${cliPath}`);
            } else {
                const msg = err instanceof Error ? err.message : String(err);
                this.logFn(`[CliVersion] Detection error: ${msg}`);
            }
            return undefined;
        }
    }

    // ── Compatibility ────────────────────────────────────────

    /**
     * Compare the detected version against the minimum required version.
     */
    checkCompatibility(
        currentVersionStr: string,
        requiredVersionStr: string,
    ): CliCompatibilityResult {
        const current = parseVersion(currentVersionStr);
        const required = parseVersion(requiredVersionStr);

        if (!current) {
            return {
                compatible: false,
                currentVersion: currentVersionStr,
                requiredVersion: requiredVersionStr,
                message: `Unable to parse current CLI version "${currentVersionStr}". Expected semver format.`,
                upgradeCommand: 'cargo install --locked stellar-cli',
            };
        }

        if (!required) {
            return {
                compatible: true,
                currentVersion: formatVersion(current),
                requiredVersion: requiredVersionStr,
                message: `Unable to parse required version "${requiredVersionStr}". Skipping compatibility check.`,
            };
        }

        const cmp = compareVersions(current, required);
        const compatible = cmp === 'greater' || cmp === 'equal';

        if (compatible) {
            return {
                compatible: true,
                currentVersion: formatVersion(current),
                requiredVersion: formatVersion(required),
                message: `Stellar CLI ${formatVersion(current)} meets the minimum requirement (${formatVersion(required)}).`,
            };
        }

        return {
            compatible: false,
            currentVersion: formatVersion(current),
            requiredVersion: formatVersion(required),
            message: `Stellar CLI ${formatVersion(current)} is below the minimum required version ${formatVersion(required)}. Please upgrade.`,
            upgradeCommand: 'cargo install --locked stellar-cli',
        };
    }

    // ── Cache ────────────────────────────────────────────────

    /** Return the cached version info if it is still within the configured TTL. */
    getCachedVersion(): CliVersionInfo | undefined {
        if (!this.cache) { return undefined; }
        if (this.config.checkIntervalMinutes <= 0) { return this.cache; }

        const ttlMs = this.config.checkIntervalMinutes * 60_000;
        if (Date.now() - this.cache.detectedAt > ttlMs) {
            this.cache = undefined;
            return undefined;
        }
        return this.cache;
    }

    /** Clear the cached version info. */
    clearCache(): void {
        this.cache = undefined;
    }

    // ── High-level check (detect + compat) ───────────────────

    /**
     * Detect CLI version and check compatibility.
     * Uses cache when fresh. Fires the onWarning callback if incompatible.
     */
    async checkVersion(cliPath: string): Promise<CliCompatibilityResult | undefined> {
        if (!this.config.enabled) { return undefined; }

        let info = this.getCachedVersion();
        if (!info || info.cliPath !== cliPath) {
            info = await this.detectVersion(cliPath);
        }

        if (!info || !info.parsed) {
            const result: CliCompatibilityResult = {
                compatible: false,
                currentVersion: info?.version ?? 'unknown',
                requiredVersion: this.config.minimumVersion,
                message: info
                    ? `Could not parse version from CLI output: "${info.version}"`
                    : `Stellar CLI not found at "${cliPath}". Please install or configure the path.`,
                upgradeCommand: 'cargo install --locked stellar-cli',
            };
            this.onWarningCallback?.(result);
            return result;
        }

        const result = this.checkCompatibility(
            formatVersion(info.parsed),
            this.config.minimumVersion,
        );

        if (!result.compatible) {
            this.onWarningCallback?.(result);
        }

        return result;
    }

    // ── Periodic checking ────────────────────────────────────

    /** Start periodic version checking. */
    startPeriodicCheck(cliPath: string): void {
        this.stopPeriodicCheck();
        if (this.config.checkIntervalMinutes <= 0) { return; }

        const intervalMs = this.config.checkIntervalMinutes * 60_000;
        this.intervalHandle = setInterval(() => {
            this.clearCache();
            this.checkVersion(cliPath).catch(() => {});
        }, intervalMs);
    }

    /** Stop periodic version checking. */
    stopPeriodicCheck(): void {
        if (this.intervalHandle !== undefined) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = undefined;
        }
    }

    // ── Lifecycle ────────────────────────────────────────────

    dispose(): void {
        this.stopPeriodicCheck();
        this.cache = undefined;
    }
}
