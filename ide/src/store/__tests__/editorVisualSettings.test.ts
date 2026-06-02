/**
 * src/store/__tests__/editorVisualSettings.test.ts
 * ──────────────────────────────────────────────────────────────
 * Unit tests for the editor visual settings added in issue #928:
 * minimap, indent guides, and font ligatures toggles persisted to
 * the UserSettingsStore.
 * ──────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useUserSettingsStore } from "../useUserSettingsStore";

// Capture the pristine defaults so each test starts from a known state.
const DEFAULTS = {
  editorMinimap: useUserSettingsStore.getState().editorMinimap,
  editorIndentGuides: useUserSettingsStore.getState().editorIndentGuides,
  editorFontLigatures: useUserSettingsStore.getState().editorFontLigatures,
};

beforeEach(() => {
  useUserSettingsStore.setState({ ...DEFAULTS });
});

describe("editor visual settings defaults (#928)", () => {
  it("defaults the minimap off", () => {
    expect(useUserSettingsStore.getState().editorMinimap).toBe(false);
  });

  it("defaults indent guides and font ligatures on", () => {
    const s = useUserSettingsStore.getState();
    expect(s.editorIndentGuides).toBe(true);
    expect(s.editorFontLigatures).toBe(true);
  });
});

describe("editor visual setters (#928)", () => {
  it("toggles the minimap and stores the value", () => {
    useUserSettingsStore.getState().setEditorMinimap(true);
    expect(useUserSettingsStore.getState().editorMinimap).toBe(true);
    useUserSettingsStore.getState().setEditorMinimap(false);
    expect(useUserSettingsStore.getState().editorMinimap).toBe(false);
  });

  it("toggles indent guides", () => {
    useUserSettingsStore.getState().setEditorIndentGuides(false);
    expect(useUserSettingsStore.getState().editorIndentGuides).toBe(false);
  });

  it("toggles font ligatures", () => {
    useUserSettingsStore.getState().setEditorFontLigatures(false);
    expect(useUserSettingsStore.getState().editorFontLigatures).toBe(false);
  });

  it("persists under the 'user-settings' storage key", () => {
    // The store is wrapped in zustand's persist middleware; updating a value
    // writes the whole settings slice to localStorage under this key.
    useUserSettingsStore.getState().setEditorMinimap(true);
    const raw = window.localStorage.getItem("user-settings");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.editorMinimap).toBe(true);
  });
});
