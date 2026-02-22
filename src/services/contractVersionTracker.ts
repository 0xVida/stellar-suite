// ============================================================
// src/services/contractVersionTracker.ts
// Tracks local and deployed versions of Soroban contracts,
// maintains per-contract version history, and surfaces
// mismatch warnings.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import {
    extractVersionFromCargoToml,
    compareVersionStrings,
    detectVersionMismatch,
    isValidVersion,
    parseVersion,
    VersionComparisonDetail,
} from '../utils/versionParser';

// ── Public types ──────────────────────────────────────────────

/** Metadata stored for each version snapshot of a contract. */
export interface VersionMetadata {
    /** Semantic version string, e.g. "1.2.3". */
    version: string;
    /** ISO-8601 timestamp when this version was recorded. */
    recordedAt: string;
    /** Optional human-readable label, e.g. "Initial release" or "Bug-fix". */
    label?: string;
    /** On-chain contract ID at the time of recording (if deployed). */
    contractId?: string;
    /** Stellar network the contract was deployed to. */
    network?: string;
    /** Source account used for deployment. */
    source?: string;
}

/** Full version history entry with status information. */
export interface VersionHistoryEntry extends VersionMetadata {
    /** Unique entry ID (UUID-like generated string). */
    id: string;
    /** Whether this entry represents a deployed version. */
    isDeployed: boolean;
}

/** Mismatch reported when the deployed version is ahead of local source. */
export interface VersionMismatch {
    contractPath: string;
    contractName: string;
    localVersion: string;
    deployedVersion: string;
    comparison: VersionComparisonDetail;
    message: string;
}

/** Complete version state for a single contract. */
export interface ContractVersionState {
    contractPath: string;
    contractName: string;
    /** Version currently found in Cargo.toml. */
    localVersion?: string;
    /** Version last seen at deploy time. */
    deployedVersion?: string;
    /** Full ordered history (oldest first). */
    history: VersionHistoryEntry[];
    /** Whether the local and deployed versions differ in a surprising way. */
    hasMismatch: boolean;
    mismatch?: VersionMismatch;
}

// ── Minimal VS Code-compatible interfaces ────────────────────
//
// Using structural interfaces instead of a hard import of 'vscode'
// makes the service testable in plain Node.js without the VS Code
// extension host.

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface SimpleWorkspaceState {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
}

interface SimpleExtensionContext {
    workspaceState: SimpleWorkspaceState;
}

// ── Internal persistence key ──────────────────────────────────

const STORAGE_KEY = 'stellarSuite.contractVersions';

// ── Service class ─────────────────────────────────────────────

/**
 * ContractVersionTracker is responsible for:
 * - Reading local versions from Cargo.toml
 * - Persisting deployed version snapshots in workspace state
 * - Maintaining an ordered history of version changes
 * - Comparing local vs deployed versions and reporting mismatches
 */
export class ContractVersionTracker {
    private readonly outputChannel: SimpleOutputChannel;

    constructor(
        private readonly context: SimpleExtensionContext,
        outputChannel?: SimpleOutputChannel
    ) {
        // Fall back to a no-op channel when running outside the VS Code host.
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg: string) => { /* no-op outside VS Code */ },
        };
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Read the version declared in `Cargo.toml` for the given contract directory.
     * `contractDir` should be the directory that contains `Cargo.toml`
     * (not the Cargo.toml path itself).
     */
    public getLocalVersion(contractDir: string): string | undefined {
        // Accept either a directory OR the Cargo.toml path itself.
        const cargoPath = contractDir.endsWith('Cargo.toml')
            ? contractDir
            : path.join(contractDir, 'Cargo.toml');

        try {
            const content = fs.readFileSync(cargoPath, 'utf-8');
            const version = extractVersionFromCargoToml(content);
            if (version && !isValidVersion(version)) {
                this.log(`[VersionTracker] Non-semver version "${version}" in ${cargoPath}`);
            }
            return version;
        } catch (err) {
            this.log(`[VersionTracker] Cannot read ${cargoPath}: ${err instanceof Error ? err.message : String(err)}`);
            return undefined;
        }
    }

    /**
     * Record a deployed version snapshot.
     * Call this immediately after a successful deployment.
     */
    public async recordDeployedVersion(
        contractPath: string,
        contractName: string,
        version: string,
        opts?: {
            contractId?: string;
            network?: string;
            source?: string;
            label?: string;
        }
    ): Promise<VersionHistoryEntry> {
        const entry: VersionHistoryEntry = {
            id:          this.generateId(),
            version,
            recordedAt:  new Date().toISOString(),
            isDeployed:  true,
            contractId:  opts?.contractId,
            network:     opts?.network,
            source:      opts?.source,
            label:       opts?.label,
        };

        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);

        if (!all[key]) {
            all[key] = { contractPath, contractName, history: [], deployedVersion: undefined };
        }

        all[key].history.push(entry);
        all[key].deployedVersion = version;
        all[key].contractName    = contractName; // keep name up-to-date

        await this.saveAllVersionData(all);
        this.log(`[VersionTracker] Recorded deployed version ${version} for ${contractName}`);
        return entry;
    }

    /**
     * Record a local (source) version snapshot without a deployment event.
     * Useful for tracking version bumps even before deploying.
     */
    public async recordLocalVersion(
        contractPath: string,
        contractName: string,
        version: string,
        label?: string
    ): Promise<VersionHistoryEntry> {
        const entry: VersionHistoryEntry = {
            id:         this.generateId(),
            version,
            recordedAt: new Date().toISOString(),
            isDeployed: false,
            label,
        };

        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);

        if (!all[key]) {
            all[key] = { contractPath, contractName, history: [], deployedVersion: undefined };
        }

        all[key].history.push(entry);
        all[key].contractName = contractName;

        await this.saveAllVersionData(all);
        this.log(`[VersionTracker] Recorded local version ${version} for ${contractName}`);
        return entry;
    }

    /**
     * Add or update a human-readable label on an existing history entry.
     */
    public async tagVersion(
        contractPath: string,
        entryId: string,
        label: string
    ): Promise<boolean> {
        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);
        const state = all[key];

        if (!state) { return false; }

        const entry = state.history.find(e => e.id === entryId);
        if (!entry) { return false; }

        entry.label = label;
        await this.saveAllVersionData(all);
        this.log(`[VersionTracker] Tagged version ${entry.version} as "${label}" for ${contractPath}`);
        return true;
    }

    /**
     * Get the full version state for a contract, including mismatch detection.
     * `contractPath` may be the directory path or the Cargo.toml path.
     */
    public getContractVersionState(
        contractPath: string,
        contractName: string
    ): ContractVersionState {
        const localVersion    = this.getLocalVersion(contractPath);
        const all             = this.loadAllVersionData();
        const key             = this.contractKey(contractPath);
        const stored          = all[key];
        const deployedVersion = stored?.deployedVersion;

        let hasMismatch = false;
        let mismatch: VersionMismatch | undefined;

        if (localVersion && deployedVersion && localVersion !== deployedVersion) {
            const comparison = compareVersionStrings(localVersion, deployedVersion);
            if (detectVersionMismatch(localVersion, deployedVersion)) {
                hasMismatch = true;
                mismatch = {
                    contractPath,
                    contractName,
                    localVersion,
                    deployedVersion,
                    comparison,
                    message:
                        `Deployed version (${deployedVersion}) is NEWER than local ` +
                        `source (${localVersion}). Your workspace may be behind the ` +
                        `deployed contract.`,
                };
            }
        }

        return {
            contractPath,
            contractName,
            localVersion,
            deployedVersion,
            history:     stored?.history ?? [],
            hasMismatch,
            mismatch,
        };
    }

    /**
     * Get version states for all tracked contracts.
     */
    public getAllContractVersionStates(): ContractVersionState[] {
        const all = this.loadAllVersionData();
        return Object.values(all).map(stored =>
            this.getContractVersionState(stored.contractPath, stored.contractName)
        );
    }

    /**
     * Get all version mismatches across tracked contracts.
     */
    public getMismatches(): VersionMismatch[] {
        return this.getAllContractVersionStates()
            .filter(s => s.hasMismatch && s.mismatch !== undefined)
            .map(s => s.mismatch!);
    }

    /**
     * Get the version history for a single contract (oldest to newest).
     */
    public getVersionHistory(contractPath: string): VersionHistoryEntry[] {
        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);
        return all[key]?.history ?? [];
    }

    /**
     * Clear the entire version history for a contract.
     */
    public async clearVersionHistory(contractPath: string): Promise<void> {
        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);
        delete all[key];
        await this.saveAllVersionData(all);
        this.log(`[VersionTracker] Cleared version history for ${contractPath}`);
    }

    /**
     * Compare any two version strings and return a detailed result.
     * Thin convenience wrapper around the versionParser utility.
     */
    public compareVersions(versionA: string, versionB: string): VersionComparisonDetail {
        return compareVersionStrings(versionA, versionB);
    }

    /**
     * Emit mismatch notifications via VS Code information messages
     * for all contracts that have version conflicts.
     */
    public async notifyMismatches(): Promise<void> {
        const mismatches = this.getMismatches();
        // Lazy-require vscode so this file stays importable in plain Node.js.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const vscode = require('vscode') as typeof import('vscode');
        for (const m of mismatches) {
            const choice = await vscode.window.showWarningMessage(
                `[Stellar Suite] ${m.contractName}: ${m.message}`,
                'Dismiss'
            );
            this.log(`[VersionTracker] Mismatch notification for ${m.contractName}: ${choice ?? 'auto-dismissed'}`);
        }
    }

    // ── Persistence helpers ───────────────────────────────────

    /** Raw persisted structure (indexed by normalised contract key). */
    private loadAllVersionData(): Record<string, StoredContractVersionData> {
        return this.context.workspaceState.get<Record<string, StoredContractVersionData>>(
            STORAGE_KEY, {}
        );
    }

    private async saveAllVersionData(
        data: Record<string, StoredContractVersionData>
    ): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY, data);
    }

    // ── Utility helpers ───────────────────────────────────────

    /** Normalise a contract path to a stable storage key. */
    private contractKey(contractPath: string): string {
        // Normalise separators and strip trailing slash.
        return contractPath.replace(/\\/g, '/').replace(/\/$/, '');
    }

    private generateId(): string {
        // Simple but unique enough for local storage purposes.
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }
}

// ── Internal persistence interface ───────────────────────────

interface StoredContractVersionData {
    contractPath: string;
    contractName: string;
    deployedVersion?: string;
    history: VersionHistoryEntry[];
}
