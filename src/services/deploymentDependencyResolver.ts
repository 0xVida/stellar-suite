import * as path from 'path';

import { CargoDependency } from './contractMetadataService';
import { ContractMetadata } from './contractMetadataService';

export interface DependencyEdge {
  /** Dependent contract Cargo.toml path. */
  from: string;
  /** Prerequisite contract Cargo.toml path. */
  to: string;
  /** Why this dependency was inferred. */
  reason: 'path' | 'workspace';
  /** Raw dependency name in Cargo.toml. */
  dependencyName: string;
}

export interface DependencyResolutionResult {
  /** All contracts included in this resolution run (Cargo.toml paths). */
  nodes: string[];
  /** Edges where `from` depends on `to`. */
  edges: DependencyEdge[];
  /** Topological deployment order (empty when cycles exist). */
  order: string[];
  /** Parallelizable waves of deploys (empty when cycles exist). */
  levels: string[][];
  /** Cycles detected in the dependency graph. */
  cycles: string[][];
}

function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '');
}

function resolveDepPath(contractDir: string, dep: CargoDependency): string | undefined {
  if (!dep.path) {
    return undefined;
  }
  // dep.path is relative to the Cargo.toml directory.
  return normalisePath(path.resolve(contractDir, dep.path));
}

function buildCycles(nodes: string[], edges: DependencyEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n, []);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
  }

  const cycles: string[][] = [];
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 visiting, 2 done
  const stack: string[] = [];

  function dfs(node: string) {
    state.set(node, 1);
    stack.push(node);

    for (const next of adj.get(node) ?? []) {
      const s = state.get(next) ?? 0;
      if (s === 0) {
        dfs(next);
        continue;
      }
      if (s === 1) {
        const idx = stack.indexOf(next);
        if (idx !== -1) {
          cycles.push(stack.slice(idx).concat([next]));
        }
      }
    }

    stack.pop();
    state.set(node, 2);
  }

  for (const n of nodes) {
    if ((state.get(n) ?? 0) === 0) {
      dfs(n);
    }
  }

  return cycles;
}

function topoLevels(nodes: string[], edges: DependencyEdge[]): { order: string[]; levels: string[][] } {
  const indegree = new Map<string, number>();
  const out = new Map<string, string[]>();

  for (const n of nodes) {
    indegree.set(n, 0);
    out.set(n, []);
  }

  for (const e of edges) {
    indegree.set(e.from, (indegree.get(e.from) ?? 0) + 1);
    out.get(e.to)?.push(e.from);
  }

  const order: string[] = [];
  const levels: string[][] = [];

  let ready = nodes.filter(n => (indegree.get(n) ?? 0) === 0);

  while (ready.length) {
    const wave = [...ready].sort();
    levels.push(wave);
    ready = [];

    for (const n of wave) {
      order.push(n);
      for (const dep of out.get(n) ?? []) {
        indegree.set(dep, (indegree.get(dep) ?? 0) - 1);
      }
    }

    for (const n of nodes) {
      if ((indegree.get(n) ?? 0) === 0 && !order.includes(n) && !ready.includes(n)) {
        ready.push(n);
      }
    }
  }

  return { order, levels };
}

/**
 * Build a dependency graph between workspace contracts based on Cargo.toml dependencies.
 *
 * Heuristics:
 * - `path = "..."`
 *   If the resolved path points at another known contract directory, we add an edge.
 * - `{ workspace = true }`
 *   If the dependency name matches another known contract name, we add an edge.
 */
export function resolveDeploymentDependencies(
  contracts: ContractMetadata[],
  opts?: { includeDevDependencies?: boolean }
): DependencyResolutionResult {
  const includeDev = opts?.includeDevDependencies ?? false;

  const byCargoPath = new Map<string, ContractMetadata>();
  const byName = new Map<string, ContractMetadata>();

  for (const c of contracts) {
    const cargo = normalisePath(c.cargoTomlPath);
    byCargoPath.set(cargo, { ...c, cargoTomlPath: cargo });
    byName.set(c.contractName.toLowerCase(), { ...c, cargoTomlPath: cargo });
  }

  const nodes = [...byCargoPath.keys()].sort();
  const edges: DependencyEdge[] = [];

  for (const c of byCargoPath.values()) {
    const from = normalisePath(c.cargoTomlPath);
    const depBuckets: Array<Record<string, CargoDependency>> = [
      c.dependencies,
      c.buildDependencies,
    ];
    if (includeDev) {
      depBuckets.push(c.devDependencies);
    }

    for (const bucket of depBuckets) {
      for (const dep of Object.values(bucket)) {
        const depPath = resolveDepPath(c.contractDir, dep);
        if (depPath) {
          const cargoGuess = normalisePath(path.join(depPath, 'Cargo.toml'));
          const target = byCargoPath.get(cargoGuess);
          if (target) {
            edges.push({ from, to: target.cargoTomlPath, reason: 'path', dependencyName: dep.name });
          }
          continue;
        }

        if (dep.workspace) {
          const target = byName.get(dep.name.toLowerCase());
          if (target) {
            edges.push({ from, to: target.cargoTomlPath, reason: 'workspace', dependencyName: dep.name });
          }
        }
      }
    }
  }

  const cycles = buildCycles(nodes, edges);
  if (cycles.length) {
    return { nodes, edges, order: [], levels: [], cycles };
  }

  const { order, levels } = topoLevels(nodes, edges);
  return { nodes, edges, order, levels, cycles: [] };
}

