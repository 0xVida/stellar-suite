"use client";

/**
 * Issue #928 — Monaco minimap & guide settings.
 *
 * Visual toggles in Settings for editor readability features: the code minimap,
 * indentation guides, and font ligatures. Each toggle persists to the
 * UserSettingsStore (zustand + localStorage), and CodeEditor reads these values
 * to configure Monaco, so changes apply fluidly without a reload.
 */
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUserSettingsStore } from "@/store/useUserSettingsStore";

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({ id, label, description, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function EditorVisualSettings() {
  const {
    editorMinimap,
    editorIndentGuides,
    editorFontLigatures,
    setEditorMinimap,
    setEditorIndentGuides,
    setEditorFontLigatures,
  } = useUserSettingsStore();

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
      <Label className="text-sm font-semibold">Editor Appearance</Label>

      <div className="space-y-4">
        <ToggleRow
          id="editor-minimap"
          label="Minimap"
          description="Show the code overview minimap on the right edge of the editor."
          checked={editorMinimap}
          onCheckedChange={setEditorMinimap}
        />
        <ToggleRow
          id="editor-indent-guides"
          label="Indent guides"
          description="Render vertical guide lines for indentation levels."
          checked={editorIndentGuides}
          onCheckedChange={setEditorIndentGuides}
        />
        <ToggleRow
          id="editor-font-ligatures"
          label="Font ligatures"
          description="Combine character sequences like => and != into single glyphs."
          checked={editorFontLigatures}
          onCheckedChange={setEditorFontLigatures}
        />
      </div>
    </div>
  );
}
