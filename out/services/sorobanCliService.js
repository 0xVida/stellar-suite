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
exports.SorobanCliService = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const errorFormatter_1 = require("../utils/errorFormatter");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const execAsync = (0, util_1.promisify)(child_process_1.exec);
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
class SorobanCliService {
    constructor(cliPath, source = 'dev') {
        this.cliPath = cliPath;
        this.source = source;
    }
    async simulateTransaction(contractId, functionName, args, network = 'testnet') {
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
                    }
                    else {
                        commandParts.push(String(value));
                    }
                }
            }
            else {
                for (const arg of args) {
                    if (typeof arg === 'object') {
                        commandParts.push(JSON.stringify(arg));
                    }
                    else {
                        commandParts.push(String(arg));
                    }
                }
            }
            const env = getEnvironmentWithPath();
            const { stdout, stderr } = await execFileAsync(commandParts[0], commandParts.slice(1), {
                env: env,
                maxBuffer: 10 * 1024 * 1024,
                timeout: 30000
            });
            if (stderr && stderr.trim().length > 0) {
                if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('failed')) {
                    return {
                        success: false,
                        error: (0, errorFormatter_1.formatCliError)(stderr)
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
                }
                catch {
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
            }
            catch (parseError) {
                return {
                    success: true,
                    result: stdout.trim()
                };
            }
        }
        catch (error) {
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
    async isAvailable() {
        try {
            const env = getEnvironmentWithPath();
            await execFileAsync(this.cliPath, ['--version'], { env: env, timeout: 5000 });
            return true;
        }
        catch {
            return false;
        }
    }
    static async findCliPath() {
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
                }
                else {
                    await execFileAsync(cliPath, ['--version'], { env: env, timeout: 5000 });
                    return cliPath;
                }
            }
            catch {
            }
        }
        return null;
    }
}
exports.SorobanCliService = SorobanCliService;
//# sourceMappingURL=sorobanCliService.js.map