// ============================================================
// src/test/fixtures/largeWorkspaceFixtures.ts
// Test fixtures for large workspace performance tests.
// Generates synthetic contract metadata at various scales to
// exercise detection, filtering, state persistence, and
// dependency resolution without touching the real filesystem.
// ============================================================

import * as path from 'path';
import { ContractMetadata, CargoDependency } from '../../services/contractMetadataService';

// ── Scale presets ─────────────────────────────────────────────

/** Named workspace scale configurations used across performance tests. */
export interface WorkspaceScale {
    /** Human-readable label for reports. */
    label: string;
    /** Number of contracts to generate. */
    contractCount: number;
    /** Average number of dependencies per contract. */
    avgDepsPerContract: number;
    /** Maximum acceptable detection time in milliseconds. */
    detectionBudgetMs: number;
    /** Maximum acceptable filter time in milliseconds. */
    filterBudgetMs: number;
}

export const WORKSPACE_SCALES: WorkspaceScale[] = [
    {
        label: 'small',
        contractCount: 10,
        avgDepsPerContract: 2,
        detectionBudgetMs: 50,
        filterBudgetMs: 10,
    },
    {
        label: 'medium',
        contractCount: 100,
        avgDepsPerContract: 3,
        detectionBudgetMs: 200,
        filterBudgetMs: 30,
    },
    {
        label: 'large',
        contractCount: 500,
        avgDepsPerContract: 4,
        detectionBudgetMs: 1000,
        filterBudgetMs: 100,
    },
    {
        label: 'xlarge',
        contractCount: 1000,
        avgDepsPerContract: 5,
        detectionBudgetMs: 3000,
        filterBudgetMs: 250,
    },
];

// ── Contract template categories ──────────────────────────────

const TEMPLATE_CATEGORIES = ['token', 'escrow', 'voting', 'amm', 'nft', 'unknown'] as const;
type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];

// ── Fixture generation ────────────────────────────────────────

/**
 * Generates a single synthetic ContractMetadata entry.
 * The generated contract is fully self-consistent and suitable
 * for passing to any service that accepts ContractMetadata.
 */
export function generateContract(index: number, workspaceRoot: string): ContractMetadata {
    const category = TEMPLATE_CATEGORIES[index % TEMPLATE_CATEGORIES.length];
    const name = `${category}_contract_${index.toString().padStart(4, '0')}`;
    const contractDir = path.join(workspaceRoot, 'contracts', name);
    const cargoTomlPath = path.join(contractDir, 'Cargo.toml');

    return {
        contractName: name,
        cargoTomlPath,
        contractDir,
        package: {
            name,
            version: '0.1.0',
            authors: [],
            edition: '2021',
        },
        dependencies: buildDependencies(index),
        devDependencies: {},
        buildDependencies: {},
        contractDependencies: [],
        isWorkspaceRoot: false,
        cachedAt: new Date().toISOString(),
        parseWarnings: [],
    };
}

/**
 * Generates a realistic set of runtime dependencies for a contract.
 * Every contract gets the soroban-sdk. A subset also gets inter-contract
 * path dependencies so the dependency graph has meaningful edges.
 */
function buildDependencies(index: number): Record<string, CargoDependency> {
    const deps: Record<string, CargoDependency> = {
        'soroban-sdk': {
            name: 'soroban-sdk',
            version: '20.0.0',
            workspace: false,
        },
    };

    // Every third contract depends on the previous one via a path dep,
    // creating a realistic sparse dependency graph.
    if (index > 0 && index % 3 === 0) {
        const prevCategory = TEMPLATE_CATEGORIES[(index - 1) % TEMPLATE_CATEGORIES.length];
        const prevName = `${prevCategory}_contract_${(index - 1).toString().padStart(4, '0')}`;
        const relPath = `../${prevName}`;
        deps[prevName] = {
            name: prevName,
            path: relPath,
            workspace: false,
        };
    }

    return deps;
}

/**
 * Generates a batch of synthetic contracts at the requested scale.
 * All contracts share the same synthetic workspace root path.
 */
export function generateWorkspace(contractCount: number): {
    contracts: ContractMetadata[];
    workspaceRoot: string;
} {
    const workspaceRoot = '/synthetic/workspace';
    const contracts: ContractMetadata[] = [];

    for (let i = 0; i < contractCount; i++) {
        contracts.push(generateContract(i, workspaceRoot));
    }

    return { contracts, workspaceRoot };
}

// ── State persistence fixtures ────────────────────────────────

/** A minimal deployed-contract record for state persistence tests. */
export interface DeployedContractRecord {
    id: string;
    contractName: string;
    contractId: string;
    network: string;
    deployedAt: string;
    transactionHash: string;
    wasmHash: string;
    templateCategory: TemplateCategory;
    isBuilt: boolean;
}

/**
 * Generates a batch of deployed contract records for state persistence
 * and serialization benchmarks.
 */
export function generateDeploymentHistory(count: number): DeployedContractRecord[] {
    const records: DeployedContractRecord[] = [];

    for (let i = 0; i < count; i++) {
        const category = TEMPLATE_CATEGORIES[i % TEMPLATE_CATEGORIES.length];
        records.push({
            id: `dep_${i.toString().padStart(6, '0')}`,
            contractName: `${category}_contract_${i.toString().padStart(4, '0')}`,
            contractId: `C${i.toString().padStart(55, '0')}`,
            network: i % 2 === 0 ? 'testnet' : 'mainnet',
            deployedAt: new Date(Date.now() - i * 60_000).toISOString(),
            transactionHash: `tx${i.toString(16).padStart(62, '0')}`,
            wasmHash: `wasm${i.toString(16).padStart(60, '0')}`,
            templateCategory: category,
            isBuilt: true,
        });
    }

    return records;
}

// ── Filter state fixture ──────────────────────────────────────

/** Represents the filter/search state applied to the sidebar contract list. */
export interface ContractFilterState {
    search: string;
    build: 'all' | 'built' | 'not-built';
    deploy: 'all' | 'deployed' | 'not-deployed';
    template: string;
}

/** A set of representative filter combinations used in filter benchmarks. */
export const FILTER_SCENARIOS: ContractFilterState[] = [
    { search: '', build: 'all', deploy: 'all', template: '' },
    { search: 'token', build: 'all', deploy: 'all', template: '' },
    { search: '', build: 'built', deploy: 'all', template: '' },
    { search: '', build: 'all', deploy: 'deployed', template: '' },
    { search: '', build: 'all', deploy: 'all', template: 'token' },
    { search: 'contract', build: 'built', deploy: 'deployed', template: 'escrow' },
    { search: 'voting', build: 'not-built', deploy: 'not-deployed', template: 'voting' },
];

// ── Sidebar UI rendering fixture ──────────────────────────────

/** Minimal contract shape used by the sidebar rendering logic. */
export interface SidebarContractItem {
    name: string;
    isBuilt: boolean;
    contractId?: string;
    templateCategory: string;
    deployedAt?: string;
    network?: string;
}

/**
 * Converts ContractMetadata entries into the lightweight shape
 * consumed by sidebar rendering and filter logic.
 */
export function toSidebarItems(
    contracts: ContractMetadata[],
    deployedIds: Set<string>
): SidebarContractItem[] {
    return contracts.map((c, idx) => {
        const category = TEMPLATE_CATEGORIES[idx % TEMPLATE_CATEGORIES.length];
        const isDeployed = deployedIds.has(c.contractName);
        return {
            name: c.contractName,
            isBuilt: idx % 4 !== 0,  // 75% built
            contractId: isDeployed ? `C${idx.toString().padStart(55, '0')}` : undefined,
            templateCategory: category,
            deployedAt: isDeployed ? new Date(Date.now() - idx * 30_000).toISOString() : undefined,
            network: isDeployed ? (idx % 2 === 0 ? 'testnet' : 'mainnet') : undefined,
        };
    });
}
