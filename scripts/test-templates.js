#!/usr/bin/env node
/**
 * Runs `cargo test` in each template under templates/.
 * Uses a shared CARGO_TARGET_DIR (templates/target) to reduce disk usage.
 * Exits with 1 if any template's tests fail.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const templatesDir = path.join(__dirname, '..', 'templates');
const sharedTargetDir = path.join(templatesDir, 'target');
const dirs = fs.readdirSync(templatesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const failed = [];
const passed = [];

for (const name of dirs) {
  const dir = path.join(templatesDir, name);
  const hasCargo = fs.existsSync(path.join(dir, 'Cargo.toml')) || fs.existsSync(path.join(dir, 'cargo.toml'));
  if (!hasCargo) continue;

  console.log(`\n--- Testing template: ${name} ---`);
  const result = spawnSync('cargo', ['test'], {
    cwd: dir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      CARGO_TARGET_DIR: sharedTargetDir,
    },
  });

  if (result.status !== 0) {
    failed.push(name);
  } else {
    passed.push(name);
  }
}

console.log('\n--- Template test summary ---');
console.log('Passed:', passed.length ? passed.join(', ') : '(none)');
if (failed.length) {
  console.error('Failed:', failed.join(', '));
  process.exit(1);
}
console.log('All template tests passed.');
