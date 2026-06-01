"use client";

/**
 * SponsoredAssetsManager.tsx
 * Asset Management for Sponsored Transactions — Issue #836
 *
 * Lets developers configure which assets are eligible for fee sponsorship
 * in the IDE's testing environment, with per-asset fee caps and network scope.
 */

import { useState } from "react";
import {
  Coins,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

import {
  useSponsoredAssetsStore,
  type AssetType,
  type SponsoredAsset,
} from "@/store/useSponsoredAssetsStore";
import type { NetworkKey } from "@/lib/networkConfig";
import { cn } from "@/lib/utils";

const ALL_NETWORKS: NetworkKey[] = ["testnet", "futurenet", "mainnet", "local"];

const NETWORK_LABELS: Record<NetworkKey, string> = {
  testnet: "Testnet",
  futurenet: "Futurenet",
  mainnet: "Mainnet",
  local: "Local",
};

interface SponsoredAssetsManagerProps {
  activeNetwork?: NetworkKey;
}

// ─── Asset row ────────────────────────────────────────────────────────────────

function AssetRow({
  asset,
  onToggle,
  onRemove,
  onFeeChange,
}: {
  asset: SponsoredAsset;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onFeeChange: (id: string, fee: number) => void;
}) {
  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState(String(asset.maxFeeStroops));

  const commitFee = () => {
    const val = parseInt(feeInput, 10);
    if (!isNaN(val) && val > 0) {
      onFeeChange(asset.id, val);
      toast.success(`Max fee updated to ${val} stroops`);
    } else {
      setFeeInput(String(asset.maxFeeStroops));
    }
    setEditingFee(false);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 transition-all",
        asset.enabled
          ? "border-border bg-card/50"
          : "border-border/40 bg-muted/20 opacity-60"
      )}
      data-testid={`sponsored-asset-${asset.id}`}
    >
      {/* Toggle */}
      <button
        onClick={() => onToggle(asset.id, !asset.enabled)}
        title={asset.enabled ? "Disable sponsorship" : "Enable sponsorship"}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
        data-testid={`asset-toggle-${asset.id}`}
      >
        {asset.enabled ? (
          <ToggleRight className="h-4 w-4 text-emerald-400" />
        ) : (
          <ToggleLeft className="h-4 w-4" />
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-foreground">{asset.label}</span>
          {asset.enabled && (
            <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
          )}
        </div>
        {asset.issuer && (
          <p className="text-[9px] font-mono text-muted-foreground truncate" title={asset.issuer}>
            {asset.issuer.slice(0, 8)}…{asset.issuer.slice(-6)}
          </p>
        )}
        {/* Networks */}
        <div className="flex flex-wrap gap-1 mt-1">
          {asset.networks.map((n) => (
            <span
              key={n}
              className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-mono text-primary"
            >
              {NETWORK_LABELS[n]}
            </span>
          ))}
        </div>
      </div>

      {/* Max fee */}
      <div className="shrink-0 text-right">
        <p className="text-[9px] text-muted-foreground mb-0.5">Max fee</p>
        {editingFee ? (
          <input
            autoFocus
            type="number"
            min={1}
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            onBlur={commitFee}
            onKeyDown={(e) => e.key === "Enter" && commitFee()}
            className="w-20 rounded border border-primary bg-background px-1.5 py-0.5 text-[10px] font-mono text-right focus:outline-none"
            data-testid={`asset-fee-input-${asset.id}`}
          />
        ) : (
          <button
            onClick={() => setEditingFee(true)}
            className="text-[10px] font-mono text-primary hover:underline"
            data-testid={`asset-fee-${asset.id}`}
          >
            {asset.maxFeeStroops} str
          </button>
        )}
      </div>

      {/* Remove */}
      {asset.id !== "native" && (
        <button
          onClick={() => {
            onRemove(asset.id);
            toast.success(`${asset.code} removed from sponsored assets`);
          }}
          className="shrink-0 mt-0.5 text-muted-foreground hover:text-destructive transition-colors"
          data-testid={`asset-remove-${asset.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Add asset form ───────────────────────────────────────────────────────────

function AddAssetForm({ onAdd }: { onAdd: () => void }) {
  const { addAsset } = useSponsoredAssetsStore();
  const [type, setType] = useState<AssetType>("issued");
  const [code, setCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [label, setLabel] = useState("");
  const [maxFee, setMaxFee] = useState("100");
  const [networks, setNetworks] = useState<NetworkKey[]>(["testnet"]);
  const [error, setError] = useState<string | null>(null);

  const toggleNetwork = (n: NetworkKey) => {
    setNetworks((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
  };

  const handleSubmit = () => {
    setError(null);
    if (!code.trim()) { setError("Asset code is required."); return; }
    if (type === "issued" && !issuer.trim()) { setError("Issuer is required for issued assets."); return; }
    const fee = parseInt(maxFee, 10);
    if (isNaN(fee) || fee < 1) { setError("Max fee must be a positive integer."); return; }
    if (networks.length === 0) { setError("Select at least one network."); return; }

    addAsset({
      type,
      code: code.trim().toUpperCase(),
      issuer: type === "native" ? null : issuer.trim(),
      label: label.trim() || code.trim().toUpperCase(),
      enabled: true,
      maxFeeStroops: fee,
      networks,
    });

    toast.success(`${code.trim().toUpperCase()} added to sponsored assets`);
    setCode(""); setIssuer(""); setLabel(""); setMaxFee("100");
    onAdd();
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/30 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Add Asset
      </p>

      {/* Type */}
      <div className="flex gap-2">
        {(["native", "issued"] as AssetType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              "rounded px-2 py-1 text-[10px] font-medium transition-colors",
              type === t
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            {t === "native" ? "Native (XLM)" : "Issued Token"}
          </button>
        ))}
      </div>

      {type === "issued" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="USDC"
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="add-asset-code"
            />
          </div>
          <div>
            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="USD Coin"
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Issuer</label>
            <input
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="G..."
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="add-asset-issuer"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wider">
            Max Fee (stroops)
          </label>
          <input
            type="number"
            min={1}
            value={maxFee}
            onChange={(e) => setMaxFee(e.target.value)}
            className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="add-asset-fee"
          />
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Networks</label>
          <div className="mt-1 flex flex-wrap gap-1">
            {ALL_NETWORKS.map((n) => (
              <button
                key={n}
                onClick={() => toggleNetwork(n)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-mono transition-colors",
                  networks.includes(n)
                    ? "bg-primary/20 text-primary"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                )}
              >
                {NETWORK_LABELS[n]}
              </button>
            ))}
          </div>
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
        className="w-full rounded bg-primary/15 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/25 transition-colors flex items-center justify-center gap-1.5"
        data-testid="add-asset-submit"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Asset
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SponsoredAssetsManager({ activeNetwork }: SponsoredAssetsManagerProps) {
  const { assets, toggleAsset, removeAsset, updateMaxFee } = useSponsoredAssetsStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterNetwork, setFilterNetwork] = useState<NetworkKey | "all">(
    activeNetwork ?? "all"
  );

  const filtered =
    filterNetwork === "all"
      ? assets
      : assets.filter((a) => a.networks.includes(filterNetwork));

  const enabledCount = filtered.filter((a) => a.enabled).length;

  return (
    <div
      className="flex h-full flex-col bg-sidebar overflow-hidden"
      data-testid="sponsored-assets-manager"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Sponsored Assets</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {enabledCount}/{filtered.length} active
        </span>
      </div>

      {/* Network filter */}
      <div className="flex items-center gap-1 border-b border-sidebar-border px-3 py-1.5 overflow-x-auto">
        {(["all", ...ALL_NETWORKS] as const).map((n) => (
          <button
            key={n}
            onClick={() => setFilterNetwork(n)}
            className={cn(
              "shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              filterNetwork === n
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            )}
            data-testid={`filter-${n}`}
          >
            {n === "all" ? "All" : NETWORK_LABELS[n]}
          </button>
        ))}
      </div>

      {/* Asset list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic text-center py-4">
            No assets configured for this network.
          </p>
        ) : (
          filtered.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              onToggle={toggleAsset}
              onRemove={removeAsset}
              onFeeChange={updateMaxFee}
            />
          ))
        )}

        {/* Add form */}
        {showAddForm ? (
          <AddAssetForm onAdd={() => setShowAddForm(false)} />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-1.5 rounded border border-dashed border-border py-2 text-[10px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            data-testid="show-add-asset-form"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Asset
          </button>
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-sidebar-border px-3 py-2 text-[9px] text-muted-foreground leading-relaxed">
        Assets listed here are eligible for fee sponsorship in the testing environment.
        Max fee caps are enforced per operation.
      </div>
    </div>
  );
}
