import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

/**
 * Get environment with proper PATH for cargo and other tools.
 */
function getEnvironmentWithPath(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    const homeDir = os.homedir();
    const cargoBin = path.join(homeDir, '.cargo', 'bin');
    
    // Add common paths where cargo might be
    const additionalPaths = [
        cargoBin,
        path.join(homeDir, '.local', 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin'
    ];
    
    // Get current PATH or use empty string
    const currentPath = env.PATH || env.Path || '';
    
    // Prepend additional paths to PATH
    env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(path.delimiter);
    env.Path = env.PATH; // Windows compatibility
    
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

/**
 * Service for inspecting Soroban contracts to get function signatures and parameters.
 */
export class ContractInspector {
    private cliPath: string;
    private source: string;
    private network: string;

    constructor(cliPath: string, source: string = 'dev', network: string = 'testnet') {
        this.cliPath = cliPath;
        this.source = source;
        this.network = network;
    }

    /**
     * Get all available functions for a contract by querying the CLI help.
     * 
     * @param contractId - Contract ID to inspect
     * @returns Array of contract functions with their parameters
     */
    async getContractFunctions(contractId: string): Promise<ContractFunction[]> {
        try {
            // Get environment with proper PATH
            const env = getEnvironmentWithPath();
            
            // Query the contract's help to get function signatures
            // Command: stellar contract invoke --id <contract> --source <source> --network <network> -- --help
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
            // If help fails, return empty array
            console.error('Failed to get contract functions:', error);
            return [];
        }
    }

    /**
     * Get detailed help for a specific function.
     * 
     * @param contractId - Contract ID
     * @param functionName - Function name to get help for
     * @returns Function details with parameters
     */
    async getFunctionHelp(contractId: string, functionName: string): Promise<ContractFunction | null> {
        try {
            // Get environment with proper PATH
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

    /**
     * Parse the CLI help output to extract function signatures.
     * 
     * @param helpOutput - Raw help text from CLI
     * @returns Array of parsed functions
     */
    private parseHelpOutput(helpOutput: string): ContractFunction[] {
        const functions: ContractFunction[] = [];
        const lines = helpOutput.split('\n');

        // Look for function sections in the help output
        // Typically functions are listed as subcommands
        let inCommandsSection = false;
        const seenFunctions = new Set<string>();

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            // Skip empty lines
            if (line.length === 0) {
                continue;
            }

            // Look for "Commands:" or "Subcommands:" section
            if (line.toLowerCase().includes('commands:') || line.toLowerCase().includes('subcommands:')) {
                inCommandsSection = true;
                continue;
            }

            // Look for "Options:" or "Global Options:" which typically ends the commands section
            if ((line.toLowerCase().includes('options:') || line.toLowerCase().includes('global options:')) && inCommandsSection) {
                inCommandsSection = false;
                break;
            }

            if (inCommandsSection) {
                // Function names can be at the start of lines, possibly with indentation
                // Format: "function_name    Description of function"
                // Or: "  function_name    Description"
                // Remove leading/trailing whitespace and try to match
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

        // If no functions found in structured format, try alternative patterns
        if (functions.length === 0) {
            // Look for usage patterns like "Usage: function_name [OPTIONS]"
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

            // Try to find function names as standalone words (simple heuristic)
            const wordMatches = Array.from(helpOutput.matchAll(/\b([a-z][a-z0-9_]*)\b/gi));
            for (const match of wordMatches) {
                const word = match[1];
                // Skip common CLI words
                if (word.length > 2 && 
                    !['the', 'and', 'for', 'use', 'with', 'from', 'this', 'that', 'help', 'version'].includes(word.toLowerCase()) &&
                    !seenFunctions.has(word)) {
                    // This is a very basic heuristic - actual parsing is better
                    // But we'll use it as fallback
                }
            }
        }

        return functions;
    }

    /**
     * Parse function-specific help to extract parameter details.
     * 
     * @param functionName - Name of the function
     * @param helpOutput - Help text for the function
     * @returns Parsed function with parameters
     */
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

            // Stop at other sections
            if (trimmed.toLowerCase().includes('usage:') && inOptionsSection) {
                break;
            }

            if (inOptionsSection && trimmed.length > 0 && !trimmed.startsWith('--')) {
                // Might be end of options section
                if (!trimmed.match(/^[A-Z]/)) {
                    continue;
                }
            }

            if (inOptionsSection && trimmed.length > 0) {
                // Parse parameter lines
                // Format: "--param-name <TYPE>    Description"
                // or: "--param-name    Description"
                // or: "  --param-name <TYPE>    Description"
                const paramMatch = trimmed.match(/-{1,2}(\w+)(?:\s+<([^>]+)>)?\s+(.+)/);
                if (paramMatch) {
                    const paramName = paramMatch[1];
                    const paramType = paramMatch[2];
                    const paramDesc = paramMatch[3]?.trim() || '';
                    
                    // Check if it's required (not marked as optional)
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
