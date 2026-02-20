// ============================================================
// src/test/templateDetection.test.ts
// Unit tests for contract template detection and categorization.
// ============================================================

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ContractTemplateService, TemplateDefinition } from '../services/contractTemplateService';

function writeContract(
    root: string,
    name: string,
    cargoContent: string,
    sourceContent: string
): { contractDir: string; cargoPath: string } {
    const contractDir = path.join(root, name);
    fs.mkdirSync(path.join(contractDir, 'src'), { recursive: true });
    const cargoPath = path.join(contractDir, 'Cargo.toml');
    fs.writeFileSync(cargoPath, cargoContent, 'utf-8');
    fs.writeFileSync(path.join(contractDir, 'src', 'lib.rs'), sourceContent, 'utf-8');
    return { contractDir, cargoPath };
}

function createWorkspace(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'stellar-template-tests-'));
}

function cleanupWorkspace(root: string): void {
    fs.rmSync(root, { recursive: true, force: true });
}

function detectWithService(
    service: ContractTemplateService,
    name: string,
    contractDir: string,
    cargoPath: string,
    customTemplates?: TemplateDefinition[]
) {
    return service.detectTemplate({
        contractDir,
        cargoTomlPath: cargoPath,
        contractName: name,
        customTemplates,
    });
}

async function testDetectsTokenTemplate() {
    const workspace = createWorkspace();
    try {
        const service = new ContractTemplateService();
        const contract = writeContract(
            workspace,
            'token-contract',
            `[package]
name = "token-contract"
version = "0.1.0"

[dependencies]
soroban-sdk = "20.0.0"
soroban-token-sdk = "20.0.0"
`,
            `pub fn mint() {}
pub fn transfer() {}
pub fn burn() {}
`
        );

        const result = detectWithService(service, 'token-contract', contract.contractDir, contract.cargoPath);
        assert.strictEqual(result.category, 'token');
        assert.strictEqual(result.templateId, 'token');
        assert.ok(result.score >= 4, 'token score should meet threshold');
        console.log('  ✓ detects token template');
    } finally {
        cleanupWorkspace(workspace);
    }
}

async function testDetectsEscrowTemplate() {
    const workspace = createWorkspace();
    try {
        const service = new ContractTemplateService();
        const contract = writeContract(
            workspace,
            'escrow-contract',
            `[package]
name = "escrow-contract"
version = "0.1.0"

[dependencies]
soroban-sdk = "20.0.0"
`,
            `pub fn deposit() {}
pub fn release() {}
pub fn refund() {}
`
        );

        const result = detectWithService(service, 'escrow-contract', contract.contractDir, contract.cargoPath);
        assert.strictEqual(result.category, 'escrow');
        assert.strictEqual(result.templateId, 'escrow');
        console.log('  ✓ detects escrow template');
    } finally {
        cleanupWorkspace(workspace);
    }
}

async function testDetectsVotingTemplate() {
    const workspace = createWorkspace();
    try {
        const service = new ContractTemplateService();
        const contract = writeContract(
            workspace,
            'voting-contract',
            `[package]
name = "voting-contract"
version = "0.1.0"

[dependencies]
soroban-sdk = "20.0.0"
`,
            `pub fn create_proposal() {}
pub fn cast_vote() {}
pub fn finalize() {}
`
        );

        const result = detectWithService(service, 'voting-contract', contract.contractDir, contract.cargoPath);
        assert.strictEqual(result.category, 'voting');
        assert.strictEqual(result.templateId, 'voting');
        console.log('  ✓ detects voting template');
    } finally {
        cleanupWorkspace(workspace);
    }
}

async function testFallsBackToUnknownWhenUnclassified() {
    const workspace = createWorkspace();
    try {
        const service = new ContractTemplateService();
        const contract = writeContract(
            workspace,
            'utility-contract',
            `[package]
name = "utility-contract"
version = "0.1.0"

[dependencies]
soroban-sdk = "20.0.0"
`,
            `pub fn hello_world() {}
pub fn increment_counter() {}
`
        );

        const result = detectWithService(service, 'utility-contract', contract.contractDir, contract.cargoPath);
        assert.strictEqual(result.category, 'unknown');
        assert.strictEqual(result.source, 'unknown');
        console.log('  ✓ falls back to unknown category');
    } finally {
        cleanupWorkspace(workspace);
    }
}

async function testLoadsCustomTemplateFromConfig() {
    const workspace = createWorkspace();
    try {
        const service = new ContractTemplateService();
        fs.writeFileSync(
            path.join(workspace, 'stellar-suite.templates.json'),
            JSON.stringify({
                version: '1',
                templates: [
                    {
                        id: 'amm',
                        displayName: 'AMM',
                        category: 'amm',
                        keywords: ['liquidity_pool', 'swap'],
                        minScore: 2,
                        actions: [{ id: 'amm.swap', label: 'Swap Assets' }],
                    },
                ],
            }, null, 2),
            'utf-8'
        );

        const loaded = service.loadTemplateConfiguration(workspace);
        assert.strictEqual(loaded.templates.length, 1);
        assert.strictEqual(loaded.templates[0].id, 'amm');

        const contract = writeContract(
            workspace,
            'amm-contract',
            `[package]
name = "amm-contract"
version = "0.1.0"

[dependencies]
soroban-sdk = "20.0.0"
`,
            `pub fn swap() {}
pub fn add_liquidity_pool() {}
`
        );

        const result = detectWithService(
            service,
            'amm-contract',
            contract.contractDir,
            contract.cargoPath,
            loaded.templates
        );
        assert.strictEqual(result.templateId, 'amm');
        assert.strictEqual(result.category, 'amm');
        assert.strictEqual(result.source, 'custom');
        console.log('  ✓ loads and detects custom template definitions');
    } finally {
        cleanupWorkspace(workspace);
    }
}

async function testManualTemplateOverride() {
    const workspace = createWorkspace();
    try {
        const service = new ContractTemplateService();
        const contract = writeContract(
            workspace,
            'utility-contract',
            `[package]
name = "utility-contract"
version = "0.1.0"

[dependencies]
soroban-sdk = "20.0.0"
`,
            `pub fn helper() {}
`
        );

        const result = service.detectTemplate({
            contractDir: contract.contractDir,
            cargoTomlPath: contract.cargoPath,
            contractName: 'utility-contract',
            manualTemplateId: 'token',
        });

        assert.strictEqual(result.templateId, 'token');
        assert.strictEqual(result.category, 'token');
        assert.strictEqual(result.source, 'manual');
        assert.strictEqual(result.confidence, 1);
        console.log('  ✓ supports manual template override');
    } finally {
        cleanupWorkspace(workspace);
    }
}

async function testCategorizeContractsByTemplateType() {
    const workspace = createWorkspace();
    try {
        const service = new ContractTemplateService();

        const token = writeContract(
            workspace,
            'token-contract',
            `[package]
name = "token-contract"
version = "0.1.0"
`,
            `pub fn transfer() {}
pub fn mint() {}
`
        );

        const voting = writeContract(
            workspace,
            'voting-contract',
            `[package]
name = "voting-contract"
version = "0.1.0"
`,
            `pub fn create_proposal() {}
pub fn cast_vote() {}
`
        );

        const grouped = service.categorizeContracts([
            {
                contractDir: token.contractDir,
                cargoTomlPath: token.cargoPath,
                contractName: 'token-contract',
            },
            {
                contractDir: voting.contractDir,
                cargoTomlPath: voting.cargoPath,
                contractName: 'voting-contract',
            },
        ]);

        assert.ok(grouped['token'] && grouped['token'].length === 1, 'token category contains one contract');
        assert.ok(grouped['voting'] && grouped['voting'].length === 1, 'voting category contains one contract');
        console.log('  ✓ categorizes contracts by template type');
    } finally {
        cleanupWorkspace(workspace);
    }
}

async function run() {
    const tests: Array<() => Promise<void>> = [
        testDetectsTokenTemplate,
        testDetectsEscrowTemplate,
        testDetectsVotingTemplate,
        testFallsBackToUnknownWhenUnclassified,
        testLoadsCustomTemplateFromConfig,
        testManualTemplateOverride,
        testCategorizeContractsByTemplateType,
    ];

    let passed = 0;
    let failed = 0;

    console.log('\n● ContractTemplateService');
    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (err) {
            failed++;
            console.error(`  ✕ ${test.name}`);
            console.error(`    ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(50));

    if (failed > 0) {
        process.exitCode = 1;
    }
}

run().catch((err) => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
