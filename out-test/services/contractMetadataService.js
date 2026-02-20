"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContractMetadataService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cargoTomlParser_1 = require("../utils/cargoTomlParser");
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
class ContractMetadataService {
    constructor(workspace, outputChannel = {
        appendLine: (_msg) => { },
    }) {
        this.workspace = workspace;
        this.outputChannel = outputChannel;
        // In-memory cache: absolute Cargo.toml path → ContractMetadata
        this.cache = new Map();
        this.disposables = [];
    }
    // ── Main API ──────────────────────────────────────────────
    /**
     * Scan the entire workspace for Cargo.toml files and return their metadata.
     * Results are cached; subsequent calls return the cached version unless
     * `invalidate()` has been called since the last scan.
     */
    async scanWorkspace() {
        this.log('[MetadataService] Starting workspace scan for Cargo.toml files...');
        const files = await this.workspace.findFiles('**/Cargo.toml', '**/target/**', 500);
        const contracts = [];
        const workspaceRoots = [];
        const errors = [];
        for (const file of files) {
            try {
                const meta = await this.getMetadata(file.fsPath);
                contracts.push(meta);
                if (meta.isWorkspaceRoot) {
                    workspaceRoots.push(meta);
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push({ path: file.fsPath, error: message });
                this.log(`[MetadataService] Error processing ${file.fsPath}: ${message}`);
            }
        }
        const result = {
            contracts,
            workspaceRoots,
            errors,
            scannedAt: new Date().toISOString(),
        };
        this.log(`[MetadataService] Scan complete: ${contracts.length} contract(s), ` +
            `${workspaceRoots.length} workspace root(s), ${errors.length} error(s).`);
        return result;
    }
    /**
     * Retrieve (and cache) the metadata for a single Cargo.toml file.
     *
     * @param cargoTomlPath Absolute path to the Cargo.toml file.
     * @throws When the file cannot be read from the file system.
     */
    async getMetadata(cargoTomlPath) {
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
    getCachedMetadata() {
        return Array.from(this.cache.values());
    }
    /**
     * Invalidate the cache for a specific file, or for all files when no path
     * is supplied.
     *
     * @param cargoTomlPath Optional path to invalidate a single entry.
     */
    invalidate(cargoTomlPath) {
        if (cargoTomlPath) {
            const normalised = normalisePath(cargoTomlPath);
            this.cache.delete(normalised);
            this.log(`[MetadataService] Cache invalidated for ${normalised}`);
        }
        else {
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
    findByContractName(contractName) {
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
    findContractsByDependency(crateName) {
        const lower = crateName.toLowerCase();
        const results = [];
        for (const meta of this.cache.values()) {
            const hasDep = Object.keys(meta.dependencies).some(k => k.toLowerCase() === lower) ||
                Object.keys(meta.devDependencies).some(k => k.toLowerCase() === lower) ||
                Object.keys(meta.buildDependencies).some(k => k.toLowerCase() === lower);
            if (hasDep) {
                results.push(meta);
            }
        }
        return results;
    }
    /**
     * Register a VS Code FileSystemWatcher that automatically invalidates
     * the cache whenever a Cargo.toml is created, modified, or deleted.
     * Call `dispose()` to stop watching.
     */
    startWatching() {
        if (this.watcher) {
            this.log('[MetadataService] File watcher already active, skipping.');
            return;
        }
        try {
            const watcher = this.workspace.createFileSystemWatcher('**/Cargo.toml');
            const onChange = (uri) => {
                this.log(`[MetadataService] Cargo.toml changed: ${uri.fsPath}`);
                this.invalidate(uri.fsPath);
            };
            const onDelete = (uri) => {
                this.log(`[MetadataService] Cargo.toml deleted: ${uri.fsPath}`);
                this.invalidate(uri.fsPath);
            };
            this.disposables.push(watcher.onDidChange(onChange), watcher.onDidCreate(onChange), watcher.onDidDelete(onDelete));
            this.watcher = watcher;
            this.log('[MetadataService] File watcher started for **/Cargo.toml');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log(`[MetadataService] WARNING: Could not start file watcher: ${message}`);
        }
    }
    /**
     * Clean up the file-system watcher and all event listeners.
     */
    dispose() {
        for (const d of this.disposables) {
            try {
                d.dispose();
            }
            catch { /* best-effort cleanup */ }
        }
        this.disposables.length = 0;
        if (this.watcher) {
            try {
                this.watcher.dispose();
            }
            catch { /* best-effort cleanup */ }
            this.watcher = undefined;
        }
        this.log('[MetadataService] Disposed.');
    }
    // ── Internal helpers ──────────────────────────────────────
    /**
     * Synchronously read and parse a single Cargo.toml file from disk.
     * Throws on read errors; parsing errors are captured as warnings.
     */
    parseFile(cargoTomlPath) {
        let content;
        try {
            content = fs.readFileSync(cargoTomlPath, 'utf-8');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Cannot read ${cargoTomlPath}: ${message}`);
        }
        const parsed = (0, cargoTomlParser_1.parseCargoToml)(content, cargoTomlPath);
        return buildContractMetadata(parsed);
    }
    log(msg) {
        this.outputChannel.appendLine(msg);
    }
}
exports.ContractMetadataService = ContractMetadataService;
// ── Internal factory ──────────────────────────────────────────
/**
 * Transform a `ParsedCargoToml` into the richer `ContractMetadata` shape.
 */
function buildContractMetadata(parsed) {
    return {
        cargoTomlPath: parsed.filePath,
        contractDir: path.dirname(parsed.filePath),
        contractName: (0, cargoTomlParser_1.getContractName)(parsed),
        package: parsed.package,
        dependencies: parsed.dependencies,
        devDependencies: parsed.devDependencies,
        buildDependencies: parsed.buildDependencies,
        contractDependencies: (0, cargoTomlParser_1.extractContractDependencies)(parsed),
        workspace: parsed.workspace,
        isWorkspaceRoot: parsed.isWorkspaceRoot,
        cachedAt: new Date().toISOString(),
        parseWarnings: parsed.parseWarnings,
    };
}
/**
 * Normalise a file path to a consistent cache key (forward slashes, no trailing slash).
 */
function normalisePath(p) {
    return p.replace(/\\/g, '/').replace(/\/$/, '');
}
