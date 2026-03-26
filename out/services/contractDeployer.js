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
exports.ContractDeployer = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
function getEnvironmentWithPath() {
    const env = { ...process.env };
    const homeDir = os.homedir();
    const cargoBin = path.join(homeDir, '.cargo', 'bin');
    const additionalPaths = [
        cargoBin,
        path.join(homeDir, '.local', 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin'
    ];
    const currentPath = env.PATH || env.Path || '';
    env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(path.delimiter);
    env.Path = env.PATH;
    return env;
}
class ContractDeployer {
    constructor(cliPath, source = 'dev', network = 'testnet') {
        this.cliPath = cliPath;
        this.source = source;
        this.network = network;
    }
    async buildContract(contractPath) {
        try {
            const env = getEnvironmentWithPath();
            const { stdout, stderr } = await execFileAsync(this.cliPath, ['contract', 'build'], {
                cwd: contractPath,
                env: env,
                maxBuffer: 10 * 1024 * 1024,
                timeout: 120000
            });
            const output = stdout + stderr;
            const wasmMatch = output.match(/target\/wasm32[^\/]*\/release\/[^\s]+\.wasm/);
            let wasmPath;
            if (wasmMatch) {
                wasmPath = path.join(contractPath, wasmMatch[0]);
            }
            else {
                const commonPaths = [
                    path.join(contractPath, 'target', 'wasm32v1-none', 'release', '*.wasm'),
                    path.join(contractPath, 'target', 'wasm32-unknown-unknown', 'release', '*.wasm')
                ];
                for (const pattern of commonPaths) {
                    const dir = path.dirname(pattern);
                    if (fs.existsSync(dir)) {
                        const files = fs.readdirSync(dir).filter(f => f.endsWith('.wasm'));
                        if (files.length > 0) {
                            wasmPath = path.join(dir, files[0]);
                            break;
                        }
                    }
                }
            }
            return {
                success: true,
                output,
                wasmPath
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                output: errorMessage
            };
        }
    }
    async deployContract(wasmPath) {
        try {
            if (!fs.existsSync(wasmPath)) {
                return {
                    success: false,
                    error: `WASM file not found: ${wasmPath}`
                };
            }
            const env = getEnvironmentWithPath();
            const { stdout, stderr } = await execFileAsync(this.cliPath, [
                'contract',
                'deploy',
                '--wasm', wasmPath,
                '--source', this.source,
                '--network', this.network
            ], {
                env: env,
                maxBuffer: 10 * 1024 * 1024,
                timeout: 60000
            });
            const output = stdout + stderr;
            const contractIdMatch = output.match(/Contract\s+ID[:\s]+(C[A-Z0-9]{55})/i);
            const txHashMatch = output.match(/Transaction\s+hash[:\s]+([a-f0-9]{64})/i);
            const contractId = contractIdMatch ? contractIdMatch[1] : undefined;
            const transactionHash = txHashMatch ? txHashMatch[1] : undefined;
            if (!contractId) {
                const altMatch = output.match(/(C[A-Z0-9]{55})/);
                if (altMatch) {
                    return {
                        success: true,
                        contractId: altMatch[0],
                        transactionHash,
                        deployOutput: output
                    };
                }
                return {
                    success: false,
                    error: 'Could not extract Contract ID from deployment output',
                    deployOutput: output
                };
            }
            return {
                success: true,
                contractId,
                transactionHash,
                deployOutput: output
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            let errorOutput = errorMessage;
            let fullOutput = errorMessage;
            if (error instanceof Error && 'stderr' in error) {
                const stderr = error.stderr || '';
                const stdout = error.stdout || '';
                fullOutput = stdout + stderr;
                errorOutput = stderr || errorMessage;
            }
            return {
                success: false,
                error: errorOutput,
                deployOutput: fullOutput
            };
        }
    }
    async buildAndDeploy(contractPath) {
        const buildResult = await this.buildContract(contractPath);
        if (!buildResult.success) {
            return {
                success: false,
                error: `Build failed: ${buildResult.output}`,
                buildOutput: buildResult.output
            };
        }
        if (!buildResult.wasmPath) {
            return {
                success: false,
                error: 'Build succeeded but could not locate WASM file',
                buildOutput: buildResult.output
            };
        }
        const deployResult = await this.deployContract(buildResult.wasmPath);
        deployResult.buildOutput = buildResult.output;
        return deployResult;
    }
    async deployFromWasm(wasmPath) {
        return this.deployContract(wasmPath);
    }
}
exports.ContractDeployer = ContractDeployer;
//# sourceMappingURL=contractDeployer.js.map