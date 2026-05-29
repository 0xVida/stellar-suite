/**
 * StellarWalletConnect — high-level binding around a WalletConnect v2
 * SignClient that speaks the Stellar namespace (`stellar:pubnet`,
 * `stellar:testnet`, `stellar_signXDR`, `stellar_signAndSubmitXDR`).
 *
 * The binding never imports `@walletconnect/sign-client` directly. The
 * caller injects a `signClientFactory` so the same code path runs in the
 * browser (real client) and under unit tests (fake client). This keeps
 * the bundle lean and makes the binding mockable end-to-end.
 *
 * Lifecycle:
 *
 *   const wc = new StellarWalletConnect({ projectId, metadata });
 *   await wc.init({ signClientFactory });
 *
 *   const { uri, session } = await wc.connect({ chains: ["stellar:testnet"] });
 *   // render `uri` as a QR code, then await `session`
 *   const active = await session;
 *
 *   const { signedXdr } = await wc.signTransaction({
 *     xdr,
 *     chain: "stellar:testnet",
 *     account: active.accounts[0],
 *   });
 *
 *   await wc.disconnect();
 */

import { browserSessionStorage } from "./storage";
import {
  ALL_STELLAR_CHAINS,
  ALL_STELLAR_METHODS,
  STELLAR_EVENTS,
  STELLAR_METHODS,
  STELLAR_NAMESPACE,
  WalletConnectError,
  type AppMetadata,
  type ConnectResult,
  type SessionStorage,
  type SessionStructLike,
  type SignClientLike,
  type SignTransactionParams,
  type SignTransactionResult,
  type StellarChain,
  type StellarSession,
} from "./types";
import { isValidBase64Xdr, isStellarChain, normalizeXdr, parseAccount } from "./xdr";

/** Factory the caller injects so the SDK stays an optional dependency. */
export type SignClientFactory = (config: {
  projectId: string;
  metadata: AppMetadata;
}) => Promise<SignClientLike>;

export interface StellarWalletConnectOptions {
  projectId: string;
  metadata: AppMetadata;
  /** Persistence layer; defaults to `browserSessionStorage()`. */
  storage?: SessionStorage;
  /**
   * Required chains during pairing. Wallets that don't list every chain
   * here will reject the session. Defaults to all known Stellar chains.
   */
  requiredChains?: StellarChain[];
}

export interface InitOptions {
  signClientFactory: SignClientFactory;
}

export interface ConnectOptions {
  chains?: StellarChain[];
  pairingTopic?: string;
}

type Listener<T> = (payload: T) => void;

interface EventMap {
  session: StellarSession;
  disconnect: { topic: string };
  expire: { topic: string };
}

const REJECTION_CODE = 5001;
const USER_DISCONNECT_REASON = {
  code: 6000,
  message: "User disconnected",
} as const;

const namespaceFor = (chains: StellarChain[]) => ({
  [STELLAR_NAMESPACE]: {
    chains: [...chains],
    methods: [...ALL_STELLAR_METHODS],
    events: [...STELLAR_EVENTS],
  },
});

export class StellarWalletConnect {
  private readonly options: Required<
    Pick<StellarWalletConnectOptions, "projectId" | "metadata">
  > & {
    storage: SessionStorage;
    requiredChains: StellarChain[];
  };

  private client: SignClientLike | null = null;
  private session: StellarSession | null = null;
  private listeners: {
    [K in keyof EventMap]: Set<Listener<EventMap[K]>>;
  } = {
    session: new Set(),
    disconnect: new Set(),
    expire: new Set(),
  };

  constructor(options: StellarWalletConnectOptions) {
    if (!options.projectId) {
      throw new WalletConnectError(
        "NOT_INITIALIZED",
        "A WalletConnect projectId is required.",
      );
    }
    if (
      options.requiredChains &&
      options.requiredChains.some((c) => !isStellarChain(c))
    ) {
      throw new WalletConnectError(
        "UNSUPPORTED_CHAIN",
        "requiredChains contains a non-Stellar chain.",
      );
    }

    this.options = {
      projectId: options.projectId,
      metadata: options.metadata,
      storage: options.storage ?? browserSessionStorage(),
      requiredChains: options.requiredChains
        ? [...options.requiredChains]
        : [...ALL_STELLAR_CHAINS],
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  async init({ signClientFactory }: InitOptions): Promise<void> {
    if (this.client) return;
    try {
      this.client = await signClientFactory({
        projectId: this.options.projectId,
        metadata: this.options.metadata,
      });
    } catch (cause) {
      throw new WalletConnectError(
        "TRANSPORT_ERROR",
        "Failed to initialize SignClient.",
        cause,
      );
    }

    this.attachClientListeners();
    await this.restoreSession();
  }

  /** Whether `init()` has resolved and a SignClient is attached. */
  get isInitialized(): boolean {
    return this.client !== null;
  }

  /** Currently approved session, or `null`. */
  getSession(): StellarSession | null {
    return this.session;
  }

  // ── Connect / disconnect ─────────────────────────────────────────────

  async connect(opts: ConnectOptions = {}): Promise<ConnectResult> {
    const client = this.requireClient();

    const chains = opts.chains?.length
      ? opts.chains
      : this.options.requiredChains;

    for (const c of chains) {
      if (!isStellarChain(c)) {
        throw new WalletConnectError(
          "UNSUPPORTED_CHAIN",
          `Chain ${String(c)} is not a Stellar chain.`,
        );
      }
    }

    let response: Awaited<ReturnType<SignClientLike["connect"]>>;
    try {
      response = await client.connect({
        requiredNamespaces: namespaceFor(chains),
        pairingTopic: opts.pairingTopic,
      });
    } catch (cause) {
      throw new WalletConnectError(
        "TRANSPORT_ERROR",
        "Failed to start WalletConnect pairing.",
        cause,
      );
    }

    const sessionPromise = response.approval().then(
      (raw) => this.acceptSession(raw),
      (cause: unknown) => {
        throw new WalletConnectError(
          "USER_REJECTED",
          "The wallet rejected the session proposal.",
          cause,
        );
      },
    );

    return { uri: response.uri ?? null, session: sessionPromise };
  }

  async disconnect(): Promise<void> {
    const client = this.requireClient();
    if (!this.session) return;
    const topic = this.session.topic;
    try {
      await client.disconnect({
        topic,
        reason: { ...USER_DISCONNECT_REASON },
      });
    } catch (cause) {
      throw new WalletConnectError(
        "TRANSPORT_ERROR",
        "Failed to disconnect WalletConnect session.",
        cause,
      );
    } finally {
      this.session = null;
      await this.options.storage.clear();
      this.emit("disconnect", { topic });
    }
  }

  // ── Signing ──────────────────────────────────────────────────────────

  async signTransaction(
    params: SignTransactionParams,
  ): Promise<SignTransactionResult> {
    const client = this.requireClient();
    const session = this.requireSession();

    if (!isStellarChain(params.chain)) {
      throw new WalletConnectError(
        "UNSUPPORTED_CHAIN",
        `Chain ${String(params.chain)} is not a Stellar chain.`,
      );
    }
    if (!session.chains.includes(params.chain)) {
      throw new WalletConnectError(
        "UNSUPPORTED_CHAIN",
        `Active session does not include chain ${params.chain}.`,
      );
    }
    if (!isValidBase64Xdr(params.xdr)) {
      throw new WalletConnectError(
        "INVALID_XDR",
        "XDR payload is empty, too large, or not valid base64.",
      );
    }

    if (params.account) {
      const expected = `${params.chain}:${params.account}`;
      if (!session.accounts.includes(expected)) {
        throw new WalletConnectError(
          "ACCOUNT_NOT_AUTHORIZED",
          `Account ${params.account} is not authorized for ${params.chain}.`,
        );
      }
    }

    const method = params.submit
      ? STELLAR_METHODS.signAndSubmitXDR
      : STELLAR_METHODS.signXDR;

    if (!sessionSupportsMethod(session.topic, client, method)) {
      throw new WalletConnectError(
        "UNSUPPORTED_METHOD",
        `Active session does not support ${method}.`,
      );
    }

    let response: unknown;
    try {
      response = await client.request({
        topic: session.topic,
        chainId: params.chain,
        request: {
          method,
          params: {
            xdr: normalizeXdr(params.xdr),
          },
        },
      });
    } catch (cause) {
      throw mapRequestError(cause);
    }

    return parseSignResponse(response);
  }

  // ── Events ───────────────────────────────────────────────────────────

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const listener of this.listeners[event]) {
      try {
        listener(payload);
      } catch {
        // Listener exceptions must not break the binding's internal flow.
      }
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  private requireClient(): SignClientLike {
    if (!this.client) {
      throw new WalletConnectError(
        "NOT_INITIALIZED",
        "StellarWalletConnect.init() must be called before this method.",
      );
    }
    return this.client;
  }

  private requireSession(): StellarSession {
    if (!this.session) {
      throw new WalletConnectError(
        "NO_ACTIVE_SESSION",
        "No active WalletConnect session. Call connect() first.",
      );
    }
    if (this.session.expiry * 1000 <= Date.now()) {
      const topic = this.session.topic;
      this.session = null;
      void this.options.storage.clear();
      this.emit("expire", { topic });
      throw new WalletConnectError(
        "SESSION_EXPIRED",
        "WalletConnect session expired. Reconnect required.",
      );
    }
    return this.session;
  }

  private acceptSession(raw: SessionStructLike): StellarSession {
    const namespace = raw.namespaces[STELLAR_NAMESPACE];
    if (!namespace) {
      throw new WalletConnectError(
        "UNSUPPORTED_CHAIN",
        "Wallet returned a session without a `stellar` namespace.",
      );
    }

    const chains: StellarChain[] = [];
    for (const account of namespace.accounts) {
      const parsed = parseAccount(account);
      if (!parsed) continue;
      if (!chains.includes(parsed.chain)) chains.push(parsed.chain);
    }
    if (chains.length === 0) {
      throw new WalletConnectError(
        "UNSUPPORTED_CHAIN",
        "Wallet did not return any usable Stellar accounts.",
      );
    }

    const session: StellarSession = {
      topic: raw.topic,
      chains,
      accounts: [...namespace.accounts],
      peer: raw.peer.metadata,
      expiry: raw.expiry,
    };

    this.session = session;
    void this.options.storage.write({
      topic: session.topic,
      savedAt: Date.now(),
    });
    this.emit("session", session);
    return session;
  }

  private async restoreSession(): Promise<void> {
    if (!this.client) return;
    const stored = await this.options.storage.read();
    if (!stored) return;
    try {
      const raw = this.client.session.get(stored.topic);
      this.acceptSession(raw);
    } catch {
      await this.options.storage.clear();
    }
  }

  private attachClientListeners(): void {
    if (!this.client) return;
    this.client.on("session_delete", (args) => {
      const topic = (args as { topic?: string } | undefined)?.topic;
      if (topic && this.session?.topic === topic) {
        this.session = null;
        void this.options.storage.clear();
        this.emit("disconnect", { topic });
      }
    });
    this.client.on("session_expire", (args) => {
      const topic = (args as { topic?: string } | undefined)?.topic;
      if (topic && this.session?.topic === topic) {
        this.session = null;
        void this.options.storage.clear();
        this.emit("expire", { topic });
      }
    });
  }
}

const sessionSupportsMethod = (
  topic: string,
  client: SignClientLike,
  method: string,
): boolean => {
  try {
    const struct = client.session.get(topic);
    return struct.namespaces[STELLAR_NAMESPACE]?.methods.includes(method) ?? false;
  } catch {
    return false;
  }
};

const parseSignResponse = (raw: unknown): SignTransactionResult => {
  if (typeof raw === "string") {
    return { signedXdr: normalizeXdr(raw) };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const signedXdr =
      typeof obj.signedXDR === "string"
        ? obj.signedXDR
        : typeof obj.signedXdr === "string"
          ? obj.signedXdr
          : typeof obj.xdr === "string"
            ? obj.xdr
            : null;
    if (!signedXdr) {
      throw new WalletConnectError(
        "TRANSPORT_ERROR",
        "Wallet response is missing a signed XDR field.",
      );
    }
    const txHash =
      typeof obj.txHash === "string"
        ? obj.txHash
        : typeof obj.transactionHash === "string"
          ? obj.transactionHash
          : undefined;
    return txHash ? { signedXdr, txHash } : { signedXdr };
  }
  throw new WalletConnectError(
    "TRANSPORT_ERROR",
    "Wallet returned an unexpected response shape.",
  );
};

const mapRequestError = (cause: unknown): WalletConnectError => {
  const message =
    cause instanceof Error ? cause.message : "WalletConnect request failed.";
  const code = (cause as { code?: number } | null)?.code;
  if (code === REJECTION_CODE || /reject/i.test(message)) {
    return new WalletConnectError("USER_REJECTED", "User rejected the request.", cause);
  }
  if (/expire/i.test(message)) {
    return new WalletConnectError("SESSION_EXPIRED", message, cause);
  }
  return new WalletConnectError("TRANSPORT_ERROR", message, cause);
};
