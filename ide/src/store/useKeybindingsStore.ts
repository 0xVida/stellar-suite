import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Keybinding {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

interface KeybindingsStore {
  customBindings: Record<string, Keybinding>;
  setBinding: (commandId: string, binding: Keybinding) => void;
  resetBinding: (commandId: string) => void;
  resetAll: () => void;
}

export const useKeybindingsStore = create<KeybindingsStore>()(
  persist(
    (set) => ({
      customBindings: {},
      setBinding: (commandId, binding) =>
        set((state) => ({
          customBindings: { ...state.customBindings, [commandId]: binding },
        })),
      resetBinding: (commandId) =>
        set((state) => {
          const newBindings = { ...state.customBindings };
          delete newBindings[commandId];
          return { customBindings: newBindings };
        }),
      resetAll: () => set({ customBindings: {} }),
    }),
    {
      name: 'stellar-ide-keybindings',
    }
  )
);
