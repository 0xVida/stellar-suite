"use client";

import { useState } from "react";
import { Plus, Trash2, Terminal, Webhook, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  usePostBuildHooksStore,
  HookType,
  PostBuildHook,
} from "@/store/usePostBuildHooksStore";

const EMPTY_HOOK: Omit<PostBuildHook, "id"> = {
  enabled: true,
  type: "script",
  command: "",
  webhookUrl: "",
  label: "",
};

export default function PostBuildHooksSettings() {
  const { hooks, addHook, updateHook, removeHook, toggleHook } =
    usePostBuildHooksStore();

  const [draft, setDraft] = useState<Omit<PostBuildHook, "id">>(EMPTY_HOOK);
  const [adding, setAdding] = useState(false);

  function handleAdd() {
    const trimmedCommand = draft.command.trim();
    const trimmedUrl = draft.webhookUrl.trim();

    if (draft.type === "script" && !trimmedCommand) return;
    if (draft.type === "webhook" && !trimmedUrl) return;

    addHook({
      ...draft,
      label: draft.label.trim() || (draft.type === "script" ? trimmedCommand : trimmedUrl),
    });
    setDraft(EMPTY_HOOK);
    setAdding(false);
  }

  function handleTypeChange(type: HookType) {
    setDraft((d) => ({ ...d, type }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Post-Build Hooks</CardTitle>
        <CardDescription>
          Run scripts or trigger webhooks automatically after a successful build.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hooks.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No hooks configured.</p>
        )}

        <div className="space-y-2">
          {hooks.map((hook) => (
            <HookRow
              key={hook.id}
              hook={hook}
              onToggle={() => toggleHook(hook.id)}
              onRemove={() => removeHook(hook.id)}
              onUpdate={(patch) => updateHook(hook.id, patch)}
            />
          ))}
        </div>

        {adding ? (
          <div className="border rounded-md p-4 space-y-3">
            <p className="text-sm font-medium">New hook</p>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={draft.type === "script" ? "default" : "outline"}
                onClick={() => handleTypeChange("script")}
                className="gap-1"
              >
                <Terminal className="h-3 w-3" />
                Script
              </Button>
              <Button
                size="sm"
                variant={draft.type === "webhook" ? "default" : "outline"}
                onClick={() => handleTypeChange("webhook")}
                className="gap-1"
              >
                <Webhook className="h-3 w-3" />
                Webhook
              </Button>
            </div>

            <Input
              placeholder="Label (optional)"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />

            {draft.type === "script" ? (
              <Input
                placeholder="Shell command, e.g. npm test"
                value={draft.command}
                onChange={(e) => setDraft((d) => ({ ...d, command: e.target.value }))}
                className="font-mono text-sm"
              />
            ) : (
              <Input
                placeholder="Webhook URL, e.g. https://example.com/hook"
                value={draft.webhookUrl}
                onChange={(e) => setDraft((d) => ({ ...d, webhookUrl: e.target.value }))}
              />
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd}>
                Add Hook
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAdding(false);
                  setDraft(EMPTY_HOOK);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />
            Add Hook
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface HookRowProps {
  hook: PostBuildHook;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<Omit<PostBuildHook, "id">>) => void;
}

function HookRow({ hook, onToggle, onRemove, onUpdate }: HookRowProps) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(hook.label);
  const [editValue, setEditValue] = useState(
    hook.type === "script" ? hook.command : hook.webhookUrl,
  );

  function saveEdit() {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    onUpdate(
      hook.type === "script"
        ? { command: trimmed, label: editLabel.trim() || trimmed }
        : { webhookUrl: trimmed, label: editLabel.trim() || trimmed },
    );
    setEditing(false);
  }

  return (
    <div className="flex items-start gap-2 border rounded-md p-3">
      <button
        onClick={onToggle}
        className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
        title={hook.enabled ? "Disable hook" : "Enable hook"}
      >
        {hook.enabled ? (
          <ToggleRight className="h-5 w-5 text-green-500" />
        ) : (
          <ToggleLeft className="h-5 w-5" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {hook.type === "script" ? (
            <Terminal className="h-3 w-3" />
          ) : (
            <Webhook className="h-3 w-3" />
          )}
          <span className="uppercase tracking-wide">{hook.type}</span>
        </div>

        {editing ? (
          <div className="space-y-1.5">
            <Input
              placeholder="Label (optional)"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="h-7 text-sm"
            />
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="h-7 text-sm font-mono"
            />
            <div className="flex gap-1">
              <Button size="sm" className="h-6 text-xs" onClick={saveEdit}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => {
                  setEditing(false);
                  setEditLabel(hook.label);
                  setEditValue(hook.type === "script" ? hook.command : hook.webhookUrl);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            className="text-sm font-mono text-left truncate w-full hover:underline"
            onClick={() => setEditing(true)}
            title="Click to edit"
          >
            {hook.label || (hook.type === "script" ? hook.command : hook.webhookUrl)}
          </button>
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        title="Remove hook"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
