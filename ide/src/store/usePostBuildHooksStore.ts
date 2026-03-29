import { create } from "zustand";
import { persist } from "zustand/middleware";

export type HookType = "script" | "webhook";

export interface PostBuildHook {
  id: string;
  enabled: boolean;
  type: HookType;
  /** For type === "script": the shell command to run */
  command: string;
  /** For type === "webhook": the URL to POST to */
  webhookUrl: string;
  label: string;
}

interface PostBuildHooksState {
  hooks: PostBuildHook[];
  addHook: (hook: Omit<PostBuildHook, "id">) => void;
  updateHook: (id: string, patch: Partial<Omit<PostBuildHook, "id">>) => void;
  removeHook: (id: string) => void;
  toggleHook: (id: string) => void;
}

export const usePostBuildHooksStore = create<PostBuildHooksState>()(
  persist(
    (set) => ({
      hooks: [],
      addHook: (hook) =>
        set((state) => ({
          hooks: [
            ...state.hooks,
            { ...hook, id: crypto.randomUUID() },
          ],
        })),
      updateHook: (id, patch) =>
        set((state) => ({
          hooks: state.hooks.map((h) => (h.id === id ? { ...h, ...patch } : h)),
        })),
      removeHook: (id) =>
        set((state) => ({ hooks: state.hooks.filter((h) => h.id !== id) })),
      toggleHook: (id) =>
        set((state) => ({
          hooks: state.hooks.map((h) =>
            h.id === id ? { ...h, enabled: !h.enabled } : h,
          ),
        })),
    }),
    { name: "stellar-suite-post-build-hooks" },
  ),
);
