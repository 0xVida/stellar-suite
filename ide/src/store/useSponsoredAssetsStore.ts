/**
 * useSponsoredAssetsStore.ts
 * Zustand store for managing assets eligible for fee sponsorship — Issue #836
 *
 * Tracks which assets (native XLM or issued tokens) are allowed to be used
 * in sponsored transactions within the IDE's testing environment.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/utils/idbStorage";
import type { NetworkKey } from "@/lib/networkConfig";

export type AssetType = "native" | "issued";

export interface SponsoredAsset {
  /** Unique ID: "native" or "<code>:<issuer>" */
  id: string;
  type: AssetType;
  /** Asset code, e.g. "XLM", "USDC" */
  code: string;
  /** Issuer public key — null for native */
  issuer: string | null;
  /** Human-readable label */
  label: string;
  /** Whether this asset is currently eligible for sponsorship */
  enabled: boolean;
  /** Max fee (in stroops) the sponsor will cover per operation */
  maxFeeStroops: number;
  /** Networks this policy applies to */
  networks: NetworkKey[];
  /** ISO timestamp when this entry was added */
  addedAt: string;
}

interface SponsoredAssetsStore {
  assets: SponsoredAsset[];

  addAsset: (asset: Omit<SponsoredAsset, "id" | "addedAt">) => void;
  removeAsset: (id: string) => void;
  toggleAsset: (id: string, enabled: boolean) => void;
  updateMaxFee: (id: string, maxFeeStroops: number) => void;
  clearAll: () => void;

  /** Returns assets eligible for a given network */
  eligibleFor: (network: NetworkKey) => SponsoredAsset[];
}

const DEFAULT_ASSETS: SponsoredAsset[] = [
  {
    id: "native",
    type: "native",
    code: "XLM",
    issuer: null,
    label: "Stellar Lumens (XLM)",
    enabled: true,
    maxFeeStroops: 100,
    networks: ["testnet", "futurenet", "local"],
    addedAt: new Date(0).toISOString(),
  },
];

function makeId(type: AssetType, code: string, issuer: string | null): string {
  return type === "native" ? "native" : `${code}:${issuer ?? ""}`;
}

export const useSponsoredAssetsStore = create<SponsoredAssetsStore>()(
  persist(
    (set, get) => ({
      assets: DEFAULT_ASSETS,

      addAsset: (asset) => {
        const id = makeId(asset.type, asset.code, asset.issuer);
        set((state) => {
          if (state.assets.some((a) => a.id === id)) return state;
          return {
            assets: [
              ...state.assets,
              { ...asset, id, addedAt: new Date().toISOString() },
            ],
          };
        });
      },

      removeAsset: (id) =>
        set((state) => ({
          assets: state.assets.filter((a) => a.id !== id),
        })),

      toggleAsset: (id, enabled) =>
        set((state) => ({
          assets: state.assets.map((a) => (a.id === id ? { ...a, enabled } : a)),
        })),

      updateMaxFee: (id, maxFeeStroops) =>
        set((state) => ({
          assets: state.assets.map((a) =>
            a.id === id ? { ...a, maxFeeStroops } : a
          ),
        })),

      clearAll: () => set({ assets: DEFAULT_ASSETS }),

      eligibleFor: (network) =>
        get().assets.filter((a) => a.enabled && a.networks.includes(network)),
    }),
    {
      name: "stellar-suite:sponsored-assets",
      storage: createJSONStorage(() => idbStorage),
    }
  )
);
