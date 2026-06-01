"use client";

/**
 * SaveToCloudButton.tsx
 *
 * Toolbar button that triggers an immediate cloud save.
 * Shows live sync status (idle → saving → saved / error).
 * Only rendered when the user is authenticated.
 */

import { AlertCircle, Check, Cloud, CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { useWorkspaceStore, flattenWorkspaceFiles } from "@/store/workspaceStore";
import { useAuth } from "@/hooks/useAuth";

export function SaveToCloudButton({ disabled }: { disabled?: boolean }) {
  const { user, isAuthenticated } = useAuth();
  const { syncStatus, errorMessage, clearError, triggerSave } =
    useCloudSyncStore();
  const { files, network, openTabs, activeTabPath } = useWorkspaceStore();

  if (!isAuthenticated || !user) return null;

  const handleSave = () => {
    if (syncStatus === "saving" || syncStatus === "loading") return;
    if (syncStatus === "error") clearError();
    void triggerSave(user.id ?? user.email ?? "anon", flattenWorkspaceFiles(files), network, openTabs, activeTabPath);
  };

  const icon =
    syncStatus === "saving" || syncStatus === "loading" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : syncStatus === "saved" ? (
      <Check className="h-3.5 w-3.5 text-emerald-400" />
    ) : syncStatus === "error" ? (
      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
    ) : syncStatus === "conflict" ? (
      <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
    ) : (
      <CloudUpload className="h-3.5 w-3.5" />
    );

  const label =
    syncStatus === "saving"
      ? "Saving…"
      : syncStatus === "saved"
        ? "Saved"
        : syncStatus === "error"
          ? "Save failed"
          : syncStatus === "conflict"
            ? "Conflict"
            : "Save to Cloud";

  const tooltipText =
    syncStatus === "error" && errorMessage
      ? errorMessage
      : syncStatus === "conflict"
        ? "A newer cloud version exists — resolve the conflict"
        : "Save project to the cloud";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={syncStatus === "saving" || syncStatus === "loading" || !!disabled}
          className={`h-8 gap-1.5 text-xs ${
            syncStatus === "saved"
              ? "text-emerald-400"
              : syncStatus === "error"
                ? "text-destructive"
                : syncStatus === "conflict"
                  ? "text-amber-400"
                  : ""
          }`}
          aria-label={label}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}
