import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STELLAR_CHAINS,
  STELLAR_METHODS,
  StellarWalletConnect,
  WalletConnectError,
  memorySessionStorage,
  type SignClientFactory,
} from "@/lib/wallet";
import {
  createFakeSignClient,
  type FakeSignClient,
} from "./fakeSignClient";

const PUBLIC_KEY = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const ACCOUNT = `${STELLAR_CHAINS.testnet}:${PUBLIC_KEY}`;
const VALID_XDR = "AAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const buildConnector = (fake: FakeSignClient) => {
  const factory: SignClientFactory = vi.fn().mockResolvedValue(fake);
  const connector = new StellarWalletConnect({
    projectId: "test-project",
    metadata: {
      name: "Test app",
      description: "Test",
      url: "https://test.invalid",
      icons: [],
    },
    storage: memorySessionStorage(),
  });
  return { connector, factory };
};

describe("StellarWalletConnect — construction", () => {
  it("requires a projectId", () => {
    expect(
      () =>
        new StellarWalletConnect({
          projectId: "",
          metadata: {
            name: "n",
            description: "d",
            url: "u",
            icons: [],
          },
        }),
    ).toThrow(WalletConnectError);
  });

  it("rejects non-Stellar chains in requiredChains", () => {
    expect(
      () =>
        new StellarWalletConnect({
          projectId: "ok",
          metadata: { name: "n", description: "d", url: "u", icons: [] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          requiredChains: ["ethereum:1" as any],
        }),
    ).toThrow(WalletConnectError);
  });
});

describe("StellarWalletConnect — init", () => {
  it("attaches the SignClient and exposes isInitialized", async () => {
    const fake = createFakeSignClient();
    const { connector, factory } = buildConnector(fake);
    expect(connector.isInitialized).toBe(false);
    await connector.init({ signClientFactory: factory });
    expect(connector.isInitialized).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("wraps factory failures in a WalletConnectError", async () => {
    const factory: SignClientFactory = vi
      .fn()
      .mockRejectedValue(new Error("boom"));
    const connector = new StellarWalletConnect({
      projectId: "p",
      metadata: { name: "n", description: "d", url: "u", icons: [] },
      storage: memorySessionStorage(),
    });
    await expect(connector.init({ signClientFactory: factory })).rejects.toMatchObject(
      { code: "TRANSPORT_ERROR" },
    );
  });

  it("is idempotent", async () => {
    const fake = createFakeSignClient();
    const { connector, factory } = buildConnector(fake);
    await connector.init({ signClientFactory: factory });
    await connector.init({ signClientFactory: factory });
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe("StellarWalletConnect — connect", () => {
  let fake: FakeSignClient;
  let connector: StellarWalletConnect;

  beforeEach(async () => {
    fake = createFakeSignClient();
    const out = buildConnector(fake);
    connector = out.connector;
    await connector.init({ signClientFactory: out.factory });
  });

  it("returns a pairing URI and resolves the session once the wallet approves", async () => {
    const { uri, session } = await connector.connect({
      chains: [STELLAR_CHAINS.testnet],
    });
    expect(uri).toMatch(/^wc:/);
    fake.approve({
      chains: [STELLAR_CHAINS.testnet],
      publicKey: PUBLIC_KEY,
    });
    const sess = await session;
    expect(sess.chains).toEqual([STELLAR_CHAINS.testnet]);
    expect(sess.accounts).toEqual([ACCOUNT]);
    expect(connector.getSession()).toEqual(sess);
  });

  it("emits a `session` event when the wallet approves", async () => {
    const listener = vi.fn();
    connector.on("session", listener);
    const { session } = await connector.connect({
      chains: [STELLAR_CHAINS.testnet],
    });
    fake.approve({ chains: [STELLAR_CHAINS.testnet], publicKey: PUBLIC_KEY });
    await session;
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("rejects with USER_REJECTED when the wallet refuses", async () => {
    const { session } = await connector.connect({
      chains: [STELLAR_CHAINS.testnet],
    });
    fake.reject(new Error("rejected"));
    await expect(session).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("requires Stellar chains", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connector.connect({ chains: ["ethereum:1" as any] }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CHAIN" });
  });

  it("requires init() first", async () => {
    const fresh = new StellarWalletConnect({
      projectId: "p",
      metadata: { name: "n", description: "d", url: "u", icons: [] },
      storage: memorySessionStorage(),
    });
    await expect(fresh.connect()).rejects.toMatchObject({
      code: "NOT_INITIALIZED",
    });
  });

  it("forwards the requested namespace to the SignClient", async () => {
    await connector.connect({ chains: [STELLAR_CHAINS.pubnet] });
    expect(fake.capturedConnect[0].requiredNamespaces.stellar.chains).toEqual([
      STELLAR_CHAINS.pubnet,
    ]);
  });
});

describe("StellarWalletConnect — signTransaction", () => {
  let fake: FakeSignClient;
  let connector: StellarWalletConnect;

  beforeEach(async () => {
    fake = createFakeSignClient();
    const out = buildConnector(fake);
    connector = out.connector;
    await connector.init({ signClientFactory: out.factory });
    const { session } = await connector.connect({
      chains: [STELLAR_CHAINS.testnet],
    });
    fake.approve({
      chains: [STELLAR_CHAINS.testnet],
      publicKey: PUBLIC_KEY,
    });
    await session;
  });

  it("signs and unwraps a string response", async () => {
    fake.programResponse("signed:abc");
    const out = await connector.signTransaction({
      xdr: VALID_XDR,
      chain: STELLAR_CHAINS.testnet,
    });
    expect(out.signedXdr).toBe("signed:abc");
  });

  it("signs and unwraps an object response with signedXDR", async () => {
    fake.programResponse({ signedXDR: "signed:obj", txHash: "h" });
    const out = await connector.signTransaction({
      xdr: VALID_XDR,
      chain: STELLAR_CHAINS.testnet,
      submit: true,
    });
    expect(out.signedXdr).toBe("signed:obj");
    expect(out.txHash).toBe("h");
    expect(fake.capturedRequests[0].request.method).toBe(
      STELLAR_METHODS.signAndSubmitXDR,
    );
  });

  it("rejects invalid XDR before sending", async () => {
    await expect(
      connector.signTransaction({
        xdr: "not-base64-!!!",
        chain: STELLAR_CHAINS.testnet,
      }),
    ).rejects.toMatchObject({ code: "INVALID_XDR" });
    expect(fake.capturedRequests).toHaveLength(0);
  });

  it("rejects a chain not present in the session", async () => {
    await expect(
      connector.signTransaction({
        xdr: VALID_XDR,
        chain: STELLAR_CHAINS.pubnet,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CHAIN" });
  });

  it("rejects an account not authorized for the session", async () => {
    await expect(
      connector.signTransaction({
        xdr: VALID_XDR,
        chain: STELLAR_CHAINS.testnet,
        account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB7",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_AUTHORIZED" });
  });

  it("maps a rejection-coded transport error to USER_REJECTED", async () => {
    const err = Object.assign(new Error("user reject"), { code: 5001 });
    fake.programRequestError(err);
    await expect(
      connector.signTransaction({
        xdr: VALID_XDR,
        chain: STELLAR_CHAINS.testnet,
      }),
    ).rejects.toMatchObject({ code: "USER_REJECTED" });
  });

  it("maps an expiry-worded transport error to SESSION_EXPIRED", async () => {
    fake.programRequestError(new Error("session expired"));
    await expect(
      connector.signTransaction({
        xdr: VALID_XDR,
        chain: STELLAR_CHAINS.testnet,
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("rejects an unrecognized response shape", async () => {
    fake.programResponse(42);
    await expect(
      connector.signTransaction({
        xdr: VALID_XDR,
        chain: STELLAR_CHAINS.testnet,
      }),
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
  });

  it("requires an active session", async () => {
    await connector.disconnect();
    await expect(
      connector.signTransaction({
        xdr: VALID_XDR,
        chain: STELLAR_CHAINS.testnet,
      }),
    ).rejects.toMatchObject({ code: "NO_ACTIVE_SESSION" });
  });

  it("rejects with SESSION_EXPIRED when the session is past its expiry", async () => {
    const fakeNow = vi.spyOn(Date, "now");
    fakeNow.mockReturnValue(Date.now() + 60 * 60 * 24 * 1000 * 365);
    try {
      await expect(
        connector.signTransaction({
          xdr: VALID_XDR,
          chain: STELLAR_CHAINS.testnet,
        }),
      ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    } finally {
      fakeNow.mockRestore();
    }
  });
});

describe("StellarWalletConnect — disconnect & events", () => {
  let fake: FakeSignClient;
  let connector: StellarWalletConnect;

  beforeEach(async () => {
    fake = createFakeSignClient();
    const out = buildConnector(fake);
    connector = out.connector;
    await connector.init({ signClientFactory: out.factory });
    const { session } = await connector.connect({
      chains: [STELLAR_CHAINS.testnet],
    });
    fake.approve({ chains: [STELLAR_CHAINS.testnet], publicKey: PUBLIC_KEY });
    await session;
  });

  it("disconnects through the underlying client and clears state", async () => {
    const topic = connector.getSession()?.topic;
    await connector.disconnect();
    expect(connector.getSession()).toBeNull();
    expect(fake.capturedDisconnects[0].topic).toBe(topic);
  });

  it("handles a remote `session_delete` event", () => {
    const topic = connector.getSession()!.topic;
    const listener = vi.fn();
    connector.on("disconnect", listener);
    fake.emitEvent("session_delete", { topic });
    expect(connector.getSession()).toBeNull();
    expect(listener).toHaveBeenCalledWith({ topic });
  });

  it("ignores `session_delete` for unknown topics", () => {
    const listener = vi.fn();
    connector.on("disconnect", listener);
    fake.emitEvent("session_delete", { topic: "other-topic" });
    expect(connector.getSession()).not.toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates listener exceptions", () => {
    connector.on("disconnect", () => {
      throw new Error("listener boom");
    });
    const observed = vi.fn();
    connector.on("disconnect", observed);
    fake.emitEvent("session_delete", { topic: connector.getSession()!.topic });
    expect(observed).toHaveBeenCalledTimes(1);
  });

  it("supports unsubscribing", () => {
    const listener = vi.fn();
    const off = connector.on("disconnect", listener);
    off();
    fake.emitEvent("session_delete", { topic: connector.getSession()!.topic });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("StellarWalletConnect — session restoration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rehydrates a session from storage on init()", async () => {
    const fake = createFakeSignClient();
    const storage = memorySessionStorage();

    // First connector establishes a session.
    {
      const factory: SignClientFactory = vi.fn().mockResolvedValue(fake);
      const wc = new StellarWalletConnect({
        projectId: "p",
        metadata: { name: "n", description: "d", url: "u", icons: [] },
        storage,
      });
      await wc.init({ signClientFactory: factory });
      const { session } = await wc.connect({ chains: [STELLAR_CHAINS.testnet] });
      fake.approve({ chains: [STELLAR_CHAINS.testnet], publicKey: PUBLIC_KEY });
      await session;
    }

    // Second connector reuses the same SignClient and should restore.
    const factory: SignClientFactory = vi.fn().mockResolvedValue(fake);
    const wc2 = new StellarWalletConnect({
      projectId: "p",
      metadata: { name: "n", description: "d", url: "u", icons: [] },
      storage,
    });
    await wc2.init({ signClientFactory: factory });
    expect(wc2.getSession()).not.toBeNull();
    expect(wc2.getSession()?.accounts).toEqual([ACCOUNT]);
  });

  it("clears the stored topic when the underlying session is gone", async () => {
    const fake = createFakeSignClient();
    const storage = memorySessionStorage();
    storage.write({ topic: "nonexistent-topic", savedAt: Date.now() });

    const factory: SignClientFactory = vi.fn().mockResolvedValue(fake);
    const wc = new StellarWalletConnect({
      projectId: "p",
      metadata: { name: "n", description: "d", url: "u", icons: [] },
      storage,
    });
    await wc.init({ signClientFactory: factory });
    expect(wc.getSession()).toBeNull();
    expect(storage.read()).toBeNull();
  });
});
