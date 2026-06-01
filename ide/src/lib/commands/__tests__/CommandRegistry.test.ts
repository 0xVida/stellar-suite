/**
 * src/lib/commands/__tests__/CommandRegistry.test.ts
 * ============================================================
 * Unit tests for the Command Registry — Issue #828
 * ============================================================
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the zustand store so tests are isolated from localStorage ──────────
vi.mock("@/store/useKeybindingsStore", () => {
  let customBindings: Record<string, unknown> = {};
  return {
    useKeybindingsStore: {
      getState: () => ({ customBindings }),
      // helper exposed for tests
      __setBindings: (b: Record<string, unknown>) => {
        customBindings = b;
      },
    },
    Keybinding: {},
  };
});

import { CommandRegistry } from "../CommandRegistry";
import type { Command } from "../CommandRegistry";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeHelper = (vi.mocked as any)(
  async () => await import("@/store/useKeybindingsStore")
);
void storeHelper;

// Grab the mocked helper via the module cache
import { useKeybindingsStore } from "@/store/useKeybindingsStore";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __setBindings = (useKeybindingsStore as any).__setBindings as (
  b: Record<string, unknown>
) => void;

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCommand(id: string, overrides: Partial<Command> = {}): Command {
  return {
    id,
    title: `Title for ${id}`,
    description: `Desc for ${id}`,
    category: "Editor",
    defaultKeys: { key: "k", ctrlKey: true },
    action: vi.fn(),
    ...overrides,
  };
}

// ── Clean registry between tests ─────────────────────────────────────────────

beforeEach(() => {
  // Unregister any commands left over from previous tests
  CommandRegistry.getAllCommands().forEach((cmd) =>
    CommandRegistry.unregister(cmd.id)
  );
  // Reset custom bindings
  __setBindings({});
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CommandRegistry — register / unregister", () => {
  it("registers a command and makes it retrievable", () => {
    const cmd = makeCommand("test.save");
    CommandRegistry.register(cmd);

    expect(CommandRegistry.getCommand("test.save")).toBeDefined();
    expect(CommandRegistry.getCommand("test.save")?.title).toBe("Title for test.save");
  });

  it("getAllCommands returns all registered commands", () => {
    CommandRegistry.register(makeCommand("cmd.a"));
    CommandRegistry.register(makeCommand("cmd.b"));
    CommandRegistry.register(makeCommand("cmd.c"));

    const ids = CommandRegistry.getAllCommands().map((c) => c.id);
    expect(ids).toContain("cmd.a");
    expect(ids).toContain("cmd.b");
    expect(ids).toContain("cmd.c");
  });

  it("unregister removes the command", () => {
    CommandRegistry.register(makeCommand("cmd.remove"));
    CommandRegistry.unregister("cmd.remove");

    expect(CommandRegistry.getCommand("cmd.remove")).toBeUndefined();
  });

  it("getCommand returns undefined for unknown ids", () => {
    expect(CommandRegistry.getCommand("nonexistent.cmd")).toBeUndefined();
  });

  it("re-registering a command overwrites the previous entry", () => {
    const first = makeCommand("cmd.overwrite", { title: "First" });
    const second = makeCommand("cmd.overwrite", { title: "Second" });
    CommandRegistry.register(first);
    CommandRegistry.register(second);

    expect(CommandRegistry.getCommand("cmd.overwrite")?.title).toBe("Second");
    // Only one entry
    expect(
      CommandRegistry.getAllCommands().filter((c) => c.id === "cmd.overwrite")
    ).toHaveLength(1);
  });
});

describe("CommandRegistry — execute", () => {
  it("calls the command action when executed by id", () => {
    const action = vi.fn();
    CommandRegistry.register(makeCommand("cmd.exec", { action }));
    CommandRegistry.execute("cmd.exec");
    expect(action).toHaveBeenCalledOnce();
  });

  it("does not throw when executing an unknown id", () => {
    expect(() => CommandRegistry.execute("does.not.exist")).not.toThrow();
  });
});

describe("CommandRegistry — getActiveKeybinding", () => {
  it("returns defaultKeys when no custom binding exists", () => {
    const defaultKeys = { key: "s", ctrlKey: true };
    CommandRegistry.register(makeCommand("cmd.keybind", { defaultKeys }));

    const active = CommandRegistry.getActiveKeybinding("cmd.keybind");
    expect(active).toEqual(defaultKeys);
  });

  it("returns custom binding over default when one is set", () => {
    const defaultKeys = { key: "s", ctrlKey: true };
    const customKey = { key: "p", metaKey: true };
    CommandRegistry.register(makeCommand("cmd.custom", { defaultKeys }));
    __setBindings({ "cmd.custom": customKey });

    const active = CommandRegistry.getActiveKeybinding("cmd.custom");
    expect(active).toEqual(customKey);
  });

  it("returns null for commands with no default keys and no custom binding", () => {
    CommandRegistry.register(makeCommand("cmd.nokeys", { defaultKeys: null }));
    expect(CommandRegistry.getActiveKeybinding("cmd.nokeys")).toBeNull();
  });
});

describe("CommandRegistry — checkConflicts", () => {
  it("detects a conflicting keybinding", () => {
    CommandRegistry.register(
      makeCommand("cmd.conflict.a", { defaultKeys: { key: "x", ctrlKey: true } })
    );
    CommandRegistry.register(
      makeCommand("cmd.conflict.b", { defaultKeys: { key: "y", ctrlKey: true } })
    );

    // "x + ctrl" conflicts with cmd.conflict.a
    const conflicts = CommandRegistry.checkConflicts({ key: "x", ctrlKey: true });
    const conflictIds = conflicts.map((c) => c.id);
    expect(conflictIds).toContain("cmd.conflict.a");
    expect(conflictIds).not.toContain("cmd.conflict.b");
  });

  it("ignores the specified command id in conflict check", () => {
    CommandRegistry.register(
      makeCommand("cmd.ignore", { defaultKeys: { key: "z", ctrlKey: true } })
    );

    // Checking the same binding but ignoring cmd.ignore → no conflicts
    const conflicts = CommandRegistry.checkConflicts(
      { key: "z", ctrlKey: true },
      "cmd.ignore"
    );
    expect(conflicts).toHaveLength(0);
  });

  it("returns empty array when no conflicts exist", () => {
    CommandRegistry.register(
      makeCommand("cmd.unique", { defaultKeys: { key: "q", altKey: true } })
    );

    const conflicts = CommandRegistry.checkConflicts({ key: "w", altKey: true });
    expect(conflicts).toHaveLength(0);
  });

  it("treats key comparison as case-insensitive", () => {
    CommandRegistry.register(
      makeCommand("cmd.case", { defaultKeys: { key: "A", ctrlKey: true } })
    );

    const conflicts = CommandRegistry.checkConflicts({ key: "a", ctrlKey: true });
    expect(conflicts.map((c) => c.id)).toContain("cmd.case");
  });
});

describe("CommandRegistry — handleKeyboardEvent", () => {
  it("fires the matching command and returns true", () => {
    const action = vi.fn();
    CommandRegistry.register(
      makeCommand("cmd.kbd", { defaultKeys: { key: "Enter", ctrlKey: true }, action })
    );

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
    });
    const preventDefault = vi.spyOn(event, "preventDefault");
    const stopPropagation = vi.spyOn(event, "stopPropagation");

    const handled = CommandRegistry.handleKeyboardEvent(event);
    expect(handled).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it("returns false when no command matches", () => {
    const event = new KeyboardEvent("keydown", { key: "F12" });
    const handled = CommandRegistry.handleKeyboardEvent(event);
    expect(handled).toBe(false);
  });

  it("does not fire when modifier mismatch", () => {
    const action = vi.fn();
    CommandRegistry.register(
      makeCommand("cmd.mod", {
        defaultKeys: { key: "s", ctrlKey: true },
        action,
      })
    );

    // No ctrlKey pressed
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: false });
    CommandRegistry.handleKeyboardEvent(event);
    expect(action).not.toHaveBeenCalled();
  });
});
