"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcService = void 0;
const errorFormatter_1 = require("../utils/errorFormatter");
class RpcService {
    constructor(rpcUrl) {
        this.rpcUrl = rpcUrl.endsWith('/') ? rpcUrl.slice(0, -1) : rpcUrl;
    }
    async simulateTransaction(contractId, functionName, args) {
        try {
            const requestBody = {
                jsonrpc: '2.0',
                id: 1,
                method: 'simulateTransaction',
                params: {
                    transaction: {
                        contractId,
                        functionName,
                        args: args.map(arg => ({
                            value: arg
                        }))
                    }
                }
            };
            const response = await fetch(`${this.rpcUrl}/rpc`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(30000)
            });
            if (!response.ok) {
                return {
                    success: false,
                    error: `RPC request failed with status ${response.status}: ${response.statusText}`
                };
            }
            const data = await response.json();
            if (data.error) {
                return {
                    success: false,
                    error: data.error.message || 'RPC error occurred'
                };
            }
            const result = data.result || data;
            return {
                success: true,
                result: result.returnValue || result.result || result,
                resourceUsage: result.resourceUsage || result.resource_usage
            };
        }
        catch (error) {
            const formatted = (0, errorFormatter_1.formatError)(error, 'RPC');
            if (error instanceof TypeError && error.message.includes('fetch')) {
                return {
                    success: false,
                    error: `Network error: Unable to reach RPC endpoint at ${this.rpcUrl}. Check your connection and rpcUrl setting.`
                };
            }
            if (error instanceof Error && error.name === 'AbortError') {
                return {
                    success: false,
                    error: 'Request timed out. The RPC endpoint may be slow or unreachable.'
                };
            }
            return {
                success: false,
                error: formatted.message
            };
        }
    }
    async isAvailable() {
        try {
            const response = await fetch(`${this.rpcUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            return response.ok;
        }
        catch {
            try {
                const response = await fetch(`${this.rpcUrl}/rpc`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
                    signal: AbortSignal.timeout(5000)
                });
                return response.ok;
            }
            catch {
                return false;
            }
        }
    }
}
exports.RpcService = RpcService;
//# sourceMappingURL=rpcService.js.map