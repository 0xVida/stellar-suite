import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutlineView } from "../OutlineView";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useEditorStore } from "@/store/editorStore";

// Mock stores
vi.mock("@/store/workspaceStore");
vi.mock("@/store/editorStore");

describe("OutlineView", () => {
  const mockJumpToLine = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default editor store mock
    vi.mocked(useEditorStore).mockReturnValue({
      jumpToLine: mockJumpToLine,
      setJumpToLine: vi.fn(),
    });
  });

  it("should show 'No file selected' when no active file", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: [],
      files: [],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    expect(screen.getByText("No file selected")).toBeInTheDocument();
  });

  it("should show message for non-Rust files", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["test.toml"],
      files: [
        {
          name: "test.toml",
          type: "file",
          content: "[package]\nname = 'test'",
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    expect(
      screen.getByText("Outline view is only available for Rust files (.rs)")
    ).toBeInTheDocument();
  });

  it("should show 'No symbols found' for empty Rust file", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["empty.rs"],
      files: [
        {
          name: "empty.rs",
          type: "file",
          content: "// Just a comment",
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    expect(screen.getByText("No symbols found in this file")).toBeInTheDocument();
  });

  it("should display struct symbols", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["lib.rs"],
      files: [
        {
          name: "lib.rs",
          type: "file",
          content: `
pub struct MyStruct;
struct PrivateStruct;
`,
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    expect(screen.getByText("MyStruct")).toBeInTheDocument();
    expect(screen.getByText("PrivateStruct")).toBeInTheDocument();
    expect(screen.getByText("2 symbols")).toBeInTheDocument();
  });

  it("should display function symbols", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["lib.rs"],
      files: [
        {
          name: "lib.rs",
          type: "file",
          content: `
pub fn public_fn() {}
fn private_fn() {}
`,
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    expect(screen.getByText("public_fn")).toBeInTheDocument();
    expect(screen.getByText("private_fn")).toBeInTheDocument();
  });

  it("should display impl blocks with methods", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["lib.rs"],
      files: [
        {
          name: "lib.rs",
          type: "file",
          content: `
impl MyContract {
    pub fn init() {}
    fn helper() {}
}
`,
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    expect(screen.getByText("impl MyContract")).toBeInTheDocument();
    expect(screen.getByText("init")).toBeInTheDocument();
    expect(screen.getByText("helper")).toBeInTheDocument();
  });

  it("should call jumpToLine when symbol is clicked", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["lib.rs"],
      files: [
        {
          name: "lib.rs",
          type: "file",
          content: `
pub struct MyStruct;
pub fn my_function() {}
`,
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    
    const structButton = screen.getByText("MyStruct");
    fireEvent.click(structButton);
    
    expect(mockJumpToLine).toHaveBeenCalledWith(2);
  });

  it("should call custom onSymbolClick if provided", () => {
    const customHandler = vi.fn();
    
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["lib.rs"],
      files: [
        {
          name: "lib.rs",
          type: "file",
          content: `pub struct MyStruct;`,
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView onSymbolClick={customHandler} />);
    
    const structButton = screen.getByText("MyStruct");
    fireEvent.click(structButton);
    
    expect(customHandler).toHaveBeenCalledWith(1);
    expect(mockJumpToLine).not.toHaveBeenCalled();
  });

  it("should show visibility badges for public symbols", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["lib.rs"],
      files: [
        {
          name: "lib.rs",
          type: "file",
          content: `
pub struct PublicStruct;
struct PrivateStruct;
`,
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    const pubBadges = screen.getAllByText("pub");
    expect(pubBadges).toHaveLength(1);
  });

  it("should expand/collapse impl blocks", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["lib.rs"],
      files: [
        {
          name: "lib.rs",
          type: "file",
          content: `
impl MyContract {
    pub fn method1() {}
    pub fn method2() {}
}
`,
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    
    // Methods should be visible initially
    expect(screen.getByText("method1")).toBeInTheDocument();
    expect(screen.getByText("method2")).toBeInTheDocument();
    
    // Click to collapse
    const implButton = screen.getByText("impl MyContract");
    fireEvent.click(implButton);
    
    // Methods should be removed from DOM when collapsed
    expect(screen.queryByText("method1")).not.toBeInTheDocument();
    expect(screen.queryByText("method2")).not.toBeInTheDocument();
  });

  it("should handle nested file structure", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["contracts", "lib.rs"],
      files: [
        {
          name: "contracts",
          type: "folder",
          children: [
            {
              name: "lib.rs",
              type: "file",
              content: `pub struct MyStruct;`,
            },
          ],
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    expect(screen.getByText("MyStruct")).toBeInTheDocument();
  });

  it("should parse complex Soroban contract", () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({
      activeTabPath: ["lib.rs"],
      files: [
        {
          name: "lib.rs",
          type: "file",
          content: `
#![no_std]
use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env) -> String {
        String::from_str(&env, "Hello")
    }
}

mod test;
`,
        },
      ],
      cursorPos: { line: 1, col: 1 },
    } as any);

    render(<OutlineView />);
    
    expect(screen.getByText("HelloContract")).toBeInTheDocument();
    expect(screen.getByText("impl HelloContract")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("test")).toBeInTheDocument();
  });
});
