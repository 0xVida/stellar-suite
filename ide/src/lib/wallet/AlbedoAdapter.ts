/**
 * src/lib/wallet/AlbedoAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WalletAdapter implementation for Albedo (web-based popup wallet).
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
import albedo from "@albedo-link/intent";

// ── Metadata ─────────────────────────────────────────────────────────────────

const ALBEDO_INFO: WalletAdapterInfo = {
  id: "albedo",
  name: "Albedo",
  description: "Web-based Stellar wallet — no extension required.",
  url: "https://albedo.link",
  capabilities: {
    canSignTransaction: true,
    canSignAuthEntry: false,
    canCheckConnection: false, // Albedo has no persistent session without user interaction
    isExtension: false,
  },
};

// ── Adapter ───────────────────────────────────────────────────────────────────

export class AlbedoAdapter extends BaseWalletAdapter {
  readonly info: WalletAdapterInfo = ALBEDO_INFO;

  /** Albedo is always "available" — it's a web popup, no install required. */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async connect(): Promise<ConnectResult> {
    try {
      const response = await albedo.publicKey({});
      if (!response?.pubkey) {
        throw new WalletAdapterError(
          "albedo",
          "CONNECTION_FAILED",
          "Albedo did not return a public key."
        );
      }
      return { publicKey: response.pubkey };
    } catch (err) {
      if (err instanceof WalletAdapterError) throw err;
      if (this.isUserRejection(err)) {
        throw new WalletAdapterError(
          "albedo",
          "USER_REJECTED",
          "User closed the Albedo popup.",
          err
        );
      }
      throw this.normaliseError("CONNECTION_FAILED", err, "Failed to connect via Albedo.");
    }
  }

  /**
   * Albedo has no persistent session — always returns null.
   * The user must explicitly connect each time.
   */
  async checkConnection(): Promise<string | null> {
    return null;
  }

  async signTransaction(xdr: string, options?: SignOptions): Promise<string> {
    try {
      const response = await albedo.tx({
        xdr,
        network: options?.networkPassphrase?.toLowerCase().includes("public")
          ? "public"
          : "testnet",
        submit: false,
      });
      if (!response?.signed_envelope_xdr) {
        throw new WalletAdapterError(
          "albedo",
          "SIGN_FAILED",
          "Albedo did not return a signed transaction."
        );
      }
      return response.signed_envelope_xdr;
    } catch (err) {
      if (err instanceof WalletAdapterError) throw err;
      if (this.isUserRejection(err)) {
        throw new WalletAdapterError(
          "albedo",
          "USER_REJECTED",
          "User rejected the Albedo signing request.",
          err
        );
      }
      throw this.normaliseError("SIGN_FAILED", err, "Albedo transaction signing failed.");
    }
  }
}

// ── Self-registration ─────────────────────────────────────────────────────────

WalletAdapterRegistry.register("albedo", () => new AlbedoAdapter());
