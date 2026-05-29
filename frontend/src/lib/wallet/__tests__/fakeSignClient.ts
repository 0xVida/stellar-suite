/**
 * Programmable in-memory SignClient used by unit + integration tests.
 * Each method's behavior is configurable so individual test cases can
 * simulate approval, rejection, expiry, malformed responses, etc.
 */

import {
  ALL_STELLAR_METHODS,
  STELLAR_EVENTS,
  STELLAR_NAMESPACE,
  type ConnectArgs,
  type RequestArgs,
  type SessionStructLike,
  type SignClientEvent,
  type SignClientLike,
  type SignClientListener,
  type StellarChain,
} from "@/lib/wallet/types";

export interface FakeWalletConfig {
  chains: StellarChain[];
  publicKey: string;
  methods?: string[];
  expirySeconds?: number;
  peerName?: string;
}

export interface FakeSignClient extends SignClientLike {
  approve: (config: FakeWalletConfig) => SessionStructLike;
  reject: (error?: Error) => void;
  programResponse: (response: unknown) => void;
  programRequestError: (error: unknown) => void;
  emitEvent: (event: SignClientEvent, payload: unknown) => void;
  capturedConnect: ConnectArgs[];
  capturedRequests: RequestArgs[];
  capturedDisconnects: Array<{ topic: string; reason: { code: number; message: string } }>;
}

const buildSession = (
  topic: string,
  config: FakeWalletConfig,
): SessionStructLike => ({
  topic,
  expiry:
    Math.floor(Date.now() / 1000) + (config.expirySeconds ?? 60 * 60 * 24),
  namespaces: {
    [STELLAR_NAMESPACE]: {
      accounts: config.chains.map((c) => `${c}:${config.publicKey}`),
      methods: config.methods ?? [...ALL_STELLAR_METHODS],
      events: [...STELLAR_EVENTS],
    },
  },
  peer: {
    metadata: {
      name: config.peerName ?? "Fake Stellar Wallet",
      description: "Programmable test wallet",
      url: "https://test.invalid",
      icons: [],
    },
  },
});

export function createFakeSignClient(): FakeSignClient {
  const sessions = new Map<string, SessionStructLike>();
  const listeners = new Map<SignClientEvent, Set<SignClientListener>>();

  let pendingApproval: ((session: SessionStructLike) => void) | null = null;
  let pendingRejection: ((err: Error) => void) | null = null;
  let pendingTopic: string | null = null;

  let nextResponse: unknown = "signed:default";
  let nextResponseError: unknown = null;

  const capturedConnect: ConnectArgs[] = [];
  const capturedRequests: RequestArgs[] = [];
  const capturedDisconnects: FakeSignClient["capturedDisconnects"] = [];

  return {
    capturedConnect,
    capturedRequests,
    capturedDisconnects,

    session: {
      getAll: () => Array.from(sessions.values()),
      get: (topic: string) => {
        const s = sessions.get(topic);
        if (!s) throw new Error(`No session for topic ${topic}`);
        return s;
      },
    },

    async connect(args) {
      capturedConnect.push(args);
      const topic = `topic-${Math.random().toString(36).slice(2, 10)}`;
      pendingTopic = topic;
      const uri = `wc:${topic}@2?relay-protocol=irn&symKey=fake`;
      const approvalPromise = new Promise<SessionStructLike>((resolve, reject) => {
        pendingApproval = (session: SessionStructLike) => {
          sessions.set(session.topic, session);
          resolve(session);
        };
        pendingRejection = reject;
      });
      return { uri, approval: () => approvalPromise };
    },

    async request(args) {
      capturedRequests.push(args);
      if (nextResponseError) {
        const err = nextResponseError;
        nextResponseError = null;
        throw err;
      }
      return nextResponse;
    },

    async disconnect({ topic, reason }) {
      capturedDisconnects.push({ topic, reason });
      sessions.delete(topic);
      listeners.get("session_delete")?.forEach((l) => l({ topic }));
    },

    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },

    approve(config) {
      if (!pendingApproval || !pendingTopic) {
        throw new Error("approve() called without a pending connect()");
      }
      const session = buildSession(pendingTopic, config);
      pendingApproval(session);
      pendingApproval = null;
      pendingRejection = null;
      pendingTopic = null;
      return session;
    },
    reject(error = new Error("user rejected")) {
      if (!pendingRejection) {
        throw new Error("reject() called without a pending connect()");
      }
      pendingRejection(error);
      pendingApproval = null;
      pendingRejection = null;
      pendingTopic = null;
    },
    programResponse(response) {
      nextResponse = response;
    },
    programRequestError(error) {
      nextResponseError = error;
    },
    emitEvent(event, payload) {
      listeners.get(event)?.forEach((listener) => listener(payload));
    },
  };
}
