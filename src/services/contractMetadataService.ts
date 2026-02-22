// ============================================================
// src/services/contractMetadataService.ts
// Discovers, parses, caches, and watches Cargo.toml files
// across the workspace.  Returns rich contract-metadata objects
// that can be used by the sidebar, commands, and other services.
//
// The service follows the same "structural-interface" pattern as
// ContractVersionTracker so that the core logic is testable in plain
// Node.js without the VS Code extension host.
// ============================================================

import * as fs   from 'fs';
import * as path from 'path';
import {
    parseCargoToml,
    extractContractDependencies,
    getContractName,
    ParsedCargoToml,
    CargoPackage,
    CargoDependency,
    CargoWorkspace,
} from '../utils/cargoTomlParser';

// ── Re-export parser types for consumer convenience ───────────
export type { ParsedCargoToml, CargoPackage, CargoDependency, CargoWorkspace };

// ── Public aggregate types ────────────────────────────────────

/**
 * All metadata associated with a single contract's Cargo.toml.
 * Combines data from the parser with derived convenience fields.
 */
export interface ContractMetadata {
    /** Absolute path to the Cargo.toml file. */
    cargoTomlPath: string;
    /** Directory containing the Cargo.toml file. */
    contractDir: string;
    /** Display-friendly contract name (from `[package].name` or directory name). */
    contractName: string;
    /** Package section from Cargo.toml (if present). */
    package?: CargoPackage;
    /** Runtime dependencies declared in the manifest. */
    dependencies: Record<string, CargoDependency>;
    /** Test/example-only dependencies. */
    devDependencies: Record<string, CargoDependency>;
    /** Compile-time build dependencies. */
    buildDependencies: Record<string, CargoDependency>;
    /**
     * Contract-specific dependencies — SDK and toolchain crates filtered out.
     * These are the dependencies most relevant to contract authors and reviewers.
     */
    contractDependencies: CargoDependency[];
    /** Workspace-level metadata (present only for workspace-root manifests). */
    workspace?: CargoWorkspace;
    /** Whether this Cargo.toml is at the root of a Cargo workspace. */
    isWorkspaceRoot: boolean;
    /** ISO-8601 timestamp of the last cache population for this entry. */
    cachedAt: string;
    /** Non-fatal warnings emitted during parsing. */
    parseWarnings: string[];
}

/** Summary returned by `scanWorkspace()`. */
export interface WorkspaceScanResult {
    /** All contract metadata found across the workspace. */
    contracts: ContractMetadata[];
    /** Workspace-root manifests (may be a superset of contracts). */
    workspaceRoots: ContractMetadata[];
    /** Paths that could not be read or parsed (with error messages). */
    errors: Array<{ path: string; error: string }>;
    /** ISO-8601 timestamp of when the scan completed. */
    scannedAt: string;
}

// ── Minimal VS Code-compatible interfaces ─────────────────────
//
// Using structural interfaces instead of a hard `import 'vscode'`
// keeps this service importable in plain Node.js test runners.

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface SimpleDisposable {
    dispose(): void;
}

interface SimpleFileSystemWatcher extends SimpleDisposable {
    onDidChange(listener: (uri: { fsPath: string }) => void): SimpleDisposable;
    onDidCreate(listener: (uri: { fsPath: string }) => void): SimpleDisposable;
    onDidDelete(listener: (uri: { fsPath: string }) => void): SimpleDisposable;
}

interface SimpleWorkspace {
    findFiles(
        include: string,
        exclude?: string,
        maxResults?: number
    ): Promise<Array<{ fsPath: string }>>;
    createFileSystemWatcher(pattern: string): SimpleFileSystemWatcher;
}

// ── Service class ─────────────────────────────────────────────

/**
 * ContractMetadataService is responsible for:
 *
 * - Discovering all Cargo.toml files in the VS Code workspace
 * - Parsing and caching their metadata
 * - Watching for file-system changes and invalidating stale cache entries
 * - Providing query APIs for the rest of the extension
 *
 * Usage (inside the extension host):
 * ```ts
 * const svc = new ContractMetadataService(vscode.workspace, outputChannel);
 * svc.startWatching();                             // register FS watcher
 * const scan = await svc.scanWorkspace();          // full workspace scan
 * const meta = await svc.getMetadata(cargoPath);   // single-file metadata
 * ```
 */
export class ContractMetadataService {
    // In-memory cache: absolute Cargo.toml path → ContractMetadata
    private readonly cache = new Map<string, ContractMetadata>();

    private watcher: SimpleDisposable | undefined;
    private readonly disposables: SimpleDisposable[] = [];

    constructor(
        private readonly workspace: SimpleWorkspace,
        private readonly outputChannel: SimpleOutputChannel = {
            appendLine: (_msg: string) => { /* no-op outside VS Code */ },
        }
    ) {}

    // ── Main API ──────────────────────────────────────────────

    /**
     * Scan the entire workspace for Cargo.toml files and return their metadata.
     * Results are cached; subsequent calls return the cached version unless
     * `invalidate()` has been called since the last scan.
     */
    public async scanWorkspace(): Promise<WorkspaceScanResult> {
        this.log('[MetadataService] Starting workspace scan for Cargo.toml files...');

        const files = await this.workspace.findFiles(
            '**/Cargo.toml',
            '**/target/**',
            500
        );

        const contracts: ContractMetadata[]                     = [];
        const workspaceRoots: ContractMetadata[]                = [];
        const errors: Array<{ path: string; error: string }>    = [];

        for (const file of files) {
            try {
                const meta = await this.getMetadata(file.fsPath);
                contracts.push(meta);
                if (meta.isWorkspaceRoot) {
                    workspaceRoots.push(meta);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push({ path: file.fsPath, error: message });
                this.log(`[MetadataService] Error processing ${file.fsPath}: ${message}`);
            }
        }

        const result: WorkspaceScanResult = {
            contracts,
            workspaceRoots,
            errors,
            scannedAt: new Date().toISOString(),
        };

        this.log(
            `[MetadataService] Scan complete: ${contracts.length} contract(s), ` +
            `${workspaceRoots.length} workspace root(s), ${errors.length} error(s).`
        );

        return result;
    }

    /**
     * Retrieve (and cache) the metadata for a single Cargo.toml file.
     *
     * @param cargoTomlPath Absolute path to the Cargo.toml file.
     * @throws When the file cannot be read from the file system.
     */
    public async getMetadata(cargoTomlPath: string): Promise<ContractMetadata> {
        const normalised = normalisePath(cargoTomlPath);

        const cached = this.cache.get(normalised);
        if (cached) {
            this.log(`[MetadataService] Cache hit for ${normalised}`);
            return cached;
        }

        const meta = this.parseFile(normalised);
        this.cache.set(normalised, meta);
        this.log(`[MetadataService] Parsed and cached metadata for ${normalised}`);
        return meta;
    }

    /**
     * Return all currently-cached metadata entries without performing a new scan.
     * Returns an empty array when the cache is cold.
     */
    public getCachedMetadata(): ContractMetadata[] {
        return Array.from(this.cache.values());
    }

    /**
     * Invalidate the cache for a specific file, or for all files when no path
     * is supplied.
     *
     * @param cargoTomlPath Optional path to invalidate a single entry.
     */
    public invalidate(cargoTomlPath?: string): void {
        if (cargoTomlPath) {
            const normalised = normalisePath(cargoTomlPath);
            this.cache.delete(normalised);
            this.log(`[MetadataService] Cache invalidated for ${normalised}`);
        } else {
            const count = this.cache.size;
            this.cache.clear();
            this.log(`[MetadataService] Entire cache cleared (${count} entries removed).`);
        }
    }

    /**
     * Look up cached (or freshly parsed) metadata by contract name.
     * Name comparison is case-insensitive.
     *
     * @param contractName The crate name as declared in `[package].name`.
     */
    public findByContractName(contractName: string): ContractMetadata | undefined {
        const lower = contractName.toLowerCase();
        for (const meta of this.cache.values()) {
            if (meta.contractName.toLowerCase() === lower) {
                return meta;
            }
        }
        return undefined;
    }

    /**
     * Get all cached contracts that have the named crate as a dependency.
     *
     * @param crateName The dependency crate name to search for.
     */
    public findContractsByDependency(crateName: string): ContractMetadata[] {
        const lower = crateName.toLowerCase();
        const results: ContractMetadata[] = [];

        for (const meta of this.cache.values()) {
            const hasDep =
                Object.keys(meta.dependencies).some(k => k.toLowerCase() === lower) ||
                Object.keys(meta.devDependencies).some(k => k.toLowerCase() === lower) ||
                Object.keys(meta.buildDependencies).some(k => k.toLowerCase() === lower);

            if (hasDep) { results.push(meta); }
        }

        return results;
    }

    /**
     * Register a VS Code FileSystemWatcher that automatically invalidates
     * the cache whenever a Cargo.toml is created, modified, or deleted.
     * Call `dispose()` to stop watching.
     */
    public startWatching(): void {
        if (this.watcher) {
            this.log('[MetadataService] File watcher already active, skipping.');
            return;
        }

        try {
            const watcher = this.workspace.createFileSystemWatcher('**/Cargo.toml');

            const onChange = (uri: { fsPath: string }) => {
                this.log(`[MetadataService] Cargo.toml changed: ${uri.fsPath}`);
                this.invalidate(uri.fsPath);
            };

            const onDelete = (uri: { fsPath: string }) => {
                this.log(`[MetadataService] Cargo.toml deleted: ${uri.fsPath}`);
                this.invalidate(uri.fsPath);
            };

            this.disposables.push(
                watcher.onDidChange(onChange),
                watcher.onDidCreate(onChange),
                watcher.onDidDelete(onDelete)
            );

            this.watcher = watcher;
            this.log('[MetadataService] File watcher started for **/Cargo.toml');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log(`[MetadataService] WARNING: Could not start file watcher: ${message}`);
        }
    }

    /**
     * Clean up the file-system watcher and all event listeners.
     */
    public dispose(): void {
        for (const d of this.disposables) {
            try { d.dispose(); } catch { /* best-effort cleanup */ }
        }
        this.disposables.length = 0;

        if (this.watcher) {
            try { this.watcher.dispose(); } catch { /* best-effort cleanup */ }
            this.watcher = undefined;
        }

        this.log('[MetadataService] Disposed.');
    }

    // ── Internal helpers ──────────────────────────────────────

    /**
     * Synchronously read and parse a single Cargo.toml file from disk.
     * Throws on read errors; parsing errors are captured as warnings.
     */
    private parseFile(cargoTomlPath: string): ContractMetadata {
        let content: string;
        try {
            content = fs.readFileSync(cargoTomlPath, 'utf-8');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Cannot read ${cargoTomlPath}: ${message}`);
        }

        const parsed = parseCargoToml(content, cargoTomlPath);
        return buildContractMetadata(parsed);
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }
}

// ── Internal factory ──────────────────────────────────────────

/**
 * Transform a `ParsedCargoToml` into the richer `ContractMetadata` shape.
 */
function buildContractMetadata(parsed: ParsedCargoToml): ContractMetadata {
    return {
        cargoTomlPath:        parsed.filePath,
        contractDir:          path.dirname(parsed.filePath),
        contractName:         getContractName(parsed),
        package:              parsed.package,
        dependencies:         parsed.dependencies,
        devDependencies:      parsed.devDependencies,
        buildDependencies:    parsed.buildDependencies,
        contractDependencies: extractContractDependencies(parsed),
        workspace:            parsed.workspace,
        isWorkspaceRoot:      parsed.isWorkspaceRoot,
        cachedAt:             new Date().toISOString(),
        parseWarnings:        parsed.parseWarnings,
    };
}

/**
 * Normalise a file path to a consistent cache key (forward slashes, no trailing slash).
 */
function normalisePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/\/$/, '');
}
