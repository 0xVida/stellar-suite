import { create } from "zustand";
import { Horizon, Keypair } from "@stellar/stellar-sdk";
import { get as idbGet, set as idbSet } from "idb-keyval";
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  migrateSecretIfNeeded,
} from "@/lib/security/StorageEncryption";

export interface Identity {
  nickname: string;
  publicKey: string;
  /** Stored as an AES-GCM encrypted blob (prefix "enc:v1:…").  */
  secretKey: string;
}

export type ActiveContext =
  | { type: "web-wallet" }
  | { type: "local-keypair"; publicKey: string }
  | null;

interface IdentityStore {
  identities: Identity[];
  /** The currently selected identity with its secret key already decrypted. */
  activeIdentity: Identity | null;
  activeContext: ActiveContext;
  webWalletPublicKey: string | null;
  balancesByPublicKey: Record<string, string>;
  loading: boolean;
  loadingBalances: boolean;
  /** Whether the vault is unlocked (passphrase in memory). */
  isUnlocked: boolean;

  // ── Vault control ────────────────────────────────────────────────────────
  unlockVault: (passphrase: string) => Promise<void>;
  lockVault: () => void;

  // ── Standard identity operations ─────────────────────────────────────────
  loadIdentities: (passphrase?: string) => Promise<void>;
  addIdentity: (
    nickname: string,
    keypair: { publicKey: string; secretKey: string },
    passphrase?: string
  ) => Promise<void>;
  generateNewIdentity: (nickname: string, passphrase?: string) => Promise<void>;
  setActiveIdentity: (identity: Identity | null) => void;
  setActiveContext: (context: ActiveContext) => void;
  setWebWalletPublicKey: (publicKey: string | null) => void;
  deleteIdentity: (publicKey: string) => Promise<void>;
  refreshBalances: (network: string) => Promise<void>;
}

const STORAGE_KEY = "stellar_kit_identities";

// ─── Internal: passphrase held in memory only (never persisted) ───────────────
let _vaultPassphrase: string | null = null;

function getPassphrase(override?: string): string | null {
  return override ?? _vaultPassphrase;
}

// ─── Horizon helpers ──────────────────────────────────────────────────────────

const getHorizonUrl = (network: string) => {
  switch (network) {
    case "mainnet":
      return "https://horizon.stellar.org";
    case "futurenet":
      return "https://horizon-futurenet.stellar.org";
    case "testnet":
    default:
      return "https://horizon-testnet.stellar.org";
  }
};

const fetchXlmBalance = async (
  server: Horizon.Server,
  publicKey: string
): Promise<string> => {
  try {
    const account = await server.loadAccount(publicKey);
    const native = account.balances.find(
      (balance) => balance.asset_type === "native"
    );
    const amount = Number(native?.balance ?? "0");
    return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
  } catch {
    return "0.00";
  }
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useIdentityStore = create<IdentityStore>((set, get) => ({
  identities: [],
  activeIdentity: null,
  activeContext: { type: "web-wallet" },
  webWalletPublicKey: null,
  balancesByPublicKey: {},
  loading: true,
  loadingBalances: false,
  isUnlocked: false,

  // ── Vault control ──────────────────────────────────────────────────────────

  unlockVault: async (passphrase: string) => {
    _vaultPassphrase = passphrase;
    set({ isUnlocked: true });
    // Re-load identities now that we have the passphrase.
    await get().loadIdentities(passphrase);
  },

  lockVault: () => {
    _vaultPassphrase = null;
    // Wipe in-memory decrypted secrets.
    set({
      isUnlocked: false,
      activeIdentity: null,
      activeContext: { type: "web-wallet" },
    });
  },

  // ── loadIdentities ─────────────────────────────────────────────────────────

  loadIdentities: async (passphrase?: string) => {
    set({ loading: true });
    try {
      const storedRaw = (await idbGet<Identity[]>(STORAGE_KEY)) ?? [];
      const pp = getPassphrase(passphrase);

      let needsPersist = false;

      // Migrate any legacy plain-text secret keys to encrypted form.
      const migrated: Identity[] = await Promise.all(
        storedRaw.map(async (id) => {
          if (!pp || isEncrypted(id.secretKey)) return id;
          const { encrypted, changed } = await migrateSecretIfNeeded(
            id.secretKey,
            pp
          );
          if (changed) needsPersist = true;
          return { ...id, secretKey: encrypted };
        })
      );

      if (needsPersist) {
        await idbSet(STORAGE_KEY, migrated);
      }

      // Build the in-memory view with decrypted secret keys (only if unlocked).
      const decrypted: Identity[] = pp
        ? await Promise.all(
            migrated.map(async (id) => {
              if (!isEncrypted(id.secretKey)) return id;
              try {
                const plain = await decryptSecret(id.secretKey, pp);
                return { ...id, secretKey: plain };
              } catch {
                // Passphrase wrong for this entry — surface encrypted blob.
                return id;
              }
            })
          )
        : migrated;

      const previousContext = get().activeContext;
      const nextActiveIdentity =
        previousContext?.type === "local-keypair"
          ? decrypted.find(
              (id) => id.publicKey === previousContext.publicKey
            ) ?? null
          : null;

      set({
        identities: decrypted,
        activeIdentity: nextActiveIdentity,
        activeContext: nextActiveIdentity
          ? previousContext
          : { type: "web-wallet" },
      });
    } catch (error) {
      // Never log error details that might contain key material.
      console.error("[IdentityStore] Failed to load identities.");
      void error;
    } finally {
      set({ loading: false });
    }
  },

  // ── addIdentity ────────────────────────────────────────────────────────────

  addIdentity: async (nickname, { publicKey, secretKey }, passphrase?) => {
    const pp = getPassphrase(passphrase);
    const { identities } = get();

    const storedSecretKey = pp
      ? await encryptSecret(secretKey, pp)
      : secretKey;

    // The in-memory identity keeps the plain-text key for runtime use.
    const newIdentityMem: Identity = { nickname, publicKey, secretKey };
    // What we persist always stores the encrypted form.
    const newIdentityStore: Identity = {
      nickname,
      publicKey,
      secretKey: storedSecretKey,
    };

    // Persist with encrypted secret keys.
    const storedPrev = (await idbGet<Identity[]>(STORAGE_KEY)) ?? [];
    await idbSet(STORAGE_KEY, [...storedPrev, newIdentityStore]);

    const nextIdentities = [...identities, newIdentityMem];
    set({ identities: nextIdentities });

    if (get().activeContext?.type !== "local-keypair") {
      set({
        activeContext: { type: "local-keypair", publicKey },
        activeIdentity: newIdentityMem,
      });
    }
  },

  // ── generateNewIdentity ────────────────────────────────────────────────────

  generateNewIdentity: async (nickname, passphrase?) => {
    const keypair = Keypair.random();
    await get().addIdentity(
      nickname,
      {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret(),
      },
      passphrase
    );
  },

  // ── setActiveIdentity ──────────────────────────────────────────────────────

  setActiveIdentity: (identity) =>
    set({
      activeIdentity: identity,
      activeContext: identity
        ? { type: "local-keypair", publicKey: identity.publicKey }
        : { type: "web-wallet" },
    }),

  // ── setActiveContext ───────────────────────────────────────────────────────

  setActiveContext: (context) => {
    if (!context) {
      set({ activeContext: null, activeIdentity: null });
      return;
    }
    if (context.type === "web-wallet") {
      set({ activeContext: context, activeIdentity: null });
      return;
    }
    const identity =
      get().identities.find((id) => id.publicKey === context.publicKey) ?? null;
    set({ activeContext: context, activeIdentity: identity });
  },

  setWebWalletPublicKey: (publicKey) => set({ webWalletPublicKey: publicKey }),

  // ── deleteIdentity ─────────────────────────────────────────────────────────

  deleteIdentity: async (publicKey) => {
    const { identities, activeContext } = get();
    const nextIdentities = identities.filter(
      (id) => id.publicKey !== publicKey
    );

    // Also prune the persisted (encrypted) list.
    const storedPrev = (await idbGet<Identity[]>(STORAGE_KEY)) ?? [];
    await idbSet(
      STORAGE_KEY,
      storedPrev.filter((id) => id.publicKey !== publicKey)
    );

    const nextState: Partial<IdentityStore> = { identities: nextIdentities };
    if (
      activeContext?.type === "local-keypair" &&
      activeContext.publicKey === publicKey
    ) {
      nextState.activeContext = { type: "web-wallet" };
      nextState.activeIdentity = null;
    }
    set(nextState);
  },

  // ── refreshBalances ────────────────────────────────────────────────────────

  refreshBalances: async (network) => {
    const { identities, webWalletPublicKey } = get();
    const server = new Horizon.Server(getHorizonUrl(network));
    const keys = [
      ...identities.map((id) => id.publicKey),
      ...(webWalletPublicKey ? [webWalletPublicKey] : []),
    ];
    if (keys.length === 0) {
      set({ balancesByPublicKey: {} });
      return;
    }
    set({ loadingBalances: true });
    const entries = await Promise.all(
      keys.map(
        async (pk) =>
          [pk, await fetchXlmBalance(server, pk)] as [string, string]
      )
    );
    set({
      balancesByPublicKey: Object.fromEntries(entries),
      loadingBalances: false,
    });
  },
}));
