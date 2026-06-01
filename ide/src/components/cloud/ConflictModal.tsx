"use client";

/**
 * ConflictModal.tsx
 *
 * Shown when the server returns HTTP 409 (the cloud copy was modified
 * after the client's last-known timestamp). The user picks whether to
 * keep their local edits or pull the cloud version.
 */

import { AlertTriangle, Cloud, HardDrive } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { buildFileTree, type ProjectData } from "@/lib/cloud/cloudSyncService";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type { TabInfo } from "@/lib/cloud/cloudSyncService";
import type { FileNode } from "@/lib/sample-contracts";

interface ConflictModalProps {
  conflictData: ProjectData;
}

export function ConflictModal({ conflictData }: ConflictModalProps) {
  const { resolveConflict, triggerSave, projectId, projectName, lastSyncedAt } =
    useCloudSyncStore();
  const { files, network, setFiles, openTabs: currentOpenTabs, setOpenTabs, activeTabPath: currentActiveTabPath, setActiveTabPath } = useWorkspaceStore();
  const flatFiles = useWorkspaceStore((s) =>
    s.files.flatMap(function flatten(
      node: FileNode,
      parentPath: string[] = [],
    ): Array<{ path: string; content: string }> {
      const currentPath = [...parentPath, node.name];
      if (node.type === "folder") {
        return (node.children ?? []).flatMap((c) => flatten(c, currentPath));
      }
      return [{ path: currentPath.join("/"), content: node.content ?? "" }];
    }),
  );

  const cloudDate = new Date(conflictData.updatedAt).toLocaleString();
  const localDate = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString()
    : "never synced";

  const handleKeepLocal = () => {
    resolveConflict("local");
    // Force a save immediately with local content and tab state
    void triggerSave("__force__", flatFiles, network, currentOpenTabs, currentActiveTabPath);
  };

  const handleUseCloud = () => {
    const tree = buildFileTree(conflictData.files) as FileNode[];
    setFiles(tree);
    // Also sync tab state from cloud
    if (conflictData.openTabs) {
      setOpenTabs(conflictData.openTabs);
    }
    if (conflictData.activeTabPath) {
      setActiveTabPath(conflictData.activeTabPath);
    }
    resolveConflict("cloud");
  };

  return (
    <Dialog open>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Sync Conflict — {conflictData.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1 text-xs text-muted-foreground">
          <p>
            The cloud version of this project was updated after your last sync.
            Choose which version to keep:
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Local */}
            <div className="rounded border border-border bg-secondary/50 p-3">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <HardDrive className="h-3.5 w-3.5 text-primary" />
                Local version
              </div>
              <p className="text-[11px]">Last synced: {localDate}</p>
              <p className="text-[11px]">{flatFiles.length} file(s)</p>
              <p className="text-[11px]">{currentOpenTabs.length} tab(s) open</p>
            </div>

            {/* Cloud */}
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <Cloud className="h-3.5 w-3.5 text-amber-400" />
                Cloud version
              </div>
              <p className="text-[11px]">Updated: {cloudDate}</p>
              <p className="text-[11px]">{conflictData.files.length} file(s)</p>
              {conflictData.openTabs && conflictData.openTabs.length > 0 && (
                <p className="text-[11px]">{conflictData.openTabs.length} tab(s) open</p>
              )}
            </div>
          </div>

          <p className="rounded border border-border bg-muted/30 px-2 py-1.5 text-[11px]">
            <strong className="text-foreground">Keep Local</strong> — overwrites
            the cloud with your current files.
            <br />
            <strong className="text-foreground">Use Cloud</strong> — replaces
            your local workspace with the cloud version.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleKeepLocal}>
            <HardDrive className="mr-1.5 h-3.5 w-3.5" />
            Keep Local
          </Button>
          <Button size="sm" onClick={handleUseCloud}>
            <Cloud className="mr-1.5 h-3.5 w-3.5" />
            Use Cloud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
