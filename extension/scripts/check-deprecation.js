#!/usr/bin/env node
/**
 * Verification harness for the soroban-sdk DeprecationChecker core (issue #933).
 *
 * Exercises the pure parsing + comparison logic against representative
 * Cargo.toml fixtures and prints PASS/FAIL for each, with a non-zero exit on any
 * failure. This is the "verified terminal output" the issue requires; it needs
 * no VS Code host (the vscode-dependent class is exercised in the editor).
 *
 * Run: node scripts/check-deprecation.js   (after `npm run compile`)
 */
const {
  findSorobanSdkVersion,
  checkDeprecation,
  parseSemVer,
  LATEST_KNOWN_SOROBAN_SDK,
} = require('../out/services/DeprecationChecker.core.js');

let failures = 0;
function assert(name, cond) {
  const status = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${status}] ${name}`);
}

console.log('soroban-sdk DeprecationChecker — verification');
console.log(`latest known (offline floor): ${LATEST_KNOWN_SOROBAN_SDK}\n`);

// 1. Simple string dependency, outdated.
const m1 = findSorobanSdkVersion('soroban-sdk = "20.0.0"\n');
assert('parses simple string dependency', m1 && m1.raw === '20.0.0');
assert('classifies 20.0.0 as deprecated', checkDeprecation(m1.version).level === 'deprecated');

// 2. Table form with features, deprecated.
const m2 = findSorobanSdkVersion(
  '[dependencies]\nsoroban-sdk = { version = "19.1.0", features = ["testutils"] }\n',
);
assert('parses table-form dependency', m2 && m2.raw === '19.1.0');
assert('classifies 19.1.0 as deprecated', checkDeprecation(m2.version).level === 'deprecated');

// 3. Caret requirement just below latest → outdated (not deprecated).
const m3 = findSorobanSdkVersion('soroban-sdk = "^21.5.0"\n');
assert('strips caret prefix', m3 && m3.version.major === 21 && m3.version.minor === 5);
assert('classifies 21.5.0 as outdated', checkDeprecation(m3.version).level === 'outdated');

// 4. Up-to-date version → ok.
const m4 = findSorobanSdkVersion(`soroban-sdk = "${LATEST_KNOWN_SOROBAN_SDK}"\n`);
assert('classifies latest as ok', checkDeprecation(m4.version).level === 'ok');

// 5. No soroban-sdk dependency → null (nothing to warn).
assert('returns null when soroban-sdk absent', findSorobanSdkVersion('serde = "1"\n') === null);

// 6. Git/path dependency (no pinned version) → null.
assert(
  'returns null for git dependency',
  findSorobanSdkVersion('soroban-sdk = { git = "https://github.com/stellar/rs-soroban-sdk" }\n') === null,
);

// 7. Line/column tracking points at the version string.
const lined = '[dependencies]\nfoo = "1"\nsoroban-sdk = "18.0.0"\n';
const m7 = findSorobanSdkVersion(lined);
assert('reports correct line index', m7 && m7.line === 2);
assert('reports version start column', m7 && lined.split('\n')[2].slice(m7.startCol, m7.endCol) === '18.0.0');

// 8. parseSemVer tolerates partial versions.
const pv = parseSemVer('20');
assert('parseSemVer fills missing minor/patch', pv.major === 20 && pv.minor === 0 && pv.patch === 0);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
