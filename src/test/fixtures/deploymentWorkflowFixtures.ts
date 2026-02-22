declare function require(name: string): any;

const fs = require('fs');
const os = require('os');
const path = require('path');

export interface DeploymentFixtureContract {
    name: string;
    dir: string;
    wasmPath: string;
}

export interface DeploymentFixtureWorkspace {
    rootDir: string;
    contracts: DeploymentFixtureContract[];
    cleanup: () => void;
}

export function createDeploymentFixtureWorkspace(contractNames: string[] = ['hello-contract']): DeploymentFixtureWorkspace {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stellar-suite-deploy-it-'));
    const contracts = contractNames.map(name => createContractFixture(rootDir, name));

    return {
        rootDir,
        contracts,
        cleanup: () => {
            fs.rmSync(rootDir, { recursive: true, force: true });
        },
    };
}

export function detectContractDirectories(rootDir: string): string[] {
    const found: string[] = [];

    const walk = (current: string): void => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        const hasCargoToml = entries.some((entry: { isFile: () => boolean; name: string }) => entry.isFile() && entry.name === 'Cargo.toml');
        const hasLib = fs.existsSync(path.join(current, 'src', 'lib.rs'));

        if (hasCargoToml && hasLib) {
            found.push(current);
            return;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
                continue;
            }
            walk(path.join(current, entry.name));
        }
    };

    walk(rootDir);
    return found.sort();
}

export function detectExpectedWasmPath(contractDir: string): string | null {
    const candidates = [
        path.join(contractDir, 'target', 'wasm32v1-none', 'release'),
        path.join(contractDir, 'target', 'wasm32-unknown-unknown', 'release'),
    ];

    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) {
            continue;
        }

        const files = fs.readdirSync(candidate).filter((file: string) => file.endsWith('.wasm'));
        if (files.length === 0) {
            continue;
        }

        const contractName = path.basename(contractDir).replace(/-/g, '_');
        const preferred = files.find((file: string) => file.includes(contractName)) ?? files[0];
        return path.join(candidate, preferred);
    }

    return null;
}

function createContractFixture(rootDir: string, contractName: string): DeploymentFixtureContract {
    const contractDir = path.join(rootDir, contractName);
    const srcDir = path.join(contractDir, 'src');
    const releaseDir = path.join(contractDir, 'target', 'wasm32-unknown-unknown', 'release');

    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(releaseDir, { recursive: true });

    fs.writeFileSync(
        path.join(contractDir, 'Cargo.toml'),
        [
            '[package]',
            `name = "${contractName}"`,
            'version = "0.1.0"',
            'edition = "2021"',
            '',
            '[lib]',
            'crate-type = ["cdylib"]',
            '',
            '[dependencies]',
            'soroban-sdk = "22.0.0"',
            '',
        ].join('\n'),
        'utf8'
    );

    fs.writeFileSync(
        path.join(srcDir, 'lib.rs'),
        [
            '#![no_std]',
            'use soroban_sdk::{contract, contractimpl, Env, Symbol};',
            '',
            '#[contract]',
            'pub struct Contract;',
            '',
            '#[contractimpl]',
            'impl Contract {',
            '    pub fn hello(_env: Env, to: Symbol) -> Symbol {',
            '        to',
            '    }',
            '}',
            '',
        ].join('\n'),
        'utf8'
    );

    const wasmFileName = `${contractName.replace(/-/g, '_')}.wasm`;
    const wasmPath = path.join(releaseDir, wasmFileName);
    fs.writeFileSync(wasmPath, '00asm-fixture', 'utf8');

    return {
        name: contractName,
        dir: contractDir,
        wasmPath,
    };
}
