import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/utils/idbStorage";

export type EnvironmentSlot = {
  id: string;
  label: string;
  color: string; // simple color name for UI (red/yellow/green/etc.)
  contractId?: string | null;
  cargoFeatures?: string[];
};

export type EnvironmentConfig = Record<string, EnvironmentSlot>;

interface EnvironmentSlotsStore {
  slots: EnvironmentConfig;
  selectedSlotId: string;
  selectSlot: (id: string) => void;
  pinContract: (slotId: string, contractId: string) => void;
  unpinContract: (slotId: string) => void;
  setSlots: (slots: EnvironmentConfig) => void;
}

const DEFAULT_SLOTS: EnvironmentConfig = {
  staging: {
    id: "staging",
    label: "Staging",
    color: "yellow",
    contractId: undefined,
    cargoFeatures: ["staging"],
  },
  production: {
    id: "production",
    label: "Production",
    color: "red",
    contractId: undefined,
    cargoFeatures: ["production"],
  },
};

export const useEnvironmentSlotsStore = create<EnvironmentSlotsStore>()(
  persist(
    (set, get) => ({
      slots: DEFAULT_SLOTS,
      selectedSlotId: "staging",

      selectSlot: (id: string) => {
        const { slots } = get();
        if (!slots[id]) return; // ignore unknown
        set({ selectedSlotId: id });
      },

      pinContract: (slotId: string, contractId: string) => {
        set((state) => ({
          slots: {
            ...state.slots,
            [slotId]: {
              ...state.slots[slotId],
              contractId,
            },
          },
        }));
      },

      unpinContract: (slotId: string) => {
        set((state) => ({
          slots: {
            ...state.slots,
            [slotId]: {
              ...state.slots[slotId],
              contractId: undefined,
            },
          },
        }));
      },

      setSlots: (slots: EnvironmentConfig) => set({ slots }),
    }),
    {
      name: "stellar-suite:env-slots",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);

export default useEnvironmentSlotsStore;
