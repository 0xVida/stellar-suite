"use client";

/**
 * SponsorshipDelegationPanel.tsx
 * UI for delegating sponsorship rights to sub-accounts — Issue #837
 */

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DelegationStore,
  type DelegationEntry,
  type DelegationAuditEntry,
} from "@/lib/identity/DelegationStore";

const store = DelegationStore.getInstance();

// ─── Delegation row ───────────────────────────────────────────────────────────

function DelegationRow({
  delegation,
  onRevoke,
}: {
  delegation: DelegationEntry;
  onRevoke: (delegate: string, sponsor: string) => void;
}) {
  const isExpired =
    delegation.expiresAt ? delegation.expiresAt <= new Date().toISOString() : false;
  const isActive = delegation.active && !isExpired;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 space-y-1.5 transition-all",
        isActive
          ? "border-border bg-card/50"
          : "border-border/40 bg-muted/20 opacity-60"
      )}
      data-testid={`delegation-${delegation.delegatePublicKey.slice(0, 8)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            {isActive ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
            ) : isExpired ? (
              <Clock className="h-3 w-3 text-yellow-400 shrink-0" />
            ) : (
              <AlertCircle className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className="text-[11px] font-semibold text-foreground truncate">
              {delegation.label}
            </span>
          </div>
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground">
              <span className="uppercase tracking-wider">Delegate</span>{" "}
              <span className="font-mono">
                {delegation.delegatePublicKey.slice(0, 8)}…{delegation.delegatePublicKey.slice(-6)}
              </span>
            </p>
            <p className="text-[9px] text-muted-foreground">
              <span className="uppercase tracking-wider">Sponsor</span>{" "}
              <span className="font-mono">
                {delegation.sponsorPublicKey.slice(0, 8)}…{delegation.sponsorPublicKey.slice(-6)}
              </span>
            </p>
            {delegation.expiresAt && (
              <p className={cn("text-[9px]", isExpired ? "text-yellow-400" : "text-muted-foreground")}>
                {isExpired ? "Expired" : "Expires"}{" "}
                {new Date(delegation.expiresAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        {isActive && (
          <button
            onClick={() => onRevoke(delegation.delegatePublicKey, delegation.sponsorPublicKey)}
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
            aria-label={`Revoke delegation for ${delegation.label}`}
            data-testid={`revoke-${delegation.delegatePublicKey.slice(0, 8)}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Add delegation form ──────────────────────────────────────────────────────

function AddDelegationForm({ onAdd }: { onAdd: () => void }) {
  const [delegateKey, setDelegateKey] = useState("");
  const [sponsorKey, setSponsorKey] = useState("");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!delegateKey.trim() || !delegateKey.startsWith("G")) {
      setError("Delegate must be a valid Stellar public key (starts with G).");
      return;
    }
    if (!sponsorKey.trim() || !sponsorKey.startsWith("G")) {
      setError("Sponsor must be a valid Stellar public key (starts with G).");
      return;
    }
    if (delegateKey === sponsorKey) {
      setError("Delegate and sponsor cannot be the same account.");
      return;
    }
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await store.addDelegation({
        delegatePublicKey: delegateKey.trim(),
        sponsorPublicKey: sponsorKey.trim(),
        label: label.trim(),
        expiresAt: expiresAt || undefined,
      });
      toast.success(`Delegation created for ${label.trim()}`);
      setDelegateKey("");
      setSponsorKey("");
      setLabel("");
      setExpiresAt("");
      onAdd();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/30 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        New Delegation
      </p>

      <div className="space-y-1.5">
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wider">
            Label
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. CI Bot Account"
            className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="delegation-label"
          />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wider">
            Delegate Public Key
          </label>
          <input
            value={delegateKey}
            onChange={(e) => setDelegateKey(e.target.value)}
            placeholder="G... (sub-account)"
            className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="delegation-delegate-key"
          />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wider">
            Sponsor Public Key
          </label>
          <input
            value={sponsorKey}
            onChange={(e) => setSponsorKey(e.target.value)}
            placeholder="G... (fee payer)"
            className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="delegation-sponsor-key"
          />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wider">
            Expires (optional)
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) =>
              setExpiresAt(
                e.target.value ? new Date(e.target.value).toISOString() : ""
              )
            }
            className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="delegation-expires"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-1.5 rounded bg-primary/15 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
        data-testid="add-delegation-submit"
      >
        <Plus className="h-3.5 w-3.5" />
        {isSubmitting ? "Creating…" : "Create Delegation"}
      </button>
    </div>
  );
}

// ─── Audit log ────────────────────────────────────────────────────────────────

function AuditLog({ entries }: { entries: DelegationAuditEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Audit Log ({entries.length})
      </button>
      {expanded && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {entries.slice(0, 50).map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2 text-[9px] font-mono text-muted-foreground"
            >
              <span
                className={cn(
                  "shrink-0 uppercase",
                  entry.action === "sponsored"
                    ? "text-emerald-400"
                    : entry.action === "revoked"
                    ? "text-destructive"
                    : "text-yellow-400"
                )}
              >
                {entry.action}
              </span>
              <span className="truncate">
                {entry.delegatePublicKey.slice(0, 8)}…
              </span>
              <span className="shrink-0 text-muted-foreground/60">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function SponsorshipDelegationPanel() {
  const [delegations, setDelegations] = useState<DelegationEntry[]>([]);
  const [auditLog, setAuditLog] = useState<DelegationAuditEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    await store.load();
    await store.pruneExpired();
    setDelegations(store.getDelegations());
    setAuditLog(store.getAuditLog());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRevoke = async (delegate: string, sponsor: string) => {
    try {
      await store.revokeDelegation(delegate, sponsor);
      toast.success("Delegation revoked");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const activeDelegations = delegations.filter(
    (d) => d.active && (!d.expiresAt || d.expiresAt > new Date().toISOString())
  );
  const inactiveDelegations = delegations.filter(
    (d) => !d.active || (d.expiresAt && d.expiresAt <= new Date().toISOString())
  );

  return (
    <div
      className="flex h-full flex-col bg-sidebar overflow-hidden"
      data-testid="sponsorship-delegation-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Sponsorship Delegation
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">
            {activeDelegations.length} active
          </span>
          <button
            onClick={refresh}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Refresh delegations"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {/* Active delegations */}
        {activeDelegations.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Active
            </p>
            {activeDelegations.map((d) => (
              <DelegationRow
                key={`${d.delegatePublicKey}:${d.sponsorPublicKey}`}
                delegation={d}
                onRevoke={handleRevoke}
              />
            ))}
          </div>
        )}

        {/* Inactive / expired */}
        {inactiveDelegations.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Inactive / Expired
            </p>
            {inactiveDelegations.map((d) => (
              <DelegationRow
                key={`${d.delegatePublicKey}:${d.sponsorPublicKey}`}
                delegation={d}
                onRevoke={handleRevoke}
              />
            ))}
          </div>
        )}

        {/* Add form */}
        {showAddForm ? (
          <AddDelegationForm
            onAdd={async () => {
              setShowAddForm(false);
              await refresh();
            }}
          />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-1.5 rounded border border-dashed border-border py-2 text-[10px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            data-testid="show-add-delegation-form"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Delegation
          </button>
        )}

        {/* Empty state */}
        {delegations.length === 0 && !showAddForm && !isLoading && (
          <p className="text-[10px] text-muted-foreground italic text-center py-4">
            No delegations configured. Add one to allow sub-accounts to use a sponsor.
          </p>
        )}

        {/* Audit log */}
        <AuditLog entries={auditLog} />
      </div>

      <div className="border-t border-sidebar-border px-3 py-2 text-[9px] text-muted-foreground leading-relaxed">
        Delegations allow sub-accounts to have their transaction fees covered by a sponsor account.
      </div>
    </div>
  );
}
