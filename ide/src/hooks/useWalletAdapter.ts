"use client";

/**
 * src/hooks/useWalletAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook for dependency-injected wallet adapter access (Issue #821).
 *
 * Bridges the WalletAdapterRegistry DI container with React state so
 * components can connect, sign, and disconnect without importing a specific
 * wallet SDK directly.
 *
 * Usage:
 *   const { adapter, connect, disconnect, publicKey, status, error } =
 *     useWalletAdapter("freighter");
 *
 *   // Or: let the user pick
 *   const { adapter, connect } = useWalletAdapter(selectedWalletType);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback, useEffect } from "react";
import {
  WalletAdapterRegistry,
  WalletAdapterError,
  type WalletAdapter,
  type WalletAdapterType,
  type SignOptions,
  type ConnectResult,
} from "@/lib/wallet/BaseAdapter";

// Ensure concrete adapters are registered before first use
import "@/lib/wallet/FreighterAdapter";
import "@/lib/wallet/AlbedoAdapter";
import "@/lib/wallet/HanaAdapter";

export type WalletStatus =
  | "idle"
  | "checking"
  | "connecting"
  | "connected"
  | "signing"
  | "disconnecting"
  | "error";

export interface UseWalletAdapterReturn {
  /** The raw adapter instance (null if the type is not registered). */
  adapter: WalletAdapter | null;
  /** Current lifecycle status. */
  status: WalletStatus;
  /** Connected public key, or null when not connected. */
  publicKey: string | null;
  /** Last error from any adapter operation. */
  error: WalletAdapterError | null;
  /** Whether the provider extension / popup is available in this browser. */
  isAvailable: boolean;
  /** Connect the wallet and store the returned public key. */
  connect: () => Promise<ConnectResult | null>;
  /** Sign a transaction XDR and return the signed XDR string. */
  signTransaction: (xdr: string, options?: SignOptions) => Promise<string | null>;
  /** Sign a Soroban auth entry XDR. */
  signAuthEntry: (entryXdr: string, options?: SignOptions) => Promise<string | null>;
  /** Disconnect and clear local session state. */
  disconnect: () => Promise<void>;
  /** Clear the last error without changing status. */
  clearError: () => void;
}

export function useWalletAdapter(type: WalletAdapterType): UseWalletAdapterReturn {
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<WalletAdapterError | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  const getAdapter = useCallback((): WalletAdapter | null => {
    try {
      return WalletAdapterRegistry.get(type);
    } catch {
      return null;
    }
  }, [type]);

  // Check availability on mount and when the type changes.
  useEffect(() => {
    const adapter = getAdapter();
    if (!adapter) {
      setIsAvailable(false);
      return;
    }
    setStatus("checking");
    void adapter.isAvailable().then((available) => {
      setIsAvailable(available);
      setStatus("idle");
    });
  }, [type, getAdapter]);

  // Check for an existing session on mount.
  useEffect(() => {
    const adapter = getAdapter();
    if (!adapter) return;
    void adapter.checkConnection().then((pk) => {
      if (pk) {
        setPublicKey(pk);
        setStatus("connected");
      }
    });
  }, [type, getAdapter]);

  const connect = useCallback(async (): Promise<ConnectResult | null> => {
    const adapter = getAdapter();
    if (!adapter) return null;
    setStatus("connecting");
    setError(null);
    try {
      const result = await adapter.connect();
      setPublicKey(result.publicKey);
      setStatus("connected");
      return result;
    } catch (err) {
      const adapterError =
        err instanceof WalletAdapterError
          ? err
          : new WalletAdapterError(type, "CONNECTION_FAILED", String(err), err);
      setError(adapterError);
      setStatus("error");
      return null;
    }
  }, [type, getAdapter]);

  const signTransaction = useCallback(
    async (xdr: string, options?: SignOptions): Promise<string | null> => {
      const adapter = getAdapter();
      if (!adapter) return null;
      setStatus("signing");
      setError(null);
      try {
        const signed = await adapter.signTransaction(xdr, options);
        setStatus("connected");
        return signed;
      } catch (err) {
        const adapterError =
          err instanceof WalletAdapterError
            ? err
            : new WalletAdapterError(type, "SIGN_FAILED", String(err), err);
        setError(adapterError);
        setStatus("error");
        return null;
      }
    },
    [type, getAdapter],
  );

  const signAuthEntry = useCallback(
    async (entryXdr: string, options?: SignOptions): Promise<string | null> => {
      const adapter = getAdapter();
      if (!adapter) return null;
      setStatus("signing");
      setError(null);
      try {
        const signed = await adapter.signAuthEntry(entryXdr, options);
        setStatus("connected");
        return signed;
      } catch (err) {
        const adapterError =
          err instanceof WalletAdapterError
            ? err
            : new WalletAdapterError(type, "SIGN_FAILED", String(err), err);
        setError(adapterError);
        setStatus("error");
        return null;
      }
    },
    [type, getAdapter],
  );

  const disconnect = useCallback(async (): Promise<void> => {
    const adapter = getAdapter();
    if (!adapter) return;
    setStatus("disconnecting");
    setError(null);
    try {
      await adapter.disconnect();
    } finally {
      setPublicKey(null);
      setStatus("idle");
    }
  }, [getAdapter]);

  const clearError = useCallback(() => {
    setError(null);
    if (status === "error") setStatus(publicKey ? "connected" : "idle");
  }, [status, publicKey]);

  return {
    adapter: getAdapter(),
    status,
    publicKey,
    error,
    isAvailable,
    connect,
    signTransaction,
    signAuthEntry,
    disconnect,
    clearError,
  };
}
