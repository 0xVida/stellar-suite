/**
 * src/lib/wallet/FreighterAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WalletAdapter implementation for the Freighter browser extension.
 * Wraps the existing `@/utils/freighter` helpers so no code is duplicated.
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
import {
  connectFreighterWallet,
  getFreighterPublicKey,
  checkFreighterInstalled,
  signFreighterTransaction,
} from "@/utils/freighter";

// ── Metadata ─────────────────────────────────────────────────────────────────

const FREIGHTER_INFO: WalletAdapterInfo = {
  id: "freighter",
  name: "Freighter",
  description: "Official Stellar browser extension wallet by SDF.",
  url: "https://www.freighter.app",
  capabilities: {
    canSignTransaction: true,
    canSignAuthEntry: false, // Freighter does not yet expose signAuthEntry via API
    canCheckConnection: true,
    isExtension: true,
  },
};

// ── Adapter ───────────────────────────────────────────────────────────────────

export class FreighterAdapter extends BaseWalletAdapter {
  readonly info: WalletAdapterInfo = FREIGHTER_INFO;

  async isAvailable(): Promise<boolean> {
    try {
      return await checkFreighterInstalled();
    } catch {
      return false;
    }
  }

  async connect(): Promise<ConnectResult> {
    try {
      const publicKey = await connectFreighterWallet();
      return { publicKey };
    } catch (err) {
      if (this.isUserRejection(err)) {
        throw new WalletAdapterError(
          "freighter",
          "USER_REJECTED",
          "User rejected the Freighter connection request.",
          err
        );
      }
      throw this.normaliseError("CONNECTION_FAILED", err, "Failed to connect Freighter.");
    }
  }

  async checkConnection(): Promise<string | null> {
    try {
      const installed = await checkFreighterInstalled();
      if (!installed) return null;
      const key = await getFreighterPublicKey();
      return key || null;
    } catch {
      return null;
    }
  }

  async signTransaction(xdr: string, options?: SignOptions): Promise<string> {
    try {
      return await signFreighterTransaction(xdr, options);
    } catch (err) {
      if (this.isUserRejection(err)) {
        throw new WalletAdapterError(
          "freighter",
          "USER_REJECTED",
          "User rejected the Freighter signing request.",
          err
        );
      }
      throw this.normaliseError("SIGN_FAILED", err, "Freighter transaction signing failed.");
    }
  }
}

// ── Self-registration ─────────────────────────────────────────────────────────

WalletAdapterRegistry.register("freighter", () => new FreighterAdapter());
