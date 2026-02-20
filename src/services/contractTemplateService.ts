// ============================================================
// src/services/contractTemplateService.ts
// Detects and categorizes common smart-contract templates.
// Supports built-in pattern sets, custom template definitions,
// and manual template overrides.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { parseCargoToml } from '../utils/cargoTomlParser';

export type ContractTemplateCategory = 'token' | 'escrow' | 'voting' | 'unknown' | string;
export type ContractTemplateSource = 'builtin' | 'custom' | 'manual' | 'unknown';

export interface TemplateActionDefinition {
    id: string;
    label: string;
    description?: string;
}

interface TemplatePatternDefinition {
    id: string;
    description: string;
    weight: number;
    regex: RegExp;
    target: 'source' | 'cargo' | 'path' | 'any';
}

export interface TemplateDefinition {
    id: string;
    displayName: string;
    category: ContractTemplateCategory;
    description?: string;
    minScore: number;
    source: 'builtin' | 'custom';
    actions: TemplateActionDefinition[];
    patterns: TemplatePatternDefinition[];
}

export interface CustomTemplateConfig {
    id: string;
    displayName?: string;
    category?: string;
    description?: string;
    keywords?: string[];
    requiredKeywords?: string[];
    dependencies?: string[];
    pathHints?: string[];
    minScore?: number;
    actions?: Array<{
        id: string;
        label: string;
        description?: string;
    }>;
}

export interface TemplateConfigFile {
    version?: string;
    templates?: CustomTemplateConfig[];
}

export interface TemplateConfigurationLoadResult {
    configPath?: string;
    templates: TemplateDefinition[];
    warnings: string[];
}

export interface TemplateDetectionInput {
    cargoTomlPath: string;
    contractDir: string;
    contractName: string;
    manualTemplateId?: string;
    customTemplates?: TemplateDefinition[];
}

export interface TemplateDetectionResult {
    templateId: string;
    displayName: string;
    category: ContractTemplateCategory;
    source: ContractTemplateSource;
    confidence: number;
    score: number;
    matchedPatterns: string[];
    actions: TemplateActionDefinition[];
}

export interface TemplateAssignmentOption {
    id: string;
    label: string;
    description: string;
    category: ContractTemplateCategory;
    source: 'builtin' | 'custom' | 'system';
}

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface ConfigCacheEntry {
    configPath: string;
    mtimeMs: number;
    result: TemplateConfigurationLoadResult;
}

interface TemplateEvaluation {
    definition: TemplateDefinition;
    score: number;
    matchedPatterns: string[];
}

const TEMPLATE_CONFIG_FILENAMES = [
    'stellar-suite.templates.json',
    path.join('.stellar-suite', 'templates.json'),
];

const NOOP_OUTPUT: SimpleOutputChannel = {
    appendLine: () => { /* no-op */ },
};

function makePattern(
    id: string,
    description: string,
    weight: number,
    regex: RegExp,
    target: 'source' | 'cargo' | 'path' | 'any' = 'any'
): TemplatePatternDefinition {
    return { id, description, weight, regex, target };
}

const BUILTIN_TEMPLATES: TemplateDefinition[] = [
    {
        id: 'token',
        displayName: 'Token',
        category: 'token',
        description: 'Fungible-token style contract pattern.',
        minScore: 4,
        source: 'builtin',
        actions: [
            { id: 'token.transfer', label: 'Transfer Tokens', description: 'Prepare a transfer-style invocation.' },
            { id: 'token.mint', label: 'Mint Tokens', description: 'Prepare a mint-style invocation.' },
            { id: 'token.burn', label: 'Burn Tokens', description: 'Prepare a burn-style invocation.' },
        ],
        patterns: [
            makePattern('token.transfer.fn', 'transfer function', 2, /\bfn\s+transfer\b/i, 'source'),
            makePattern('token.mint.fn', 'mint function', 2, /\bfn\s+mint\b/i, 'source'),
            makePattern('token.burn.fn', 'burn function', 2, /\bfn\s+burn\b/i, 'source'),
            makePattern('token.approve.fn', 'approve/allowance function', 2, /\bfn\s+(approve|allowance)\b/i, 'source'),
            makePattern('token.balance.fn', 'balance function', 1, /\bfn\s+(balance|balance_of|total_supply)\b/i, 'source'),
            makePattern('token.dependency', 'token SDK dependency', 3, /\bsoroban-token-sdk\b/i, 'cargo'),
            makePattern('token.keywords', 'token keywords', 1, /\b(token|spender|allowance|decimals|symbol)\b/i, 'source'),
        ],
    },
    {
        id: 'escrow',
        displayName: 'Escrow',
        category: 'escrow',
        description: 'Escrow/release/refund style contract pattern.',
        minScore: 4,
        source: 'builtin',
        actions: [
            { id: 'escrow.deposit', label: 'Create Escrow Deposit', description: 'Prepare a deposit-style invocation.' },
            { id: 'escrow.release', label: 'Release Escrow Funds', description: 'Prepare a release-style invocation.' },
            { id: 'escrow.refund', label: 'Refund Escrow', description: 'Prepare a refund-style invocation.' },
        ],
        patterns: [
            makePattern('escrow.deposit.fn', 'deposit function', 2, /\bfn\s+deposit\b/i, 'source'),
            makePattern('escrow.release.fn', 'release function', 2, /\bfn\s+release\b/i, 'source'),
            makePattern('escrow.refund.fn', 'refund function', 2, /\bfn\s+refund\b/i, 'source'),
            makePattern('escrow.keywords', 'escrow keywords', 1, /\b(escrow|beneficiary|arbiter|deadline|timeout|unlock)\b/i, 'source'),
            makePattern('escrow.path', 'escrow directory hint', 1, /\bescrow\b/i, 'path'),
        ],
    },
    {
        id: 'voting',
        displayName: 'Voting',
        category: 'voting',
        description: 'Governance and ballot style contract pattern.',
        minScore: 4,
        source: 'builtin',
        actions: [
            { id: 'voting.createProposal', label: 'Create Proposal', description: 'Prepare a proposal-style invocation.' },
            { id: 'voting.castVote', label: 'Cast Vote', description: 'Prepare a vote-style invocation.' },
            { id: 'voting.finalize', label: 'Finalize Voting', description: 'Prepare a finalize/close invocation.' },
        ],
        patterns: [
            makePattern('voting.vote.fn', 'vote function', 2, /\bfn\s+(vote|cast_vote)\b/i, 'source'),
            makePattern('voting.proposal.fn', 'proposal function', 2, /\bfn\s+(proposal|create_proposal|submit_proposal)\b/i, 'source'),
            makePattern('voting.finalize.fn', 'finalize function', 2, /\bfn\s+(close_vote|finalize|finalize_proposal)\b/i, 'source'),
            makePattern('voting.keywords', 'voting keywords', 1, /\b(vote|proposal|ballot|quorum|tally|voter|candidate)\b/i, 'source'),
            makePattern('voting.path', 'voting directory hint', 1, /\b(vote|voting|governance)\b/i, 'path'),
        ],
    },
];

const UNKNOWN_TEMPLATE_RESULT: TemplateDetectionResult = {
    templateId: 'unknown',
    displayName: 'Unknown',
    category: 'unknown',
    source: 'unknown',
    confidence: 0,
    score: 0,
    matchedPatterns: [],
    actions: [],
};

export class ContractTemplateService {
    private readonly outputChannel: SimpleOutputChannel;
    private readonly configCache = new Map<string, ConfigCacheEntry>();

    constructor(outputChannel: SimpleOutputChannel = NOOP_OUTPUT) {
        this.outputChannel = outputChannel;
    }

    public getBuiltInTemplates(): TemplateDefinition[] {
        return BUILTIN_TEMPLATES;
    }

    public loadTemplateConfiguration(workspaceRoot: string): TemplateConfigurationLoadResult {
        const configPath = this.resolveTemplateConfigPath(workspaceRoot);
        if (!configPath) {
            this.configCache.delete(workspaceRoot);
            return { templates: [], warnings: [] };
        }

        let stat: fs.Stats;
        try {
            stat = fs.statSync(configPath);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                configPath,
                templates: [],
                warnings: [`Failed to read template config metadata: ${message}`],
            };
        }

        const cached = this.configCache.get(workspaceRoot);
        if (cached && cached.configPath === configPath && cached.mtimeMs === stat.mtimeMs) {
            return cached.result;
        }

        const result = this.readTemplateConfiguration(configPath);
        this.configCache.set(workspaceRoot, {
            configPath,
            mtimeMs: stat.mtimeMs,
            result,
        });
        return result;
    }

    public detectTemplate(input: TemplateDetectionInput): TemplateDetectionResult {
        const customTemplates = input.customTemplates || [];
        const allDefinitions = [...BUILTIN_TEMPLATES, ...customTemplates];

        if (input.manualTemplateId && input.manualTemplateId.trim()) {
            return this.resolveManualTemplate(input.manualTemplateId.trim(), allDefinitions);
        }

        const cargoContent = this.safeReadText(input.cargoTomlPath);
        const sourceContent = this.collectRustSourceText(input.contractDir);
        const pathContent = `${input.contractDir}\n${input.contractName}`.toLowerCase();
        const cargoDeps = this.extractDependencies(cargoContent, input.cargoTomlPath).join('\n');

        const context = {
            source: sourceContent.toLowerCase(),
            cargo: `${cargoContent.toLowerCase()}\n${cargoDeps}`,
            path: pathContent,
            any: `${sourceContent}\n${cargoContent}\n${pathContent}`.toLowerCase(),
        };

        const evaluations: TemplateEvaluation[] = allDefinitions
            .map(definition => this.evaluateTemplate(definition, context))
            .filter((evalResult) => evalResult.score >= evalResult.definition.minScore);

        if (evaluations.length === 0) {
            return { ...UNKNOWN_TEMPLATE_RESULT };
        }

        const best = evaluations.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            if (a.definition.source !== b.definition.source) {
                return a.definition.source === 'custom' ? -1 : 1;
            }
            return a.definition.id.localeCompare(b.definition.id);
        })[0];

        const confidenceRaw = best.score / Math.max(best.definition.minScore + 2, 1);
        const confidence = Number(Math.min(1, confidenceRaw).toFixed(2));

        return {
            templateId: best.definition.id,
            displayName: best.definition.displayName,
            category: best.definition.category,
            source: best.definition.source,
            confidence,
            score: best.score,
            matchedPatterns: best.matchedPatterns,
            actions: best.definition.actions,
        };
    }

    public categorizeContracts(contracts: TemplateDetectionInput[]): Record<string, TemplateDetectionResult[]> {
        const grouped: Record<string, TemplateDetectionResult[]> = {};

        for (const contract of contracts) {
            const detection = this.detectTemplate(contract);
            const category = detection.category || 'unknown';
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(detection);
        }

        return grouped;
    }

    public getTemplateAssignmentOptions(customTemplates: TemplateDefinition[] = []): TemplateAssignmentOption[] {
        const builtIn = BUILTIN_TEMPLATES.map((template) => ({
            id: template.id,
            label: template.displayName,
            description: template.description || `${template.displayName} contract template`,
            category: template.category,
            source: 'builtin' as const,
        }));

        const custom = customTemplates.map((template) => ({
            id: template.id,
            label: template.displayName,
            description: template.description || 'Custom template from workspace configuration',
            category: template.category,
            source: 'custom' as const,
        }));

        return [
            ...builtIn,
            ...custom,
            {
                id: 'unknown',
                label: 'Unknown / Unclassified',
                description: 'Mark this contract as unclassified.',
                category: 'unknown',
                source: 'system',
            },
        ];
    }

    public getTemplateActions(
        templateId?: string,
        templateCategory?: string,
        customTemplates: TemplateDefinition[] = []
    ): TemplateActionDefinition[] {
        if (templateId) {
            const byId = this.resolveTemplateById(templateId, customTemplates);
            if (byId && byId.actions.length > 0) {
                return byId.actions;
            }
        }

        if (templateCategory) {
            const byCategory = [...BUILTIN_TEMPLATES, ...customTemplates].find(
                (t) => t.category.toLowerCase() === templateCategory.toLowerCase()
            );
            if (byCategory) {
                return byCategory.actions;
            }
        }

        return [];
    }

    public resolveTemplateById(templateId: string, customTemplates: TemplateDefinition[] = []): TemplateDefinition | undefined {
        const id = templateId.toLowerCase();
        return [...BUILTIN_TEMPLATES, ...customTemplates].find((template) => template.id.toLowerCase() === id);
    }

    private resolveTemplateConfigPath(workspaceRoot: string): string | undefined {
        for (const filename of TEMPLATE_CONFIG_FILENAMES) {
            const candidate = path.join(workspaceRoot, filename);
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return candidate;
            }
        }
        return undefined;
    }

    private readTemplateConfiguration(configPath: string): TemplateConfigurationLoadResult {
        const warnings: string[] = [];
        let raw: string;
        try {
            raw = fs.readFileSync(configPath, 'utf-8');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { configPath, templates: [], warnings: [`Failed reading template config: ${message}`] };
        }

        let parsed: TemplateConfigFile;
        try {
            parsed = JSON.parse(raw) as TemplateConfigFile;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { configPath, templates: [], warnings: [`Invalid JSON in template config: ${message}`] };
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { configPath, templates: [], warnings: ['Template config root must be a JSON object.'] };
        }

        const templatesRaw = parsed.templates;
        if (!Array.isArray(templatesRaw)) {
            return { configPath, templates: [], warnings };
        }

        const templates = templatesRaw
            .map((cfg, index) => this.buildCustomTemplateDefinition(cfg, index, warnings))
            .filter((template): template is TemplateDefinition => !!template);

        this.outputChannel.appendLine(
            `[Template] Loaded ${templates.length} custom template definition(s) from ${configPath}`
        );

        return { configPath, templates, warnings };
    }

    private buildCustomTemplateDefinition(
        config: CustomTemplateConfig,
        index: number,
        warnings: string[]
    ): TemplateDefinition | undefined {
        if (!config || typeof config !== 'object') {
            warnings.push(`templates[${index}] is not an object and was skipped.`);
            return undefined;
        }

        const id = typeof config.id === 'string' ? config.id.trim() : '';
        if (!id) {
            warnings.push(`templates[${index}] is missing "id" and was skipped.`);
            return undefined;
        }

        const displayName = (typeof config.displayName === 'string' && config.displayName.trim())
            ? config.displayName.trim()
            : id;
        const category = (typeof config.category === 'string' && config.category.trim())
            ? config.category.trim().toLowerCase()
            : id.toLowerCase();

        const patterns: TemplatePatternDefinition[] = [];

        const addWordPatterns = (items: unknown, weight: number, source: 'source' | 'cargo' | 'path', prefix: string) => {
            if (!Array.isArray(items)) { return; }
            for (let i = 0; i < items.length; i++) {
                const raw = items[i];
                if (typeof raw !== 'string' || !raw.trim()) { continue; }
                const token = raw.trim();
                patterns.push(makePattern(
                    `${prefix}.${i}`,
                    `${prefix} contains "${token}"`,
                    weight,
                    new RegExp(`\\b${escapeRegex(token)}\\b`, 'i'),
                    source
                ));
            }
        };

        addWordPatterns(config.keywords, 1, 'source', 'keyword');
        addWordPatterns(config.requiredKeywords, 2, 'source', 'requiredKeyword');
        addWordPatterns(config.dependencies, 2, 'cargo', 'dependency');
        addWordPatterns(config.pathHints, 1, 'path', 'pathHint');

        if (patterns.length === 0) {
            warnings.push(`templates[${index}] (${id}) has no valid patterns and was skipped.`);
            return undefined;
        }

        const minScore = typeof config.minScore === 'number' && config.minScore > 0
            ? Math.floor(config.minScore)
            : Math.min(4, Math.max(1, Math.ceil(patterns.length / 2)));

        const actions: TemplateActionDefinition[] = Array.isArray(config.actions)
            ? config.actions
                .filter((action) => action && typeof action.id === 'string' && typeof action.label === 'string')
                .map((action) => ({
                    id: action.id.trim(),
                    label: action.label.trim(),
                    description: typeof action.description === 'string' ? action.description : undefined,
                }))
                .filter((action) => !!action.id && !!action.label)
            : [];

        return {
            id,
            displayName,
            category,
            description: config.description,
            minScore,
            source: 'custom',
            actions,
            patterns,
        };
    }

    private resolveManualTemplate(templateId: string, definitions: TemplateDefinition[]): TemplateDetectionResult {
        if (templateId.toLowerCase() === 'unknown') {
            return {
                ...UNKNOWN_TEMPLATE_RESULT,
                source: 'manual',
                matchedPatterns: ['Manually assigned as unknown'],
            };
        }

        const match = definitions.find((definition) => definition.id.toLowerCase() === templateId.toLowerCase());
        if (!match) {
            return {
                ...UNKNOWN_TEMPLATE_RESULT,
                source: 'manual',
                matchedPatterns: [`Manual template "${templateId}" is no longer defined.`],
            };
        }

        return {
            templateId: match.id,
            displayName: match.displayName,
            category: match.category,
            source: 'manual',
            confidence: 1,
            score: Number.POSITIVE_INFINITY,
            matchedPatterns: [`Manually assigned template "${match.displayName}"`],
            actions: match.actions,
        };
    }

    private evaluateTemplate(
        definition: TemplateDefinition,
        context: { source: string; cargo: string; path: string; any: string }
    ): TemplateEvaluation {
        let score = 0;
        const matchedPatterns: string[] = [];

        for (const pattern of definition.patterns) {
            const haystack = pattern.target === 'any' ? context.any : context[pattern.target];
            if (pattern.regex.test(haystack)) {
                score += pattern.weight;
                matchedPatterns.push(pattern.description);
            }
        }

        return { definition, score, matchedPatterns };
    }

    private safeReadText(filePath: string): string {
        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch {
            return '';
        }
    }

    private extractDependencies(cargoContent: string, cargoPath: string): string[] {
        if (!cargoContent.trim()) {
            return [];
        }
        try {
            const parsed = parseCargoToml(cargoContent, cargoPath);
            return [
                ...Object.keys(parsed.dependencies),
                ...Object.keys(parsed.devDependencies),
                ...Object.keys(parsed.buildDependencies),
            ];
        } catch {
            return [];
        }
    }

    private collectRustSourceText(contractDir: string): string {
        const srcDir = path.join(contractDir, 'src');
        if (!fs.existsSync(srcDir)) {
            return '';
        }

        const files = this.collectRustFiles(srcDir, [], 0).slice(0, 20);
        const snippets: string[] = [];
        let totalBytes = 0;

        for (const file of files) {
            try {
                const text = fs.readFileSync(file, 'utf-8');
                totalBytes += Buffer.byteLength(text, 'utf-8');
                if (totalBytes > 350_000) {
                    break;
                }
                snippets.push(text);
            } catch {
                // ignore unreadable files
            }
        }

        return snippets.join('\n');
    }

    private collectRustFiles(dir: string, files: string[], depth: number): string[] {
        if (depth > 4) {
            return files;
        }

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return files;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'target' || entry.name === '.git') {
                    continue;
                }
                this.collectRustFiles(fullPath, files, depth + 1);
                continue;
            }
            if (entry.isFile() && entry.name.endsWith('.rs')) {
                files.push(fullPath);
            }
        }

        return files;
    }
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
