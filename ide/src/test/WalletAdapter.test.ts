import { beforeEach, describe, expect, it, vi } from "vitest";

const { walletServiceConnect, walletServiceCheckConnection, walletServiceSignTransaction } =
  vi.hoisted(() => ({
    walletServiceConnect: vi.fn(),
    walletServiceCheckConnection: vi.fn(),
    walletServiceSignTransaction: vi.fn(),
  }));

vi.mock("@/wallet/WalletService", () => ({
  WalletService: {
    connect: walletServiceConnect,
    checkConnection: walletServiceCheckConnection,
    signTransaction: walletServiceSignTransaction,
  },
}));

import {
  WalletAdapter,
  WalletConsentDeniedError,
  WalletNoConsentHandlerError,
  DEFAULT_SESSION_TTL_MS,
  MAX_SESSION_TTL_MS,
} from "@/lib/wallet/WalletAdapter";

describe("WalletAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    WalletAdapter.revokeAll();
  });

  describe("consent gating", () => {
    it("throws WalletNoConsentHandlerError when no handler is registered and a sensitive scope is requested", async () => {
      // Make sure no handler is registered
      const unregister = WalletAdapter.registerConsentHandler(async () => ({ approved: true }));
      unregister();

      await expect(
        WalletAdapter.signInvocation("freighter", "XDR", {
          networkPassphrase: "Test",
          address: "G...",
          contractId: "C...",
          fnName: "transfer",
        }),
      ).rejects.toBeInstanceOf(WalletNoConsentHandlerError);
      expect(walletServiceSignTransaction).not.toHaveBeenCalled();
    });

    it("rejects with WalletConsentDeniedError when the user denies", async () => {
      const unregister = WalletAdapter.registerConsentHandler(async () => ({
        approved: false,
        reason: "nope",
      }));

      await expect(
        WalletAdapter.signInvocation("freighter", "XDR", {
          networkPassphrase: "Test",
          fnName: "transfer",
        }),
      ).rejects.toBeInstanceOf(WalletConsentDeniedError);
      expect(walletServiceSignTransaction).not.toHaveBeenCalled();
      unregister();
    });

    it("invokes the underlying provider only after consent is granted", async () => {
      walletServiceSignTransaction.mockResolvedValue("SIGNED");
      const handler = vi.fn().mockResolvedValue({ approved: true });
      const unregister = WalletAdapter.registerConsentHandler(handler);

      const result = await WalletAdapter.signInvocation("freighter", "XDR", {
        networkPassphrase: "Test",
        address: "G_USER",
        contractId: "C_TARGET",
        fnName: "transfer",
        network: "testnet",
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const descriptor = handler.mock.calls[0][0];
      expect(descriptor.scope).toBe("sign:invoke");
      expect(descriptor.target).toBe("C_TARGET");
      expect(descriptor.action).toContain("transfer");

      expect(walletServiceSignTransaction).toHaveBeenCalledWith("freighter", "XDR", {
        networkPassphrase: "Test",
        address: "G_USER",
      });
      expect(result).toBe("SIGNED");
      unregister();
    });
  });

  describe("scoped sessions", () => {
    it("revokes a session immediately after a single signature (single-use)", async () => {
      walletServiceSignTransaction.mockResolvedValue("SIGNED");
      const unregister = WalletAdapter.registerConsentHandler(async () => ({ approved: true }));

      await WalletAdapter.signInvocation("freighter", "XDR", {
        networkPassphrase: "Test",
        fnName: "transfer",
      });

      expect(WalletAdapter.getActiveSessions()).toHaveLength(0);
      unregister();
    });

    it("clamps requested TTL to MAX_SESSION_TTL_MS", async () => {
      walletServiceSignTransaction.mockImplementation(() => new Promise<string>(() => undefined)); // never resolves
      const unregister = WalletAdapter.registerConsentHandler(async () => ({
        approved: true,
        ttlMs: MAX_SESSION_TTL_MS * 100,
      }));

      // Kick off but don't await
      void WalletAdapter.signDeployment("freighter", "XDR", {
        networkPassphrase: "Test",
        step: "instantiate",
      });

      // Allow the consent promise to resolve and the session to be opened
      await Promise.resolve();
      await Promise.resolve();

      const sessions = WalletAdapter.getActiveSessions();
      expect(sessions).toHaveLength(1);
      const session = sessions[0];
      expect(session.expiresAt - Date.now()).toBeLessThanOrEqual(MAX_SESSION_TTL_MS + 50);
      WalletAdapter.revokeAll();
      unregister();
    });

    it("revokes all sessions on disconnect", async () => {
      walletServiceSignTransaction.mockImplementation(() => new Promise<string>(() => undefined));
      const unregister = WalletAdapter.registerConsentHandler(async () => ({ approved: true }));

      void WalletAdapter.signInvocation("freighter", "XDR", {
        networkPassphrase: "Test",
        fnName: "transfer",
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(WalletAdapter.getActiveSessions().length).toBeGreaterThanOrEqual(1);
      WalletAdapter.revokeAll();
      expect(WalletAdapter.getActiveSessions()).toHaveLength(0);
      unregister();
    });
  });

  describe("connect", () => {
    it("prompts for consent before exposing the public key", async () => {
      walletServiceConnect.mockResolvedValue("GPUBKEY");
      const handler = vi.fn().mockResolvedValue({ approved: true });
      const unregister = WalletAdapter.registerConsentHandler(handler);

      const pubkey = await WalletAdapter.connect("freighter");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].scope).toBe("connect:read");
      expect(walletServiceConnect).toHaveBeenCalledWith("freighter");
      expect(pubkey).toBe("GPUBKEY");
      unregister();
    });

    it("checkConnection never prompts the user", async () => {
      walletServiceCheckConnection.mockResolvedValue("GPUBKEY");
      const handler = vi.fn().mockResolvedValue({ approved: true });
      const unregister = WalletAdapter.registerConsentHandler(handler);

      await WalletAdapter.checkConnection("freighter");

      expect(handler).not.toHaveBeenCalled();
      expect(walletServiceCheckConnection).toHaveBeenCalledWith("freighter");
      unregister();
    });
  });

  it("exposes sensible defaults for TTL constants", () => {
    expect(DEFAULT_SESSION_TTL_MS).toBeGreaterThan(0);
    expect(MAX_SESSION_TTL_MS).toBeGreaterThanOrEqual(DEFAULT_SESSION_TTL_MS);
  });
});
