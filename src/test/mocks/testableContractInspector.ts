import { ContractFunction } from '../../services/contractInspector';

/**
 * Testable wrapper that exposes the parsing logic from ContractInspector
 * without requiring CLI access or child process execution.
 */
export class TestableContractInspector {

    public parseHelpOutput(helpOutput: string): ContractFunction[] {
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

    public parseFunctionHelp(functionName: string, helpOutput: string): ContractFunction {
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
