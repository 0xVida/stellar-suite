import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import { formatCliError } from '../utils/errorFormatter';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

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

export interface SimulationResult {
    success: boolean;
    result?: any;
    error?: string;
    resourceUsage?: {
        cpuInstructions?: number;
        memoryBytes?: number;
    };
}

export class SorobanCliService {
    private cliPath: string;
    private source: string;

    constructor(cliPath: string, source: string = 'dev') {
        this.cliPath = cliPath;
        this.source = source;
    }

    async simulateTransaction(
        contractId: string,
        functionName: string,
        args: any[],
        network: string = 'testnet'
    ): Promise<SimulationResult> {
        try {
            const commandParts = [
                this.cliPath,
                'contract',
                'invoke',
                '--id', contractId,
                '--source', this.source,
                '--network', network,
                '--'
            ];

            commandParts.push(functionName);

            if (args.length > 0 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
                const argObj = args[0];
                for (const [key, value] of Object.entries(argObj)) {
                    commandParts.push(`--${key}`);
                    if (typeof value === 'object') {
                        commandParts.push(JSON.stringify(value));
                    } else {
                        commandParts.push(String(value));
                    }
                }
            } else {
                for (const arg of args) {
                    if (typeof arg === 'object') {
                        commandParts.push(JSON.stringify(arg));
                    } else {
                        commandParts.push(String(arg));
                    }
                }
            }

            const env = getEnvironmentWithPath();
            
            const { stdout, stderr } = await execFileAsync(
                commandParts[0],
                commandParts.slice(1),
                {
                    env: env,
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 30000
                }
            );

            if (stderr && stderr.trim().length > 0) {
                if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('failed')) {
                    return {
                        success: false,
                        error: formatCliError(stderr)
                    };
                }
            }

            try {
                const output = stdout.trim();
                try {
                    const parsed = JSON.parse(output);
                    return {
                        success: true,
                        result: parsed.result || parsed.returnValue || parsed,
                        resourceUsage: parsed.resource_usage || parsed.resourceUsage || parsed.cpu_instructions ? {
                            cpuInstructions: parsed.cpu_instructions,
                            memoryBytes: parsed.memory_bytes
                        } : undefined
                    };
                } catch {
                    const jsonMatch = output.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        return {
                            success: true,
                            result: parsed.result || parsed.returnValue || parsed,
                            resourceUsage: parsed.resource_usage || parsed.resourceUsage || parsed.cpu_instructions ? {
                                cpuInstructions: parsed.cpu_instructions,
                                memoryBytes: parsed.memory_bytes
                            } : undefined
                        };
                    }
                    return {
                        success: true,
                        result: output
                    };
                }
            } catch (parseError) {
                return {
                    success: true,
                    result: stdout.trim()
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                return {
                    success: false,
                    error: `Stellar CLI not found at "${this.cliPath}". Make sure it is installed and in your PATH, or configure the stellarSuite.cliPath setting.`
                };
            }

            return {
                success: false,
                error: `CLI execution failed: ${errorMessage}`
            };
        }
    }

    async isAvailable(): Promise<boolean> {
        try {
            const env = getEnvironmentWithPath();
            await execFileAsync(this.cliPath, ['--version'], { env: env, timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    static async findCliPath(): Promise<string | null> {
        const commonPaths = [
            'stellar',
            path.join(os.homedir(), '.cargo', 'bin', 'stellar'),
            '/usr/local/bin/stellar',
            '/opt/homebrew/bin/stellar',
            '/usr/bin/stellar'
        ];

        const env = getEnvironmentWithPath();
        for (const cliPath of commonPaths) {
            try {
                if (cliPath === 'stellar') {
                    await execAsync('stellar --version', { env: env, timeout: 5000 });
                    return 'stellar';
                } else {
                    await execFileAsync(cliPath, ['--version'], { env: env, timeout: 5000 });
                    return cliPath;
                }
            } catch {
            }
        }
        return null;
    }
}
