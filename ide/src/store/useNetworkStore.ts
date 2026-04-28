/**
 * src/store/useNetworkStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized Network Configuration Store  — Issue #647
 * Multi-Network Parallelism                — Issue #657
 *
 * Single source of truth for:
 *  • Active network selection (testnet | futurenet | mainnet | local | custom)
 *  • RPC endpoint URL (preset or custom, with validation)
 *  • Network passphrase
 *  • Horizon URL
 *  • Custom RPC headers
 *  • Named custom network profiles (CRUD)
 *  • Isolated per-network workspace state (deployments, env vars, notes)
 *
 * All state is persisted to localStorage under the key
 * "stellar-suite-network-store" so user preferences survive page reloads.
 *
 * Design notes
 * ────────────
 * • Extends `NetworkKey` with a "custom" literal so components can distinguish
 *   between a built-in preset and a fully user-defined endpoint.
 * • `resolvedRpcUrl` / `resolvedPassphrase` are derived getters that merge
 *   the active preset with any user override — no component needs to do this
 *   logic themselves.
 * • Validation is run on every URL/passphrase setter so invalid values are
 *   rejected immediately and an `error` field is set for UI feedback.
 * • `networkWorkspaces` holds isolated state keyed by network ID so that
 *   Testnet and Mainnet (and any custom network) maintain independent
 *   deployment lists, environment variables, and scratch notes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  NETWORK_CONFIG,
  DEFAULT_CUSTOM_RPC,
  type NetworkKey,
  type NetworkConfig,
  type CustomHeaders,
} from "@/lib/networkConfig";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** All built-in presets + a "custom" sentinel */
export type ExtendedNetworkKey = NetworkKey | "custom";

/**
 * A user-saved custom network profile.
 * Multiple profiles can be stored; one can be made active.
 */
export interface CustomNetworkProfile {
  /** UUID-style identifier */
  id: string;
  /** Human-readable name shown in the selector */
  label: string;
  /** Soroban RPC URL */
  rpcUrl: string;
  /** Network passphrase for transaction signing */
  passphrase: string;
  /** Optional Horizon REST API URL */
  horizonUrl?: string;
  /** Optional per-request HTTP headers */
  headers?: CustomHeaders;
  /** ISO timestamp when this profile was last modified */
  updatedAt: string;
}

/** Validation result returned from URL/passphrase setters */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-network workspace isolation — Issue #657
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Isolated workspace state scoped to a single network.
 * Each network (testnet, mainnet, custom, …) has its own slot so that
 * switching networks never leaks deployment history or env vars.
 */
export interface NetworkWorkspace {
  /** Network key this workspace belongs to. */
  networkId: string;
  /** Deployed contract IDs recorded on this network. */
  deployedContracts: DeployedContractEntry[];
  /** Key-value environment variables for this network only. */
  envVars: Record<string, string>;
  /** Freeform scratch notes for this network. */
  notes: string;
  /** ISO timestamp of the last modification. */
  updatedAt: string;
}

/** Minimal record for a deployed contract within a workspace. */
export interface DeployedContractEntry {
  contractId: string;
  wasmHash: string | null;
  label: string | null;
  deployedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// State interface
// ─────────────────────────────────────────────────────────────────────────────

export interface NetworkStoreState {
  // ── Active selection ──────────────────────────────────────────────────────

  /** Currently active network key (built-in preset or "custom") */
  activeNetwork: ExtendedNetworkKey;

  /**
   * When `activeNetwork === "custom"`, the ID of the selected
   * `CustomNetworkProfile` — or `null` for an inline override.
   */
  activeProfileId: string | null;

  // ── Overrides (apply on top of any preset) ────────────────────────────────

  /** User-supplied RPC URL (overrides the preset's default when set) */
  customRpcUrl: string;
  /** User-supplied network passphrase override */
  customPassphrase: string;
  /** User-supplied Horizon URL override */
  customHorizonUrl: string;
  /** Per-request HTTP headers sent to the RPC endpoint */
  customHeaders: CustomHeaders;

  // ── Saved profiles ────────────────────────────────────────────────────────

  /** Ordered list of user-saved custom network profiles */
  profiles: CustomNetworkProfile[];

  // ── UI state ─────────────────────────────────────────────────────────────

  /** Last validation error, cleared when state becomes valid */
  validationError: string | null;
  /** ISO timestamp of last successful network selection change */
  lastChangedAt: string | null;

  // ── Per-network workspace isolation — Issue #657 ──────────────────────────

  /**
   * Map from network ID → isolated workspace state.
   * Populated lazily on first access; one entry per network ever used.
   */
  networkWorkspaces: Record<string, NetworkWorkspace>;

  /**
   * Convenience getter: returns the workspace for the currently active network.
   * Creates an empty workspace on first access if none exists yet.
   */
  activeWorkspace: () => NetworkWorkspace;

  // ── Derived / computed (getters) ──────────────────────────────────────────

  /**
   * The RPC URL that should be used for all requests.
   * Priority: customRpcUrl override → activeProfile.rpcUrl → preset default
   */
  resolvedRpcUrl: () => string;

  /**
   * The network passphrase for transaction signing.
   * Priority: customPassphrase → activeProfile.passphrase → preset default
   */
  resolvedPassphrase: () => string;

  /**
   * The Horizon REST API URL.
   * Priority: customHorizonUrl → activeProfile.horizonUrl → preset default
   */
  resolvedHorizonUrl: () => string;

  /**
   * The merged HTTP headers (profile headers + customHeaders overrides).
   */
  resolvedHeaders: () => CustomHeaders;

  /**
   * Snapshot of the fully-resolved NetworkConfig-compatible object.
   * Useful for passing to RpcService / eventSubscriber without picking fields.
   */
  resolvedConfig: () => NetworkConfig & { rpcUrl: string };

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Switch to a built-in network preset.
   * Clears all overrides and activeProfileId so the preset defaults apply.
   */
  selectPreset: (network: NetworkKey) => void;

  /**
   * Switch to a saved custom profile by its ID.
   * Sets activeNetwork to "custom" and populates overrides from the profile.
   */
  selectProfile: (profileId: string) => void;

  /**
   * Directly set the RPC URL (inline override, no profile required).
   * Returns a ValidationResult; invalid URLs are rejected.
   */
  setCustomRpcUrl: (url: string) => ValidationResult;

  /**
   * Override the network passphrase.
   * Returns a ValidationResult; empty passphrases are rejected.
   */
  setCustomPassphrase: (passphrase: string) => ValidationResult;

  /** Override the Horizon URL. */
  setCustomHorizonUrl: (url: string) => ValidationResult;

  /** Merge additional headers into customHeaders (existing keys are overwritten). */
  setCustomHeaders: (headers: CustomHeaders) => void;

  /** Remove a single header key. */
  removeCustomHeader: (key: string) => void;

  /** Clear all header overrides. */
  clearCustomHeaders: () => void;

  // ── Profile CRUD ──────────────────────────────────────────────────────────

  /**
   * Save a new custom network profile.
   * Returns the generated profile ID on success or null if validation failed.
   */
  addProfile: (
    input: Omit<CustomNetworkProfile, "id" | "updatedAt">
  ) => { id: string | null; error?: string };

  /** Update fields on an existing profile by ID. */
  updateProfile: (
    id: string,
    patch: Partial<Omit<CustomNetworkProfile, "id" | "updatedAt">>
  ) => ValidationResult;

  /** Delete a profile. If it was active, falls back to "testnet". */
  removeProfile: (id: string) => void;

  /** Export all profiles as a JSON string for sharing/backup. */
  exportProfiles: () => string;

  /**
   * Import profiles from a JSON string.
   * Existing profiles with the same label+rpcUrl pair are skipped (dedup).
   */
  importProfiles: (json: string) => { imported: number; error?: string };

  /** Reset everything back to factory defaults. */
  reset: () => void;

  // ── Workspace actions — Issue #657 ────────────────────────────────────────

  /**
   * Record a newly-deployed contract in the active network's workspace.
   */
  addDeployedContract: (entry: Omit<DeployedContractEntry, "deployedAt">) => void;

  /** Remove a contract record from the active network's workspace. */
  removeDeployedContract: (contractId: string) => void;

  /**
   * Upsert an environment variable in the active network's workspace.
   * Pass `value: undefined` to delete the key.
   */
  setEnvVar: (key: string, value: string | undefined) => void;

  /** Replace the scratch notes for the active network's workspace. */
  setNotes: (notes: string) => void;

  /**
   * Copy all workspace state (contracts + env vars + notes) from one network
   * to another.  Useful for promoting a testnet config to mainnet.
   */
  cloneWorkspace: (fromNetworkId: string, toNetworkId: string) => void;

  /** Wipe the workspace for a specific network. */
  clearWorkspace: (networkId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Basic URL validation — must be http:// or https:// */
function validateUrl(url: string): ValidationResult {
  const trimmed = url.trim();
  if (!trimmed) return { valid: false, error: "URL must not be empty." };
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "URL must use http or https protocol." };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `"${trimmed}" is not a valid URL.` };
  }
}

function validatePassphrase(p: string): ValidationResult {
  const trimmed = p.trim();
  if (!trimmed) return { valid: false, error: "Passphrase must not be empty." };
  if (trimmed.length < 8)
    return { valid: false, error: "Passphrase must be at least 8 characters." };
  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default state values
// ─────────────────────────────────────────────────────────────────────────────

function emptyWorkspace(networkId: string): NetworkWorkspace {
  return {
    networkId,
    deployedContracts: [],
    envVars: {},
    notes: "",
    updatedAt: now(),
  };
}

const DEFAULTS = {
  activeNetwork: "testnet" as ExtendedNetworkKey,
  activeProfileId: null as string | null,
  customRpcUrl: NETWORK_CONFIG.testnet.horizon,
  customPassphrase: "",
  customHorizonUrl: "",
  customHeaders: {} as CustomHeaders,
  profiles: [] as CustomNetworkProfile[],
  validationError: null as string | null,
  lastChangedAt: null as string | null,
  networkWorkspaces: {} as Record<string, NetworkWorkspace>,
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useNetworkStore = create<NetworkStoreState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      // ── Derived getters ────────────────────────────────────────────────────

      resolvedRpcUrl: () => {
        const s = get();
        if (s.customRpcUrl && s.customRpcUrl !== NETWORK_CONFIG[s.activeNetwork as NetworkKey]?.horizon) {
          return s.customRpcUrl;
        }
        if (s.activeProfileId) {
          const profile = s.profiles.find((p) => p.id === s.activeProfileId);
          if (profile) return profile.rpcUrl;
        }
        if (s.activeNetwork === "custom") return s.customRpcUrl || DEFAULT_CUSTOM_RPC;
        return NETWORK_CONFIG[s.activeNetwork as NetworkKey]?.horizon ?? DEFAULT_CUSTOM_RPC;
      },

      resolvedPassphrase: () => {
        const s = get();
        if (s.customPassphrase) return s.customPassphrase;
        if (s.activeProfileId) {
          const profile = s.profiles.find((p) => p.id === s.activeProfileId);
          if (profile) return profile.passphrase;
        }
        if (s.activeNetwork === "custom") return s.customPassphrase;
        return NETWORK_CONFIG[s.activeNetwork as NetworkKey]?.passphrase ?? "";
      },

      resolvedHorizonUrl: () => {
        const s = get();
        if (s.customHorizonUrl) return s.customHorizonUrl;
        if (s.activeProfileId) {
          const profile = s.profiles.find((p) => p.id === s.activeProfileId);
          if (profile?.horizonUrl) return profile.horizonUrl;
        }
        if (s.activeNetwork === "custom") return s.customHorizonUrl;
        return NETWORK_CONFIG[s.activeNetwork as NetworkKey]?.horizonUrl ?? "";
      },

      resolvedHeaders: () => {
        const s = get();
        const profileHeaders =
          s.activeProfileId
            ? s.profiles.find((p) => p.id === s.activeProfileId)?.headers ?? {}
            : {};
        return { ...profileHeaders, ...s.customHeaders };
      },

      resolvedConfig: () => {
        const s = get();
        return {
          label: s.activeNetwork === "custom"
            ? (s.profiles.find((p) => p.id === s.activeProfileId)?.label ?? "Custom")
            : NETWORK_CONFIG[s.activeNetwork as NetworkKey]?.label ?? "Custom",
          horizon: s.resolvedRpcUrl(),
          rpcUrl: s.resolvedRpcUrl(),
          horizonUrl: s.resolvedHorizonUrl(),
          passphrase: s.resolvedPassphrase(),
          secondaryRpcUrls: s.activeNetwork !== "custom"
            ? (NETWORK_CONFIG[s.activeNetwork as NetworkKey]?.secondaryRpcUrls ?? [])
            : [],
        };
      },

      // ── Actions ────────────────────────────────────────────────────────────

      selectPreset: (network) => {
        const config = NETWORK_CONFIG[network];
        set({
          activeNetwork: network,
          activeProfileId: null,
          customRpcUrl: config.horizon,
          customPassphrase: "",
          customHorizonUrl: "",
          validationError: null,
          lastChangedAt: now(),
        });
      },

      selectProfile: (profileId) => {
        const { profiles } = get();
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) {
          set({ validationError: `Profile "${profileId}" not found.` });
          return;
        }
        set({
          activeNetwork: "custom",
          activeProfileId: profileId,
          customRpcUrl: profile.rpcUrl,
          customPassphrase: profile.passphrase,
          customHorizonUrl: profile.horizonUrl ?? "",
          customHeaders: profile.headers ?? {},
          validationError: null,
          lastChangedAt: now(),
        });
      },

      setCustomRpcUrl: (url) => {
        const result = validateUrl(url);
        if (!result.valid) {
          set({ validationError: result.error ?? null });
          return result;
        }
        set({
          customRpcUrl: url.trim(),
          activeNetwork: "custom",
          activeProfileId: null,
          validationError: null,
          lastChangedAt: now(),
        });
        return result;
      },

      setCustomPassphrase: (passphrase) => {
        const result = validatePassphrase(passphrase);
        if (!result.valid) {
          set({ validationError: result.error ?? null });
          return result;
        }
        set({
          customPassphrase: passphrase.trim(),
          activeNetwork: "custom",
          activeProfileId: null,
          validationError: null,
          lastChangedAt: now(),
        });
        return result;
      },

      setCustomHorizonUrl: (url) => {
        if (url === "") {
          // Clearing is allowed
          set({ customHorizonUrl: "", validationError: null });
          return { valid: true };
        }
        const result = validateUrl(url);
        if (!result.valid) {
          set({ validationError: result.error ?? null });
          return result;
        }
        set({ customHorizonUrl: url.trim(), validationError: null });
        return result;
      },

      setCustomHeaders: (headers) =>
        set((s) => ({
          customHeaders: { ...s.customHeaders, ...headers },
        })),

      removeCustomHeader: (key) =>
        set((s) => {
          const next = { ...s.customHeaders };
          delete next[key];
          return { customHeaders: next };
        }),

      clearCustomHeaders: () => set({ customHeaders: {} }),

      // ── Profile CRUD ───────────────────────────────────────────────────────

      addProfile: (input) => {
        const urlCheck = validateUrl(input.rpcUrl);
        if (!urlCheck.valid) return { id: null, error: urlCheck.error };

        const passphraseCheck = validatePassphrase(input.passphrase);
        if (!passphraseCheck.valid) return { id: null, error: passphraseCheck.error };

        if (input.horizonUrl) {
          const horizonCheck = validateUrl(input.horizonUrl);
          if (!horizonCheck.valid) return { id: null, error: horizonCheck.error };
        }

        const id = generateId();
        const profile: CustomNetworkProfile = {
          ...input,
          id,
          updatedAt: now(),
        };
        set((s) => ({ profiles: [...s.profiles, profile] }));
        return { id };
      },

      updateProfile: (id, patch) => {
        const { profiles } = get();
        const existing = profiles.find((p) => p.id === id);
        if (!existing) return { valid: false, error: `Profile "${id}" not found.` };

        if (patch.rpcUrl !== undefined) {
          const check = validateUrl(patch.rpcUrl);
          if (!check.valid) return check;
        }
        if (patch.passphrase !== undefined) {
          const check = validatePassphrase(patch.passphrase);
          if (!check.valid) return check;
        }
        if (patch.horizonUrl !== undefined && patch.horizonUrl !== "") {
          const check = validateUrl(patch.horizonUrl);
          if (!check.valid) return check;
        }

        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: now() } : p
          ),
        }));

        // If this profile is currently active, sync the overrides
        if (get().activeProfileId === id) {
          get().selectProfile(id);
        }
        return { valid: true };
      },

      removeProfile: (id) => {
        const { activeProfileId } = get();
        set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) }));
        if (activeProfileId === id) {
          // Fall back to testnet
          get().selectPreset("testnet");
        }
      },

      exportProfiles: () => {
        const { profiles } = get();
        return JSON.stringify({ version: 1, profiles, exportedAt: now() }, null, 2);
      },

      importProfiles: (json) => {
        try {
          const parsed = JSON.parse(json) as {
            profiles?: Omit<CustomNetworkProfile, "id">[];
          };
          const incoming = Array.isArray(parsed.profiles) ? parsed.profiles : [];
          const { profiles } = get();

          let imported = 0;
          const newProfiles: CustomNetworkProfile[] = [];

          for (const p of incoming) {
            // Skip exact URL + label duplicates
            const isDuplicate = profiles.some(
              (e) => e.rpcUrl === p.rpcUrl && e.label === p.label
            );
            if (!isDuplicate) {
              const urlCheck = validateUrl(p.rpcUrl);
              if (!urlCheck.valid) continue;
              newProfiles.push({ ...p, id: generateId(), updatedAt: now() });
              imported++;
            }
          }

          set((s) => ({ profiles: [...s.profiles, ...newProfiles] }));
          return { imported };
        } catch (e) {
          return {
            imported: 0,
            error: e instanceof Error ? e.message : "Invalid JSON",
          };
        }
      },

      reset: () =>
        set({
          ...DEFAULTS,
          lastChangedAt: now(),
        }),

      // ── Workspace: derived getter — Issue #657 ────────────────────────────

      activeWorkspace: () => {
        const s = get();
        const key = s.activeNetwork;
        return s.networkWorkspaces[key] ?? emptyWorkspace(key);
      },

      // ── Workspace: actions — Issue #657 ───────────────────────────────────

      addDeployedContract: (entry) => {
        const { activeNetwork, networkWorkspaces } = get();
        const ws = networkWorkspaces[activeNetwork] ?? emptyWorkspace(activeNetwork);
        // Avoid duplicate contract IDs
        const filtered = ws.deployedContracts.filter(
          (c) => c.contractId !== entry.contractId
        );
        const updated: NetworkWorkspace = {
          ...ws,
          deployedContracts: [
            ...filtered,
            { ...entry, deployedAt: now() },
          ],
          updatedAt: now(),
        };
        set((s) => ({
          networkWorkspaces: { ...s.networkWorkspaces, [activeNetwork]: updated },
        }));
      },

      removeDeployedContract: (contractId) => {
        const { activeNetwork, networkWorkspaces } = get();
        const ws = networkWorkspaces[activeNetwork] ?? emptyWorkspace(activeNetwork);
        const updated: NetworkWorkspace = {
          ...ws,
          deployedContracts: ws.deployedContracts.filter(
            (c) => c.contractId !== contractId
          ),
          updatedAt: now(),
        };
        set((s) => ({
          networkWorkspaces: { ...s.networkWorkspaces, [activeNetwork]: updated },
        }));
      },

      setEnvVar: (key, value) => {
        const { activeNetwork, networkWorkspaces } = get();
        const ws = networkWorkspaces[activeNetwork] ?? emptyWorkspace(activeNetwork);
        const envVars = { ...ws.envVars };
        if (value === undefined) {
          delete envVars[key];
        } else {
          envVars[key] = value;
        }
        const updated: NetworkWorkspace = { ...ws, envVars, updatedAt: now() };
        set((s) => ({
          networkWorkspaces: { ...s.networkWorkspaces, [activeNetwork]: updated },
        }));
      },

      setNotes: (notes) => {
        const { activeNetwork, networkWorkspaces } = get();
        const ws = networkWorkspaces[activeNetwork] ?? emptyWorkspace(activeNetwork);
        const updated: NetworkWorkspace = { ...ws, notes, updatedAt: now() };
        set((s) => ({
          networkWorkspaces: { ...s.networkWorkspaces, [activeNetwork]: updated },
        }));
      },

      cloneWorkspace: (fromNetworkId, toNetworkId) => {
        const { networkWorkspaces } = get();
        const source = networkWorkspaces[fromNetworkId] ?? emptyWorkspace(fromNetworkId);
        const cloned: NetworkWorkspace = {
          ...source,
          networkId: toNetworkId,
          updatedAt: now(),
        };
        set((s) => ({
          networkWorkspaces: { ...s.networkWorkspaces, [toNetworkId]: cloned },
        }));
      },

      clearWorkspace: (networkId) => {
        set((s) => ({
          networkWorkspaces: {
            ...s.networkWorkspaces,
            [networkId]: emptyWorkspace(networkId),
          },
        }));
      },
    }),
    {
      name: "stellar-suite-network-store",
      storage: createJSONStorage(() => localStorage),
      // Only persist user-editable fields; computed getters are not serialisable
      partialize: (s) => ({
        activeNetwork: s.activeNetwork,
        activeProfileId: s.activeProfileId,
        customRpcUrl: s.customRpcUrl,
        customPassphrase: s.customPassphrase,
        customHorizonUrl: s.customHorizonUrl,
        customHeaders: s.customHeaders,
        profiles: s.profiles,
        lastChangedAt: s.lastChangedAt,
        networkWorkspaces: s.networkWorkspaces,
      }),
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// Convenience selector hooks
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the fully-resolved RPC URL for use in fetch / eventSubscriber calls. */
export const useResolvedRpcUrl = () =>
  useNetworkStore((s) => s.resolvedRpcUrl());

/** Returns the fully-resolved network passphrase for transaction signing. */
export const useResolvedPassphrase = () =>
  useNetworkStore((s) => s.resolvedPassphrase());

/** Returns the currently active network key. */
export const useActiveNetwork = () =>
  useNetworkStore((s) => s.activeNetwork);

/** Returns all saved custom network profiles. */
export const useNetworkProfiles = () =>
  useNetworkStore((s) => s.profiles);

/** Returns the current validation error (if any). */
export const useNetworkValidationError = () =>
  useNetworkStore((s) => s.validationError);

/** Returns the fully-resolved network config snapshot. */
export const useResolvedNetworkConfig = () =>
  useNetworkStore((s) => s.resolvedConfig());

// ── Multi-network workspace selector hooks — Issue #657 ──────────────────────

/** Returns the workspace for the currently active network. */
export const useActiveWorkspace = () =>
  useNetworkStore((s) => s.activeWorkspace());

/** Returns deployed contracts recorded on the currently active network. */
export const useActiveNetworkContracts = () =>
  useNetworkStore((s) => s.activeWorkspace().deployedContracts);

/** Returns env vars for the currently active network workspace. */
export const useActiveNetworkEnvVars = () =>
  useNetworkStore((s) => s.activeWorkspace().envVars);

/** Returns the scratch notes for the currently active network workspace. */
export const useActiveNetworkNotes = () =>
  useNetworkStore((s) => s.activeWorkspace().notes);

/** Returns workspaces keyed by network ID (all networks). */
export const useAllNetworkWorkspaces = () =>
  useNetworkStore((s) => s.networkWorkspaces);
