import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const execFileAsync = promisify(execFile);

function getEnvironmentWithPath(): NodeJS.ProcessEnv {
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

export interface DeploymentResult {
    success: boolean;
    contractId?: string;
    transactionHash?: string;
    error?: string;
    buildOutput?: string;
    deployOutput?: string;
}

export class ContractDeployer {
    private cliPath: string;
    private source: string;
    private network: string;

    constructor(cliPath: string, source: string = 'dev', network: string = 'testnet') {
        this.cliPath = cliPath;
        this.source = source;
        this.network = network;
    }

    async buildContract(contractPath: string): Promise<{ success: boolean; output: string; wasmPath?: string }> {
        try {
            const env = getEnvironmentWithPath();
            
            const { stdout, stderr } = await execFileAsync(
                this.cliPath,
                ['contract', 'build'],
                {
                    cwd: contractPath,
                    env: env,
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 120000
                }
            );

            const output = stdout + stderr;
            const wasmMatch = output.match(/target\/wasm32[^\/]*\/release\/[^\s]+\.wasm/);
            let wasmPath: string | undefined;
            
            if (wasmMatch) {
                wasmPath = path.join(contractPath, wasmMatch[0]);
            } else {
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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                output: errorMessage
            };
        }
    }

    async deployContract(wasmPath: string): Promise<DeploymentResult> {
        try {
            if (!fs.existsSync(wasmPath)) {
                return {
                    success: false,
                    error: `WASM file not found: ${wasmPath}`
                };
            }

            const env = getEnvironmentWithPath();
            
            const { stdout, stderr } = await execFileAsync(
                this.cliPath,
                [
                    'contract',
                    'deploy',
                    '--wasm', wasmPath,
                    '--source', this.source,
                    '--network', this.network
                ],
                {
                    env: env,
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 60000
                }
            );

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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            let errorOutput = errorMessage;
            if (error instanceof Error && 'stderr' in error) {
                errorOutput = (error as any).stderr || errorMessage;
            }

            return {
                success: false,
                error: errorOutput
            };
        }
    }

    async buildAndDeploy(contractPath: string): Promise<DeploymentResult> {
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

    async deployFromWasm(wasmPath: string): Promise<DeploymentResult> {
        return this.deployContract(wasmPath);
    }
}
