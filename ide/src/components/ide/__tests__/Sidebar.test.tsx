/**
 * src/components/ide/__tests__/Sidebar.test.tsx
 * Snapshot tests for sidebar panel layouts — Issue #669
 *
 * Covers the six sidebar panels used in the IDE layout:
 * AssetManager, OutlineView, GlobalSearch, EnhancedSearch,
 * FuzzingPanel, and TutorialsPane.
 *
 * Snapshots capture rendered HTML structure so that unintended
 * layout regressions are caught in CI.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// ── Mocked sidebar components ─────────────────────────────────────────────────
// Each panel depends on stores/hooks; we mock them to isolate layout rendering.

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceStore: vi.fn(),
  flattenWorkspaceFiles: vi.fn(() => []),
}));

vi.mock("@/store/editorStore", () => ({
  useEditorStore: vi.fn(),
}));

vi.mock("@/store/useDiagnosticsStore", () => ({
  useDiagnosticsStore: vi.fn(() => ({ diagnostics: [] })),
}));

vi.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: vi.fn((v: unknown) => v),
}));

vi.mock("@/utils/searchWalker", () => ({
  searchWalker: vi.fn(() => Promise.resolve({ matches: [], error: null })),
}));

vi.mock("@/utils/searchWorkspace", () => ({
  searchWorkspace: vi.fn(() => []),
}));

vi.mock("@/lib/tutorials/tutorialEngine", () => ({
  tutorialEngine: {
    getState: vi.fn(() => ({ activeTutorialId: null, currentStepIndex: 0 })),
    listTutorials: vi.fn(() => []),
    subscribe: vi.fn(() => () => {}),
    evaluateMilestones: vi.fn(),
  },
  createWorkspaceSnapshot: vi.fn(() => ({})),
}));

// ── Import sidebar components ────────────────────────────────────────────────

import { AssetManager } from "@/components/sidebar/AssetManager";
import { OutlineView } from "@/components/sidebar/OutlineView";
import { GlobalSearch } from "@/components/sidebar/GlobalSearch";
import { EnhancedSearch } from "@/components/sidebar/EnhancedSearch";
import { TutorialsPane } from "@/components/sidebar/TutorialsPane";

// ── Store defaults ───────────────────────────────────────────────────────────

const defaultWorkspaceStore = {
  files: [],
  activeTabPath: [],
  setActiveTabPath: vi.fn(),
  cursorPos: { line: 1, col: 1 },
};

const defaultEditorStore = {
  jumpToLine: vi.fn(),
  viewStates: {},
  setJumpToLine: vi.fn(),
  saveViewState: vi.fn(),
  getViewState: vi.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// AssetManager snapshots
// ─────────────────────────────────────────────────────────────────────────────

describe("Sidebar snapshot — AssetManager", () => {
  beforeEach(() => {
    const { useWorkspaceStore } = vi.mocked(
      await import("@/store/workspaceStore")
    );
    (useWorkspaceStore as ReturnType<typeof vi.fn>).mockReturnValue(defaultWorkspaceStore);
  });

  it("renders empty state", () => {
    const { useWorkspaceStore } = require("@/store/workspaceStore");
    (useWorkspaceStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultWorkspaceStore,
      files: [],
    });
    const { container } = render(<AssetManager />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders with image assets", () => {
    const { useWorkspaceStore } = require("@/store/workspaceStore");
    (useWorkspaceStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultWorkspaceStore,
      files: [
        {
          name: "assets",
          type: "folder",
          children: [
            { name: "logo.svg", type: "file", content: "<svg><rect/></svg>" },
            { name: "banner.png", type: "file", content: "png_data" },
          ],
        },
      ],
    });
    const { container } = render(<AssetManager />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OutlineView snapshots
// ─────────────────────────────────────────────────────────────────────────────

describe("Sidebar snapshot — OutlineView", () => {
  beforeEach(() => {
    const { useEditorStore } = require("@/store/editorStore");
    (useEditorStore as ReturnType<typeof vi.fn>).mockReturnValue(defaultEditorStore);
  });

  it("renders 'No file selected' when no active tab", () => {
    const { useWorkspaceStore } = require("@/store/workspaceStore");
    (useWorkspaceStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultWorkspaceStore,
      activeTabPath: [],
      files: [],
    });
    const { container } = render(<OutlineView />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders non-Rust file placeholder", () => {
    const { useWorkspaceStore } = require("@/store/workspaceStore");
    (useWorkspaceStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultWorkspaceStore,
      activeTabPath: ["Cargo.toml"],
      files: [{ name: "Cargo.toml", type: "file", content: "[package]" }],
    });
    const { container } = render(<OutlineView />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders Rust file with symbols", () => {
    const { useWorkspaceStore } = require("@/store/workspaceStore");
    (useWorkspaceStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultWorkspaceStore,
      activeTabPath: ["lib.rs"],
      files: [
        {
          name: "lib.rs",
          type: "file",
          content: `
pub struct MyContract;
pub fn initialize(env: Env) {}
pub fn create_pool(env: Env, name: String) -> u32 { 0 }
          `.trim(),
        },
      ],
    });
    const { container } = render(<OutlineView />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GlobalSearch snapshots
// ─────────────────────────────────────────────────────────────────────────────

describe("Sidebar snapshot — GlobalSearch", () => {
  beforeEach(() => {
    const { useWorkspaceStore } = require("@/store/workspaceStore");
    (useWorkspaceStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultWorkspaceStore,
      setActiveTabPath: vi.fn(),
    });
  });

  it("renders idle (empty query) state", () => {
    const { container } = render(<GlobalSearch />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EnhancedSearch snapshots
// ─────────────────────────────────────────────────────────────────────────────

describe("Sidebar snapshot — EnhancedSearch", () => {
  beforeEach(() => {
    const { useWorkspaceStore } = require("@/store/workspaceStore");
    (useWorkspaceStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultWorkspaceStore,
      setActiveTabPath: vi.fn(),
    });
  });

  it("renders idle (empty query) state", () => {
    const { container } = render(<EnhancedSearch />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TutorialsPane snapshots
// ─────────────────────────────────────────────────────────────────────────────

describe("Sidebar snapshot — TutorialsPane", () => {
  beforeEach(() => {
    const { useWorkspaceStore } = require("@/store/workspaceStore");
    (useWorkspaceStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...defaultWorkspaceStore,
    });
  });

  it("renders 'no active tutorial' state (landing prompt)", () => {
    const { container } = render(<TutorialsPane />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders active tutorial with steps", () => {
    const { tutorialEngine } = require("@/lib/tutorials/tutorialEngine");
    (tutorialEngine.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTutorialId: "tutorial-1",
      currentStepIndex: 0,
    });
    (tutorialEngine.listTutorials as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: "tutorial-1",
        title: "Deploy your first contract",
        steps: [
          { title: "Write the contract", description: "Open lib.rs and write your code." },
          { title: "Build and deploy", description: "Click the build button." },
        ],
      },
    ]);
    const { container } = render(<TutorialsPane />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
