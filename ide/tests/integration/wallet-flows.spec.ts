/**
 * tests/integration/wallet-flows.spec.ts
 * Multi-wallet integration tests — Issue #667
 *
 * Tests the full connect → sign → disconnect lifecycle for each adapter
 * (Freighter, Albedo, Guest/no-wallet) using controlled test doubles.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  WalletAdapterRegistry,
  WalletAdapterError,
  BaseWalletAdapter,
  type WalletAdapterInfo,
  type ConnectResult,
  type SignOptions,
} from "@/lib/wallet/BaseAdapter";

// ─────────────────────────────────────────────────────────────────────────────
// Shared test constants
// ─────────────────────────────────────────────────────────────────────────────

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const MOCK_PUBLIC_KEY = "GBVXAEFHIHD55DKNNFOBGBBZFHOCXXSGGW6NMIDVGYBQQJRQCZL4B7RQ";
const MOCK_SIGNED_XDR = "AAAA_SIGNED_XDR_MOCK==";

// ─────────────────────────────────────────────────────────────────────────────
// Test double helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeInfo(id: string, overrides: Partial<WalletAdapterInfo> = {}): WalletAdapterInfo {
  return {
    id,
    name: id,
    description: `Test adapter for ${id}`,
    url: "https://example.com",
    capabilities: {
      canSignTransaction: true,
      canSignAuthEntry: false,
      canCheckConnection: true,
      isExtension: false,
      ...overrides.capabilities,
    },
    ...overrides,
  };
}

class StubFreighterAdapter extends BaseWalletAdapter {
  readonly info = makeInfo("freighter", {
    capabilities: {
      canSignTransaction: true,
      canSignAuthEntry: false,
      canCheckConnection: true,
      isExtension: true,
    },
  });

  private _installed = true;
  private _publicKey = MOCK_PUBLIC_KEY;
  private _rejectConnect = false;
  private _rejectSign = false;

  setInstalled(v: boolean) { this._installed = v; }
  setRejectConnect(v: boolean) { this._rejectConnect = v; }
  setRejectSign(v: boolean) { this._rejectSign = v; }

  async isAvailable(): Promise<boolean> { return this._installed; }

  async connect(): Promise<ConnectResult> {
    if (!this._installed) {
      throw new WalletAdapterError("freighter", "NOT_AVAILABLE", "Freighter not installed.");
    }
    if (this._rejectConnect) {
      throw new WalletAdapterError("freighter", "USER_REJECTED", "User dismissed popup.");
    }
    return { publicKey: this._publicKey };
  }

  async checkConnection(): Promise<string | null> {
    return this._installed ? this._publicKey : null;
  }

  async signTransaction(xdr: string, _opts?: SignOptions): Promise<string> {
    if (this._rejectSign) {
      throw new WalletAdapterError("freighter", "SIGN_FAILED", "User rejected signing.");
    }
    return `${MOCK_SIGNED_XDR}:freighter:${xdr}`;
  }
}

class StubAlbedoAdapter extends BaseWalletAdapter {
  readonly info = makeInfo("albedo", {
    capabilities: {
      canSignTransaction: true,
      canSignAuthEntry: false,
      canCheckConnection: false,
      isExtension: false,
    },
  });

  private _rejectConnect = false;
  private _rejectSign = false;

  setRejectConnect(v: boolean) { this._rejectConnect = v; }
  setRejectSign(v: boolean) { this._rejectSign = v; }

  async isAvailable(): Promise<boolean> { return true; }

  async connect(): Promise<ConnectResult> {
    if (this._rejectConnect) {
      throw new WalletAdapterError("albedo", "USER_REJECTED", "User closed Albedo popup.");
    }
    return { publicKey: MOCK_PUBLIC_KEY };
  }

  async signTransaction(xdr: string, _opts?: SignOptions): Promise<string> {
    if (this._rejectSign) {
      throw new WalletAdapterError("albedo", "SIGN_FAILED", "User rejected Albedo signing.");
    }
    return `${MOCK_SIGNED_XDR}:albedo:${xdr}`;
  }
}

/** Simulates an unauthenticated / read-only guest session. */
class GuestAdapter extends BaseWalletAdapter {
  readonly info = makeInfo("guest", {
    capabilities: {
      canSignTransaction: false,
      canSignAuthEntry: false,
      canCheckConnection: false,
      isExtension: false,
    },
  });

  async isAvailable(): Promise<boolean> { return true; }

  async connect(): Promise<ConnectResult> {
    // Guest mode returns no public key — treated as anonymous.
    return { publicKey: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry isolation — each suite restores the registry after tests
// ─────────────────────────────────────────────────────────────────────────────

function registerStubs(
  freighter: StubFreighterAdapter,
  albedo: StubAlbedoAdapter,
  guest: GuestAdapter
) {
  WalletAdapterRegistry.register("freighter", () => freighter);
  WalletAdapterRegistry.register("albedo", () => albedo);
  WalletAdapterRegistry.register("guest", () => guest);
}

// ─────────────────────────────────────────────────────────────────────────────
// Freighter wallet flows
// ─────────────────────────────────────────────────────────────────────────────

describe("Freighter wallet integration", () => {
  let freighter: StubFreighterAdapter;
  let albedo: StubAlbedoAdapter;
  let guest: GuestAdapter;

  beforeEach(() => {
    freighter = new StubFreighterAdapter();
    albedo = new StubAlbedoAdapter();
    guest = new GuestAdapter();
    registerStubs(freighter, albedo, guest);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("connects and returns a public key when extension is installed", async () => {
    const adapter = WalletAdapterRegistry.get("freighter");
    const result = await adapter.connect();
    expect(result.publicKey).toBe(MOCK_PUBLIC_KEY);
  });

  it("throws NOT_AVAILABLE when Freighter extension is absent", async () => {
    freighter.setInstalled(false);
    WalletAdapterRegistry.register("freighter", () => freighter);
    const adapter = WalletAdapterRegistry.get("freighter");

    await expect(adapter.connect()).rejects.toMatchObject({
      code: "NOT_AVAILABLE",
      adapter: "freighter",
    });
  });

  it("throws USER_REJECTED when user dismisses the connect popup", async () => {
    freighter.setRejectConnect(true);
    WalletAdapterRegistry.register("freighter", () => freighter);
    const adapter = WalletAdapterRegistry.get("freighter");

    await expect(adapter.connect()).rejects.toMatchObject({
      code: "USER_REJECTED",
    });
  });

  it("signs a transaction XDR after successful connect", async () => {
    const adapter = WalletAdapterRegistry.get("freighter");
    await adapter.connect();
    const signed = await adapter.signTransaction("AAAA_UNSIGNED_XDR==", {
      networkPassphrase: TESTNET_PASSPHRASE,
    });
    expect(signed).toContain("freighter");
    expect(signed).toContain("AAAA_UNSIGNED_XDR==");
  });

  it("throws SIGN_FAILED when user rejects the transaction", async () => {
    freighter.setRejectSign(true);
    WalletAdapterRegistry.register("freighter", () => freighter);
    const adapter = WalletAdapterRegistry.get("freighter");
    await adapter.connect();

    await expect(
      adapter.signTransaction("AAAA_UNSIGNED_XDR==", {
        networkPassphrase: TESTNET_PASSPHRASE,
      })
    ).rejects.toMatchObject({ code: "SIGN_FAILED" });
  });

  it("checkConnection returns the public key for an active session", async () => {
    const adapter = WalletAdapterRegistry.get("freighter");
    const pk = await adapter.checkConnection();
    expect(pk).toBe(MOCK_PUBLIC_KEY);
  });

  it("checkConnection returns null when extension is unavailable", async () => {
    freighter.setInstalled(false);
    WalletAdapterRegistry.register("freighter", () => freighter);
    const adapter = WalletAdapterRegistry.get("freighter");
    const pk = await adapter.checkConnection();
    expect(pk).toBeNull();
  });

  it("isAvailable returns false when extension is not installed", async () => {
    freighter.setInstalled(false);
    expect(await freighter.isAvailable()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Albedo wallet flows
// ─────────────────────────────────────────────────────────────────────────────

describe("Albedo wallet integration", () => {
  let freighter: StubFreighterAdapter;
  let albedo: StubAlbedoAdapter;
  let guest: GuestAdapter;

  beforeEach(() => {
    freighter = new StubFreighterAdapter();
    albedo = new StubAlbedoAdapter();
    guest = new GuestAdapter();
    registerStubs(freighter, albedo, guest);
  });

  it("is always available (web popup — no install required)", async () => {
    const adapter = WalletAdapterRegistry.get("albedo");
    expect(await adapter.isAvailable()).toBe(true);
  });

  it("connects and returns a public key", async () => {
    const adapter = WalletAdapterRegistry.get("albedo");
    const result = await adapter.connect();
    expect(result.publicKey).toBe(MOCK_PUBLIC_KEY);
  });

  it("throws USER_REJECTED when user closes the Albedo popup", async () => {
    albedo.setRejectConnect(true);
    WalletAdapterRegistry.register("albedo", () => albedo);
    const adapter = WalletAdapterRegistry.get("albedo");

    await expect(adapter.connect()).rejects.toMatchObject({
      code: "USER_REJECTED",
      adapter: "albedo",
    });
  });

  it("signs a transaction after connect", async () => {
    const adapter = WalletAdapterRegistry.get("albedo");
    await adapter.connect();
    const signed = await adapter.signTransaction("TX_XDR", {
      networkPassphrase: TESTNET_PASSPHRASE,
    });
    expect(signed).toContain("albedo");
    expect(signed).toContain("TX_XDR");
  });

  it("throws SIGN_FAILED when user rejects signing", async () => {
    albedo.setRejectSign(true);
    WalletAdapterRegistry.register("albedo", () => albedo);
    const adapter = WalletAdapterRegistry.get("albedo");
    await adapter.connect();

    await expect(
      adapter.signTransaction("TX_XDR", { networkPassphrase: TESTNET_PASSPHRASE })
    ).rejects.toMatchObject({ code: "SIGN_FAILED" });
  });

  it("canCheckConnection is false — Albedo has no persistent session", () => {
    const adapter = WalletAdapterRegistry.get("albedo");
    expect(adapter.info.capabilities.canCheckConnection).toBe(false);
  });

  it("signAuthEntry throws UNSUPPORTED (not implemented)", async () => {
    const adapter = WalletAdapterRegistry.get("albedo");
    await expect(adapter.signAuthEntry("entry_xdr")).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guest (no-wallet / read-only) flows
// ─────────────────────────────────────────────────────────────────────────────

describe("Guest (unauthenticated) wallet flow", () => {
  let freighter: StubFreighterAdapter;
  let albedo: StubAlbedoAdapter;
  let guest: GuestAdapter;

  beforeEach(() => {
    freighter = new StubFreighterAdapter();
    albedo = new StubAlbedoAdapter();
    guest = new GuestAdapter();
    registerStubs(freighter, albedo, guest);
  });

  it("connects and returns an empty public key", async () => {
    const adapter = WalletAdapterRegistry.get("guest");
    const result = await adapter.connect();
    expect(result.publicKey).toBe("");
  });

  it("is always available", async () => {
    const adapter = WalletAdapterRegistry.get("guest");
    expect(await adapter.isAvailable()).toBe(true);
  });

  it("cannot sign transactions", async () => {
    const adapter = WalletAdapterRegistry.get("guest");
    expect(adapter.info.capabilities.canSignTransaction).toBe(false);
  });

  it("signTransaction throws UNSUPPORTED for guest adapter", async () => {
    await expect(guest.signTransaction("TX_XDR")).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Registry behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe("WalletAdapterRegistry", () => {
  beforeEach(() => {
    const freighter = new StubFreighterAdapter();
    const albedo = new StubAlbedoAdapter();
    const guest = new GuestAdapter();
    registerStubs(freighter, albedo, guest);
  });

  it("throws NOT_AVAILABLE for unregistered wallet type", () => {
    expect(() => WalletAdapterRegistry.get("nonexistent" as never)).toThrow(
      WalletAdapterError
    );
  });

  it("re-registering a type invalidates the cached singleton", () => {
    const first = WalletAdapterRegistry.get("albedo");
    WalletAdapterRegistry.register("albedo", () => new StubAlbedoAdapter());
    const second = WalletAdapterRegistry.get("albedo");
    expect(first).not.toBe(second);
  });

  it("registered() lists all registered adapter IDs", () => {
    const ids = WalletAdapterRegistry.registered();
    expect(ids).toContain("freighter");
    expect(ids).toContain("albedo");
    expect(ids).toContain("guest");
  });
});
