// ============================================================
// src/services/contractDependencyDetectionService.ts
// Comprehensive contract dependency detection and tracking service.
// Detects dependencies from Cargo.toml and Rust source imports,
// builds dependency graphs, identifies cycles, and provides
// visualization data for the UI.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { ContractMetadata, CargoDependency } from './contractMetadataService';
import { DependencyEdge, DependencyResolutionResult, resolveDeploymentDependencies } from './deploymentDependencyResolver';

// ── Public types ──────────────────────────────────────────────

/**
 * Represents an import statement found in contract source code
 */
export interface ImportDependency {
    /** Contract that contains the import */
    sourceContract: string;
    /** Imported module/crate name */
    importedModule: string;
    /** Type of import (use, extern crate, etc.) */
    importType: 'use' | 'extern_crate' | 'mod';
    /** Source file where import was found */
    sourceFile: string;
    /** Line number in source file */
    lineNumber: number;
    /** Full import statement text */
    statement: string;
}

/**
 * Enhanced dependency edge with additional metadata
 */
export interface EnhancedDependencyEdge extends DependencyEdge {
    /** Source of the dependency detection */
    source: 'cargo' | 'import' | 'both';
    /** Import dependencies that support this edge */
    imports?: ImportDependency[];
    /** Whether this is an external dependency */
    isExternal: boolean;
    /** Dependency metadata from Cargo.toml */
    cargoMetadata?: CargoDependency;
}

/**
 * Dependency node representing a contract in the graph
 */
export interface DependencyNode {
    /** Contract name */
    name: string;
    /** Cargo.toml path */
    cargoTomlPath: string;
    /** Contract directory */
    contractDir: string;
    /** Dependencies (outgoing edges) */
    dependencies: string[];
    /** Dependents (incoming edges) */
    dependents: string[];
    /** Whether this is an external dependency */
    isExternal: boolean;
    /** Number of direct dependencies */
    dependencyCount: number;
    /** Number of contracts depending on this one */
    dependentCount: number;
    /** Depth in dependency tree (0 = no dependencies) */
    depth: number;
}

/**
 * Complete dependency graph structure
 */
export interface DependencyGraph {
    /** All nodes in the graph */
    nodes: Map<string, DependencyNode>;
    /** All edges in the graph */
    edges: EnhancedDependencyEdge[];
    /** Import dependencies detected */
    imports: ImportDependency[];
    /** Circular dependency chains */
    cycles: string[][];
    /** Topologically sorted deployment order */
    deploymentOrder: string[];
    /** Parallelizable deployment levels */
    deploymentLevels: string[][];
    /** External dependencies (not in workspace) */
    externalDependencies: Set<string>;
    /** Workspace contracts */
    workspaceContracts: Set<string>;
    /** Graph statistics */
    statistics: DependencyGraphStatistics;
}

/**
 * Statistics about the dependency graph
 */
export interface DependencyGraphStatistics {
    /** Total number of contracts */
    totalContracts: number;
    /** Total number of dependencies */
    totalDependencies: number;
    /** Total number of external dependencies */
    externalDependencies: number;
    /** Number of circular dependencies */
    circularDependencies: number;
    /** Maximum dependency depth */
    maxDepth: number;
    /** Average dependencies per contract */
    avgDependenciesPerContract: number;
    /** Contracts with no dependencies */
    leafContracts: number;
    /** Contracts with no dependents */
    rootContracts: number;
}

/**
 * Options for dependency detection
 */
export interface DependencyDetectionOptions {
    /** Include dev dependencies */
    includeDevDependencies?: boolean;
    /** Include build dependencies */
    includeBuildDependencies?: boolean;
    /** Scan source files for imports */
    detectImports?: boolean;
    /** Maximum depth to scan for source files */
    maxSourceDepth?: number;
    /** File extensions to scan for imports */
    sourceExtensions?: string[];
}

// ── Minimal interface for compatibility ──────────────────────

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

// ── Main service class ────────────────────────────────────────

/**
 * Service for detecting and tracking contract dependencies.
 * 
 * Features:
 * - Parse Cargo.toml dependencies
 * - Detect import statements in Rust source files
 * - Build comprehensive dependency graphs
 * - Identify circular dependencies
 * - Calculate deployment order
 * - Provide visualization data
 * 
 * Usage:
 * ```ts
 * const service = new ContractDependencyDetectionService(outputChannel);
 * const graph = await service.buildDependencyGraph(contracts);
 * const cycles = service.detectCircularDependencies(graph);
 * const order = service.calculateDeploymentOrder(graph);
 * ```
 */
export class ContractDependencyDetectionService {
    private cachedGraph: DependencyGraph | null = null;
    private lastScanTime: number = 0;

    constructor(
        private readonly outputChannel: SimpleOutputChannel = {
            appendLine: (_msg: string) => { /* no-op */ },
        }
    ) {}

    // ── Main API ──────────────────────────────────────────────

    /**
     * Build a complete dependency graph from contract metadata
     */
    public async buildDependencyGraph(
        contracts: ContractMetadata[],
        options: DependencyDetectionOptions = {}
    ): Promise<DependencyGraph> {
        const opts = {
            includeDevDependencies: false,
            includeBuildDependencies: true,
            detectImports: true,
            maxSourceDepth: 3,
            sourceExtensions: ['.rs'],
            ...options,
        };

        this.log('[DependencyDetection] Building dependency graph...');
        this.log(`[DependencyDetection] Analyzing ${contracts.length} contracts`);

        // Step 1: Resolve Cargo.toml dependencies
        const cargoResolution = resolveDeploymentDependencies(contracts, {
            includeDevDependencies: opts.includeDevDependencies,
        });

        // Step 2: Detect import dependencies if enabled
        const imports = opts.detectImports
            ? await this.detectImportDependencies(contracts, opts)
            : [];

        this.log(`[DependencyDetection] Found ${imports.length} import statements`);

        // Step 3: Build enhanced edges
        const enhancedEdges = this.buildEnhancedEdges(
            cargoResolution.edges,
            imports,
            contracts
        );

        // Step 4: Build nodes
        const nodes = this.buildNodes(contracts, enhancedEdges);

        // Step 5: Identify external dependencies
        const { externalDependencies, workspaceContracts } = this.identifyExternalDependencies(
            contracts,
            enhancedEdges
        );

        // Step 6: Calculate statistics
        const statistics = this.calculateStatistics(nodes, enhancedEdges, externalDependencies);

        const graph: DependencyGraph = {
            nodes,
            edges: enhancedEdges,
            imports,
            cycles: cargoResolution.cycles,
            deploymentOrder: cargoResolution.order,
            deploymentLevels: cargoResolution.levels,
            externalDependencies,
            workspaceContracts,
            statistics,
        };

        this.cachedGraph = graph;
        this.lastScanTime = Date.now();

        this.log('[DependencyDetection] Graph built successfully');
        this.logGraphSummary(graph);

        return graph;
    }

    /**
     * Detect import dependencies from source files
     */
    public async detectImportDependencies(
        contracts: ContractMetadata[],
        options: DependencyDetectionOptions = {}
    ): Promise<ImportDependency[]> {
        const opts = {
            maxSourceDepth: 3,
            sourceExtensions: ['.rs'],
            ...options,
        };

        const imports: ImportDependency[] = [];

        for (const contract of contracts) {
            const sourceFiles = this.findSourceFiles(
                contract.contractDir,
                opts.sourceExtensions,
                opts.maxSourceDepth
            );

            for (const sourceFile of sourceFiles) {
                const fileImports = this.parseImportsFromFile(
                    sourceFile,
                    contract.contractName,
                    contract.cargoTomlPath
                );
                imports.push(...fileImports);
            }
        }

        return imports;
    }

    /**
     * Get cached graph if available and not stale
     */
    public getCachedGraph(maxAge: number = 60000): DependencyGraph | null {
        if (!this.cachedGraph) {
            return null;
        }

        const age = Date.now() - this.lastScanTime;
        if (age > maxAge) {
            return null;
        }

        return this.cachedGraph;
    }

    /**
     * Invalidate cached graph
     */
    public invalidateCache(): void {
        this.cachedGraph = null;
        this.lastScanTime = 0;
        this.log('[DependencyDetection] Cache invalidated');
    }

    /**
     * Check if a graph has circular dependencies
     */
    public hasCircularDependencies(graph: DependencyGraph): boolean {
        return graph.cycles.length > 0;
    }

    /**
     * Get detailed information about circular dependencies
     */
    public getCircularDependencyDetails(graph: DependencyGraph): string[] {
        return graph.cycles.map((cycle) => {
            const path = cycle.join(' → ');
            return `Circular dependency: ${path}`;
        });
    }

    /**
     * Get dependencies for a specific contract
     */
    public getContractDependencies(
        graph: DependencyGraph,
        contractName: string
    ): { direct: DependencyNode[]; transitive: DependencyNode[] } {
        const node = Array.from(graph.nodes.values()).find(
            (n) => n.name === contractName
        );

        if (!node) {
            return { direct: [], transitive: [] };
        }

        const direct = node.dependencies
            .map((depName) => graph.nodes.get(depName))
            .filter((n): n is DependencyNode => n !== undefined);

        const transitive = this.getTransitiveDependencies(graph, contractName);

        return { direct, transitive };
    }

    /**
     * Get dependents of a specific contract (contracts that depend on it)
     */
    public getContractDependents(
        graph: DependencyGraph,
        contractName: string
    ): { direct: DependencyNode[]; transitive: DependencyNode[] } {
        const node = Array.from(graph.nodes.values()).find(
            (n) => n.name === contractName
        );

        if (!node) {
            return { direct: [], transitive: [] };
        }

        const direct = node.dependents
            .map((depName) => graph.nodes.get(depName))
            .filter((n): n is DependencyNode => n !== undefined);

        const transitive = this.getTransitiveDependents(graph, contractName);

        return { direct, transitive };
    }

    // ── Internal implementation ───────────────────────────────

    /**
     * Find source files in a contract directory
     */
    private findSourceFiles(
        dir: string,
        extensions: string[],
        maxDepth: number,
        currentDepth: number = 0
    ): string[] {
        if (currentDepth > maxDepth) {
            return [];
        }

        const files: string[] = [];

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                // Skip common directories
                if (entry.isDirectory()) {
                    if (['target', 'node_modules', '.git', 'out'].includes(entry.name)) {
                        continue;
                    }
                    files.push(...this.findSourceFiles(fullPath, extensions, maxDepth, currentDepth + 1));
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (extensions.includes(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // Ignore read errors
        }

        return files;
    }

    /**
     * Parse import statements from a Rust source file
     */
    private parseImportsFromFile(
        filePath: string,
        contractName: string,
        cargoTomlPath: string
    ): ImportDependency[] {
        const imports: ImportDependency[] = [];

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const lineNumber = i + 1;

                // Match 'use' statements: use my_crate::something;
                const useMatch = line.match(/^use\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
                if (useMatch) {
                    imports.push({
                        sourceContract: contractName,
                        importedModule: useMatch[1],
                        importType: 'use',
                        sourceFile: filePath,
                        lineNumber,
                        statement: line,
                    });
                    continue;
                }

                // Match 'extern crate' statements: extern crate my_crate;
                const externMatch = line.match(/^extern\s+crate\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
                if (externMatch) {
                    imports.push({
                        sourceContract: contractName,
                        importedModule: externMatch[1],
                        importType: 'extern_crate',
                        sourceFile: filePath,
                        lineNumber,
                        statement: line,
                    });
                    continue;
                }

                // Match 'mod' statements: mod my_module;
                const modMatch = line.match(/^mod\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
                if (modMatch) {
                    imports.push({
                        sourceContract: contractName,
                        importedModule: modMatch[1],
                        importType: 'mod',
                        sourceFile: filePath,
                        lineNumber,
                        statement: line,
                    });
                }
            }
        } catch (error) {
            this.log(`[DependencyDetection] Failed to parse imports from ${filePath}: ${error}`);
        }

        return imports;
    }

    /**
     * Build enhanced edges combining Cargo.toml and import data
     */
    private buildEnhancedEdges(
        cargoEdges: DependencyEdge[],
        imports: ImportDependency[],
        contracts: ContractMetadata[]
    ): EnhancedDependencyEdge[] {
        const edges: EnhancedDependencyEdge[] = [];
        const edgeMap = new Map<string, EnhancedDependencyEdge>();

        // Build contract name lookup
        const contractByPath = new Map<string, ContractMetadata>();
        const contractByName = new Map<string, ContractMetadata>();
        for (const contract of contracts) {
            contractByPath.set(this.normalizePath(contract.cargoTomlPath), contract);
            contractByName.set(contract.contractName.toLowerCase(), contract);
        }

        // Process Cargo.toml edges
        for (const edge of cargoEdges) {
            const key = `${edge.from}|${edge.to}`;
            const fromContract = contractByPath.get(this.normalizePath(edge.from));
            const toContract = contractByPath.get(this.normalizePath(edge.to));

            const cargoMetadata = fromContract
                ? this.findCargoDependency(fromContract, edge.dependencyName)
                : undefined;

            const enhancedEdge: EnhancedDependencyEdge = {
                ...edge,
                source: 'cargo',
                isExternal: false,
                cargoMetadata,
            };

            edgeMap.set(key, enhancedEdge);
        }

        // Augment with import information
        for (const imp of imports) {
            const sourceContract = contractByName.get(imp.sourceContract.toLowerCase());
            const targetContract = contractByName.get(imp.importedModule.toLowerCase());

            if (sourceContract && targetContract) {
                const key = `${sourceContract.cargoTomlPath}|${targetContract.cargoTomlPath}`;
                const existing = edgeMap.get(key);

                if (existing) {
                    // Import confirms Cargo.toml dependency
                    existing.source = 'both';
                    existing.imports = existing.imports || [];
                    existing.imports.push(imp);
                } else {
                    // Import without Cargo.toml dependency (unusual but possible with workspace deps)
                    edgeMap.set(key, {
                        from: sourceContract.cargoTomlPath,
                        to: targetContract.cargoTomlPath,
                        reason: 'workspace',
                        dependencyName: imp.importedModule,
                        source: 'import',
                        isExternal: false,
                        imports: [imp],
                    });
                }
            }
        }

        return Array.from(edgeMap.values());
    }

    /**
     * Find cargo dependency metadata by name
     */
    private findCargoDependency(
        contract: ContractMetadata,
        dependencyName: string
    ): CargoDependency | undefined {
        const allDeps = {
            ...contract.dependencies,
            ...contract.buildDependencies,
            ...contract.devDependencies,
        };
        return allDeps[dependencyName];
    }

    /**
     * Build dependency nodes from contracts and edges
     */
    private buildNodes(
        contracts: ContractMetadata[],
        edges: EnhancedDependencyEdge[]
    ): Map<string, DependencyNode> {
        const nodes = new Map<string, DependencyNode>();

        // Initialize nodes
        for (const contract of contracts) {
            nodes.set(contract.contractName, {
                name: contract.contractName,
                cargoTomlPath: contract.cargoTomlPath,
                contractDir: contract.contractDir,
                dependencies: [],
                dependents: [],
                isExternal: false,
                dependencyCount: 0,
                dependentCount: 0,
                depth: 0,
            });
        }

        // Build adjacency lists and counts
        for (const edge of edges) {
            const fromContract = contracts.find(
                (c) => this.normalizePath(c.cargoTomlPath) === this.normalizePath(edge.from)
            );
            const toContract = contracts.find(
                (c) => this.normalizePath(c.cargoTomlPath) === this.normalizePath(edge.to)
            );

            if (fromContract && toContract) {
                const fromNode = nodes.get(fromContract.contractName);
                const toNode = nodes.get(toContract.contractName);

                if (fromNode && toNode) {
                    if (!fromNode.dependencies.includes(toNode.name)) {
                        fromNode.dependencies.push(toNode.name);
                        fromNode.dependencyCount++;
                    }
                    if (!toNode.dependents.includes(fromNode.name)) {
                        toNode.dependents.push(fromNode.name);
                        toNode.dependentCount++;
                    }
                }
            }
        }

        // Calculate depth
        this.calculateDepths(nodes);

        return nodes;
    }

    /**
     * Calculate depth of each node in the dependency tree
     */
    private calculateDepths(nodes: Map<string, DependencyNode>): void {
        const visited = new Set<string>();

        const calculateDepth = (nodeName: string): number => {
            if (visited.has(nodeName)) {
                return nodes.get(nodeName)?.depth ?? 0;
            }

            visited.add(nodeName);
            const node = nodes.get(nodeName);
            if (!node) {
                return 0;
            }

            if (node.dependencies.length === 0) {
                node.depth = 0;
                return 0;
            }

            const maxDepth = Math.max(
                ...node.dependencies.map((dep) => calculateDepth(dep))
            );
            node.depth = maxDepth + 1;

            return node.depth;
        };

        for (const nodeName of nodes.keys()) {
            calculateDepth(nodeName);
        }
    }

    /**
     * Identify external dependencies vs workspace contracts
     */
    private identifyExternalDependencies(
        contracts: ContractMetadata[],
        edges: EnhancedDependencyEdge[]
    ): { externalDependencies: Set<string>; workspaceContracts: Set<string> } {
        const workspaceContracts = new Set(contracts.map((c) => c.contractName));
        const externalDependencies = new Set<string>();

        for (const contract of contracts) {
            const allDeps = {
                ...contract.dependencies,
                ...contract.buildDependencies,
                ...contract.devDependencies,
            };

            for (const [name, dep] of Object.entries(allDeps)) {
                // External if it has version/git but no path, and not in workspace
                if (!dep.path && !workspaceContracts.has(name)) {
                    externalDependencies.add(name);
                }
            }
        }

        return { externalDependencies, workspaceContracts };
    }

    /**
     * Calculate graph statistics
     */
    private calculateStatistics(
        nodes: Map<string, DependencyNode>,
        edges: EnhancedDependencyEdge[],
        externalDependencies: Set<string>
    ): DependencyGraphStatistics {
        const totalContracts = nodes.size;
        const totalDependencies = edges.length;
        const maxDepth = Math.max(...Array.from(nodes.values()).map((n) => n.depth), 0);
        const avgDependenciesPerContract =
            totalContracts > 0 ? totalDependencies / totalContracts : 0;

        const leafContracts = Array.from(nodes.values()).filter(
            (n) => n.dependencyCount === 0
        ).length;

        const rootContracts = Array.from(nodes.values()).filter(
            (n) => n.dependentCount === 0
        ).length;

        return {
            totalContracts,
            totalDependencies,
            externalDependencies: externalDependencies.size,
            circularDependencies: 0, // Will be set by caller
            maxDepth,
            avgDependenciesPerContract,
            leafContracts,
            rootContracts,
        };
    }

    /**
     * Get transitive dependencies for a contract
     */
    private getTransitiveDependencies(
        graph: DependencyGraph,
        contractName: string
    ): DependencyNode[] {
        const visited = new Set<string>();
        const transitive: DependencyNode[] = [];

        const traverse = (name: string) => {
            const node = Array.from(graph.nodes.values()).find((n) => n.name === name);
            if (!node) {
                return;
            }

            for (const depName of node.dependencies) {
                if (visited.has(depName)) {
                    continue;
                }
                visited.add(depName);

                const depNode = graph.nodes.get(depName);
                if (depNode) {
                    transitive.push(depNode);
                    traverse(depName);
                }
            }
        };

        traverse(contractName);
        return transitive;
    }

    /**
     * Get transitive dependents for a contract
     */
    private getTransitiveDependents(
        graph: DependencyGraph,
        contractName: string
    ): DependencyNode[] {
        const visited = new Set<string>();
        const transitive: DependencyNode[] = [];

        const traverse = (name: string) => {
            const node = Array.from(graph.nodes.values()).find((n) => n.name === name);
            if (!node) {
                return;
            }

            for (const depName of node.dependents) {
                if (visited.has(depName)) {
                    continue;
                }
                visited.add(depName);

                const depNode = graph.nodes.get(depName);
                if (depNode) {
                    transitive.push(depNode);
                    traverse(depName);
                }
            }
        };

        traverse(contractName);
        return transitive;
    }

    /**
     * Normalize file path for comparison
     */
    private normalizePath(p: string): string {
        return p.replace(/\\/g, '/').replace(/\/$/, '');
    }

    /**
     * Log message to output channel
     */
    private log(message: string): void {
        this.outputChannel.appendLine(message);
    }

    /**
     * Log graph summary
     */
    private logGraphSummary(graph: DependencyGraph): void {
        this.log('[DependencyDetection] ═══════════════════════════════════════');
        this.log(`[DependencyDetection] Contracts: ${graph.statistics.totalContracts}`);
        this.log(`[DependencyDetection] Dependencies: ${graph.statistics.totalDependencies}`);
        this.log(`[DependencyDetection] External deps: ${graph.statistics.externalDependencies}`);
        this.log(`[DependencyDetection] Circular deps: ${graph.cycles.length}`);
        this.log(`[DependencyDetection] Max depth: ${graph.statistics.maxDepth}`);
        this.log(`[DependencyDetection] Leaf contracts: ${graph.statistics.leafContracts}`);
        this.log(`[DependencyDetection] Root contracts: ${graph.statistics.rootContracts}`);
        this.log('[DependencyDetection] ═══════════════════════════════════════');
    }
}
