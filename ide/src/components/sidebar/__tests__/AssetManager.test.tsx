import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetManager } from "../AssetManager";
import { useWorkspaceStore } from "@/store/workspaceStore";
import React from "react";

// Mock the workspace store
vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceStore: vi.fn(),
}));

const mockFiles = [
  {
    name: "assets",
    type: "folder",
    children: [
      {
        name: "logo.svg",
        type: "file",
        content: "<svg>test</svg>",
      },
      {
        name: "banner.png",
        type: "file",
        content: "base64",
      },
      {
        name: "document.txt",
        type: "file",
        content: "text",
      },
    ],
  },
];

describe("AssetManager", () => {
  it("renders the asset library with filtered image/svg files", () => {
    (useWorkspaceStore as any).mockReturnValue({ files: mockFiles });

    render(<AssetManager />);

    expect(screen.getByRole("heading", { name: /assets/i })).toBeDefined();
    expect(screen.getByTitle("logo.svg")).toBeDefined();
    expect(screen.getByTitle("banner.png")).toBeDefined();
    
    // Should NOT show non-image files
    expect(screen.queryByTitle("document.txt")).toBeNull();
  });

  it("shows asset details when an asset is clicked", () => {
    (useWorkspaceStore as any).mockReturnValue({ files: mockFiles });

    render(<AssetManager />);

    const svgAsset = screen.getByTitle("logo.svg");
    fireEvent.click(svgAsset);

    expect(screen.getByText(/asset details/i)).toBeDefined();
    expect(screen.getAllByText("logo.svg").length).toBeGreaterThan(0);
    // Text content is lowercase ("svg"); CSS uppercases it visually.
    expect(screen.getByText("svg")).toBeDefined();
    expect(screen.getByText("Vector")).toBeDefined();
  });

  it("filters assets by search query", () => {
    (useWorkspaceStore as any).mockReturnValue({ files: mockFiles });

    render(<AssetManager />);

    const searchInput = screen.getByPlaceholderText("Search assets...");
    fireEvent.change(searchInput, { target: { value: "logo" } });

    expect(screen.getByTitle("logo.svg")).toBeDefined();
    expect(screen.queryByTitle("banner.png")).toBeNull();
  });
});
