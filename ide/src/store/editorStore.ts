import { create } from "zustand";

interface EditorState {
  jumpToLine: ((line: number) => void) | null;
  setJumpToLine: (fn: ((line: number) => void) | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  jumpToLine: null,
  setJumpToLine: (fn) => set({ jumpToLine: fn }),
}));
