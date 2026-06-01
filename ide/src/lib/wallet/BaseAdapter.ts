/**
 * src/lib/wallet/BaseAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dependency Injection for Wallet Connectors — Issue #644
 *
 * Defines the canonical `WalletAdapter` interface and the `BaseWalletAdapter`
 * abstract class that all concrete wallet adapters must extend.
 *
 * Architecture
 * ────────────
 *  WalletAdapter (interface)         ← the contract every adapter fulfills
 *       │
 *  BaseWalletAdapter (abstract)      ← shared helpers, capability flags,
 *       │                              error normalisation, lifecycle hooks
 *       ├── FreighterAdapter          ← wraps @stellar/freighter-api
 *       ├── AlbedoAdapter             ← wraps @albedo-link/intent
 *       └── HanaAdapter               ← wraps window.hana (Hana Wallet extension)
 *
 * Usage
 * ─────
 *   import { FreighterAdapter } from "@/lib/wallet/FreighterAdapter";
 *   import { WalletAdapterRegistry } from "@/lib/wallet/BaseAdapter";
 *
 *   // Auto-detect and connect
 *   const adapter = WalletAdapterRegistry.get("freighter");
 *   const publicKey = await adapter.connect();
 *
 *   // Or: inject any adapter at call-site
 *   async function sign(adapter: WalletAdapter, xdr: string) {
 *     return adapter.signTransaction(xdr, { networkPassphrase: "..." });
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

/** All known wallet provider identifiers. */
export type WalletAdapterType = "freighter" | "albedo" | "hana";

/** Options passed to signTransaction / signAuthEntry. */
export interface SignOptions {
  /** Stellar network passphrase (e.g. "Test SDF Network ; September 2015") */
  networkPassphrase?: string;
  /** Stellar public key of the signing account */
  address?: string;
}

/** Structured result from a successful connection. */
export interface ConnectResult {
  /** G... Stellar public key of the connected account */
  publicKey: string;
  /** Human-readable wallet display name, if available */
  displayName?: string;
}

/**
 * Capability flags — tell consumers what the adapter supports
 * without having to try/catch feature calls.
 */
export interface WalletCapabilities {
  /** Can sign Stellar transactions (XDR envelope) */
  canSignTransaction: boolean;
  /** Can sign Soroban authorization entries */
  canSignAuthEntry: boolean;
  /** Can check whether a session already exists without a user popup */
  canCheckConnection: boolean;
  /** Whether the wallet is a browser extension vs. a web-popup flow */
  isExtension: boolean;
}

/** Metadata about the wallet provider. */
export interface WalletAdapterInfo {
  /** Unique string identifier */
  id: WalletAdapterType;
  /** Human-readable name */
  name: string;
  /** Short description shown in wallet selector UI */
  description: string;
  /** Download / homepage URL */
  url: string;
  capabilities: WalletCapabilities;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core interface — ALL adapters must implement this
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standardized WalletAdapter interface.
 *
 * Every method has a concrete, non-optional signature so consumers don't need
 * to guard for `undefined`. Adapters that genuinely can't support a method
 * (e.g. Albedo signing) should throw a descriptive `WalletAdapterError`.
 */
export interface WalletAdapter {
  /** Static metadata — safe to read before connecting. */
  readonly info: WalletAdapterInfo;

  /**
   * Check whether the wallet extension / provider is available in this browser.
   * Does NOT trigger a connection popup.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Initiate a connection and return the connected account's public key.
   * May open a browser popup.
   */
  connect(): Promise<ConnectResult>;

  /**
   * Check whether there is an existing active session.
   * Returns the public key if connected, `null` otherwise.
   * Never opens a popup.
   */
  checkConnection(): Promise<string | null>;

  /**
   * Disconnect / clear the active session.
   * No-op if the wallet manages sessions externally (e.g. extensions).
   */
  disconnect(): Promise<void>;

  /**
   * Sign a Stellar transaction XDR envelope.
   * Returns the signed XDR string.
   * Throws `WalletAdapterError` with code `UNSUPPORTED` if not supported.
   */
  signTransaction(xdr: string, options?: SignOptions): Promise<string>;

  /**
   * Sign a Soroban authorization entry XDR.
   * Returns the signed entry XDR string.
   * Throws `WalletAdapterError` with code `UNSUPPORTED` if not supported.
   */
  signAuthEntry(entryXdr: string, options?: SignOptions): Promise<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed error class
// ─────────────────────────────────────────────────────────────────────────────

export type WalletAdapterErrorCode =
  | "NOT_AVAILABLE"     // Extension/provider not installed
  | "CONNECTION_FAILED" // connect() call failed
  | "USER_REJECTED"     // User dismissed / cancelled the popup
  | "SIGN_FAILED"       // Transaction / auth-entry signing failed
  | "UNSUPPORTED"       // Feature not supported by this provider
  | "UNKNOWN";          // Catch-all

export class WalletAdapterError extends Error {
  readonly code: WalletAdapterErrorCode;
  readonly adapter: WalletAdapterType;
  readonly cause?: unknown;

  constructor(
    adapter: WalletAdapterType,
    code: WalletAdapterErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "WalletAdapterError";
    this.code = code;
    this.adapter = adapter;
    this.cause = cause;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Abstract base — shared helpers that concrete adapters inherit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abstract base class for all wallet adapters.
 *
 * Concrete adapters extend this and only override the methods they need to.
 * Unsupported operations automatically throw a well-typed `WalletAdapterError`.
 */
export abstract class BaseWalletAdapter implements WalletAdapter {
  abstract readonly info: WalletAdapterInfo;

  // Subclasses implement these two
  abstract isAvailable(): Promise<boolean>;
  abstract connect(): Promise<ConnectResult>;

  /** Default: no persistent session check. Override when supported. */
  async checkConnection(): Promise<string | null> {
    return null;
  }

  /** Default: no-op disconnect. Override for session-aware providers. */
  async disconnect(): Promise<void> {
    // no-op by default
  }

  /** Default: throws UNSUPPORTED. Override in adapters that can sign. */
  async signTransaction(_xdr: string, _options?: SignOptions): Promise<string> {
    throw new WalletAdapterError(
      this.info.id,
      "UNSUPPORTED",
      `${this.info.name} does not support transaction signing.`
    );
  }

  /** Default: throws UNSUPPORTED. Override in adapters that can sign auth entries. */
  async signAuthEntry(_entryXdr: string, _options?: SignOptions): Promise<string> {
    throw new WalletAdapterError(
      this.info.id,
      "UNSUPPORTED",
      `${this.info.name} does not support auth entry signing.`
    );
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  /**
   * Normalise any thrown value into a `WalletAdapterError`.
   * Useful inside catch blocks to ensure typed errors propagate upward.
   */
  protected normaliseError(
    code: WalletAdapterErrorCode,
    err: unknown,
    fallbackMessage: string
  ): WalletAdapterError {
    let message: string;
    if (err instanceof Error) {
      message = err.message || fallbackMessage;
    } else {
      const coerced = String(err ?? "");
      message = coerced && coerced !== "null" && coerced !== "undefined"
        ? coerced
        : fallbackMessage;
    }
    return new WalletAdapterError(this.info.id, code, message, err);
  }

  /**
   * Detect common user-rejection signals across wallet SDKs.
   * Returns true if `err` looks like a user cancellation.
   */
  protected isUserRejection(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes("user rejected") ||
      msg.includes("user cancelled") ||
      msg.includes("user denied") ||
      msg.includes("closed") ||
      msg.includes("cancel")
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry — DI container for adapter instances
// ─────────────────────────────────────────────────────────────────────────────

type AdapterFactory = () => WalletAdapter;

/**
 * Global adapter registry.
 *
 * Adapters register themselves at module load time; consumers retrieve them
 * by provider key. This is the dependency-injection entry-point:
 *
 *   const adapter = WalletAdapterRegistry.get("freighter");
 *
 * Custom / third-party adapters can be added at runtime:
 *
 *   WalletAdapterRegistry.register("myWallet" as WalletAdapterType, () => new MyAdapter());
 */
export class WalletAdapterRegistry {
  private static readonly factories = new Map<string, AdapterFactory>();
  private static readonly cache    = new Map<string, WalletAdapter>();

  /** Register a factory function for an adapter type. */
  static register(type: string, factory: AdapterFactory): void {
    this.factories.set(type, factory);
    this.cache.delete(type); // invalidate any cached instance
  }

  /**
   * Retrieve the adapter for a given type.
   * Instances are cached (singleton-per-type) after first creation.
   */
  static get(type: WalletAdapterType | string): WalletAdapter {
    if (this.cache.has(type)) return this.cache.get(type)!;
    const factory = this.factories.get(type);
    if (!factory) {
      throw new WalletAdapterError(
        type as WalletAdapterType,
        "NOT_AVAILABLE",
        `No adapter registered for wallet type "${type}".`
      );
    }
    const instance = factory();
    this.cache.set(type, instance);
    return instance;
  }

  /** Returns all registered type keys. */
  static registered(): string[] {
    return [...this.factories.keys()];
  }

  /** Clear cached instances (useful for testing). */
  static clearCache(): void {
    this.cache.clear();
  }
}
