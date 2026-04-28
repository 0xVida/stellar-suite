/**
 * src/store/__tests__/useNetworkStore.test.ts
 * ──────────────────────────────────────────────────────────────
 * Unit tests for useNetworkStore (#647)
 * ──────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useNetworkStore } from "../useNetworkStore";
import { NETWORK_CONFIG } from "@/lib/networkConfig";

// Reset store state before every test
beforeEach(() => {
  useNetworkStore.getState().reset();
});

// ─────────────────────────────────────────────────────────────
// Initial defaults
// ─────────────────────────────────────────────────────────────

describe("initial state", () => {
  it("defaults to testnet preset", () => {
    const s = useNetworkStore.getState();
    expect(s.activeNetwork).toBe("testnet");
    expect(s.activeProfileId).toBeNull();
  });

  it("resolves testnet RPC URL by default", () => {
    const s = useNetworkStore.getState();
    expect(s.resolvedRpcUrl()).toBe(NETWORK_CONFIG.testnet.horizon);
  });

  it("resolves testnet passphrase by default", () => {
    const s = useNetworkStore.getState();
    expect(s.resolvedPassphrase()).toBe(NETWORK_CONFIG.testnet.passphrase);
  });

  it("resolves testnet horizon URL by default", () => {
    const s = useNetworkStore.getState();
    expect(s.resolvedHorizonUrl()).toBe(NETWORK_CONFIG.testnet.horizonUrl);
  });

  it("starts with empty profiles list", () => {
    expect(useNetworkStore.getState().profiles).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Preset selection
// ─────────────────────────────────────────────────────────────

describe("selectPreset", () => {
  it("switches to mainnet and resolves correct URLs", () => {
    useNetworkStore.getState().selectPreset("mainnet");
    const s = useNetworkStore.getState();
    expect(s.activeNetwork).toBe("mainnet");
    expect(s.resolvedPassphrase()).toBe(NETWORK_CONFIG.mainnet.passphrase);
    expect(s.resolvedHorizonUrl()).toBe(NETWORK_CONFIG.mainnet.horizonUrl);
  });

  it("switches to futurenet", () => {
    useNetworkStore.getState().selectPreset("futurenet");
    expect(useNetworkStore.getState().activeNetwork).toBe("futurenet");
  });

  it("switches to local", () => {
    useNetworkStore.getState().selectPreset("local");
    expect(useNetworkStore.getState().resolvedRpcUrl()).toContain("localhost");
  });

  it("clears activeProfileId when switching to a preset", () => {
    // Add and select a profile first
    const { id } = useNetworkStore.getState().addProfile({
      label: "My Net",
      rpcUrl: "https://custom.example.com",
      passphrase: "Custom Net Passphrase ; 2024",
    });
    useNetworkStore.getState().selectProfile(id!);
    expect(useNetworkStore.getState().activeProfileId).toBe(id);

    // Switch to a preset — profileId must clear
    useNetworkStore.getState().selectPreset("testnet");
    expect(useNetworkStore.getState().activeProfileId).toBeNull();
  });

  it("sets lastChangedAt", () => {
    useNetworkStore.getState().selectPreset("mainnet");
    expect(useNetworkStore.getState().lastChangedAt).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// Custom RPC URL
// ─────────────────────────────────────────────────────────────

describe("setCustomRpcUrl", () => {
  it("accepts a valid https URL", () => {
    const result = useNetworkStore.getState().setCustomRpcUrl("https://rpc.example.com");
    expect(result.valid).toBe(true);
    expect(useNetworkStore.getState().customRpcUrl).toBe("https://rpc.example.com");
  });

  it("accepts a valid http URL (e.g. localhost)", () => {
    const result = useNetworkStore.getState().setCustomRpcUrl("http://localhost:8000");
    expect(result.valid).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = useNetworkStore.getState().setCustomRpcUrl("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects a non-URL string", () => {
    const result = useNetworkStore.getState().setCustomRpcUrl("not-a-url");
    expect(result.valid).toBe(false);
  });

  it("rejects ftp:// protocol", () => {
    const result = useNetworkStore.getState().setCustomRpcUrl("ftp://example.com");
    expect(result.valid).toBe(false);
  });

  it("sets activeNetwork to 'custom' on success", () => {
    useNetworkStore.getState().setCustomRpcUrl("https://rpc.example.com");
    expect(useNetworkStore.getState().activeNetwork).toBe("custom");
  });

  it("sets validationError on failure", () => {
    useNetworkStore.getState().setCustomRpcUrl("bad-url");
    expect(useNetworkStore.getState().validationError).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// Custom passphrase
// ─────────────────────────────────────────────────────────────

describe("setCustomPassphrase", () => {
  it("accepts a valid passphrase", () => {
    const result = useNetworkStore.getState().setCustomPassphrase("My Stellar Net ; 2024");
    expect(result.valid).toBe(true);
    expect(useNetworkStore.getState().customPassphrase).toBe("My Stellar Net ; 2024");
  });

  it("rejects empty passphrase", () => {
    const result = useNetworkStore.getState().setCustomPassphrase("");
    expect(result.valid).toBe(false);
  });

  it("rejects passphrase shorter than 8 chars", () => {
    const result = useNetworkStore.getState().setCustomPassphrase("short");
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Custom headers
// ─────────────────────────────────────────────────────────────

describe("custom headers", () => {
  it("merges new headers into existing ones", () => {
    useNetworkStore.getState().setCustomHeaders({ "X-Api-Key": "abc" });
    useNetworkStore.getState().setCustomHeaders({ "X-Tenant": "xyz" });
    const headers = useNetworkStore.getState().customHeaders;
    expect(headers["X-Api-Key"]).toBe("abc");
    expect(headers["X-Tenant"]).toBe("xyz");
  });

  it("removes a single header by key", () => {
    useNetworkStore.getState().setCustomHeaders({ "X-Remove-Me": "yes" });
    useNetworkStore.getState().removeCustomHeader("X-Remove-Me");
    expect(useNetworkStore.getState().customHeaders["X-Remove-Me"]).toBeUndefined();
  });

  it("clears all headers", () => {
    useNetworkStore.getState().setCustomHeaders({ A: "1", B: "2" });
    useNetworkStore.getState().clearCustomHeaders();
    expect(Object.keys(useNetworkStore.getState().customHeaders)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Profile CRUD
// ─────────────────────────────────────────────────────────────

describe("addProfile", () => {
  it("adds a valid profile and returns its ID", () => {
    const { id, error } = useNetworkStore.getState().addProfile({
      label: "Staging",
      rpcUrl: "https://staging-rpc.example.com",
      passphrase: "Staging Network ; 2024",
    });
    expect(error).toBeUndefined();
    expect(id).toBeTruthy();
    expect(useNetworkStore.getState().profiles).toHaveLength(1);
  });

  it("rejects a profile with an invalid RPC URL", () => {
    const { id, error } = useNetworkStore.getState().addProfile({
      label: "Bad",
      rpcUrl: "not-a-url",
      passphrase: "Valid Passphrase ; 2024",
    });
    expect(id).toBeNull();
    expect(error).toBeTruthy();
  });

  it("rejects a profile with an empty passphrase", () => {
    const { id } = useNetworkStore.getState().addProfile({
      label: "Empty Pass",
      rpcUrl: "https://rpc.example.com",
      passphrase: "",
    });
    expect(id).toBeNull();
  });

  it("each profile gets a unique id", () => {
    const { id: id1 } = useNetworkStore.getState().addProfile({
      label: "Net 1",
      rpcUrl: "https://rpc1.example.com",
      passphrase: "Network One ; 2024",
    });
    const { id: id2 } = useNetworkStore.getState().addProfile({
      label: "Net 2",
      rpcUrl: "https://rpc2.example.com",
      passphrase: "Network Two ; 2024",
    });
    expect(id1).not.toBe(id2);
  });
});

describe("selectProfile", () => {
  it("activates a profile and populates overrides", () => {
    const { id } = useNetworkStore.getState().addProfile({
      label: "My Custom",
      rpcUrl: "https://my-rpc.example.com",
      passphrase: "My Custom Network ; 2024",
    });
    useNetworkStore.getState().selectProfile(id!);
    const s = useNetworkStore.getState();
    expect(s.activeNetwork).toBe("custom");
    expect(s.activeProfileId).toBe(id);
    expect(s.resolvedRpcUrl()).toBe("https://my-rpc.example.com");
    expect(s.resolvedPassphrase()).toBe("My Custom Network ; 2024");
  });

  it("sets validationError when profile ID is unknown", () => {
    useNetworkStore.getState().selectProfile("non-existent-id");
    expect(useNetworkStore.getState().validationError).toBeTruthy();
  });
});

describe("updateProfile", () => {
  it("updates profile fields", () => {
    const { id } = useNetworkStore.getState().addProfile({
      label: "Old Label",
      rpcUrl: "https://old.example.com",
      passphrase: "Old Passphrase ; 2024",
    });
    const result = useNetworkStore.getState().updateProfile(id!, {
      label: "New Label",
      rpcUrl: "https://new.example.com",
    });
    expect(result.valid).toBe(true);
    const updated = useNetworkStore.getState().profiles.find((p) => p.id === id);
    expect(updated?.label).toBe("New Label");
    expect(updated?.rpcUrl).toBe("https://new.example.com");
  });

  it("rejects invalid URL on update", () => {
    const { id } = useNetworkStore.getState().addProfile({
      label: "Net",
      rpcUrl: "https://rpc.example.com",
      passphrase: "Passphrase ; 2024",
    });
    const result = useNetworkStore.getState().updateProfile(id!, { rpcUrl: "bad" });
    expect(result.valid).toBe(false);
  });
});

describe("removeProfile", () => {
  it("removes a profile by ID", () => {
    const { id } = useNetworkStore.getState().addProfile({
      label: "To Delete",
      rpcUrl: "https://rpc.example.com",
      passphrase: "Passphrase ; 2024",
    });
    useNetworkStore.getState().removeProfile(id!);
    expect(useNetworkStore.getState().profiles).toHaveLength(0);
  });

  it("falls back to testnet if the active profile is removed", () => {
    const { id } = useNetworkStore.getState().addProfile({
      label: "Active",
      rpcUrl: "https://rpc.example.com",
      passphrase: "Active Passphrase ; 2024",
    });
    useNetworkStore.getState().selectProfile(id!);
    useNetworkStore.getState().removeProfile(id!);
    expect(useNetworkStore.getState().activeNetwork).toBe("testnet");
  });
});

// ─────────────────────────────────────────────────────────────
// Export / Import profiles
// ─────────────────────────────────────────────────────────────

describe("exportProfiles / importProfiles", () => {
  it("exports profiles as valid JSON", () => {
    useNetworkStore.getState().addProfile({
      label: "Export Me",
      rpcUrl: "https://rpc.example.com",
      passphrase: "Export Passphrase ; 2024",
    });
    const json = useNetworkStore.getState().exportProfiles();
    const parsed = JSON.parse(json);
    expect(parsed.profiles).toHaveLength(1);
    expect(parsed.version).toBe(1);
  });

  it("imports profiles from valid JSON", () => {
    const json = JSON.stringify({
      version: 1,
      profiles: [
        {
          label: "Imported",
          rpcUrl: "https://imported.example.com",
          passphrase: "Imported Network ; 2024",
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    const { imported, error } = useNetworkStore.getState().importProfiles(json);
    expect(error).toBeUndefined();
    expect(imported).toBe(1);
    expect(useNetworkStore.getState().profiles).toHaveLength(1);
  });

  it("skips duplicate profiles on import", () => {
    useNetworkStore.getState().addProfile({
      label: "Existing",
      rpcUrl: "https://dup.example.com",
      passphrase: "Existing Passphrase ; 2024",
    });
    const json = JSON.stringify({
      profiles: [{ label: "Existing", rpcUrl: "https://dup.example.com", passphrase: "X" }],
    });
    const { imported } = useNetworkStore.getState().importProfiles(json);
    expect(imported).toBe(0);
    expect(useNetworkStore.getState().profiles).toHaveLength(1);
  });

  it("returns error on invalid JSON", () => {
    const { imported, error } = useNetworkStore.getState().importProfiles("not json");
    expect(imported).toBe(0);
    expect(error).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// resolvedConfig
// ─────────────────────────────────────────────────────────────

describe("resolvedConfig", () => {
  it("returns a full config object for the active preset", () => {
    useNetworkStore.getState().selectPreset("mainnet");
    const cfg = useNetworkStore.getState().resolvedConfig();
    expect(cfg.label).toBe("Mainnet");
    expect(cfg.passphrase).toBe(NETWORK_CONFIG.mainnet.passphrase);
    expect(cfg.rpcUrl).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// reset
// ─────────────────────────────────────────────────────────────

describe("reset", () => {
  it("restores factory defaults", () => {
    useNetworkStore.getState().selectPreset("mainnet");
    useNetworkStore.getState().addProfile({
      label: "P",
      rpcUrl: "https://rpc.example.com",
      passphrase: "Passphrase ; 2024",
    });
    useNetworkStore.getState().reset();
    const s = useNetworkStore.getState();
    expect(s.activeNetwork).toBe("testnet");
    expect(s.profiles).toHaveLength(0);
    expect(s.customPassphrase).toBe("");
  });
});
