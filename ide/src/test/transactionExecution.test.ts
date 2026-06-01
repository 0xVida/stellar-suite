import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adapterSignInvocation,
  adapterSignDeployment,
  adapterSignTransaction,
  transactionSign,
  toXdr,
  fromSecret,
  fromXDR,
} = vi.hoisted(() => {
  const transactionSign = vi.fn();
  const toXdr = vi.fn(() => "SIGNED_LOCAL_XDR");

  return {
    adapterSignInvocation: vi.fn(),
    adapterSignDeployment: vi.fn(),
    adapterSignTransaction: vi.fn(),
    transactionSign,
    toXdr,
    fromSecret: vi.fn(() => ({ secret: "SLOCAL" })),
    fromXDR: vi.fn(() => ({
      sign: transactionSign,
      toXDR: toXdr,
    })),
  };
});

vi.mock("@/lib/wallet/WalletAdapter", () => ({
  WalletAdapter: {
    signInvocation: adapterSignInvocation,
    signDeployment: adapterSignDeployment,
    signTransaction: adapterSignTransaction,
  },
}));

vi.mock("@stellar/stellar-sdk", () => ({
  Keypair: {
    fromSecret,
  },
  TransactionBuilder: {
    fromXDR,
  },
  contract: {
    Client: {
      from: vi.fn(),
    },
  },
}));

vi.mock("@stellar/stellar-sdk/rpc", () => ({
  Api: {
    GetTransactionStatus: {
      NOT_FOUND: "NOT_FOUND",
      SUCCESS: "SUCCESS",
      FAILED: "FAILED",
    },
  },
  Server: vi.fn(),
}));

vi.mock("@/utils/XdrValidator", () => ({
  assertValidTransactionEnvelopeXdr: vi.fn((xdr, passphrase) => {
    fromXDR(xdr, passphrase);
    return {
      transaction: {
        sign: transactionSign,
        toXDR: toXdr,
      },
    };
  }),
}));

import {
  createWalletSigningDelegator,
  DEFAULT_TRANSACTION_POLL_INTERVAL_MS,
  pollTransactionStatus,
} from "@/lib/transactionExecution";

describe("createWalletSigningDelegator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs locally with the active keypair identity", async () => {
    const signTransaction = createWalletSigningDelegator({
      activeContext: { type: "local-keypair", publicKey: "GLOCAL" },
      activeIdentity: {
        nickname: "Local",
        publicKey: "GLOCAL",
        secretKey: "SLOCAL",
      },
      webWalletPublicKey: null,
      walletType: null,
      networkPassphrase: "Test Network",
      intent: { kind: "invoke" },
    });

    const result = await signTransaction("UNSIGNED_XDR");

    expect(fromXDR).toHaveBeenCalledWith("UNSIGNED_XDR", "Test Network");
    expect(fromSecret).toHaveBeenCalledWith("SLOCAL");
    expect(transactionSign).toHaveBeenCalledTimes(1);
    expect(result).toBe("SIGNED_LOCAL_XDR");
  });

  it("routes browser wallet invocations through WalletAdapter.signInvocation", async () => {
    adapterSignInvocation.mockResolvedValue("SIGNED_WALLET_XDR");

    const signTransaction = createWalletSigningDelegator({
      activeContext: { type: "web-wallet" },
      activeIdentity: null,
      webWalletPublicKey: "GWALLET",
      walletType: "freighter",
      networkPassphrase: "Test Network",
      intent: { kind: "invoke", contractId: "CABC", fnName: "transfer", network: "testnet" },
    });

    const result = await signTransaction("UNSIGNED_XDR");

    expect(adapterSignInvocation).toHaveBeenCalledWith("freighter", "UNSIGNED_XDR", {
      networkPassphrase: "Test Network",
      address: "GWALLET",
      contractId: "CABC",
      fnName: "transfer",
      network: "testnet",
    });
    expect(result).toBe("SIGNED_WALLET_XDR");
  });

  it("routes deployment signing through WalletAdapter.signDeployment", async () => {
    adapterSignDeployment.mockResolvedValue("SIGNED_DEPLOY_XDR");

    const signTransaction = createWalletSigningDelegator({
      activeContext: { type: "web-wallet" },
      activeIdentity: null,
      webWalletPublicKey: "GWALLET",
      walletType: "freighter",
      networkPassphrase: "Test Network",
      intent: { kind: "deploy", step: "instantiate", wasmHash: "deadbeef" },
    });

    const result = await signTransaction("UNSIGNED_XDR");

    expect(adapterSignDeployment).toHaveBeenCalledWith("freighter", "UNSIGNED_XDR", {
      networkPassphrase: "Test Network",
      address: "GWALLET",
      step: "instantiate",
      wasmHash: "deadbeef",
      network: undefined,
    });
    expect(result).toBe("SIGNED_DEPLOY_XDR");
  });
});

describe("pollTransactionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("polls until the transaction reaches SUCCESS", async () => {
    const getTransaction = vi
      .fn()
      .mockResolvedValueOnce({ status: "NOT_FOUND" })
      .mockResolvedValueOnce({ status: "SUCCESS", resultXdr: "RESULT" });
    const onUpdate = vi.fn();

    const result = await pollTransactionStatus({
      server: { getTransaction },
      hash: "abc123",
      intervalMs: 1,
      timeoutMs: DEFAULT_TRANSACTION_POLL_INTERVAL_MS,
      onUpdate,
    });

    expect(getTransaction).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ status: "SUCCESS", resultXdr: "RESULT" });
  });
});
