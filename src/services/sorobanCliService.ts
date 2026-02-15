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
                    // Convert value to string, handling JSON for complex types
                    if (typeof value === 'object') {
                        commandParts.push(JSON.stringify(value));
                    } else {
                        commandParts.push(String(value));
                    }
                }
            } else {
                // Array format: pass as positional arguments
                for (const arg of args) {
                    // Convert argument to string
                    if (typeof arg === 'object') {
                        commandParts.push(JSON.stringify(arg));
                    } else {
                        commandParts.push(String(arg));
                    }
                }
            }

            // Get environment with proper PATH
            const env = getEnvironmentWithPath();
            
            // Execute the command using execFile with proper argument array
            // This avoids shell injection and properly handles arguments
            const { stdout, stderr } = await execFileAsync(
                commandParts[0], // CLI path
                commandParts.slice(1), // All arguments
                {
                    env: env,
                    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                    timeout: 30000 // 30 second timeout
                }
            );

            if (stderr && stderr.trim().length > 0) {
                // CLI may output warnings to stderr, but if it looks like an error, treat it as such
                if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('failed')) {
                    return {
                        success: false,
                        error: formatCliError(stderr)
                    };
                }
            }

            // Parse the output from Soroban CLI
            // The official CLI outputs structured data, often in JSON format
            try {
                const output = stdout.trim();
                
                // Try to parse as JSON first (CLI may output pure JSON)
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
                    // If not pure JSON, try to extract JSON from mixed output
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

                    // If no JSON found, return raw output (CLI may output plain text)
                    return {
                        success: true,
                        result: output
                    };
                }
            } catch (parseError) {
                // If parsing fails, return raw output
                return {
                    success: true,
                    result: stdout.trim()
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            // Check if it's a "command not found" error
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

    /**
     * Check if Stellar CLI is available.
     * Uses the official CLI version command.
     * 
     * @returns True if CLI is accessible
     */
    async isAvailable(): Promise<boolean> {
        try {
            const env = getEnvironmentWithPath();
            await execFileAsync(this.cliPath, ['--version'], { env: env, timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Try to find Stellar CLI in common installation locations.
     * 
     * @returns Path to CLI if found, or null
     */
    static async findCliPath(): Promise<string | null> {
        const commonPaths = [
            'stellar', // Try PATH first
            path.join(os.homedir(), '.cargo', 'bin', 'stellar'),
            '/usr/local/bin/stellar',
            '/opt/homebrew/bin/stellar',
            '/usr/bin/stellar'
        ];

        const env = getEnvironmentWithPath();
        for (const cliPath of commonPaths) {
            try {
                if (cliPath === 'stellar') {
                    // Use exec for PATH lookup with proper environment
                    await execAsync('stellar --version', { env: env, timeout: 5000 });
                    return 'stellar';
                } else {
                    // Use execFile for absolute paths
                    await execFileAsync(cliPath, ['--version'], { env: env, timeout: 5000 });
                    return cliPath;
                }
            } catch {
                // Continue to next path
            }
        }

        return null;
    }

    /**
     * Set the source identity to use for transactions.
     * 
     * @param source - Source identity name (e.g., 'dev')
     */
    setSource(source: string): void {
        this.source = source;
    }
}
