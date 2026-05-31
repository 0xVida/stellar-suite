/**
 * contractInstantiator.ts
 *
 * Builds and submits a Soroban `createContract` host-function transaction
 * (step 2 of deployment: Upload WASM → Instantiate contract address).
 *
 * Given a WASM hash returned by the upload step, this module:
 *  1. Assembles an `Operation.invokeHostFunction` that calls the host
 *     `create_contract` function with the wasm hash.
 *  2. Simulates, signs, and submits the transaction.
 *  3. Extracts the `C...` contract address from the transaction result XDR.
 *  4. Returns the string-encoded contract ID.
 */

import {
  Address,
  Operation,
  TransactionBuilder,
  hash,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";

import type { ActiveContext, Identity } from "@/store/useIdentityStore";
import type { WalletProviderType } from "@/wallet/WalletService";
import {
  createWalletSigningDelegator,
  pollTransactionStatus,
  DEFAULT_TRANSACTION_POLL_INTERVAL_MS,
  DEFAULT_TRANSACTION_POLL_TIMEOUT_MS,
  type TransactionExecutionStatus,
} from "./transactionExecution";
import { buildProtocolCompatibilityReport } from "./protocolUpgrade";
import type { ProtocolVersion } from "@/config/ProtocolMatrix";

export interface InstantiateContractOptions {
  /** Hex-encoded WASM hash returned by the upload step. */
  wasmHash: string;
  rpcUrl: string;
  networkPassphrase: string;
  activeContext: ActiveContext;
  activeIdentity: Identity | null;
  webWalletPublicKey: string | null;
  walletType: WalletProviderType | null;
  protocolVersion?: ProtocolVersion;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  onStatus?: (status: TransactionExecutionStatus) => void;
  /**
   * Called after simulation/assembly with the base64 transaction-envelope
   * XDR that is about to be signed. The caller should decode the XDR,
   * show it to the user, and resolve with `true` to proceed with signing
   * or `false` to abort. If omitted, the transaction is signed without
   * a pre-signing review.
   */
  onConfirmXdr?: (xdr: string) => Promise<boolean>;
}

export interface InstantiateContractResult {
  contractId: string;
  transactionHash: string;
}

const getAllowHttp = (rpcUrl: string) => rpcUrl.startsWith("http://");

const getPublicKey = (
  activeContext: ActiveContext,
  activeIdentity: Identity | null,
  webWalletPublicKey: string | null,
): string => {
  if (!activeContext) {
    throw new Error("Select a signing identity before deploying.");
  }
  if (activeContext.type === "local-keypair") {
    if (!activeIdentity?.publicKey) {
      throw new Error("The selected local identity is missing its public key.");
    }
    return activeIdentity.publicKey;
  }
  if (!webWalletPublicKey) {
    throw new Error("Connect a browser wallet before deploying.");
  }
  return webWalletPublicKey;
};

/**
 * Extract the deployed contract ID from a successful transaction response.
 *
 * In SDK v14 the `GetSuccessfulTransactionResponse` already has:
 *   - `returnValue?: xdr.ScVal`  — the ScVal returned by the host function
 *   - `resultMetaXdr: xdr.TransactionMeta` — already-parsed (not base64)
 *
 * The `createContract` host function returns the new contract address as an
 * ScVal of type `address`, so we read it directly from `returnValue`.
 */
const extractContractId = (response: Api.GetSuccessfulTransactionResponse): string => {
  // Fast path: SDK v14 exposes returnValue directly for Soroban transactions
  if (response.returnValue) {
    try {
      const addr = response.returnValue.address();
      return Address.fromScAddress(addr).toString();
    } catch {
      // not an address ScVal — fall through
    }
  }

  // Fallback: walk the already-parsed resultMetaXdr
  try {
    const meta = response.resultMetaXdr;
    // v3 / v4 meta
    const v3 = (meta as any).v3?.();
    if (v3) {
      const returnVal: xdr.ScVal | undefined = v3.sorobanMeta?.()?.returnValue?.();
      if (returnVal) {
        return Address.fromScAddress(returnVal.address()).toString();
      }
    }
  } catch {
    // fall through
  }

  throw new Error(
    "Could not extract contract ID from transaction result. " +
      "The transaction succeeded but the contract address is unavailable.",
  );
};

/**
 * Instantiate a new Soroban contract from an already-uploaded WASM hash.
 *
 * This is step 2 of the two-phase deployment:
 *   Phase 1 — Upload WASM  → returns wasmHash
 *   Phase 2 — Create contract instance (this function) → returns contractId
 */
export const instantiateContract = async ({
  wasmHash,
  rpcUrl,
  networkPassphrase,
  activeContext,
  activeIdentity,
  webWalletPublicKey,
  walletType,
  protocolVersion,
  pollIntervalMs = DEFAULT_TRANSACTION_POLL_INTERVAL_MS,
  pollTimeoutMs = DEFAULT_TRANSACTION_POLL_TIMEOUT_MS,
  onStatus,
  onConfirmXdr,
}: InstantiateContractOptions): Promise<InstantiateContractResult> => {
  const publicKey = getPublicKey(activeContext, activeIdentity, webWalletPublicKey);
  const allowHttp = getAllowHttp(rpcUrl);
  const server = new Server(rpcUrl, { allowHttp });
  const protocolCompatibility = buildProtocolCompatibilityReport(protocolVersion, [
    "invokeHostFunction",
    "createContract",
  ]);

  onStatus?.({
    phase: "preparing",
    message: `Assembling createContract transaction for Protocol ${protocolCompatibility.protocolVersion}…`,
  });
  protocolCompatibility.warnings.forEach((warning) => {
    onStatus?.({ phase: "preparing", message: `Protocol warning: ${warning}` });
  });

  // Fetch the source account
  const account = await server.getAccount(publicKey);

  // Build the createContract host-function operation
  // Uses Address-based derivation (deployer address + salt)
  const wasmHashBytes = Buffer.from(wasmHash, "hex");
  const salt = hash(Buffer.from(`${publicKey}${Date.now()}`));

  const createContractOp = Operation.invokeHostFunction({
    func: xdr.HostFunction.hostFunctionTypeCreateContract(
      new xdr.CreateContractArgs({
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: Address.fromString(publicKey).toScAddress(),
            salt,
          }),
        ),
        executable: xdr.ContractExecutable.contractExecutableWasm(wasmHashBytes),
      }),
    ),
    auth: [],
  });

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(createContractOp)
    .setTimeout(Math.ceil(pollTimeoutMs / 1000))
    .build();

  // Simulate to get the footprint / resource data
  onStatus?.({ phase: "preparing", message: "Simulating createContract…" });
  const simResponse = await server.simulateTransaction(tx);

  if (Api.isSimulationError(simResponse)) {
    throw new Error(`Simulation failed: ${simResponse.error}`);
  }

  if (!Api.isSimulationSuccess(simResponse)) {
    throw new Error("Simulation returned an unexpected response.");
  }

  // Assemble the transaction with the simulated footprint
  const assembledTx = Api.assembleTransaction(tx, simResponse).build();

  // Pre-signing review: surface the decoded XDR so the user can verify
  // operations, fees, and authorization changes before approving.
  if (onConfirmXdr) {
    onStatus?.({
      phase: "preparing",
      message: "Awaiting XDR review before signing…",
    });
    const approved = await onConfirmXdr(assembledTx.toXDR());
    if (!approved) {
      throw new Error("Transaction signing was cancelled after XDR review.");
    }
  }

  // Sign
  onStatus?.({ phase: "signing", message: "Waiting for signature…" });

  const signTransaction = createWalletSigningDelegator({
    activeContext,
    activeIdentity,
    webWalletPublicKey,
    walletType,
    networkPassphrase,
    intent: { kind: "deploy", step: "instantiate", wasmHash },
  });

  const signedXdr = await signTransaction(assembledTx.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

  // Submit
  onStatus?.({ phase: "submitting", message: "Submitting createContract transaction…" });

  const sendResponse = await server.sendTransaction(signedTx);
  if (sendResponse.status !== "PENDING" && sendResponse.status !== "DUPLICATE") {
    throw new Error(
      `sendTransaction returned ${sendResponse.status}: ${JSON.stringify(sendResponse.errorResult ?? "")}`,
    );
  }

  // Poll for confirmation
  onStatus?.({
    phase: "confirming",
    message: "Confirming contract instantiation…",
    hash: sendResponse.hash,
  });

  const finalResponse = await pollTransactionStatus({
    server,
    hash: sendResponse.hash,
    intervalMs: pollIntervalMs,
    timeoutMs: pollTimeoutMs,
    onUpdate: (_res, meta) => {
      onStatus?.({
        phase: "confirming",
        message: `Confirming… (attempt ${meta.attempt})`,
        hash: sendResponse.hash,
      });
    },
  });

  if (finalResponse.status === Api.GetTransactionStatus.FAILED) {
    throw new Error("createContract transaction reached FAILED status on-chain.");
  }

  // Extract the C... contract address
  const contractId = extractContractId(finalResponse as Api.GetSuccessfulTransactionResponse);

  onStatus?.({
    phase: "success",
    message: "Contract instantiated successfully.",
    hash: sendResponse.hash,
  });

  return { contractId, transactionHash: sendResponse.hash };
};

export interface UploadWasmOptions {
  wasmBytes: Uint8Array;
  rpcUrl: string;
  networkPassphrase: string;
  activeContext: ActiveContext;
  activeIdentity: Identity | null;
  webWalletPublicKey: string | null;
  walletType: WalletProviderType | null;
  protocolVersion?: ProtocolVersion;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  onStatus?: (status: TransactionExecutionStatus) => void;
}

export interface UploadWasmResult {
  wasmHash: string;
  transactionHash: string;
}

const extractWasmHash = (response: Api.GetSuccessfulTransactionResponse): string => {
  if (response.returnValue) {
    try {
      const bytes = response.returnValue.bytes();
      return Buffer.from(bytes).toString("hex");
    } catch {
      // not a direct bytes ScVal — fall through
    }
  }

  // Fallback: walk the already-parsed resultMetaXdr
  try {
    const meta = response.resultMetaXdr;
    const v3 = (meta as any).v3?.();
    if (v3) {
      const returnVal: xdr.ScVal | undefined = v3.sorobanMeta?.()?.returnValue?.();
      if (returnVal) {
        return Buffer.from(returnVal.bytes()).toString("hex");
      }
    }
  } catch {
    // fall through
  }

  throw new Error(
    "Could not extract WASM hash from transaction result. " +
      "The transaction succeeded but the WASM hash is unavailable.",
  );
};

export const uploadWasm = async ({
  wasmBytes,
  rpcUrl,
  networkPassphrase,
  activeContext,
  activeIdentity,
  webWalletPublicKey,
  walletType,
  protocolVersion,
  pollIntervalMs = DEFAULT_TRANSACTION_POLL_INTERVAL_MS,
  pollTimeoutMs = DEFAULT_TRANSACTION_POLL_TIMEOUT_MS,
  onStatus,
}: UploadWasmOptions): Promise<UploadWasmResult> => {
  const publicKey = getPublicKey(activeContext, activeIdentity, webWalletPublicKey);
  const allowHttp = getAllowHttp(rpcUrl);
  const server = new Server(rpcUrl, { allowHttp });
  const protocolCompatibility = buildProtocolCompatibilityReport(protocolVersion, [
    "invokeHostFunction",
    "uploadContractWasm",
  ]);

  onStatus?.({
    phase: "preparing",
    message: `Assembling uploadWasm transaction for Protocol ${protocolCompatibility.protocolVersion}…`,
  });
  protocolCompatibility.warnings.forEach((warning) => {
    onStatus?.({ phase: "preparing", message: `Protocol warning: ${warning}` });
  });

  // Fetch the source account
  const account = await server.getAccount(publicKey);

  // Build the uploadWasm host-function operation
  const uploadWasmOp = Operation.invokeHostFunction({
    func: xdr.HostFunction.hostFunctionTypeUploadContractWasm(wasmBytes),
    auth: [],
  });

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(uploadWasmOp)
    .setTimeout(Math.ceil(pollTimeoutMs / 1000))
    .build();

  // Simulate to get the footprint / resource data
  onStatus?.({ phase: "preparing", message: "Simulating uploadWasm…" });
  const simResponse = await server.simulateTransaction(tx);

  if (Api.isSimulationError(simResponse)) {
    throw new Error(`Simulation failed: ${simResponse.error}`);
  }

  if (!Api.isSimulationSuccess(simResponse)) {
    throw new Error("Simulation returned an unexpected response.");
  }

  // Assemble the transaction with the simulated footprint
  const assembledTx = Api.assembleTransaction(tx, simResponse).build();

  // Sign
  onStatus?.({ phase: "signing", message: "Waiting for signature…" });

  const signTransaction = createWalletSigningDelegator({
    activeContext,
    activeIdentity,
    webWalletPublicKey,
    walletType,
    networkPassphrase,
  });

  const signedXdr = await signTransaction(assembledTx.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

  // Submit
  onStatus?.({ phase: "submitting", message: "Submitting uploadWasm transaction…" });

  const sendResponse = await server.sendTransaction(signedTx);
  if (sendResponse.status !== "PENDING" && sendResponse.status !== "DUPLICATE") {
    throw new Error(
      `sendTransaction returned ${sendResponse.status}: ${JSON.stringify(sendResponse.errorResult ?? "")}`,
    );
  }

  // Poll for confirmation
  onStatus?.({
    phase: "confirming",
    message: "Confirming WASM upload…",
    hash: sendResponse.hash,
  });

  const finalResponse = await pollTransactionStatus({
    server,
    hash: sendResponse.hash,
    intervalMs: pollIntervalMs,
    timeoutMs: pollTimeoutMs,
    onUpdate: (_res, meta) => {
      onStatus?.({
        phase: "confirming",
        message: `Confirming… (attempt ${meta.attempt})`,
        hash: sendResponse.hash,
      });
    },
  });

  if (finalResponse.status === Api.GetTransactionStatus.FAILED) {
    throw new Error("uploadWasm transaction reached FAILED status on-chain.");
  }

  // Extract the WASM hash
  const wasmHash = extractWasmHash(finalResponse as Api.GetSuccessfulTransactionResponse);

  onStatus?.({
    phase: "success",
    message: "WASM uploaded successfully.",
    hash: sendResponse.hash,
  });

  return { wasmHash, transactionHash: sendResponse.hash };
};
