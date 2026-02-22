import * as assert from 'assert';
import * as path from 'path';
import { resolveDeploymentDependencies } from '../services/deploymentDependencyResolver';

// Minimal ContractMetadata shape needed by resolver.
// We only include fields the resolver reads.
function mkContract(opts: {
  name: string;
  dir: string;
  cargo: string;
  deps?: Record<string, any>;
  buildDeps?: Record<string, any>;
  devDeps?: Record<string, any>;
}) {
  return {
    contractName: opts.name,
    contractDir: opts.dir,
    cargoTomlPath: opts.cargo,
    dependencies: opts.deps ?? {},
    buildDependencies: opts.buildDeps ?? {},
    devDependencies: opts.devDeps ?? {},
  } as any;
}

function norm(p: string) {
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

  const res = resolveDeploymentDependencies([A, B]);

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

  const res = resolveDeploymentDependencies([A, B]);

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

  const res = resolveDeploymentDependencies([A, B]);

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