"use client";

import { useState } from "react";
import { LayoutGrid, Save, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLayoutStore } from "@/lib/layout/layoutStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type { SidebarTab } from "@/store/workspaceStore";

interface SaveLayoutDialogProps {
  onSave: (name: string) => void;
  onCancel: () => void;
}

function SaveLayoutDialog({ onSave, onCancel }: SaveLayoutDialogProps) {
  const [name, setName] = useState("");

  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) {
            onSave(name.trim());
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        placeholder="Layout name..."
        className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <Button
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={!name.trim()}
        onClick={() => {
          if (name.trim()) onSave(name.trim());
        }}
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

export function LayoutPicker() {
  const { snapshots, activeSnapshotId, saveSnapshot, deleteSnapshot, setActiveSnapshotId } =
    useLayoutStore();
  const {
    showExplorer,
    showPanel,
    leftSidebarTab,
    setShowExplorer,
    setShowPanel,
    setLeftSidebarTab,
  } = useWorkspaceStore();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const applySnapshot = (id: string) => {
    const snapshot = snapshots.find((s) => s.id === id);
    if (!snapshot) return;
    setShowExplorer(snapshot.showExplorer);
    setShowPanel(snapshot.showPanel);
    setLeftSidebarTab(snapshot.leftSidebarTab as SidebarTab);
    setActiveSnapshotId(id);
    setOpen(false);
  };

  const handleSave = (name: string) => {
    const snap = saveSnapshot(name, showExplorer, showPanel, leftSidebarTab);
    setActiveSnapshotId(snap.id);
    setSaving(false);
    setOpen(false);
  };

  const activeSnapshot = snapshots.find((s) => s.id === activeSnapshotId);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label="Layout presets"
          title="Layout presets"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {activeSnapshot ? activeSnapshot.name : "Layout"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {saving ? (
          <SaveLayoutDialog
            onSave={handleSave}
            onCancel={() => setSaving(false)}
          />
        ) : (
          <>
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Presets
            </div>
            {snapshots.map((snapshot, index) => (
              <DropdownMenuItem
                key={snapshot.id}
                className="flex items-center justify-between gap-2 pr-1"
                onSelect={(e) => {
                  e.preventDefault();
                  applySnapshot(snapshot.id);
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {activeSnapshotId === snapshot.id ? (
                    <Check className="h-3 w-3 shrink-0 text-primary" />
                  ) : (
                    <span className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate text-xs">{snapshot.name}</span>
                  {index < 9 ? (
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                      Alt+{index + 1}
                    </span>
                  ) : null}
                </div>
                {!snapshot.isDefault ? (
                  <button
                    type="button"
                    className="ml-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Delete layout ${snapshot.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSnapshot(snapshot.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setSaving(true);
              }}
              className="gap-2 text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              Save current layout...
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
