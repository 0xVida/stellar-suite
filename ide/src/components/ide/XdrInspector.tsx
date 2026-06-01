"use client";

/**
 * XdrInspector — pre-signing transaction breakdown.
 *
 * Decodes a base64 transaction-envelope XDR into a human-readable list of
 * operations and highlights changes that elevate authorization, recover
 * funds, or push fees above expected baselines. Rendered as a modal that
 * the deploy flow opens immediately before requesting a signature so users
 * never approve an opaque XDR blob.
 */

import { useMemo } from "react";
import {
  AlertTriangle,
  Check,
  FileText,
  Hash,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  FeeBumpTransaction,
  Transaction,
} from "@stellar/stellar-sdk";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  formatXdrValidationError,
  validateTransactionEnvelopeXdr,
} from "@/utils/XdrValidator";

// Operations whose effect modifies authentication / authorization,
// recovers funds, or destroys an account — always surfaced as sensitive.
const SENSITIVE_OPS = new Set<string>([
  "setOptions",
  "setTrustLineFlags",
  "allowTrust",
  "clawback",
  "clawbackClaimableBalance",
  "accountMerge",
  "revokeSponsorship",
]);

// Soroban host-function invocations require explicit `auth` entries; they
// aren't always destructive but deserve attention.
const AUTH_RELATED_OPS = new Set<string>([
  ...SENSITIVE_OPS,
  "invokeHostFunction",
]);

const BASE_FEE_STROOPS = 100;
const HIGH_FEE_STROOPS = 1_000_000; // 0.1 XLM

const stroopsToXlm = (stroops: string | number): string => {
  const value = typeof stroops === "string" ? Number(stroops) : stroops;
  if (!Number.isFinite(value)) return String(stroops);
  return `${(value / 10_000_000).toFixed(7)} XLM`;
};

const shortenAddress = (addr: string | null | undefined, head = 6, tail = 4): string => {
  if (!addr) return "";
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
};

interface DetailEntry {
  label: string;
  value: string;
}

interface OperationRow {
  index: number;
  type: string;
  source: string | null;
  details: DetailEntry[];
  warnings: string[];
  isSensitive: boolean;
  isAuthRelated: boolean;
}

// Operations in stellar-sdk are a heavy discriminated union; for the
// read-only field probing we do here, a permissive record shape keeps
// the switch statement readable without listing every variant.
type OperationLike = Record<string, unknown> & {
  type: string;
  source?: string;
};

const describeSetOptions = (op: OperationLike): DetailEntry[] => {
  const out: DetailEntry[] = [];
  if (op.masterWeight !== undefined)
    out.push({ label: "Master weight", value: String(op.masterWeight) });
  if (op.lowThreshold !== undefined)
    out.push({ label: "Low threshold", value: String(op.lowThreshold) });
  if (op.medThreshold !== undefined)
    out.push({ label: "Med threshold", value: String(op.medThreshold) });
  if (op.highThreshold !== undefined)
    out.push({ label: "High threshold", value: String(op.highThreshold) });
  const signer = op.signer as Record<string, unknown> | undefined;
  if (signer) {
    const key =
      signer.ed25519PublicKey ??
      signer.preAuthTx ??
      signer.sha256Hash ??
      signer.ed25519SignedPayload ??
      "key";
    out.push({
      label: "Signer",
      value: `${shortenAddress(String(key))} weight=${String(signer.weight)}`,
    });
  }
  if (op.setFlags !== undefined)
    out.push({ label: "Set flags", value: String(op.setFlags) });
  if (op.clearFlags !== undefined)
    out.push({ label: "Clear flags", value: String(op.clearFlags) });
  if (op.inflationDest)
    out.push({ label: "Inflation dest", value: shortenAddress(String(op.inflationDest)) });
  if (op.homeDomain) out.push({ label: "Home domain", value: String(op.homeDomain) });
  return out;
};

const describeOperation = (op: OperationLike, index: number): OperationRow => {
  const type = op.type;
  const source: string | null = op.source ?? null;
  const warnings: string[] = [];
  let details: DetailEntry[] = [];

  const asset = op.asset as { code?: string } | undefined;

  switch (type) {
    case "payment":
      details = [
        { label: "To", value: shortenAddress(String(op.destination ?? "")) },
        { label: "Amount", value: String(op.amount) },
        { label: "Asset", value: asset?.code ?? "native" },
      ];
      break;
    case "createAccount":
      details = [
        { label: "Funded", value: shortenAddress(String(op.destination ?? "")) },
        { label: "Starting balance", value: `${op.startingBalance} XLM` },
      ];
      break;
    case "setOptions":
      details = describeSetOptions(op);
      warnings.push(
        "Modifies account authentication (signers, thresholds, or auth flags).",
      );
      break;
    case "setTrustLineFlags":
    case "allowTrust":
      details = [
        { label: "Trustor", value: shortenAddress(String(op.trustor ?? "")) },
        { label: "Asset code", value: String(op.assetCode ?? "") },
      ];
      warnings.push("Modifies trust-line authorization flags.");
      break;
    case "clawback":
      details = [
        { label: "From", value: shortenAddress(String(op.from ?? "")) },
        { label: "Amount", value: String(op.amount ?? "") },
        { label: "Asset", value: asset?.code ?? "" },
      ];
      warnings.push("Recovers funds from another account.");
      break;
    case "clawbackClaimableBalance":
      details = [
        {
          label: "Balance ID",
          value: shortenAddress(String(op.balanceId ?? ""), 10, 8),
        },
      ];
      warnings.push("Recovers a previously created claimable balance.");
      break;
    case "accountMerge":
      details = [
        { label: "Destination", value: shortenAddress(String(op.destination ?? "")) },
      ];
      warnings.push(
        "Destroys the source account and transfers its entire XLM balance.",
      );
      break;
    case "revokeSponsorship":
      details = [{ label: "Operation", value: "revokeSponsorship" }];
      warnings.push(
        "Revokes a sponsorship — reserves may transfer between accounts.",
      );
      break;
    case "invokeHostFunction": {
      const func = op.func as { switch?: () => { name?: string } } | undefined;
      const fnName = func?.switch?.()?.name ?? String(op.function ?? "(host function)");
      const authArr = op.auth;
      const authCount = Array.isArray(authArr) ? authArr.length : 0;
      details = [
        { label: "Host function", value: fnName },
        { label: "Auth entries", value: String(authCount) },
      ];
      if (authCount > 0) {
        warnings.push(
          `Requests ${authCount} authorization signature${authCount === 1 ? "" : "s"} for sub-invocations.`,
        );
      }
      if (fnName.toLowerCase().includes("createcontract")) {
        details.push({
          label: "Sub-action",
          value: "Creates a new contract instance",
        });
      }
      break;
    }
    case "manageData": {
      const value = op.value as Uint8Array | null | undefined;
      details = [
        { label: "Name", value: String(op.name ?? "") },
        {
          label: "Value",
          value: value ? `${value.length} bytes` : "(deletion)",
        },
      ];
      break;
    }
    case "changeTrust": {
      const line = op.line as { code?: string } | undefined;
      details = [
        { label: "Asset", value: line?.code ?? "native" },
        { label: "Limit", value: String(op.limit ?? "max") },
      ];
      if (op.limit === "0") warnings.push("Removes a trust line.");
      break;
    }
    case "bumpSequence":
      details = [{ label: "Bump to", value: String(op.bumpTo) }];
      break;
    default:
      details = [];
  }

  return {
    index,
    type,
    source,
    details,
    warnings,
    isSensitive: SENSITIVE_OPS.has(type),
    isAuthRelated: AUTH_RELATED_OPS.has(type),
  };
};

interface DecodedTx {
  source: string;
  fee: string;
  feeStroops: number;
  sequence?: string;
  operations: OperationRow[];
  isFeeBump: boolean;
  feeWarning: string | null;
  decodeError: string | null;
}

const decode = (xdrStr: string | null, networkPassphrase: string): DecodedTx | null => {
  if (!xdrStr) return null;

  try {
    const validation = validateTransactionEnvelopeXdr(xdrStr, networkPassphrase);
    if (!validation.ok) {
      return {
        source: "",
        fee: "",
        feeStroops: 0,
        operations: [],
        isFeeBump: false,
        feeWarning: null,
        decodeError: formatXdrValidationError(validation),
      };
    }

    const tx = validation.transaction;

    const isFeeBump = tx instanceof FeeBumpTransaction;
    const inner: Transaction = isFeeBump
      ? (tx as FeeBumpTransaction).innerTransaction
      : (tx as Transaction);

    const operations = inner.operations.map((op, idx) =>
      describeOperation(op as unknown as OperationLike, idx),
    );

    const feeStroops = Number(inner.fee);
    let feeWarning: string | null = null;
    const expectedFee = BASE_FEE_STROOPS * Math.max(1, operations.length);
    if (Number.isFinite(feeStroops) && feeStroops > expectedFee * 50) {
      feeWarning = `Fee is unusually high — ${feeStroops} stroops vs. ~${expectedFee} stroops baseline.`;
    } else if (Number.isFinite(feeStroops) && feeStroops > HIGH_FEE_STROOPS) {
      feeWarning = `Fee exceeds 0.1 XLM (${stroopsToXlm(feeStroops)}).`;
    }

    return {
      source: inner.source,
      fee: inner.fee,
      feeStroops,
      sequence: isFeeBump ? undefined : String((inner as Transaction).sequence),
      operations,
      isFeeBump,
      feeWarning,
      decodeError: null,
    };
  } catch (error) {
    return {
      source: "",
      fee: "",
      feeStroops: 0,
      operations: [],
      isFeeBump: false,
      feeWarning: null,
      decodeError:
        error instanceof Error ? error.message : "Failed to decode XDR.",
    };
  }
};

export interface XdrInspectorProps {
  open: boolean;
  xdr: string | null;
  networkPassphrase: string;
  /** Called when the user confirms they want to sign the transaction. */
  onApprove: () => void;
  /** Called when the user cancels or dismisses the inspector. */
  onReject: () => void;
}

export function XdrInspector({
  open,
  xdr,
  networkPassphrase,
  onApprove,
  onReject,
}: XdrInspectorProps) {
  const decoded = useMemo(() => decode(xdr, networkPassphrase), [xdr, networkPassphrase]);
  const sensitiveCount =
    decoded?.operations.filter((op) => op.isSensitive).length ?? 0;
  const canApprove = !!decoded && !decoded.decodeError;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onReject();
      }}
    >
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-card border-border z-[60]"
        data-testid="xdr-inspector"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            Review transaction before signing
          </DialogTitle>
          <DialogDescription className="text-xs">
            Decoded operations and ledger changes for the XDR you are about to sign.
            Confirm the source, fee, and highlighted warnings before approving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {!decoded ? (
            <div className="text-xs text-muted-foreground">No XDR to inspect.</div>
          ) : decoded.decodeError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-mono">
              <ShieldAlert className="inline h-3.5 w-3.5 mr-1" />
              {decoded.decodeError}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-background/40 p-3 text-xs">
                <div>
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">
                    Source
                  </div>
                  <div
                    className="font-mono break-all"
                    title={decoded.source}
                  >
                    {shortenAddress(decoded.source, 8, 6)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">
                    Fee
                  </div>
                  <div
                    className={cn(
                      "font-mono",
                      decoded.feeWarning && "text-amber-400",
                    )}
                  >
                    {decoded.fee} stroops ({stroopsToXlm(decoded.feeStroops)})
                  </div>
                </div>
                {decoded.sequence ? (
                  <div>
                    <div className="font-mono text-[10px] uppercase text-muted-foreground">
                      Sequence
                    </div>
                    <div className="font-mono">{decoded.sequence}</div>
                  </div>
                ) : null}
                <div>
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">
                    Type
                  </div>
                  <div className="font-mono">
                    {decoded.isFeeBump ? "Fee bump" : "Transaction"}
                  </div>
                </div>
              </div>

              {decoded.feeWarning ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="font-mono">{decoded.feeWarning}</span>
                </div>
              ) : null}

              {sensitiveCount > 0 ? (
                <div
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
                  role="alert"
                  data-testid="xdr-inspector-sensitive-banner"
                >
                  <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="font-mono">
                    {sensitiveCount} sensitive operation
                    {sensitiveCount === 1 ? "" : "s"} detected — verify each
                    change carefully.
                  </span>
                </div>
              ) : null}

              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2 flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  Operations ({decoded.operations.length})
                </div>
                <ul className="space-y-2" role="list">
                  {decoded.operations.map((op) => (
                    <li
                      key={op.index}
                      className={cn(
                        "rounded-md border p-3 text-xs font-mono",
                        op.isSensitive
                          ? "border-destructive/40 bg-destructive/5"
                          : op.isAuthRelated
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-border bg-background/40",
                      )}
                      data-op-type={op.type}
                      data-sensitive={op.isSensitive ? "true" : "false"}
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground">
                            #{op.index + 1}
                          </span>
                          <Badge
                            variant={op.isSensitive ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {op.type}
                          </Badge>
                        </div>
                        {op.source ? (
                          <span className="text-[10px] text-muted-foreground truncate">
                            from {shortenAddress(op.source)}
                          </span>
                        ) : null}
                      </div>

                      {op.details.length > 0 ? (
                        <dl className="grid grid-cols-[max-content_1fr] gap-x-2 gap-y-0.5">
                          {op.details.map((d, i) => (
                            <div key={i} className="contents">
                              <dt className="text-muted-foreground">{d.label}</dt>
                              <dd className="break-all">{d.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <div className="text-muted-foreground">
                          No additional fields.
                        </div>
                      )}

                      {op.warnings.map((w, i) => (
                        <div
                          key={i}
                          className="mt-1.5 flex items-start gap-1.5 text-[10px] text-destructive"
                        >
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReject}
            className="text-xs"
            data-testid="xdr-inspector-reject"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            disabled={!canApprove}
            className="text-xs"
            data-testid="xdr-inspector-approve"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {sensitiveCount > 0 ? "Approve & sign anyway" : "Approve & sign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default XdrInspector;
