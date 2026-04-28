/**
 * src/components/layout/__tests__/LazySidebar.test.tsx
 * Unit tests for LazySidebar — Issue #650
 *
 * Strategy:
 * - Mock next/dynamic so panels resolve synchronously in tests
 * - Verify correct panel is rendered for each activeTab
 * - Verify FileExplorer is NOT lazy (always present without dynamic)
 * - Verify skeleton renders for unresolved panels
 * - Verify data-active-tab attribute updates per tab
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import React, { Suspense } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Mock next/dynamic — resolve immediately to a named stub
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("next/dynamic", () => ({
  default: (
    loader: () => Promise<{ default: React.ComponentType<object> }>,
    opts?: { loading?: () => React.ReactElement }
  ) => {
    // Return a synchronous wrapper that immediately renders the loaded component
    function LazyStub(props: object) {
      const [Comp, setComp] = React.useState<React.ComponentType<object> | null>(null);
      React.useEffect(() => {
        loader().then((mod) => setComp(() => mod.default));
      }, []);
      if (!Comp) return opts?.loading?.() ?? null;
      return <Comp {...props} />;
    }
    LazyStub.displayName = "LazyStub";
    return LazyStub;
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock sidebar panel components — lightweight stubs
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/components/ide/FileExplorer", () => ({
  FileExplorer: () => <div data-testid="panel-explorer">FileExplorer</div>,
}));

vi.mock("@/components/ide/GitPane", () => ({
  GitPane: () => <div data-testid="panel-git">GitPane</div>,
}));

vi.mock("@/components/ide/DeploymentsView", () => ({
  DeploymentsView: () => <div data-testid="panel-deployments">DeploymentsView</div>,
}));

vi.mock("@/components/ide/IdentitiesView", () => ({
  IdentitiesView: () => <div data-testid="panel-identities">IdentitiesView</div>,
}));

vi.mock("@/components/sidebar/GlobalSearch", () => ({
  GlobalSearch: () => <div data-testid="panel-search">GlobalSearch</div>,
}));

vi.mock("@/components/ide/SecurityView", () => ({
  SecurityView: () => <div data-testid="panel-security">SecurityView</div>,
}));

vi.mock("@/components/ide/TestingView", () => ({
  TestingView: () => <div data-testid="panel-tests">TestingView</div>,
}));

vi.mock("@/components/ide/NetworkExplorer", () => ({
  NetworkExplorer: () => <div data-testid="panel-network">NetworkExplorer</div>,
}));



// ─────────────────────────────────────────────────────────────────────────────
// Import component AFTER mocks are registered
// ─────────────────────────────────────────────────────────────────────────────

import { LazySidebar, SidebarPanelSkeleton } from "../LazySidebar";
import type { SidebarTab } from "@/store/workspaceStore";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function renderSidebar(activeTab: SidebarTab) {
  return render(
    <Suspense fallback={<div>suspended</div>}>
      <LazySidebar activeTab={activeTab} />
    </Suspense>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SidebarPanelSkeleton
// ─────────────────────────────────────────────────────────────────────────────

describe("SidebarPanelSkeleton", () => {
  it("renders with aria-busy=true", () => {
    render(<SidebarPanelSkeleton />);
    const el = document.querySelector("[aria-busy='true']");
    expect(el).not.toBeNull();
  });

  it("renders a label in aria-label when provided", () => {
    render(<SidebarPanelSkeleton label="Security" />);
    expect(document.querySelector("[aria-label='Loading Security…']")).not.toBeNull();
  });

  it("uses default aria-label when no label given", () => {
    render(<SidebarPanelSkeleton />);
    expect(document.querySelector("[aria-label='Loading panel…']")).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LazySidebar — container
// ─────────────────────────────────────────────────────────────────────────────

describe("LazySidebar container", () => {
  it("renders the sidebar container with data-testid", () => {
    renderSidebar("explorer");
    expect(screen.getByTestId("lazy-sidebar")).toBeInTheDocument();
  });

  it("sets data-active-tab attribute", () => {
    renderSidebar("git");
    const el = screen.getByTestId("lazy-sidebar");
    expect(el.getAttribute("data-active-tab")).toBe("git");
  });

  it("applies custom className", () => {
    render(<LazySidebar activeTab="explorer" className="my-custom-class" />);
    expect(screen.getByTestId("lazy-sidebar").classList.contains("my-custom-class")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Essential tab — FileExplorer (eager, no dynamic)
// ─────────────────────────────────────────────────────────────────────────────

describe("explorer tab (essential — eager load)", () => {
  it("renders FileExplorer immediately without Suspense delay", () => {
    renderSidebar("explorer");
    // FileExplorer is not lazy, so it renders synchronously
    expect(screen.getByTestId("panel-explorer")).toBeInTheDocument();
  });

  it("does NOT render other panels when explorer is active", () => {
    renderSidebar("explorer");
    expect(screen.queryByTestId("panel-git")).toBeNull();
    expect(screen.queryByTestId("panel-deployments")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Non-essential tabs — each renders the correct panel
// ─────────────────────────────────────────────────────────────────────────────

const lazyTabCases: Array<[SidebarTab, string]> = [
  ["git", "panel-git"],
  ["deployments", "panel-deployments"],
  ["identities", "panel-identities"],
  ["search", "panel-search"],
  ["security", "panel-security"],
  ["tests", "panel-tests"],
  ["network", "panel-network"],
];

describe("non-essential tabs (lazy load)", () => {
  it.each(lazyTabCases)(
    'renders the correct panel for "%s" tab',
    async (tab, testId) => {
      renderSidebar(tab as SidebarTab);
      // Show skeleton initially (loading state from dynamic mock)
      // Then wait for the lazy component to resolve
      await vi.waitFor(() => {
        expect(screen.getByTestId(testId)).toBeInTheDocument();
      });
    }
  );

  it.each(lazyTabCases)(
    'does NOT render explorer panel when "%s" is active',
    async (tab) => {
      renderSidebar(tab as SidebarTab);
      await vi.waitFor(() => {
        expect(screen.queryByTestId("panel-explorer")).toBeNull();
      });
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Only one panel is rendered at a time
// ─────────────────────────────────────────────────────────────────────────────

describe("panel exclusivity", () => {
  it("shows exactly one panel at a time", async () => {
    renderSidebar("security");
    await vi.waitFor(() => {
      expect(screen.getByTestId("panel-security")).toBeInTheDocument();
    });
    // All other panels should be absent
    const otherIds = lazyTabCases
      .filter(([tab]) => tab !== "security")
      .map(([, id]) => id);
    for (const id of otherIds) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByTestId("panel-explorer")).toBeNull();
  });
});
