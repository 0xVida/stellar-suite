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
const assert = __importStar(require("assert"));
const path = __importStar(require("path"));
const deploymentDependencyResolver_1 = require("../services/deploymentDependencyResolver");
// Minimal ContractMetadata shape needed by resolver.
// We only include fields the resolver reads.
function mkContract(opts) {
    return {
        contractName: opts.name,
        contractDir: opts.dir,
        cargoTomlPath: opts.cargo,
        dependencies: opts.deps ?? {},
        buildDependencies: opts.buildDeps ?? {},
        devDependencies: opts.devDeps ?? {},
    };
}
function norm(p) {
    return p.replace(/\\/g, '/').replace(/\/$/, '');
}
async function testTopologicalOrder_pathDeps() {
    // Use platform paths so resolver’s path.resolve behavior matches.
    const root = path.join(process.cwd(), '__tmp__', 'w');
    const ADir = path.join(root, 'A');
    const BDir = path.join(root, 'B');
    const ACargo = path.join(ADir, 'Cargo.toml');
    const BCargo = path.join(BDir, 'Cargo.toml');
    // A depends on B via path
    const A = mkContract({
        name: 'A',
        dir: ADir,
        cargo: ACargo,
        deps: {
            b: { name: 'b', path: '../B', workspace: false },
        },
    });
    const B = mkContract({
        name: 'B',
        dir: BDir,
        cargo: BCargo,
    });
    const res = (0, deploymentDependencyResolver_1.resolveDeploymentDependencies)([A, B]);
    assert.deepStrictEqual(res.cycles.length, 0);
    assert.strictEqual(res.edges.length, 1);
    const a = norm(ACargo);
    const b = norm(BCargo);
    // B must come before A in order
    assert.ok(res.order.indexOf(b) < res.order.indexOf(a));
    console.log('  ✓ dependency resolver: path deps topo order');
}
async function testTopologicalOrder_workspaceDeps() {
    const root = path.join(process.cwd(), '__tmp__', 'w2');
    const ADir = path.join(root, 'A');
    const BDir = path.join(root, 'B');
    const ACargo = path.join(ADir, 'Cargo.toml');
    const BCargo = path.join(BDir, 'Cargo.toml');
    // A depends on B via workspace=true + name match
    const A = mkContract({
        name: 'contract-a',
        dir: ADir,
        cargo: ACargo,
        deps: {
            'contract-b': { name: 'contract-b', workspace: true },
        },
    });
    const B = mkContract({
        name: 'contract-b',
        dir: BDir,
        cargo: BCargo,
    });
    const res = (0, deploymentDependencyResolver_1.resolveDeploymentDependencies)([A, B]);
    assert.deepStrictEqual(res.cycles.length, 0);
    assert.strictEqual(res.edges.length, 1);
    const a = norm(ACargo);
    const b = norm(BCargo);
    assert.ok(res.order.indexOf(b) < res.order.indexOf(a));
    console.log('  ✓ dependency resolver: workspace deps topo order');
}
async function testCycleDetection() {
    const root = path.join(process.cwd(), '__tmp__', 'w3');
    const ADir = path.join(root, 'A');
    const BDir = path.join(root, 'B');
    const ACargo = path.join(ADir, 'Cargo.toml');
    const BCargo = path.join(BDir, 'Cargo.toml');
    // A -> B and B -> A
    const A = mkContract({
        name: 'A',
        dir: ADir,
        cargo: ACargo,
        deps: { b: { name: 'b', workspace: true } },
    });
    const B = mkContract({
        name: 'b',
        dir: BDir,
        cargo: BCargo,
        deps: { A: { name: 'A', workspace: true } },
    });
    const res = (0, deploymentDependencyResolver_1.resolveDeploymentDependencies)([A, B]);
    assert.ok(res.cycles.length >= 1, 'should detect at least one cycle');
    assert.strictEqual(res.order.length, 0, 'order should be empty when cycles exist');
    assert.strictEqual(res.levels.length, 0, 'levels should be empty when cycles exist');
    console.log('  ✓ dependency resolver: cycle detection');
}
(async () => {
    console.log('\n[deploymentDependencyResolver.test]');
    await testTopologicalOrder_pathDeps();
    await testTopologicalOrder_workspaceDeps();
    await testCycleDetection();
    console.log('  [ok] deploymentDependencyResolver tests passed');
})().catch((e) => {
    console.error('  [fail] deploymentDependencyResolver tests failed:', e);
    process.exit(1);
});
