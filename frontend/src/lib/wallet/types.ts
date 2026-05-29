/**
 * Standard Stellar WalletConnect bindings.
 *
 * Aligns with the Stellar WalletConnect specification used by LOBSTR
 * Vault, xBull, and other Stellar wallets that expose the protocol over
 * the standard WalletConnect v2 transport.
 *
 * Spec references:
 *   - Stellar namespace: `stellar`
 *   - Chains:            `stellar:pubnet`, `stellar:testnet`
 *   - Methods:           `stellar_signXDR`, `stellar_signAndSubmitXDR`
 *   - Events:            `connect`, `disconnect`, `chainChanged`,
 *                        `accountsChanged`
 */

export const STELLAR_NAMESPACE = "stellar" as const;

export const STELLAR_CHAINS = {
  pubnet: "stellar:pubnet",
  testnet: "stellar:testnet",
} as const;

export type StellarChain = (typeof STELLAR_CHAINS)[keyof typeof STELLAR_CHAINS];

export const STELLAR_METHODS = {
  signXDR: "stellar_signXDR",
  signAndSubmitXDR: "stellar_signAndSubmitXDR",
} as const;

export type StellarMethod =
  (typeof STELLAR_METHODS)[keyof typeof STELLAR_METHODS];

export const STELLAR_EVENTS = ["accountsChanged", "chainChanged"] as const;
export type StellarEvent = (typeof STELLAR_EVENTS)[number];

/** All known Stellar chains as a frozen list. */
export const ALL_STELLAR_CHAINS: readonly StellarChain[] = Object.freeze([
  STELLAR_CHAINS.pubnet,
  STELLAR_CHAINS.testnet,
]);

/** All known Stellar methods as a frozen list. */
export const ALL_STELLAR_METHODS: readonly StellarMethod[] = Object.freeze([
  STELLAR_METHODS.signXDR,
  STELLAR_METHODS.signAndSubmitXDR,
]);

/**
 * Application metadata sent to wallets during pairing. WalletConnect v2
 * surfaces this in the wallet UI before the user approves the session.
 */
export interface AppMetadata {
  name: string;
  description: string;
  url: string;
  icons: string[];
}

/**
 * Minimal SignClient-shaped interface. Only the surface area we actually
 * use is typed — keeping the dependency on `@walletconnect/sign-client`
 * optional (peer / runtime-only) and the module fully mockable in tests.
 */
export interface SignClientLike {
  readonly session: {
    getAll(): SessionStructLike[];
    get(topic: string): SessionStructLike;
  };
  connect(args: ConnectArgs): Promise<{
    uri?: string;
    approval: () => Promise<SessionStructLike>;
  }>;
  request(args: RequestArgs): Promise<unknown>;
  disconnect(args: { topic: string; reason: ErrorReason }): Promise<void>;
  on(event: SignClientEvent, listener: SignClientListener): void;
  off(event: SignClientEvent, listener: SignClientListener): void;
}

export interface SessionStructLike {
  topic: string;
  expiry: number;
  namespaces: Record<
    string,
    {
      accounts: string[];
      methods: string[];
      events: string[];
    }
  >;
  peer: {
    metadata: AppMetadata;
  };
}

export interface ConnectArgs {
  requiredNamespaces: Record<
    string,
    {
      chains: string[];
      methods: string[];
      events: string[];
    }
  >;
  optionalNamespaces?: Record<
    string,
    {
      chains: string[];
      methods: string[];
      events: string[];
    }
  >;
  pairingTopic?: string;
}

export interface RequestArgs {
  topic: string;
  chainId: string;
  request: {
    method: string;
    params: unknown;
  };
}

export interface ErrorReason {
  code: number;
  message: string;
}

export type SignClientEvent =
  | "session_event"
  | "session_update"
  | "session_delete"
  | "session_expire"
  | "session_proposal"
  | "session_request";

export type SignClientListener = (args: unknown) => void;

/** Session state held by the binding for the host application. */
export interface StellarSession {
  topic: string;
  chains: StellarChain[];
  accounts: string[];
  peer: AppMetadata;
  expiry: number;
}

/** Result of a successful `connect()` call. */
export interface ConnectResult {
  /** Returned immediately so the host can render a QR code or deep link. */
  uri: string | null;
  /** Resolves once the wallet approves the session proposal. */
  session: Promise<StellarSession>;
}

export interface SignTransactionParams {
  xdr: string;
  chain: StellarChain;
  /** Optional account hint — must match an account in the session. */
  account?: string;
  /** Whether the signature should also submit the transaction. */
  submit?: boolean;
}

export interface SignTransactionResult {
  signedXdr: string;
  /** Present only when `submit: true` and the wallet returns a hash. */
  txHash?: string;
}

/** Pluggable persistence layer for restoring sessions across reloads. */
export interface SessionStorage {
  read(): Promise<StoredSession | null> | StoredSession | null;
  write(value: StoredSession): Promise<void> | void;
  clear(): Promise<void> | void;
}

export interface StoredSession {
  topic: string;
  savedAt: number;
}

/**
 * Discriminated error union surfaced by the binding. Callers can switch on
 * `code` to map errors to UX without parsing message strings.
 */
export type WalletConnectErrorCode =
  | "NOT_INITIALIZED"
  | "NO_ACTIVE_SESSION"
  | "INVALID_XDR"
  | "UNSUPPORTED_CHAIN"
  | "UNSUPPORTED_METHOD"
  | "ACCOUNT_NOT_AUTHORIZED"
  | "USER_REJECTED"
  | "SESSION_EXPIRED"
  | "TRANSPORT_ERROR";

export class WalletConnectError extends Error {
  public readonly code: WalletConnectErrorCode;
  public readonly cause?: unknown;

  constructor(code: WalletConnectErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "WalletConnectError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}
