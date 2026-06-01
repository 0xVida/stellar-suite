/**
 * src/lib/wallet/HanaAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WalletAdapter implementation for the Hana Wallet browser extension.
 *
 * Hana exposes a `window.hana` object that mirrors the Freighter API shape.
 * Reference: https://docs.hanawallet.io/
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  BaseWalletAdapter,
  WalletAdapterRegistry,
  WalletAdapterError,
  type ConnectResult,
  type SignOptions,
  type WalletAdapterInfo,
} from "./BaseAdapter";

// ── Hana window type augmentation ─────────────────────────────────────────────

interface HanaProvider {
  isHana?: boolean;
  getPublicKey(): Promise<string>;
  isConnected(): Promise<boolean>;
  signTransaction(
    transactionXdr: string,
    opts?: { networkPassphrase?: string }
  ): Promise<{ signedTxXdr: string }>;
  signAuthEntry(
    entryXdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<{ signedAuthEntry: string }>;
}

declare global {
  interface Window {
    hana?: HanaProvider;
  }
}

// ── Metadata ─────────────────────────────────────────────────────────────────

const HANA_INFO: WalletAdapterInfo = {
  id: "hana",
  name: "Hana",
  description: "Hana Wallet — Stellar & Soroban browser extension.",
  url: "https://hanawallet.io",
  capabilities: {
    canSignTransaction: true,
    canSignAuthEntry: true, // Hana supports Soroban auth entry signing
    canCheckConnection: true,
    isExtension: true,
  },
};

// ── Helper ─────────────────────────────────────────────────────────────────────

function getHanaProvider(): HanaProvider {
  if (typeof window === "undefined" || !window.hana) {
    throw new WalletAdapterError(
      "hana",
      "NOT_AVAILABLE",
      "Hana Wallet extension is not installed. Install it from hanawallet.io."
    );
  }
  return window.hana;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class HanaAdapter extends BaseWalletAdapter {
  readonly info: WalletAdapterInfo = HANA_INFO;

  async isAvailable(): Promise<boolean> {
    return (
      typeof window !== "undefined" &&
      typeof window.hana !== "undefined" &&
      window.hana.isHana === true
    );
  }

  async connect(): Promise<ConnectResult> {
    try {
      const hana = getHanaProvider();
      const publicKey = await hana.getPublicKey();
      if (!publicKey) {
        throw new WalletAdapterError(
          "hana",
          "CONNECTION_FAILED",
          "Hana did not return a public key."
        );
      }
      return { publicKey };
    } catch (err) {
      if (err instanceof WalletAdapterError) throw err;
      if (this.isUserRejection(err)) {
        throw new WalletAdapterError(
          "hana",
          "USER_REJECTED",
          "User rejected the Hana connection request.",
          err
        );
      }
      throw this.normaliseError("CONNECTION_FAILED", err, "Failed to connect to Hana Wallet.");
    }
  }

  async checkConnection(): Promise<string | null> {
    try {
      const hana = getHanaProvider();
      const connected = await hana.isConnected();
      if (!connected) return null;
      const publicKey = await hana.getPublicKey();
      return publicKey || null;
    } catch {
      return null;
    }
  }

  async signTransaction(xdr: string, options?: SignOptions): Promise<string> {
    try {
      const hana = getHanaProvider();
      const result = await hana.signTransaction(xdr, {
        networkPassphrase: options?.networkPassphrase,
      });
      if (!result?.signedTxXdr) {
        throw new WalletAdapterError(
          "hana",
          "SIGN_FAILED",
          "Hana did not return a signed transaction."
        );
      }
      return result.signedTxXdr;
    } catch (err) {
      if (err instanceof WalletAdapterError) throw err;
      if (this.isUserRejection(err)) {
        throw new WalletAdapterError(
          "hana",
          "USER_REJECTED",
          "User rejected the Hana signing request.",
          err
        );
      }
      throw this.normaliseError("SIGN_FAILED", err, "Hana transaction signing failed.");
    }
  }

  async signAuthEntry(entryXdr: string, options?: SignOptions): Promise<string> {
    try {
      const hana = getHanaProvider();
      const result = await hana.signAuthEntry(entryXdr, {
        networkPassphrase: options?.networkPassphrase,
        address: options?.address,
      });
      if (!result?.signedAuthEntry) {
        throw new WalletAdapterError(
          "hana",
          "SIGN_FAILED",
          "Hana did not return a signed auth entry."
        );
      }
      return result.signedAuthEntry;
    } catch (err) {
      if (err instanceof WalletAdapterError) throw err;
      if (this.isUserRejection(err)) {
        throw new WalletAdapterError(
          "hana",
          "USER_REJECTED",
          "User rejected the Hana auth-entry signing request.",
          err
        );
      }
      throw this.normaliseError("SIGN_FAILED", err, "Hana auth entry signing failed.");
    }
  }
}

// ── Self-registration ─────────────────────────────────────────────────────────

WalletAdapterRegistry.register("hana", () => new HanaAdapter());
