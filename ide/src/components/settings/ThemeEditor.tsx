"use client";

import { useMemo } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  type BrandThemeTokens,
  type HslToken,
  useUserSettingsStore,
} from "@/store/useUserSettingsStore";

type ThemeKey = keyof BrandThemeTokens;
type Channel = keyof HslToken;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function hslToRgb(token: HslToken) {
  const h = token.h / 360;
  const s = token.s / 100;
  const l = token.l / 100;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function relativeLuminance(token: HslToken) {
  const { r, g, b } = hslToRgb(token);
  const toLinear = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };

  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);

  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(a: HslToken, b: HslToken) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function autoForeground(token: HslToken): HslToken {
  return token.l > 45
    ? { h: 220, s: 20, l: 8 }
    : { h: 210, s: 20, l: 96 };
}

function tokenCss(token: HslToken) {
  return `hsl(${token.h} ${token.s}% ${token.l}%)`;
}

interface ChannelControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}

function ChannelControl({ label, value, min, max, onChange }: ChannelControlProps) {
  return (
    <div className="grid grid-cols-[52px_1fr_56px] items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-primary"
      />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-7 rounded-md border border-border bg-background px-2 text-xs"
      />
    </div>
  );
}

export function ThemeEditor() {
  const { brandTheme, setBrandTheme } = useUserSettingsStore();

  const updateChannel = (key: ThemeKey, channel: Channel, value: number) => {
    const bounds = channel === "h" ? [0, 360] : [0, 100];
    setBrandTheme({
      ...brandTheme,
      [key]: {
        ...brandTheme[key],
        [channel]: clamp(value, bounds[0], bounds[1]),
      },
    });
  };

  const checks = useMemo(() => {
    const bgFg = contrastRatio(brandTheme.background, autoForeground(brandTheme.background));
    const primaryFg = contrastRatio(brandTheme.primary, autoForeground(brandTheme.primary));
    const secondaryFg = contrastRatio(brandTheme.secondary, autoForeground(brandTheme.secondary));

    return [
      { name: "Background contrast", value: bgFg, pass: bgFg >= 4.5 },
      { name: "Primary contrast", value: primaryFg, pass: primaryFg >= 4.5 },
      { name: "Secondary contrast", value: secondaryFg, pass: secondaryFg >= 4.5 },
    ];
  }, [brandTheme]);

  const themeJson = useMemo(() => JSON.stringify(brandTheme, null, 2), [brandTheme]);

  const copyThemeJson = async () => {
    try {
      await navigator.clipboard.writeText(themeJson);
      toast.success("Theme JSON copied");
    } catch {
      toast.error("Failed to copy theme JSON");
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Stellar Kit Theme</Label>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={copyThemeJson}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Export JSON
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {([
          ["primary", "Primary"],
          ["secondary", "Secondary"],
          ["background", "Background"],
        ] as const).map(([key, label]) => {
          const token = brandTheme[key];
          return (
            <div key={key} className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <div className="h-5 w-5 rounded border border-border" style={{ backgroundColor: tokenCss(token) }} />
              </div>
              <ChannelControl
                label="Hue"
                value={token.h}
                min={0}
                max={360}
                onChange={(value) => updateChannel(key, "h", value)}
              />
              <ChannelControl
                label="Sat"
                value={token.s}
                min={0}
                max={100}
                onChange={(value) => updateChannel(key, "s", value)}
              />
              <ChannelControl
                label="Light"
                value={token.l}
                min={0}
                max={100}
                onChange={(value) => updateChannel(key, "l", value)}
              />
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {checks.map((check) => (
          <div
            key={check.name}
            className={`rounded-md border px-3 py-2 text-xs ${
              check.pass
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            <p className="font-medium">{check.name}</p>
            <p>{check.value.toFixed(2)}:1 (target 4.5:1)</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Theme JSON</Label>
        <pre className="max-h-36 overflow-auto rounded-md border border-border bg-background/70 p-3 text-[10px] leading-4">
          {themeJson}
        </pre>
      </div>
    </div>
  );
}
