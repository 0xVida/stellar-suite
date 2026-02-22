import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';

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

export interface ContractFunction {
    name: string;
    description?: string;
    parameters: FunctionParameter[];
}

export interface FunctionParameter {
    name: string;
    type?: string;
    required: boolean;
    description?: string;
}

export class ContractInspector {
    private cliPath: string;
    private source: string;
    private network: string;

    constructor(cliPath: string, source: string = 'dev', network: string = 'testnet') {
        this.cliPath = cliPath;
        this.source = source;
        this.network = network;
    }

    async getContractFunctions(contractId: string): Promise<ContractFunction[]> {
        try {
            const env = getEnvironmentWithPath();
            
            const { stdout } = await execFileAsync(
                this.cliPath,
                [
                    'contract',
                    'invoke',
                    '--id', contractId,
                    '--source', this.source,
                    '--network', this.network,
                    '--',
                    '--help'
                ],
                {
                    env: env,
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 30000
                }
            );

            return this.parseHelpOutput(stdout);
        } catch (error) {
            console.error('Failed to get contract functions:', error);
            return [];
        }
    }

    async getFunctionHelp(contractId: string, functionName: string): Promise<ContractFunction | null> {
        try {
            const env = getEnvironmentWithPath();
            
            const { stdout } = await execFileAsync(
                this.cliPath,
                [
                    'contract',
                    'invoke',
                    '--id', contractId,
                    '--source', this.source,
                    '--network', this.network,
                    '--',
                    functionName,
                    '--help'
                ],
                {
                    env: env,
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 30000
                }
            );

            return this.parseFunctionHelp(functionName, stdout);
        } catch (error) {
            console.error(`Failed to get help for function ${functionName}:`, error);
            return null;
        }
    }

    private parseHelpOutput(helpOutput: string): ContractFunction[] {
        const functions: ContractFunction[] = [];
        const lines = helpOutput.split('\n');

        let inCommandsSection = false;
        const seenFunctions = new Set<string>();

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            if (line.length === 0) {
                continue;
            }

            if (line.toLowerCase().includes('commands:') || line.toLowerCase().includes('subcommands:')) {
                inCommandsSection = true;
                continue;
            }

            if ((line.toLowerCase().includes('options:') || line.toLowerCase().includes('global options:')) && inCommandsSection) {
                inCommandsSection = false;
                break;
            }

            if (inCommandsSection) {
                const functionMatch = line.match(/^(\w+)(?:\s{2,}|\s+)(.+)?$/);
                if (functionMatch) {
                    const funcName = functionMatch[1];
                    if (!seenFunctions.has(funcName)) {
                        seenFunctions.add(funcName);
                        functions.push({
                            name: funcName,
                            description: functionMatch[2]?.trim() || '',
                            parameters: []
                        });
                    }
                }
            }
        }

        if (functions.length === 0) {
            const usageMatches = Array.from(helpOutput.matchAll(/Usage:\s+(\w+)\s+\[OPTIONS\]/gi));
            for (const match of usageMatches) {
                const funcName = match[1];
                if (!seenFunctions.has(funcName)) {
                    seenFunctions.add(funcName);
                    functions.push({
                        name: funcName,
                        parameters: []
                    });
                }
            }
        }

        return functions;
    }

    private parseFunctionHelp(functionName: string, helpOutput: string): ContractFunction {
        const functionInfo: ContractFunction = {
            name: functionName,
            parameters: []
        };

        const lines = helpOutput.split('\n');
        let inOptionsSection = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.toLowerCase().includes('options:') || 
                trimmed.toLowerCase().includes('arguments:') ||
                trimmed.toLowerCase().includes('parameters:')) {
                inOptionsSection = true;
                continue;
            }

            if (trimmed.toLowerCase().includes('usage:') && inOptionsSection) {
                break;
            }

            if (inOptionsSection && trimmed.length > 0 && !trimmed.startsWith('--')) {
                if (!trimmed.match(/^[A-Z]/)) {
                    continue;
                }
            }

            if (inOptionsSection && trimmed.length > 0) {
                const paramMatch = trimmed.match(/-{1,2}(\w+)(?:\s+<([^>]+)>)?\s+(.+)/);
                if (paramMatch) {
                    const paramName = paramMatch[1];
                    const paramType = paramMatch[2];
                    const paramDesc = paramMatch[3]?.trim() || '';
                    
                    const isOptional = trimmed.toLowerCase().includes('[optional]') || 
                                     trimmed.toLowerCase().includes('optional') ||
                                     trimmed.toLowerCase().includes('default:');

                    functionInfo.parameters.push({
                        name: paramName,
                        type: paramType,
                        required: !isOptional,
                        description: paramDesc
                    });
                }
            }
        }

        return functionInfo;
    }
}
