import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Copy, ExternalLink, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { txLink, truncateHash } from "@/utils/explorerLinks";
import { stringifyDecodedValue } from "@/utils/scValDecoder";
import { type TransactionResultEntry } from "@/store/useTransactionResultsStore";
import { SimulationComparison } from "@/components/ide/SimulationComparison";

interface TransactionResultLogProps {
  entry: TransactionResultEntry;
}

export function TransactionResultLog({ entry }: TransactionResultLogProps) {
  const [expanded, setExpanded] = useState(true);

  const decodedText = useMemo(() => stringifyDecodedValue(entry.decodedResult), [entry.decodedResult]);
  const explorerUrl = txLink(entry.network, entry.txHash);

  const handleCopy = (text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
  };

  const statusIcon = entry.status === "success" ? (
    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
  ) : (
    <XCircle className="h-4 w-4 text-destructive" aria-hidden />
  );

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {statusIcon}
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span>{entry.fnName}</span>
              <span className="text-[11px] text-muted-foreground">{entry.status === "success" ? "Success" : "Error"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(entry.timestamp).toLocaleTimeString()}</span>
              {entry.durationMs !== undefined && <span>{entry.durationMs}ms</span>}
              {entry.source && <span className="uppercase tracking-wide">{entry.source}</span>}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded((prev) => !prev)} aria-label={expanded ? "Collapse" : "Expand"}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">TxHash</span>
            {explorerUrl && entry.txHash ? (
              <a className="inline-flex items-center gap-1 text-primary hover:underline" href={explorerUrl} target="_blank" rel="noopener noreferrer">
                {truncateHash(entry.txHash)}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-muted-foreground/80">N/A</span>
            )}
            {entry.txHash && (
              <button onClick={() => handleCopy(entry.txHash ?? "")} className="p-1 text-muted-foreground hover:text-foreground" title="Copy transaction hash" aria-label="Copy transaction hash">
                <Copy className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="space-y-1">
            <p className="font-mono text-[11px] text-muted-foreground">Arguments</p>
            <pre className="whitespace-pre-wrap rounded bg-background/80 px-2 py-1 text-[11px] leading-snug text-foreground border border-border">{entry.argsJson || "(none)"}</pre>
          </div>

          <div className="space-y-1">
            <p className="font-mono text-[11px] text-muted-foreground">Decoded Output</p>
            <pre className="whitespace-pre-wrap rounded bg-background/80 px-2 py-1 text-[11px] leading-snug text-foreground border border-border">
              {decodedText || "(no decoded output)"}
            </pre>
            {entry.errorMessage && (
              <p className="text-[11px] text-destructive">{entry.errorMessage}</p>
            )}
          </div>

          {entry.simulationComparison && (
            <SimulationComparison comparison={entry.simulationComparison} />
          )}
        </div>
      )}
    </div>
  );
}
