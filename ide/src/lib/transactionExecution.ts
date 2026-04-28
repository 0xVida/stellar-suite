import { contract, Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";

import type { NetworkKey } from "@/lib/networkConfig";
import { withRpcFailover } from "@/lib/rpcFailover";
import type { ActiveContext, Identity } from "@/store/useIdentityStore";
import { assertValidTransactionEnvelopeXdr } from "@/utils/XdrValidator";
import type { WalletProviderType } from "@/wallet/WalletService";
import { WalletService } from "@/wallet/WalletService";
import { ErrorTranslator } from "./errorTranslator";

export const DEFAULT_TRANSACTION_POLL_INTERVAL_MS = 2_000;
export const DEFAULT_TRANSACTION_POLL_TIMEOUT_MS = 45_000;

export type InvokePhase =
  | "preparing"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "failed";

export interface TransactionExecutionStatus {
  phase: InvokePhase;
  message: string;
  hash?: string;
  status?: string;
  attempt?: number;
}

export interface PollTransactionOptions {
  server: Pick<Server, "getTransaction">;
  hash: string;
  intervalMs?: number;
  timeoutMs?: number;
  onUpdate?: (response: Api.GetTransactionResponse, meta: { attempt: number; elapsedMs: number }) => void;
}

export interface ExecuteWriteTransactionOptions {
  contractId: string;
  fnName: string;
  args: string;
  rpcUrl: string;
  network?: NetworkKey;
  networkPassphrase: string;
  activeContext: ActiveContext;
  activeIdentity: Identity | null;
  webWalletPublicKey: string | null;
  walletType: WalletProviderType | null;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  onStatus?: (status: TransactionExecutionStatus) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getAllowHttp = (rpcUrl: string) => rpcUrl.startsWith("http://");

const normalizeInvocationArgs = (rawArgs: string): unknown[] => {
  const trimmed = rawArgs.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error("Arguments must be valid JSON.");
  }

  return Array.isArray(parsed) ? parsed : [parsed];
};

const getActivePublicKey = (
  activeContext: ActiveContext,
  activeIdentity: Identity | null,
  webWalletPublicKey: string | null
) => {
  if (!activeContext) {
    throw new Error("Select a signing identity before invoking a write transaction.");
  }

  if (activeContext.type === "local-keypair") {
    if (!activeIdentity?.secretKey) {
      throw new Error("The selected local identity is missing its secret key.");
    }
    return activeIdentity.publicKey;
  }

  if (!webWalletPublicKey) {
    throw new Error("Connect a browser wallet before invoking a write transaction.");
  }

  return webWalletPublicKey;
};

export const createWalletSigningDelegator = ({
  activeContext,
  activeIdentity,
  webWalletPublicKey,
  walletType,
  networkPassphrase,
}: {
  activeContext: ActiveContext;
  activeIdentity: Identity | null;
  webWalletPublicKey: string | null;
  walletType: WalletProviderType | null;
  networkPassphrase: string;
}) => {
  return async (transactionXdr: string) => {
    if (!activeContext) {
      throw new Error("No active signing identity selected.");
    }

    if (activeContext.type === "local-keypair") {
      if (!activeIdentity?.secretKey) {
        throw new Error("The selected local identity is missing its secret key.");
      }

      const transaction = assertValidTransactionEnvelopeXdr(
        transactionXdr,
        networkPassphrase,
      ).transaction;
      transaction.sign(Keypair.fromSecret(activeIdentity.secretKey));
      return transaction.toXDR();
    }

    if (!walletType) {
      throw new Error("No browser wallet is connected.");
    }

    return WalletService.signTransaction(walletType, transactionXdr, {
      networkPassphrase,
      address: webWalletPublicKey ?? undefined,
    });
  };
};

export const pollTransactionStatus = async ({
  server,
  hash,
  intervalMs = DEFAULT_TRANSACTION_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TRANSACTION_POLL_TIMEOUT_MS,
  onUpdate,
}: PollTransactionOptions): Promise<Api.GetTransactionResponse> => {
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt <= timeoutMs) {
    attempt += 1;
    const response = await server.getTransaction(hash);
    onUpdate?.(response, { attempt, elapsedMs: Date.now() - startedAt });

    if (
      response.status === Api.GetTransactionStatus.SUCCESS ||
      response.status === Api.GetTransactionStatus.FAILED
    ) {
      return response;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Transaction confirmation timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`);
};

const describeSendFailure = (response: Api.SendTransactionResponse) => {
  if (response.errorResult) {
    return `RPC sendTransaction returned ${response.status}: ${JSON.stringify(response.errorResult)}`;
  }
  return `RPC sendTransaction returned ${response.status}.`;
};

export const executeWriteTransaction = async ({
  contractId,
  fnName,
  args,
  rpcUrl,
  network,
  networkPassphrase,
  activeContext,
  activeIdentity,
  webWalletPublicKey,
  walletType,
  pollIntervalMs = DEFAULT_TRANSACTION_POLL_INTERVAL_MS,
  pollTimeoutMs = DEFAULT_TRANSACTION_POLL_TIMEOUT_MS,
  onStatus,
}: ExecuteWriteTransactionOptions) => {
  const publicKey = getActivePublicKey(activeContext, activeIdentity, webWalletPublicKey);
  const normalizedArgs = normalizeInvocationArgs(args);

  onStatus?.({
    phase: "preparing",
    message: `Assembling ${fnName} transaction...`,
  });

  const { result: rpcContext } = await withRpcFailover({
    network,
    primaryUrl: rpcUrl,
    operation: async (candidateRpcUrl) => {
      const allowHttp = getAllowHttp(candidateRpcUrl);
      const server = new Server(candidateRpcUrl, { allowHttp });
      const client = await contract.Client.from({
        contractId,
        rpcUrl: candidateRpcUrl,
        networkPassphrase,
        allowHttp,
        publicKey,
        server,
      });

      return {
        allowHttp,
        client,
        rpcUrl: candidateRpcUrl,
        server,
      };
    },
  });
  const { client, server } = rpcContext;

  const method = (client as unknown as Record<string, unknown>)[fnName];
  if (typeof method !== "function") {
    throw new Error(`Contract function "${fnName}" was not found in the resolved contract spec.`);
  }

  const assembled =
    normalizedArgs.length === 0
      ? await (method as (options?: Record<string, unknown>) => Promise<any>)({
          publicKey,
          restore: true,
          timeoutInSeconds: Math.ceil(pollTimeoutMs / 1000),
        })
      : await (
          method as (methodArgs: unknown[], options?: Record<string, unknown>) => Promise<any>
        )(normalizedArgs, {
          publicKey,
          restore: true,
          timeoutInSeconds: Math.ceil(pollTimeoutMs / 1000),
        });

  if (assembled.isReadCall) {
    throw new Error(`"${fnName}" is a read call. Only write transactions are executed through this flow.`);
  }

  const signTransaction = createWalletSigningDelegator({
    activeContext,
    activeIdentity,
    webWalletPublicKey,
    walletType,
    networkPassphrase,
  });

  onStatus?.({
    phase: "signing",
    message: "Waiting for the active identity to sign the transaction...",
  });

  await assembled.sign({ signTransaction });
  const signedTransaction = (assembled as { signed: { toXDR: () => string } }).signed;
  const signedXdr = signedTransaction.toXDR();

  onStatus?.({
    phase: "submitting",
    message: "Posting signed XDR to RPC sendTransaction...",
  });

  const sendResponse = await server.sendTransaction(signedTransaction as any);
  if (sendResponse.status !== "PENDING" && sendResponse.status !== "DUPLICATE") {
    throw new Error(describeSendFailure(sendResponse));
  }

  onStatus?.({
    phase: "confirming",
    message: "Confirming...",
    hash: sendResponse.hash,
    status: sendResponse.status,
  });

  const finalResponse = await pollTransactionStatus({
    server,
    hash: sendResponse.hash,
    intervalMs: pollIntervalMs,
    timeoutMs: pollTimeoutMs,
    onUpdate: (response, meta) => {
      onStatus?.({
        phase: response.status === Api.GetTransactionStatus.SUCCESS ? "success" : "confirming",
        message:
          response.status === Api.GetTransactionStatus.SUCCESS
            ? "Transaction confirmed."
            : "Confirming...",
        hash: sendResponse.hash,
        status: response.status,
        attempt: meta.attempt,
      });
    },
  });

  if (finalResponse.status === Api.GetTransactionStatus.FAILED) {
    onStatus?.({
      phase: "failed",
      message: "Transaction failed on-chain.",
      hash: sendResponse.hash,
      status: finalResponse.status,
    });
    throw new Error("Transaction reached FAILED status.");
  }

  onStatus?.({
    phase: "success",
    message: "Transaction confirmed.",
    hash: sendResponse.hash,
    status: finalResponse.status,
  });

  return {
    hash: sendResponse.hash,
    signedXdr,
    sendResponse,
    finalResponse,
  };
};
