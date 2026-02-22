// ============================================================
// src/services/signatureCacheService.ts
// Caches parsed Rust source file results in workspace state.
// No vscode dependency — pure TypeScript service.
// ============================================================

import { ParsedRustFile, SignatureCacheEntry } from '../types/rustParser';
import { hashContent } from '../utils/rustSourceParser';

// ── Minimal VS Code-compatible interfaces ─────────────────────

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface SimpleWorkspaceState {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

interface SimpleExtensionContext {
    workspaceState: SimpleWorkspaceState;
}

// ── Constants ─────────────────────────────────────────────────

const STORAGE_KEY = 'stellarSuite.signatureCache';

// ── Service class ─────────────────────────────────────────────

/**
 * SignatureCacheService caches parsed Rust source results so
 * re-parsing is only done when file content actually changes.
 */
export class SignatureCacheService {
    private readonly outputChannel: SimpleOutputChannel;

    constructor(
        private readonly context: SimpleExtensionContext,
        outputChannel?: SimpleOutputChannel
    ) {
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg: string) => { /* no-op */ },
        };
    }

    /**
     * Store a parsed result in the cache keyed by file path.
     */
    public async cacheSignatures(
        filePath: string,
        parsed: ParsedRustFile,
        sourceContent: string
    ): Promise<void> {
        const all = this.loadAll();
        const entry: SignatureCacheEntry = {
            parsed,
            contentHash: hashContent(sourceContent),
            cachedAt: new Date().toISOString(),
        };
        all[filePath] = entry;
        await this.saveAll(all);
        this.log(`[SignatureCache] Cached ${parsed.functions.length} function(s) for ${filePath}`);
    }

    /**
     * Retrieve cached parse result for a file, or undefined.
     */
    public getCachedSignatures(filePath: string): ParsedRustFile | undefined {
        const all = this.loadAll();
        return all[filePath]?.parsed;
    }

    /**
     * Check if the cached entry for a file is stale compared
     * to the current source content.
     */
    public isStale(filePath: string, currentContent: string): boolean {
        const all = this.loadAll();
        const entry = all[filePath];
        if (!entry) { return true; }
        return entry.contentHash !== hashContent(currentContent);
    }

    /**
     * Invalidate the cache for a single file.
     */
    public async invalidate(filePath: string): Promise<boolean> {
        const all = this.loadAll();
        if (!(filePath in all)) { return false; }
        delete all[filePath];
        await this.saveAll(all);
        this.log(`[SignatureCache] Invalidated ${filePath}`);
        return true;
    }

    /**
     * Clear the entire signature cache.
     */
    public async clearAll(): Promise<void> {
        await this.saveAll({});
        this.log('[SignatureCache] Cleared all cached signatures');
    }

    /**
     * Get all cached file paths.
     */
    public getCachedFilePaths(): string[] {
        return Object.keys(this.loadAll());
    }

    // ── Persistence helpers ───────────────────────────────────

    private loadAll(): Record<string, SignatureCacheEntry> {
        return this.context.workspaceState.get<Record<string, SignatureCacheEntry>>(
            STORAGE_KEY, {}
        );
    }

    private async saveAll(data: Record<string, SignatureCacheEntry>): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY, data);
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }
}
