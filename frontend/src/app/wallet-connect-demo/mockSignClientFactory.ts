/**
 * In-page mock SignClient used by the demo page so the example is
 * clickable without a real WalletConnect bridge or projectId. The mock
 * mimics enough of the protocol surface — pairing URI, approval promise,
 * `request()` round-trip, and `disconnect()` — to exercise every code
 * path in StellarWalletConnect. Production callers should swap this for
 * a factory that constructs `@walletconnect/sign-client`.
 */

import {
  ALL_STELLAR_METHODS,
  STELLAR_EVENTS,
  STELLAR_METHODS,
  STELLAR_NAMESPACE,
  type SessionStructLike,
  type SignClientLike,
  type StellarChain,
} from "@/lib/wallet";

const DEMO_PUBLIC_KEY =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB7";

const APPROVAL_DELAY_MS = 600;
const REQUEST_DELAY_MS = 300;

export function mockSignClientFactory(chain: StellarChain): SignClientLike {
  const sessions = new Map<string, SessionStructLike>();
  const listeners = new Map<string, Set<(args: unknown) => void>>();

  const emit = (event: string, payload: unknown) => {
    listeners.get(event)?.forEach((listener) => {
      try {
        listener(payload);
      } catch {
        // mocked listener errors are non-fatal
      }
    });
  };

  return {
    session: {
      getAll: () => Array.from(sessions.values()),
      get: (topic: string) => {
        const s = sessions.get(topic);
        if (!s) {
          throw new Error(`No session for topic ${topic}`);
        }
        return s;
      },
    },

    async connect() {
      const topic = `mock-topic-${Math.random().toString(36).slice(2, 10)}`;
      const uri = `wc:${topic}@2?relay-protocol=irn&symKey=mock`;
      const approval = () =>
        new Promise<SessionStructLike>((resolve) => {
          setTimeout(() => {
            const session: SessionStructLike = {
              topic,
              expiry: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
              namespaces: {
                [STELLAR_NAMESPACE]: {
                  accounts: [`${chain}:${DEMO_PUBLIC_KEY}`],
                  methods: [...ALL_STELLAR_METHODS],
                  events: [...STELLAR_EVENTS],
                },
              },
              peer: {
                metadata: {
                  name: "Mock Stellar Wallet",
                  description: "Stub wallet used by the demo page.",
                  url: "https://example.com",
                  icons: [],
                },
              },
            };
            sessions.set(topic, session);
            resolve(session);
          }, APPROVAL_DELAY_MS);
        });
      return { uri, approval };
    },

    async request({ request }) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      if (
        request.method === STELLAR_METHODS.signXDR ||
        request.method === STELLAR_METHODS.signAndSubmitXDR
      ) {
        const params = request.params as { xdr?: string };
        const signed = `signed:${params.xdr ?? ""}`;
        return request.method === STELLAR_METHODS.signAndSubmitXDR
          ? ({ signedXDR: signed, txHash: "mock-hash" } as unknown)
          : (signed as unknown);
      }
      throw new Error(`Unsupported method: ${request.method}`);
    },

    async disconnect({ topic }) {
      sessions.delete(topic);
      emit("session_delete", { topic });
    },

    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
  };
}
