import { ErrorTranslator, type TranslatedError } from "./errorTranslator";
import type { NetworkKey } from "./networkConfig";
import { fetchWithRpcFailover } from "./rpcFailover";
import { buildProtocolCompatibilityReport, getProtocolSimulationEnvelope } from "./protocolUpgrade";
import type { ProtocolVersion } from "@/config/ProtocolMatrix";

export interface SimulationResult {
  success: boolean;
  result?: unknown;
  error?: string;
  translatedError?: TranslatedError;
  resourceUsage?: {
    cpuInstructions?: number;
    memoryBytes?: number;
    minResourceFee?: string;
  };
  events?: unknown[];
  auth?: unknown[];
  protocolVersion?: ProtocolVersion;
  warnings?: string[];
}

export interface CustomHeaders {
  [key: string]: string;
}

const normalizeResourceUsage = (value: unknown): SimulationResult["resourceUsage"] => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as {
    cpuInstructions?: unknown;
    cpu_instructions?: unknown;
    memoryBytes?: unknown;
    memory_bytes?: unknown;
    minResourceFee?: unknown;
    min_resource_fee?: unknown;
  };

  const cpuCandidate = input.cpuInstructions ?? input.cpu_instructions;
  const memoryCandidate = input.memoryBytes ?? input.memory_bytes;
  const feeCandidate = input.minResourceFee ?? input.min_resource_fee;

  return {
    cpuInstructions: typeof cpuCandidate === "number" ? cpuCandidate : undefined,
    memoryBytes: typeof memoryCandidate === "number" ? memoryCandidate : undefined,
    minResourceFee: typeof feeCandidate === "string" ? feeCandidate : undefined,
  };
};

export class RpcService {
  private rpcUrl: string;
  private customHeaders: CustomHeaders;
  private network?: NetworkKey;

  constructor(rpcUrl: string, customHeaders: CustomHeaders = {}, network?: NetworkKey) {
    this.rpcUrl = rpcUrl.endsWith("/") ? rpcUrl.slice(0, -1) : rpcUrl;
    this.customHeaders = customHeaders;
    this.network = network;
  }

  setCustomHeaders(headers: CustomHeaders): void {
    this.customHeaders = headers;
  }

  async simulateTransaction(
    contractId: string,
    functionName: string,
    args: unknown[],
    protocolVersion?: ProtocolVersion,
  ): Promise<SimulationResult> {
    try {
      const protocol = getProtocolSimulationEnvelope(protocolVersion);
      const compatibility = buildProtocolCompatibilityReport(protocol.protocolVersion, [
        "invokeHostFunction",
      ]);
      const requestBody = {
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: {
          protocolVersion: protocol.protocolVersion,
          simulationRules: protocol.simulationRules,
          transaction: {
            contractId,
            functionName,
            args: args.map((arg) => ({
              value: arg,
            })),
          },
        },
      };

      const { response, activeRpcUrl } = await fetchWithRpcFailover({
        network: this.network,
        primaryUrl: this.rpcUrl,
        path: "/rpc",
        timeoutMs: 30_000,
        customHeaders: this.customHeaders,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      });

      this.rpcUrl = activeRpcUrl;

      if (!response.ok) {
        const errorMessage = `RPC request failed with status ${response.status}: ${response.statusText}`;
        return {
          success: false,
          error: errorMessage,
          translatedError: ErrorTranslator.translate(errorMessage, { operation: "RPC request" }),
        };
      }

      const data: {
        result?: {
          returnValue?: unknown;
          result?: unknown;
          resourceUsage?: unknown;
          resource_usage?: unknown;
        };
        error?: { message?: string };
      } = await response.json();

      if (data.error) {
        const errorMessage = data.error.message || "RPC error occurred";
        return {
          success: false,
          error: errorMessage,
          translatedError: ErrorTranslator.translate(errorMessage, { 
            operation: "simulateTransaction",
            functionName,
            contractId,
          }),
        };
      }

      const result = data.result;

      return {
        success: true,
        result: result?.returnValue ?? result?.result ?? result,
        resourceUsage: normalizeResourceUsage(result?.resourceUsage ?? result?.resource_usage),
        protocolVersion: protocol.protocolVersion,
        warnings: compatibility.warnings,
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        const errorMessage = `Network error: Unable to reach RPC endpoint at ${this.rpcUrl}. Check your connection and rpcUrl setting.`;
        return {
          success: false,
          error: errorMessage,
          translatedError: ErrorTranslator.translate(errorMessage, { operation: "Network request" }),
        };
      }

      if (error instanceof Error && error.name === "AbortError") {
        const errorMessage = "Request timed out. The RPC endpoint may be slow or unreachable.";
        return {
          success: false,
          error: errorMessage,
          translatedError: ErrorTranslator.translate(errorMessage, { operation: "RPC request" }),
        };
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: errorMessage,
        translatedError: ErrorTranslator.translate(errorMessage, { operation: "simulateTransaction" }),
      };
    }
  }
}
