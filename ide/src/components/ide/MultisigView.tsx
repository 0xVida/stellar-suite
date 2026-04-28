"use client";

import { useState } from "react";
import {
  GitMerge,
  PenLine,
  Trash2,
  Radio,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { useMultisigStore } from "@/store/useMultisigStore";
import { useIdentityStore } from "@/store/useIdentityStore";
import { NETWORK_CONFIG, type NetworkKey } from "@/lib/networkConfig";
import { Badge } from "@/components/ui/badge";
import { XdrChecksumCard } from "@/components/ide/XdrChecksumCard";

interface MultisigViewProps {
  network: NetworkKey;
}

const shortKey = (key: string) =>
  key.length >= 12 ? `${key.slice(0, 6)}...${key.slice(-6)}` : key;

export function MultisigView({ network }: MultisigViewProps) {
  const { identities } = useIdentityStore();
  const {
    session,
    broadcastStatus,
    broadcastError,
    broadcastHash,
    startSession,
    appendSignature,
    setThreshold,
    clearSession,
    broadcastTransaction,
  } = useMultisigStore();

  // ── New-session form state ────────────────────────────────────────────────
  const [xdrInput, setXdrInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("2");
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkKey>(network);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Clipboard helper ─────────────────────────────────────────────────────
  const [copiedXdr, setCopiedXdr] = useState(false);
  const copyXdr = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.xdr).then(() => {
      setCopiedXdr(true);
      setTimeout(() => setCopiedXdr(false), 1500);
    });
  };

  // ── Start session ─────────────────────────────────────────────────────────
  const handleStartSession = () => {
    setFormError(null);
    const trimmed = xdrInput.trim();
    if (!trimmed) {
      setFormError("Paste a base64-encoded Transaction Envelope XDR.");
      return;
    }
    const parsedThreshold = parseInt(thresholdInput, 10);
    if (isNaN(parsedThreshold) || parsedThreshold < 1) {
      setFormError("Threshold must be a positive integer.");
      return;
    }

    const passphrase =
      NETWORK_CONFIG[selectedNetwork]?.passphrase ?? "Test SDF Network ; September 2015";

    try {
      startSession(trimmed, parsedThreshold, passphrase);
      toast.success("Multisig session started. Collect signatures below.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid XDR";
      setFormError(`Invalid XDR: ${msg}`);
    }
  };

  // ── Append signature ─────────────────────────────────────────────────────
  const handleSign = (identity: { nickname: string; publicKey: string; secretKey: string }) => {
    try {
      appendSignature(identity);
      toast.success(`${identity.nickname} signed the transaction.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signing failed";
      toast.error(msg);
    }
  };

  // ── Broadcast ────────────────────────────────────────────────────────────
  const handleBroadcast = async () => {
    if (!session) return;
    const rpcUrl =
      selectedNetwork === "local"
        ? "http://localhost:8000"
        : NETWORK_CONFIG[selectedNetwork]?.horizon ?? "https://soroban-testnet.stellar.org:443";

    try {
      await broadcastTransaction(rpcUrl);
      toast.success("Transaction broadcast successfully!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Broadcast failed";
      toast.error(msg);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const collectedWeight = session?.signers.length ?? 0;
  const threshold = session?.threshold ?? 1;
  const progressPct = Math.min((collectedWeight / threshold) * 100, 100);
  const thresholdReached = collectedWeight >= threshold;

  // ── Render: no session ────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="h-full bg-sidebar flex flex-col overflow-hidden animate-in fade-in duration-300">
        {/* Header */}
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-sidebar-border flex items-center gap-1.5">
          <GitMerge className="h-3.5 w-3.5 text-primary" />
          <span>Multisig Coordinator</span>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Paste a transaction envelope XDR, set the required weight threshold, then let
            each local identity append their signature sequentially.
          </p>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Transaction Envelope XDR
            </label>
            <textarea
              rows={5}
              value={xdrInput}
              onChange={(e) => setXdrInput(e.target.value)}
              placeholder="AAAAAgAAAAA..."
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground resize-none placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Network
              </label>
              <select
                value={selectedNetwork}
                onChange={(e) => setSelectedNetwork(e.target.value as NetworkKey)}
                className="w-full bg-background border border-border rounded px-1.5 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              >
                <option value="testnet">Testnet</option>
                <option value="futurenet">Futurenet</option>
                <option value="mainnet">Mainnet</option>
                <option value="local">Local</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Weight Threshold
              </label>
              <input
                type="number"
                min={1}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="w-full bg-background border border-border rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>
          </div>

          {formError && (
            <div className="flex items-start gap-1.5 p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[10px]">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <button
            onClick={handleStartSession}
            className="w-full bg-primary text-primary-foreground py-1.5 text-[11px] font-bold rounded hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
          >
            <GitMerge className="h-3.5 w-3.5" />
            Start Multisig Session
          </button>

          {identities.length === 0 && (
            <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] leading-relaxed">
              <strong>No local identities found.</strong> Add keypairs in the Identities panel
              to use them as multisig signers.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: active session ────────────────────────────────────────────────
  return (
    <div className="h-full bg-sidebar flex flex-col overflow-hidden animate-in fade-in duration-300">
      {/* Header */}
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitMerge className="h-3.5 w-3.5 text-primary" />
          <span>Multisig Coordinator</span>
        </div>
        <button
          onClick={() => {
            if (window.confirm("Clear the current multisig session?")) {
              clearSession();
              setXdrInput("");
            }
          }}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          title="Clear session"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Weight / Threshold status */}
        <div className="p-3 border-b border-sidebar-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Signature Weight
            </span>
            <div className="flex items-center gap-1.5">
              {thresholdReached ? (
                <Badge className="text-[9px] py-0 h-4 px-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                  Ready to Broadcast
                </Badge>
              ) : (
                <Badge className="text-[9px] py-0 h-4 px-1.5 bg-amber-500/15 text-amber-400 border-amber-500/25">
                  <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                  Pending Signatures
                </Badge>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  thresholdReached ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
              <span>{collectedWeight} collected</span>
              <span>threshold: {threshold}</span>
            </div>
          </div>

          {/* Threshold editor */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground">Adjust threshold:</span>
            <input
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1) setThreshold(v);
              }}
              className="w-14 bg-background border border-border rounded px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
            />
          </div>
        </div>

        {/* Identity signers */}
        <div className="p-3 border-b border-sidebar-border space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Local Identities
          </p>
          {identities.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">
              No local identities. Add keypairs in the Identities panel.
            </p>
          ) : (
            <div className="space-y-1.5">
              {identities.map((identity) => {
                const hasSigned = session.signers.includes(identity.publicKey);
                return (
                  <div
                    key={identity.publicKey}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-lg border transition-all ${
                      hasSigned
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-card/50 border-border"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {hasSigned ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        ) : (
                          <PenLine className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-[11px] font-medium text-foreground truncate">
                          {identity.nickname}
                        </span>
                      </div>
                      <p className="text-[9px] font-mono text-muted-foreground mt-0.5 ml-4.5">
                        {shortKey(identity.publicKey)}
                      </p>
                    </div>
                    <button
                      disabled={hasSigned || broadcastStatus === "success"}
                      onClick={() => handleSign(identity)}
                      className={`shrink-0 ml-2 px-2 py-1 rounded text-[9px] font-bold transition-all ${
                        hasSigned
                          ? "bg-emerald-500/10 text-emerald-500 cursor-default"
                          : broadcastStatus === "success"
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20"
                      }`}
                    >
                      {hasSigned ? "Signed" : "Append Sig"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Signed-by list */}
        {session.signers.length > 0 && (
          <div className="p-3 border-b border-sidebar-border space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Signatures Collected ({session.signers.length})
            </p>
            <div className="space-y-1">
              {session.signers.map((pk, i) => (
                <div key={pk} className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                  <span className="text-emerald-400">{i + 1}.</span>
                  <span>{shortKey(pk)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current XDR */}
        <div className="p-3 border-b border-sidebar-border space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Current Envelope XDR
            </p>
            <button
              onClick={copyXdr}
              className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
              title="Copy XDR"
            >
              {copiedXdr ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copiedXdr ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="bg-background border border-border rounded p-2 text-[9px] font-mono text-muted-foreground break-all max-h-20 overflow-y-auto">
            {session.xdr}
          </div>
          <XdrChecksumCard
            xdr={session.xdr}
            title="Envelope SHA-256"
            description="Share this checksum with cosigners before import or manual submission."
          />
        </div>

        {/* Broadcast section */}
        <div className="p-3 space-y-2">
          {broadcastStatus === "success" && broadcastHash && (
            <div className="flex items-start gap-1.5 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px]">
              <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Broadcast successful!</p>
                <p className="font-mono mt-0.5 break-all">{shortKey(broadcastHash)}</p>
              </div>
            </div>
          )}

          {broadcastStatus === "error" && broadcastError && (
            <div className="flex items-start gap-1.5 p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[10px]">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <p>{broadcastError}</p>
            </div>
          )}

          <button
            onClick={() => void handleBroadcast()}
            disabled={!thresholdReached || broadcastStatus === "broadcasting" || broadcastStatus === "success"}
            className={`w-full py-1.5 text-[11px] font-bold rounded flex items-center justify-center gap-1.5 transition-all ${
              thresholdReached && broadcastStatus !== "success"
                ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-500/20"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {broadcastStatus === "broadcasting" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Broadcasting…
              </>
            ) : broadcastStatus === "success" ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Broadcast Complete
              </>
            ) : (
              <>
                <Radio className="h-3.5 w-3.5" />
                {thresholdReached ? "Broadcast Transaction" : `Need ${threshold - collectedWeight} more sig(s)`}
              </>
            )}
          </button>

          {broadcastStatus === "success" && (
            <button
              onClick={() => {
                clearSession();
                setXdrInput("");
              }}
              className="w-full py-1.5 text-[10px] font-bold rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              New Session
            </button>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="p-3 border-t border-sidebar-border bg-sidebar-accent/10">
        <div className="flex items-center gap-2 text-primary font-bold text-[9px] mb-1">
          <GitMerge className="h-3 w-3" />
          <span>MULTISIG COORDINATOR</span>
        </div>
        <p className="text-[9px] text-muted-foreground leading-tight italic">
          Each local identity appends their signature sequentially. Broadcast when the
          weight threshold is reached.
        </p>
      </div>
    </div>
  );
}
