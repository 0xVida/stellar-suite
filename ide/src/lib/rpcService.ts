export interface SimulationResult {
    success: boolean;
    result?: unknown;
    error?: string;
    resourceUsage?: {
        cpuInstructions?: number;
        memoryBytes?: number;
        minResourceFee?: string;
    };
    events?: unknown[];
    auth?: unknown[];
}

export class RpcService {
    private rpcUrl: string;

    constructor(rpcUrl: string) {
        this.rpcUrl = rpcUrl.endsWith('/') ? rpcUrl.slice(0, -1) : rpcUrl;
    }

    async simulateTransaction(
        contractId: string,
        functionName: string,
        args: unknown[]
    ): Promise<SimulationResult> {
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

            const data: { result?: { returnValue?: unknown; result?: unknown; resourceUsage?: unknown; resource_usage?: unknown }; error?: { message?: string } } = await response.json();

            if (data.error) {
                return {
                    success: false,
                    error: data.error.message || 'RPC error occurred'
                };
            }

            const result = data.result;

            return {
                success: true,
                result: result?.returnValue ?? result?.result ?? result,
                resourceUsage: result?.resourceUsage ?? result?.resource_usage
            };
        } catch (error) {
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
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}