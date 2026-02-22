// ============================================================
// src/services/sourceInspectorService.ts
// High-level service that combines Rust source parsing with
// caching and provides ContractFunction[] output compatible
// with the existing ContractInspector interface.
// ============================================================

import { ContractFunction, FunctionParameter } from './contractInspector';
import { ParsedRustFile, ParsedRustFunction } from '../types/rustParser';
import { parseRustSource } from '../utils/rustSourceParser';
import { SignatureCacheService } from './signatureCacheService';

// ── Minimal interfaces for VS Code ────────────────────────────

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface SimpleFileSystem {
    readFile(filePath: string): Promise<string>;
    findFiles(dirPath: string, pattern: string): Promise<string[]>;
}

// ── Service class ─────────────────────────────────────────────

/**
 * SourceInspectorService parses Rust source files to extract
 * contract function signatures, caches results, and returns
 * them in the same ContractFunction[] format as ContractInspector.
 */
export class SourceInspectorService {
    private readonly outputChannel: SimpleOutputChannel;

    constructor(
        private readonly cacheService: SignatureCacheService,
        private readonly fileSystem: SimpleFileSystem,
        outputChannel?: SimpleOutputChannel
    ) {
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg: string) => { /* no-op */ },
        };
    }

    /**
     * Parse a single Rust source file and cache the results.
     * Uses cache if the file hasn't changed.
     */
    public async inspectContractSource(filePath: string): Promise<ParsedRustFile> {
        const content = await this.fileSystem.readFile(filePath);

        // Check cache first
        if (!this.cacheService.isStale(filePath, content)) {
            const cached = this.cacheService.getCachedSignatures(filePath);
            if (cached) {
                this.log(`[SourceInspector] Cache hit for ${filePath}`);
                return cached;
            }
        }

        // Parse fresh
        this.log(`[SourceInspector] Parsing ${filePath}`);
        const parsed = parseRustSource(content, filePath);

        // Cache the result
        await this.cacheService.cacheSignatures(filePath, parsed, content);

        return parsed;
    }

    /**
     * Find and parse all .rs files in a contract directory.
     */
    public async inspectContractDirectory(dirPath: string): Promise<ParsedRustFile[]> {
        const files = await this.fileSystem.findFiles(dirPath, '*.rs');
        const results: ParsedRustFile[] = [];

        for (const file of files) {
            try {
                const parsed = await this.inspectContractSource(file);
                results.push(parsed);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                this.log(`[SourceInspector] Failed to parse ${file}: ${msg}`);
            }
        }

        return results;
    }

    /**
     * Get contract functions in the same format as ContractInspector,
     * enabling seamless integration with the rest of the extension.
     * Only returns public functions from #[contractimpl] blocks.
     */
    public async getContractFunctions(filePath: string): Promise<ContractFunction[]> {
        const parsed = await this.inspectContractSource(filePath);
        return this.convertToContractFunctions(parsed);
    }

    /**
     * Convert ParsedRustFile functions to ContractFunction[] format.
     * Filters to only public functions in #[contractimpl] blocks.
     */
    public convertToContractFunctions(parsed: ParsedRustFile): ContractFunction[] {
        return parsed.functions
            .filter(fn => fn.isContractImpl && fn.visibility === 'pub')
            .map(fn => this.convertFunction(fn));
    }

    private convertFunction(fn: ParsedRustFunction): ContractFunction {
        const parameters: FunctionParameter[] = fn.parameters
            .filter(p => {
                // Skip `env: Env` / `env: &Env` — it's the execution environment,
                // not a user-supplied parameter
                const typeNorm = p.typeStr.replace(/\s+/g, '');
                return typeNorm !== 'Env';
            })
            .map(p => ({
                name: p.name,
                type: p.isReference
                    ? (p.isMutable ? `&mut ${p.typeStr}` : `&${p.typeStr}`)
                    : p.typeStr,
                required: true,
            }));

        const description = fn.docComments.length > 0
            ? fn.docComments.join(' ')
            : undefined;

        return {
            name: fn.name,
            parameters,
            description,
        };
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }
}
