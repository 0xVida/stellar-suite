"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { CopyToClipboard } from "@/components/ide/CopyToClipboard";
import { checksumXdrPayload } from "@/utils/XdrChecksum";

interface XdrChecksumCardProps {
  xdr: string;
  title?: string;
  description?: string;
}

export function XdrChecksumCard({
  xdr,
  title = "SHA-256 Checksum",
  description = "Use this digest to verify the exported XDR was not altered in transit.",
}: XdrChecksumCardProps) {
  const [checksum, setChecksum] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadChecksum = async () => {
      if (!xdr.trim()) {
        setChecksum("");
        setError(null);
        return;
      }

      try {
        const result = await checksumXdrPayload(xdr);
        if (!cancelled) {
          setChecksum(result.checksum);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setChecksum("");
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to generate an XDR checksum.",
          );
        }
      }
    };

    void loadChecksum();

    return () => {
      cancelled = true;
    };
  }, [xdr]);

  return (
    <div className="rounded-md border border-border bg-background/70 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
        {checksum ? (
          <CopyToClipboard
            text={checksum}
            label="Copy checksum"
            copiedLabel="Checksum copied!"
          />
        ) : null}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <code className="break-all text-[11px] text-emerald-200">{checksum || "Calculating..."}</code>
        </div>
      )}
    </div>
  );
}
