"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Keyboard, RotateCcw, HelpCircle, AlertCircle } from "lucide-react";
import { useKeybindingsStore, type Keybinding } from "@/store/useKeybindingsStore";
import { CommandRegistry, type Command } from "@/lib/commands/CommandRegistry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function formatKeybinding(binding: Keybinding): string {
  const parts: string[] = [];
  const isMac = typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("mac");

  if (binding.metaKey) parts.push(isMac ? "⌘" : "Win");
  if (binding.ctrlKey) parts.push(isMac ? "⌃" : "Ctrl");
  if (binding.altKey) parts.push(isMac ? "⌥" : "Alt");
  if (binding.shiftKey) parts.push(isMac ? "⇧" : "Shift");

  let keyDisplay = binding.key;
  if (keyDisplay === " ") keyDisplay = "Space";
  else if (keyDisplay.length === 1) keyDisplay = keyDisplay.toUpperCase();
  else {
    // Capitalize first letter of word keys (e.g. Enter, ArrowUp)
    keyDisplay = keyDisplay.charAt(0).toUpperCase() + keyDisplay.slice(1);
  }

  parts.push(keyDisplay);
  return parts.join(" + ");
}

const VS_CODE_PRESETS: Record<string, Keybinding> = {
  "ide.saveFile": { key: "s", metaKey: true },
  "ide.build": { key: "b", ctrlKey: true, shiftKey: true },
  "ide.openFileFinder": { key: "p", metaKey: true },
  "ide.openSearch": { key: "f", metaKey: true, shiftKey: true },
  "ide.openCommandPalette": { key: "p", metaKey: true, shiftKey: true },
  "ide.openHotkeys": { key: ",", metaKey: true }, // Map settings/hotkeys
};

export function KeyboardShortcutEditor() {
  const { customBindings, setBinding, resetBinding, resetAll } = useKeybindingsStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [recordingCmdId, setRecordingCmdId] = useState<string | null>(null);
  const recordingRef = useRef<string | null>(null);

  recordingRef.current = recordingCmdId;

  // Keypress listener during recording mode
  useEffect(() => {
    if (!recordingCmdId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const ignoredKeys = ["control", "shift", "meta", "alt", "capslock"];
      if (ignoredKeys.includes(e.key.toLowerCase())) {
        return; // Wait for the main key
      }

      const activeId = recordingRef.current;
      if (!activeId) return;

      const newBinding: Keybinding = {
        key: e.key.toLowerCase(),
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      };

      // Check conflicts
      const conflicts = CommandRegistry.checkConflicts(newBinding, activeId);
      if (conflicts.length > 0) {
        const conflictNames = conflicts.map(c => `'${c.title}'`).join(", ");
        toast.warning(`Warning: Conflict detected with existing command: ${conflictNames}. Binding overridden.`);
      }

      setBinding(activeId, newBinding);
      toast.success(`Shortcut for '${CommandRegistry.getCommand(activeId)?.title}' updated to '${formatKeybinding(newBinding)}'`);
      setRecordingCmdId(null);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [recordingCmdId, setBinding]);

  const allCommands = CommandRegistry.getAllCommands();
  
  const filteredCommands = allCommands.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const applyVsCodePreset = () => {
    Object.entries(VS_CODE_PRESETS).forEach(([cmdId, binding]) => {
      setBinding(cmdId, binding);
    });
    toast.success("Applied VS Code Keyboard Shortcuts preset!");
  };

  const handleResetAll = () => {
    if (window.confirm("Are you sure you want to reset all keyboard shortcuts to their defaults?")) {
      resetAll();
      toast.success("All shortcuts reset to defaults.");
    }
  };

  return (
    <div className="space-y-4 max-h-[480px] overflow-hidden flex flex-col h-full pr-1">
      {/* Search and Action Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search commands by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={applyVsCodePreset}
          className="h-8 text-xs font-semibold px-3"
          title="Map shortcuts like VS Code (e.g. Cmd+Shift+P for Command Palette)"
        >
          VS Code Preset
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleResetAll}
          className="h-8 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          Reset All
        </Button>
      </div>

      {recordingCmdId && (
        <div className="bg-primary/10 border border-primary/20 text-foreground text-xs p-2 rounded-lg flex items-center gap-2 animate-pulse">
          <Keyboard className="h-4 w-4 text-primary shrink-0" />
          <span>Recording keypress. Press the key combination for <strong>'{CommandRegistry.getCommand(recordingCmdId)?.title}'</strong>...</span>
        </div>
      )}

      {/* Shortcuts List */}
      <ScrollArea className="flex-1 border rounded-lg max-h-[360px]">
        {filteredCommands.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground flex flex-col items-center justify-center gap-1.5">
            <HelpCircle className="h-6 w-6 opacity-30" />
            <span>No commands found matching search.</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredCommands.map((cmd) => {
              const currentBinding = CommandRegistry.getActiveKeybinding(cmd.id);
              const isCustomized = !!customBindings[cmd.id];
              const isRecordingThis = recordingCmdId === cmd.id;

              return (
                <div
                  key={cmd.id}
                  className="p-3 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-primary tracking-wide">
                        {cmd.category}
                      </span>
                      {isCustomized && (
                        <Badge variant="outline" className="text-[8px] h-4 py-0 leading-none border-primary/30 text-primary bg-primary/5">
                          Customized
                        </Badge>
                      )}
                    </div>
                    <h4 className="text-xs font-semibold text-foreground truncate">{cmd.title}</h4>
                    <p className="text-[10px] text-muted-foreground truncate max-w-sm">
                      {cmd.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Keybinding display / action */}
                    <button
                      onClick={() => setRecordingCmdId(isRecordingThis ? null : cmd.id)}
                      className={`h-7 px-2.5 rounded text-[10px] font-mono border transition-all ${
                        isRecordingThis
                          ? "bg-primary text-primary-foreground border-primary animate-pulse"
                          : "bg-secondary text-foreground hover:bg-muted border-border"
                      }`}
                      title={isRecordingThis ? "Click to cancel recording" : "Click to record new shortcut"}
                    >
                      {isRecordingThis
                        ? "Recording..."
                        : currentBinding
                        ? formatKeybinding(currentBinding)
                        : "Configure"}
                    </button>

                    {/* Reset single binding */}
                    {isCustomized && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          resetBinding(cmd.id);
                          toast.success(`Reset shortcut for '${cmd.title}' to default.`);
                        }}
                        className="w-7 h-7 hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Reset to default keybinding"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
