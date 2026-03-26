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
exports.ContractInspector = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
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
class ContractInspector {
    constructor(cliPath, source = 'dev', network = 'testnet') {
        this.cliPath = cliPath;
        this.source = source;
        this.network = network;
    }
    async getContractFunctions(contractId) {
        try {
            const env = getEnvironmentWithPath();
            const { stdout } = await execFileAsync(this.cliPath, [
                'contract',
                'invoke',
                '--id', contractId,
                '--source', this.source,
                '--network', this.network,
                '--',
                '--help'
            ], {
                env: env,
                maxBuffer: 10 * 1024 * 1024,
                timeout: 30000
            });
            return this.parseHelpOutput(stdout);
        }
        catch (error) {
            console.error('Failed to get contract functions:', error);
            return [];
        }
    }
    async getFunctionHelp(contractId, functionName) {
        try {
            const env = getEnvironmentWithPath();
            const { stdout } = await execFileAsync(this.cliPath, [
                'contract',
                'invoke',
                '--id', contractId,
                '--source', this.source,
                '--network', this.network,
                '--',
                functionName,
                '--help'
            ], {
                env: env,
                maxBuffer: 10 * 1024 * 1024,
                timeout: 30000
            });
            return this.parseFunctionHelp(functionName, stdout);
        }
        catch (error) {
            console.error(`Failed to get help for function ${functionName}:`, error);
            return null;
        }
    }
    parseHelpOutput(helpOutput) {
        const functions = [];
        const lines = helpOutput.split('\n');
        let inCommandsSection = false;
        const seenFunctions = new Set();
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
    parseFunctionHelp(functionName, helpOutput) {
        const functionInfo = {
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
exports.ContractInspector = ContractInspector;
//# sourceMappingURL=contractInspector.js.map