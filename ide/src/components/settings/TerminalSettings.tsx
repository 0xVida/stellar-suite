"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useUserSettingsStore, TERMINAL_THEMES, type TerminalTheme } from "@/store/useUserSettingsStore";

const FONT_FAMILIES = [
  '"JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
  '"Fira Code", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
  '"Cascadia Code", "JetBrains Mono", "Fira Code", Menlo, monospace',
  '"Source Code Pro", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
  '"Roboto Mono", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
  'Menlo, Monaco, "Courier New", monospace',
];

export function TerminalSettings() {
  const {
    terminalTheme,
    terminalFontFamily,
    terminalFontSize,
    setTerminalTheme,
    setTerminalFontFamily,
    setTerminalFontSize,
  } = useUserSettingsStore();

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
      <Label className="text-sm font-semibold">Terminal Customization</Label>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Theme</Label>
          <Select value={terminalTheme} onValueChange={(value: TerminalTheme) => setTerminalTheme(value)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default (GitHub Dark)</SelectItem>
              <SelectItem value="monokai">Monokai</SelectItem>
              <SelectItem value="solarized-dark">Solarized Dark</SelectItem>
              <SelectItem value="dracula">Dracula</SelectItem>
              <SelectItem value="gruvbox">Gruvbox</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Font Family</Label>
          <Select value={terminalFontFamily} onValueChange={setTerminalFontFamily}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((font) => (
                <SelectItem key={font} value={font}>
                  {font.split(',')[0].replace(/"/g, '')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Font Size</Label>
          <div className="flex items-center space-x-2">
            <Input
              type="number"
              min={8}
              max={24}
              value={terminalFontSize}
              onChange={(e) => setTerminalFontSize(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Preview</Label>
        <div
          className="rounded-md border border-border p-3 font-mono text-sm"
          style={{
            backgroundColor: TERMINAL_THEMES[terminalTheme].background,
            color: TERMINAL_THEMES[terminalTheme].foreground,
            fontFamily: terminalFontFamily,
            fontSize: `${terminalFontSize}px`,
          }}
        >
          <div>$ stellar contract build</div>
          <div style={{ color: TERMINAL_THEMES[terminalTheme].green }}>
            ✓ Contract compiled successfully
          </div>
          <div style={{ color: TERMINAL_THEMES[terminalTheme].blue }}>
            → Deploying to testnet...
          </div>
        </div>
      </div>
    </div>
  );
}