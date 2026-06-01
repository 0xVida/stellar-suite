import type { WalletProviderType } from "@/wallet/WalletService";
import { WalletService } from "@/wallet/WalletService";

/**
 * Permission scopes a caller can request from the wallet. Designed around the
 * principle of least privilege — a caller asks for only what it needs, and the
 * adapter mints a short-lived session key for that scope. The session is then
 * consumed and revoked, so the next sensitive operation has to ask again.
 *
 * - `connect:read`      Read the connected account's public key. Non-sensitive.
 * - `sign:invoke`       Sign a single Soroban contract invocation.
 * - `sign:deploy`       Sign a single contract deployment (upload + instantiate).
 * - `sign:transaction`  Generic single-transaction signing for arbitrary XDR.
 */
export type WalletScope =
  | "connect:read"
  | "sign:invoke"
  | "sign:deploy"
  | "sign:transaction";

export const SENSITIVE_SCOPES: ReadonlySet<WalletScope> = new Set([
  "sign:invoke",
  "sign:deploy",
  "sign:transaction",
]);

/** Default lifetime (ms) for a signing session before it auto-revokes. */
export const DEFAULT_SESSION_TTL_MS = 2 * 60 * 1000;

/** Hard cap to prevent callers from minting effectively-permanent sessions. */
export const MAX_SESSION_TTL_MS = 5 * 60 * 1000;

export interface ConsentDescriptor {
  scope: WalletScope;
  walletType: WalletProviderType;
  /** Short, user-facing action label, e.g. "Invoke contract function `transfer`". */
  action: string;
  /** Optional contract or destination identifier, shown to the user. */
  target?: string;
  /** Network the request will run against. */
  network?: string;
  /** Free-form details rendered as a list (key/value pairs). */
  details?: Record<string, string | undefined>;
  /** Requested session lifetime (ms). Clamped to MAX_SESSION_TTL_MS. */
  ttlMs?: number;
}

export type ConsentDecision =
  | { approved: true; ttlMs?: number }
  | { approved: false; reason?: string };

export type ConsentHandler = (descriptor: ConsentDescriptor) => Promise<ConsentDecision>;

export interface SessionKey {
  id: string;
  scope: WalletScope;
  walletType: WalletProviderType;
  expiresAt: number;
  /** True once the session has been spent (single-use) or revoked. */
  consumed: boolean;
}

/**
 * Error thrown when the user denies a consent prompt. Kept distinct from
 * generic errors so the UI layer can render a friendlier message.
 */
export class WalletConsentDeniedError extends Error {
  constructor(message = "User declined the wallet permission request.") {
    super(message);
    this.name = "WalletConsentDeniedError";
  }
}

/**
 * Error thrown when no consent handler is registered but a sensitive scope is
 * requested. This prevents accidentally falling back to silent full-access.
 */
export class WalletNoConsentHandlerError extends Error {
  constructor() {
    super(
      "A wallet permission was requested but no consent handler is registered. " +
        "Mount <WalletPermissionPrompt /> high in the tree before invoking sensitive operations.",
    );
    this.name = "WalletNoConsentHandlerError";
  }
}

interface InvokeSignOptions {
  networkPassphrase: string;
  network?: string;
  address?: string;
  contractId?: string;
  fnName?: string;
}

interface DeploySignOptions {
  networkPassphrase: string;
  network?: string;
  address?: string;
  /** Hex-encoded WASM hash being instantiated, when known. */
  wasmHash?: string;
  /** Step within the deployment flow ("upload" | "instantiate"). */
  step?: string;
}

interface GenericSignOptions {
  networkPassphrase: string;
  network?: string;
  address?: string;
  /** Optional human-readable label for the prompt. */
  label?: string;
}

const generateSessionId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const clampTtl = (requested: number | undefined): number => {
  const ttl = typeof requested === "number" && requested > 0 ? requested : DEFAULT_SESSION_TTL_MS;
  return Math.min(ttl, MAX_SESSION_TTL_MS);
};

/**
 * Central wallet permission broker. Callers go through this adapter instead of
 * touching wallet providers directly, so every sensitive operation funnels
 * through a single consent + scoped-session check.
 */
class WalletAdapterImpl {
  private consentHandler: ConsentHandler | null = null;
  private readonly sessions = new Map<string, SessionKey>();

  /**
   * Register the function the adapter will call when consent is needed.
   * Returns an unsubscribe function so React components can clean up on unmount.
   */
  registerConsentHandler(handler: ConsentHandler): () => void {
    this.consentHandler = handler;
    return () => {
      if (this.consentHandler === handler) {
        this.consentHandler = null;
      }
    };
  }

  hasConsentHandler(): boolean {
    return this.consentHandler !== null;
  }

  /** Read-only view of active (non-expired, unconsumed) sessions, for diagnostics/tests. */
  getActiveSessions(): SessionKey[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter(
      (session) => !session.consumed && session.expiresAt > now,
    );
  }

  /** Revoke a single session by id. Idempotent. */
  revokeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.consumed = true;
      this.sessions.delete(sessionId);
    }
  }

  /** Revoke every session. Called on wallet disconnect. */
  revokeAll(): void {
    for (const session of this.sessions.values()) {
      session.consumed = true;
    }
    this.sessions.clear();
  }

  /**
   * Connect to a wallet provider. `connect:read` is a low-sensitivity scope
   * (just reads the public key) but we still gate it on consent so the user
   * always sees the first connection — that's the moment they grant any
   * access at all.
   */
  async connect(walletType: WalletProviderType): Promise<string> {
    await this.requestConsent({
      scope: "connect:read",
      walletType,
      action: "Read your wallet's public key",
      details: {
        Provider: walletType,
        Permissions: "Public key only — no signing",
      },
    });
    return WalletService.connect(walletType);
  }

  /** Silent check for an existing connection. Never prompts the user. */
  async checkConnection(walletType: WalletProviderType): Promise<string | null> {
    return WalletService.checkConnection(walletType);
  }

  /**
   * Sign a contract invocation. Mints a single-use `sign:invoke` session
   * after explicit user consent, then consumes it immediately.
   */
  async signInvocation(
    walletType: WalletProviderType,
    transactionXdr: string,
    options: InvokeSignOptions,
  ): Promise<string> {
    const session = await this.openSession({
      scope: "sign:invoke",
      walletType,
      action: options.fnName
        ? `Invoke contract function \`${options.fnName}\``
        : "Invoke a Soroban contract function",
      target: options.contractId,
      network: options.network,
      details: {
        Contract: options.contractId,
        Function: options.fnName,
        Network: options.network,
        Signer: options.address,
      },
    });

    try {
      return await WalletService.signTransaction(walletType, transactionXdr, {
        networkPassphrase: options.networkPassphrase,
        address: options.address,
      });
    } finally {
      this.revokeSession(session.id);
    }
  }

  /** Sign a deployment-related transaction (upload WASM or instantiate). */
  async signDeployment(
    walletType: WalletProviderType,
    transactionXdr: string,
    options: DeploySignOptions,
  ): Promise<string> {
    const stepLabel = options.step ? ` (${options.step})` : "";
    const session = await this.openSession({
      scope: "sign:deploy",
      walletType,
      action: `Deploy a contract${stepLabel}`,
      target: options.wasmHash,
      network: options.network,
      details: {
        Step: options.step,
        "WASM hash": options.wasmHash,
        Network: options.network,
        Signer: options.address,
      },
    });

    try {
      return await WalletService.signTransaction(walletType, transactionXdr, {
        networkPassphrase: options.networkPassphrase,
        address: options.address,
      });
    } finally {
      this.revokeSession(session.id);
    }
  }

  /** Generic XDR signing for callers that don't fit invoke/deploy. */
  async signTransaction(
    walletType: WalletProviderType,
    transactionXdr: string,
    options: GenericSignOptions,
  ): Promise<string> {
    const session = await this.openSession({
      scope: "sign:transaction",
      walletType,
      action: options.label ?? "Sign a Stellar transaction",
      network: options.network,
      details: {
        Network: options.network,
        Signer: options.address,
      },
    });

    try {
      return await WalletService.signTransaction(walletType, transactionXdr, {
        networkPassphrase: options.networkPassphrase,
        address: options.address,
      });
    } finally {
      this.revokeSession(session.id);
    }
  }

  private async openSession(descriptor: ConsentDescriptor): Promise<SessionKey> {
    const decision = await this.requestConsent(descriptor);
    const ttlMs = clampTtl(decision.ttlMs ?? descriptor.ttlMs);
    const session: SessionKey = {
      id: generateSessionId(),
      scope: descriptor.scope,
      walletType: descriptor.walletType,
      expiresAt: Date.now() + ttlMs,
      consumed: false,
    };
    this.sessions.set(session.id, session);

    if (ttlMs > 0 && typeof setTimeout !== "undefined") {
      const timer = setTimeout(() => this.revokeSession(session.id), ttlMs);
      if (typeof (timer as { unref?: () => void }).unref === "function") {
        (timer as { unref: () => void }).unref();
      }
    }
    return session;
  }

  private async requestConsent(descriptor: ConsentDescriptor): Promise<{ ttlMs?: number }> {
    if (!SENSITIVE_SCOPES.has(descriptor.scope) && !this.consentHandler) {
      // Low-sensitivity scopes (connect:read) can fall through silently when
      // the UI hasn't mounted yet — this matches the previous behavior of
      // exposing the public key on demand.
      return {};
    }

    if (!this.consentHandler) {
      throw new WalletNoConsentHandlerError();
    }

    const decision = await this.consentHandler(descriptor);
    if (!decision.approved) {
      throw new WalletConsentDeniedError(decision.reason);
    }
    return { ttlMs: decision.ttlMs };
  }
}

export const WalletAdapter = new WalletAdapterImpl();
export type { WalletAdapterImpl };
