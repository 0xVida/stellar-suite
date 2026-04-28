/**
 * src/lib/wallet/__tests__/BaseAdapter.test.ts
 * Unit tests for the wallet adapter framework — Issue #644
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BaseWalletAdapter,
  WalletAdapterRegistry,
  WalletAdapterError,
  type WalletAdapterInfo,
  type ConnectResult,
} from "../BaseAdapter";

// ─────────────────────────────────────────────────────────────────────────────
// Test double — minimal concrete adapter
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_INFO: WalletAdapterInfo = {
  id: "freighter",
  name: "Mock Wallet",
  description: "Test double",
  url: "https://example.com",
  capabilities: {
    canSignTransaction: true,
    canSignAuthEntry: false,
    canCheckConnection: true,
    isExtension: true,
  },
};

class MockAdapter extends BaseWalletAdapter {
  readonly info = MOCK_INFO;
  private _available = true;
  private _publicKey = "GABC1234";

  setAvailable(v: boolean) { this._available = v; }
  setPublicKey(k: string) { this._publicKey = k; }

  async isAvailable() { return this._available; }
  async connect(): Promise<ConnectResult> {
    if (!this._available) {
      throw new WalletAdapterError("freighter", "NOT_AVAILABLE", "Not installed.");
    }
    return { publicKey: this._publicKey };
  }
  async checkConnection() { return this._available ? this._publicKey : null; }
  async signTransaction(xdr: string) { return `signed:${xdr}`; }
}

// ─────────────────────────────────────────────────────────────────────────────
// WalletAdapterError
// ─────────────────────────────────────────────────────────────────────────────

describe("WalletAdapterError", () => {
  it("has the correct name and code", () => {
    const err = new WalletAdapterError("freighter", "CONNECTION_FAILED", "test message");
    expect(err.name).toBe("WalletAdapterError");
    expect(err.code).toBe("CONNECTION_FAILED");
    expect(err.adapter).toBe("freighter");
    expect(err.message).toBe("test message");
  });

  it("instanceof Error is true", () => {
    expect(new WalletAdapterError("albedo", "UNKNOWN", "x") instanceof Error).toBe(true);
  });

  it("stores optional cause", () => {
    const cause = new Error("root cause");
    const err = new WalletAdapterError("hana", "SIGN_FAILED", "wrapped", cause);
    expect(err.cause).toBe(cause);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BaseWalletAdapter defaults
// ─────────────────────────────────────────────────────────────────────────────

describe("BaseWalletAdapter defaults", () => {
  let adapter: MockAdapter;
  beforeEach(() => { adapter = new MockAdapter(); });

  it("connect returns a ConnectResult with publicKey", async () => {
    const result = await adapter.connect();
    expect(result.publicKey).toBe("GABC1234");
  });

  it("checkConnection returns publicKey when available", async () => {
    const key = await adapter.checkConnection();
    expect(key).toBe("GABC1234");
  });

  it("checkConnection returns null when unavailable", async () => {
    adapter.setAvailable(false);
    const key = await adapter.checkConnection();
    expect(key).toBeNull();
  });

  it("signTransaction is overridden in MockAdapter", async () => {
    const result = await adapter.signTransaction("xdr123");
    expect(result).toBe("signed:xdr123");
  });

  it("signAuthEntry throws UNSUPPORTED by default", async () => {
    await expect(adapter.signAuthEntry("entry")).rejects.toMatchObject({
      code: "UNSUPPORTED",
      name: "WalletAdapterError",
    });
  });

  it("disconnect resolves without error (no-op)", async () => {
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normaliseError helper
// ─────────────────────────────────────────────────────────────────────────────

describe("BaseWalletAdapter.normaliseError", () => {
  class ExposedAdapter extends MockAdapter {
    public expose_normaliseError(code: Parameters<typeof this.normaliseError>[0], err: unknown, msg: string) {
      return this.normaliseError(code, err, msg);
    }
    public expose_isUserRejection(err: unknown) {
      return this.isUserRejection(err);
    }
  }

  let adapter: ExposedAdapter;
  beforeEach(() => { adapter = new ExposedAdapter(); });

  it("wraps an Error cause with its message", () => {
    const cause = new Error("original");
    const result = adapter.expose_normaliseError("CONNECTION_FAILED", cause, "fallback");
    expect(result.message).toBe("original");
    expect(result.code).toBe("CONNECTION_FAILED");
  });

  it("uses fallbackMessage when cause is not an Error", () => {
    const result = adapter.expose_normaliseError("UNKNOWN", "raw string", "fallback msg");
    expect(result.message).toBe("raw string");
  });

  it("uses fallbackMessage for null cause", () => {
    const result = adapter.expose_normaliseError("UNKNOWN", null, "fallback msg");
    expect(result.message).toBe("fallback msg");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isUserRejection helper
// ─────────────────────────────────────────────────────────────────────────────

describe("BaseWalletAdapter.isUserRejection", () => {
  class ExposedAdapter extends MockAdapter {
    public check(err: unknown) { return this.isUserRejection(err); }
  }
  const adapter = new ExposedAdapter();

  it("returns true for 'user rejected' message", () => {
    expect(adapter.check(new Error("User rejected the request"))).toBe(true);
  });
  it("returns true for 'user cancelled'", () => {
    expect(adapter.check(new Error("user cancelled"))).toBe(true);
  });
  it("returns true for 'closed'", () => {
    expect(adapter.check(new Error("popup closed"))).toBe(true);
  });
  it("returns false for generic errors", () => {
    expect(adapter.check(new Error("network timeout"))).toBe(false);
  });
  it("returns false for non-Error values", () => {
    expect(adapter.check("string error")).toBe(false);
    expect(adapter.check(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WalletAdapterRegistry
// ─────────────────────────────────────────────────────────────────────────────

describe("WalletAdapterRegistry", () => {
  beforeEach(() => {
    WalletAdapterRegistry.clearCache();
  });

  it("register + get returns the adapter", () => {
    WalletAdapterRegistry.register("freighter", () => new MockAdapter());
    const adapter = WalletAdapterRegistry.get("freighter");
    expect(adapter).toBeInstanceOf(MockAdapter);
  });

  it("returns the same cached instance on repeated get", () => {
    WalletAdapterRegistry.register("freighter", () => new MockAdapter());
    const a = WalletAdapterRegistry.get("freighter");
    const b = WalletAdapterRegistry.get("freighter");
    expect(a).toBe(b);
  });

  it("throws NOT_AVAILABLE for unknown type", () => {
    expect(() => WalletAdapterRegistry.get("unknown_wallet" as never)).toThrow(
      WalletAdapterError
    );
    try {
      WalletAdapterRegistry.get("unknown_wallet" as never);
    } catch (e) {
      expect((e as WalletAdapterError).code).toBe("NOT_AVAILABLE");
    }
  });

  it("clearCache forces new instance creation", () => {
    WalletAdapterRegistry.register("freighter", () => new MockAdapter());
    const a = WalletAdapterRegistry.get("freighter");
    WalletAdapterRegistry.clearCache();
    const b = WalletAdapterRegistry.get("freighter");
    expect(a).not.toBe(b);
  });

  it("registered() lists all registered keys", () => {
    WalletAdapterRegistry.register("albedo", () => new MockAdapter());
    WalletAdapterRegistry.register("hana", () => new MockAdapter());
    const keys = WalletAdapterRegistry.registered();
    expect(keys).toContain("albedo");
    expect(keys).toContain("hana");
  });

  it("register invalidates existing cache for that type", () => {
    WalletAdapterRegistry.register("freighter", () => new MockAdapter());
    const a = WalletAdapterRegistry.get("freighter");
    // Re-register with a different factory
    WalletAdapterRegistry.register("freighter", () => {
      const m = new MockAdapter();
      m.setPublicKey("GNEW");
      return m;
    });
    const b = WalletAdapterRegistry.get("freighter");
    expect(a).not.toBe(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WalletAdapter interface contract (via MockAdapter)
// ─────────────────────────────────────────────────────────────────────────────

describe("WalletAdapter interface contract", () => {
  it("info.capabilities.canSignTransaction matches actual behaviour", async () => {
    const adapter = new MockAdapter();
    if (adapter.info.capabilities.canSignTransaction) {
      await expect(adapter.signTransaction("xdr")).resolves.toBeTruthy();
    }
  });

  it("info.capabilities.canSignAuthEntry=false leads to UNSUPPORTED error", async () => {
    const adapter = new MockAdapter();
    expect(adapter.info.capabilities.canSignAuthEntry).toBe(false);
    await expect(adapter.signAuthEntry("entry")).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });

  it("canCheckConnection=true means checkConnection does not throw", async () => {
    const adapter = new MockAdapter();
    expect(adapter.info.capabilities.canCheckConnection).toBe(true);
    await expect(adapter.checkConnection()).resolves.not.toThrow();
  });

  it("isAvailable reflects extension presence flag", async () => {
    const adapter = new MockAdapter();
    adapter.setAvailable(false);
    expect(await adapter.isAvailable()).toBe(false);
    adapter.setAvailable(true);
    expect(await adapter.isAvailable()).toBe(true);
  });
});
