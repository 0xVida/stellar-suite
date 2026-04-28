"use client";

import { useCallback, useMemo, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { redactString, type RedactionResult } from "@/lib/redaction/redact";

// ---------------------------------------------------------------------------
// Persistent store — privacy by default
// ---------------------------------------------------------------------------

interface RedactionStoreState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useRedactionStore = create<RedactionStoreState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: "stellar-suite:log-redaction",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : undefinedStorage,
      ),
    },
  ),
);

const undefinedStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
} as Storage;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useRedaction() {
  const enabled = useRedactionStore((s) => s.enabled);
  const setEnabled = useRedactionStore((s) => s.setEnabled);

  const apply = useCallback(
    (input: string): RedactionResult => {
      if (!enabled) {
        return { redacted: input, count: 0, hits: [] };
      }
      return redactString(input);
    },
    [enabled],
  );

  return { enabled, setEnabled, apply };
}

/** Lightweight string helper for components that just need the masked text. */
export function useRedactedText(input: string): string {
  const enabled = useRedactionStore((s) => s.enabled);
  return useMemo(
    () => (enabled ? redactString(input).redacted : input),
    [enabled, input],
  );
}

// ---------------------------------------------------------------------------
// Inline component
// ---------------------------------------------------------------------------

export function Redacted({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const masked = useRedactedText(text);
  return <span className={className}>{masked}</span>;
}

// ---------------------------------------------------------------------------
// Toggle widget — privacy by default with confirmation when revealing
// ---------------------------------------------------------------------------

export interface LogRedactorProps {
  className?: string;
  compact?: boolean;
}

export function LogRedactor({ className, compact = false }: LogRedactorProps) {
  const { enabled, setEnabled } = useRedaction();
  const [confirming, setConfirming] = useState(false);

  const handleToggle = () => {
    if (enabled) {
      // turning OFF — require confirmation since this reveals secrets
      setConfirming(true);
    } else {
      // turning back ON is always safe
      setEnabled(true);
    }
  };

  const handleConfirmUnredact = () => {
    setEnabled(false);
    setConfirming(false);
  };

  const Icon = enabled ? EyeOff : Eye;
  const label = enabled ? "Redacted" : "Unredacted";

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={!enabled}
        aria-label={
          enabled ? "Show sensitive log values" : "Hide sensitive log values"
        }
        title={
          enabled
            ? "Sensitive values are masked. Click to reveal."
            : "Sensitive values are visible. Click to mask."
        }
        className={
          "inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] transition-colors " +
          (enabled
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20") +
          (className ? ` ${className}` : "")
        }
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {!compact && <span>{label}</span>}
      </button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" aria-hidden="true" />
              Reveal sensitive log values?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Turning off redaction exposes secret keys, JWTs, and other
              high-entropy tokens in the Events and Terminal panels. Anyone with
              a screenshot or screen-share can read them. Re-enable redaction as
              soon as you're done.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep redacted</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUnredact}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              Reveal anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default LogRedactor;
