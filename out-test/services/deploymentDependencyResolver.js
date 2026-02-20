"use strict";
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
exports.resolveDeploymentDependencies = resolveDeploymentDependencies;
const path = __importStar(require("path"));
function normalisePath(p) {
    return p.replace(/\\/g, '/').replace(/\/$/, '');
}
function resolveDepPath(contractDir, dep) {
    if (!dep.path) {
        return undefined;
    }
    // dep.path is relative to the Cargo.toml directory.
    return normalisePath(path.resolve(contractDir, dep.path));
}
function buildCycles(nodes, edges) {
    const adj = new Map();
    for (const n of nodes) {
        adj.set(n, []);
    }
    for (const e of edges) {
        adj.get(e.from)?.push(e.to);
    }
    const cycles = [];
    const state = new Map(); // 0 unvisited, 1 visiting, 2 done
    const stack = [];
    function dfs(node) {
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
function topoLevels(nodes, edges) {
    const indegree = new Map();
    const out = new Map();
    for (const n of nodes) {
        indegree.set(n, 0);
        out.set(n, []);
    }
    for (const e of edges) {
        indegree.set(e.from, (indegree.get(e.from) ?? 0) + 1);
        out.get(e.to)?.push(e.from);
    }
    const order = [];
    const levels = [];
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
function resolveDeploymentDependencies(contracts, opts) {
    const includeDev = opts?.includeDevDependencies ?? false;
    const byCargoPath = new Map();
    const byName = new Map();
    for (const c of contracts) {
        const cargo = normalisePath(c.cargoTomlPath);
        byCargoPath.set(cargo, { ...c, cargoTomlPath: cargo });
        byName.set(c.contractName.toLowerCase(), { ...c, cargoTomlPath: cargo });
    }
    const nodes = [...byCargoPath.keys()].sort();
    const edges = [];
    for (const c of byCargoPath.values()) {
        const from = normalisePath(c.cargoTomlPath);
        const depBuckets = [
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
