import { useState, useCallback } from "react";
import { Rocket, ExternalLink, UserPlus, ShieldAlert, Key, Trash2, Braces, Download, ReceiptText, FileCode2, TerminalSquare, Camera } from "lucide-react";
import { useIdentityStore } from "@/store/useIdentityStore";
import { useFileStore } from "@/store/useFileStore";
import { resolveContractSchema, type FunctionSpec } from "@/lib/contractAbiParser";
import { createBindingsExportFromWorkspace, downloadBindingsFile } from "@/lib/bindingsGenerator";
import type { InvocationDebugData } from "@/lib/invokeResult";
import { CopyToClipboard } from "@/components/ide/CopyToClipboard";
import { InteractPane } from "./InteractPane";
import { buildArgsJson } from "@/lib/invokeUtils";
import { XdrChecksumCard } from "@/components/ide/XdrChecksumCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { TransactionResultsPane } from "@/components/ide/TransactionResultsPane";
import { invocationSnapshotManager } from "@/lib/test/SnapshotManager";

interface ContractPanelProps {
  contractId: string | null;
  onInvoke: (fn: string, args: string) => void;
  invokeState?: {
    phase: "idle" | "preparing" | "signing" | "submitting" | "confirming" | "success" | "failed";
    message: string;
  };
  lastInvocation?: InvocationDebugData | null;
}


export function ContractPanel({ contractId, onInvoke, invokeState, lastInvocation = null }: ContractPanelProps) {
  const [fnName, setFnName] = useState("");
  const [args, setArgs] = useState("");
  const [showManager, setShowManager] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [isResolvingAbi, setIsResolvingAbi] = useState(false);
  const [schemaPreview, setSchemaPreview] = useState("");
  const [schemaSource, setSchemaSource] = useState("");
  const [isSimulation, setIsSimulation] = useState(false);
  const [functions, setFunctions] = useState<FunctionSpec[]>([]);
  const [showRawJson, setShowRawJson] = useState(false);
  const [manualFnName, setManualFnName] = useState("");
  const [manualArgs, setManualArgs] = useState("[]");
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);

  const { identities, activeContext, setActiveContext, generateNewIdentity, deleteIdentity } = useIdentityStore();
  const { files, activeTabPath, horizonUrl, customRpcUrl, networkPassphrase, network } = useFileStore();

  const handleGenerate = async () => {
    if (!newNickname.trim()) return;

    try {
      await generateNewIdentity(newNickname);
      toast.success(`Identity "${newNickname}" generated!`);
      setNewNickname("");
      setIsCreating(false);
    } catch (error) {
      toast.error("Failed to generate identity");
      console.error(error);
    }
  };

  const handleResolveAbi = async () => {
    setIsResolvingAbi(true);

    try {
      const rpcUrl = network === "local" ? customRpcUrl : horizonUrl;
      const result = await resolveContractSchema({
        contractId,
        files,
        activeTabPath,
        rpcUrl,
        networkPassphrase,
        network,
      });

      setSchemaPreview(result.preview);
      setSchemaSource(
        result.source === "contract-id"
          ? `Fetched from ${result.rpcUrl ?? rpcUrl}`
          : `Parsed from ${result.source}`,
      );
      setFunctions(result.functions);
      toast.success(`Parsed ${result.functions.length} contract function${result.functions.length === 1 ? "" : "s"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse contract ABI";
      toast.error(message);
    } finally {
      setIsResolvingAbi(false);
    }
  };
  
  const handleExportBindings = () => {
    try {
      const result = createBindingsExportFromWorkspace(files, activeTabPath);
      downloadBindingsFile(result);
      toast.success(`Exported ${result.filename} using ${result.mode} generation`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to export JS bindings";
      toast.error(message);
    }
  };

  const handleSaveInvocationSnapshot = useCallback(async () => {
    if (!lastInvocation) {
      toast.error("No invocation result available to snapshot");
      return;
    }

    setIsSavingSnapshot(true);
    try {
      const snapshotName = `${lastInvocation.functionName}-${lastInvocation.network}`;
      await invocationSnapshotManager.saveInvocationSnapshot({
        contractId,
        snapshotName,
        invocation: lastInvocation,
      });
      toast.success(`Saved invocation snapshot: ${snapshotName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save invocation snapshot";
      toast.error(message);
    } finally {
      setIsSavingSnapshot(false);
    }
  }, [contractId, lastInvocation]);

  return (
    <div className="h-full bg-card flex flex-col">
      <div className="px-3 py-2 flex items-center justify-between border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Interact
        </span>
        <button
          onClick={() => setShowManager(!showManager)}
          className={`p-1 rounded transition-colors ${showManager ? 'bg-primary/20 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
          title="Identity Manager"
        >
          <Key className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {showManager ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Identity Manager</h4>
              {!isCreating && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 rounded transition-colors"
                >
                  <UserPlus className="h-3 w-3" />
                  Generate
                </button>
              )}
            </div>

            {isCreating && (
              <div className="bg-muted border border-primary/30 rounded-md p-2 space-y-2 animate-in slide-in-from-top-1 duration-200">
                <label className="text-[10px] text-muted-foreground font-mono block">New Identity Nickname</label>
                <input
                  autoFocus
                  type="text"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerate();
                    if (e.key === 'Escape') {
                      setIsCreating(false);
                      setNewNickname("");
                    }
                  }}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Test Account"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerate}
                    className="flex-1 bg-primary text-primary-foreground text-[10px] font-bold py-1 rounded hover:bg-primary/90 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => { setIsCreating(false); setNewNickname(""); }}
                    className="flex-1 bg-muted text-muted-foreground text-[10px] font-bold py-1 rounded border border-border hover:bg-background transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="bg-orange-500/10 border border-orange-500/20 rounded-md p-2 flex gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-500 shrink-0" />
              <p className="text-[9px] leading-tight text-orange-200/80">
                <strong className="text-orange-500 block mb-0.5">SECURITY WARNING</strong>
                Test keys are stored unencrypted in your browser. NEVER fund these with Mainnet assets.
              </p>
            </div>

            <div className="space-y-2">
              {identities.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic text-center py-4">No identities generated yet.</p>
              ) : (
                identities.map((id) => (
                  <div key={id.publicKey} className="bg-muted/50 border border-border rounded-md p-2 space-y-1.5 relative group">
                    <div className="flex items-center justify-between pr-6">
                      <span className="text-[11px] font-bold text-foreground">{id.nickname}</span>
                      <button
                        onClick={() => deleteIdentity(id.publicKey)}
                        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 overflow-hidden">
                        <span className="text-[9px] text-muted-foreground font-mono truncate">{id.publicKey}</span>
                        <CopyToClipboard
                          text={id.publicKey}
                          label="Copy public key"
                          copiedLabel="Copied!"
                          className="shrink-0 p-0.5"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowManager(false)}
              className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1 border border-dashed border-border rounded"
            >
              Back to Interact
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] md:text-xs text-muted-foreground font-mono block">Signing Identity</label>
              <Select
                value={activeContext?.type === "local-keypair" ? activeContext.publicKey : "wallet"}
                onValueChange={(val) =>
                  setActiveContext(
                    val === "wallet"
                      ? { type: "web-wallet" }
                      : { type: "local-keypair", publicKey: val }
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs bg-muted border-border">
                  <SelectValue placeholder="Select identity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wallet">Browser Wallet</SelectItem>
                  {identities.map(id => (
                    <SelectItem key={id.publicKey} value={id.publicKey}>
                      {id.nickname} ({id.publicKey.substring(0, 4)}...{id.publicKey.substring(52)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[10px] md:text-xs text-muted-foreground font-mono block mb-1">Contract ID</label>
              {contractId ? (
                <div className="flex items-center gap-1">
                  <code className="text-[10px] md:text-xs bg-muted px-2 py-1 rounded font-mono text-primary truncate flex-1">
                    {contractId}
                  </code>
                  <CopyToClipboard text={contractId} label="Copy contract ID" copiedLabel="Copied!" />
                </div>
              ) : (
                <p className="text-[10px] md:text-xs text-muted-foreground/50 italic">No contract deployed</p>
              )}
            </div>

            <InteractPane 
              functions={functions}
              contractId={contractId}
              activeContext={activeContext}
              invokeState={invokeState}
              onInvoke={onInvoke}
            />

            {functions.length === 0 && (
               <div className="space-y-4 pt-4 border-t border-border/40">
                  <div className="flex items-center gap-2 mb-2">
                    <TerminalSquare className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Manual Invocation</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={manualFnName}
                      onChange={(e) => setManualFnName(e.target.value)}
                      className="w-full bg-muted border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Function name"
                    />
                    <textarea
                      value={manualArgs}
                      onChange={(e) => setManualArgs(e.target.value)}
                      rows={2}
                      className="w-full bg-muted border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      placeholder='["arg1", "arg2"]'
                    />
                    <button
                      onClick={() => onInvoke(manualFnName, manualArgs)}
                      disabled={!contractId || !activeContext || !manualFnName || (invokeState?.phase && invokeState.phase !== "idle" && invokeState.phase !== "success" && invokeState.phase !== "failed")}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] uppercase font-bold rounded bg-muted border border-border hover:bg-muted/80 disabled:opacity-30 transition-colors"
                    >
                      <Rocket className="h-3 w-3" />
                      {invokeState?.message ?? "Manual Invoke"}
                    </button>
                  </div>
               </div>
            )}
              {invokeState?.phase === "confirming" && (
                <p className="text-[9px] text-center text-muted-foreground italic mt-1">
                  Confirming on-chain every 2s...
                </p>
              )}
              {!activeContext && identities.length > 0 && (
                <p className="text-[9px] text-destructive text-center italic mt-1">Select an identity to invoke</p>
              )}
              {identities.length === 0 && (
                <button
                  onClick={() => setShowManager(true)}
                  className="w-full text-[9px] text-primary hover:underline text-center mt-1"
                >
                  Create an identity to get started
                </button>
              )}

            {lastInvocation && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      <ReceiptText className="h-3.5 w-3.5" />
                      Invocation Result
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {lastInvocation.functionName} on {lastInvocation.network} by {lastInvocation.signer}
                    </p>
                  </div>
                  <CopyToClipboard
                    text={lastInvocation.result}
                    label="Copy result"
                    copiedLabel="Copied!"
                    className="opacity-80 hover:opacity-100"
                  />
                </div>

                <button
                  onClick={() => {
                    void handleSaveInvocationSnapshot();
                  }}
                  disabled={isSavingSnapshot}
                  data-testid="snap-invocation-btn"
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Camera className="h-3 w-3" />
                  {isSavingSnapshot ? "Saving..." : "Snap"}
                </button>

                <pre className="max-h-28 overflow-auto rounded bg-background px-2 py-2 text-[10px] leading-relaxed text-foreground">
                  {lastInvocation.result}
                </pre>

                <div className="flex items-center justify-between gap-2 rounded border border-border/80 bg-background/60 px-2.5 py-2">
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">Raw XDR Debug View</p>
                    <p className="text-[9px] text-muted-foreground">
                      Inspect or copy the final unsigned and signed Base64 envelopes.
                    </p>
                  </div>

                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-muted/80">
                        <FileCode2 className="h-3 w-3" />
                        View XDR
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl border-border bg-card p-0">
                      <DialogHeader className="border-b border-border px-5 py-4">
                        <DialogTitle className="text-base">Invocation XDR Debug View</DialogTitle>
                        <DialogDescription>
                          Copy the invocation result or inspect the unsigned and signed Base64 payloads.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="grid gap-4 px-5 py-4">
                        <div className="rounded-md border border-border bg-background/50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-foreground">Result Payload</p>
                              <p className="text-[11px] text-muted-foreground">Useful for sharing execution output.</p>
                            </div>
                            <CopyToClipboard
                              text={lastInvocation.result}
                              label="Copy result"
                              copiedLabel="Copied!"
                            />
                          </div>
                          <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-background px-3 py-2 text-[11px] text-foreground">
                            {lastInvocation.result}
                          </pre>
                        </div>

                        <div className="rounded-md border border-border bg-background/50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-foreground">Unsigned Transaction XDR</p>
                              <p className="text-[11px] text-muted-foreground">Base64 view before signing.</p>
                            </div>
                            <CopyToClipboard
                              text={lastInvocation.unsignedXdr}
                              label="Copy unsigned XDR"
                              copiedLabel="Copied!"
                            />
                          </div>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-background px-3 py-2 text-[11px] text-foreground">
                            {lastInvocation.unsignedXdr}
                          </pre>
                          <div className="mt-3">
                            <XdrChecksumCard xdr={lastInvocation.unsignedXdr} />
                          </div>
                        </div>

                        <div className="rounded-md border border-border bg-background/50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-foreground">Signed Transaction XDR</p>
                              <p className="text-[11px] text-muted-foreground">Base64 view after signing.</p>
                            </div>
                            <CopyToClipboard
                              text={lastInvocation.signedXdr}
                              label="Copy signed XDR"
                              copiedLabel="Copied!"
                            />
                          </div>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-background px-3 py-2 text-[11px] text-foreground">
                            {lastInvocation.signedXdr}
                          </pre>
                          <div className="mt-3">
                            <XdrChecksumCard xdr={lastInvocation.signedXdr} />
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            )}

            <div className="border-t border-border pt-3 space-y-2">
              <button
                onClick={() => {
                  void handleResolveAbi();
                }}
                disabled={isResolvingAbi}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded border border-border bg-muted text-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
              >
                <Braces className="h-3.5 w-3.5" />
                {isResolvingAbi ? "Parsing ABI..." : "Parse Contract ABI"}
              </button>
              {schemaPreview && (
                <div className="rounded-md border border-border bg-muted/40 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contract Schema</p>
                      <p className="text-[9px] text-muted-foreground">{schemaSource}</p>
                    </div>
                    <CopyToClipboard text={schemaPreview} label="Copy ABI preview" copiedLabel="Copied!" title="Copy ABI preview" />
                  </div>
                  <pre className="max-h-40 overflow-auto rounded bg-background px-2 py-2 text-[9px] leading-relaxed text-foreground">
                    {schemaPreview}
                  </pre>
                </div>
              )}
                
              <button
                onClick={handleExportBindings}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded border border-border bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export JS Bindings
              </button>
              <TransactionResultsPane />
              <p className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wider">Resources</p>
              <a href="https://soroban.stellar.org/docs" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[10px] md:text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" />
                Soroban Docs
              </a>
              <a href="https://stellar.expert" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[10px] md:text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" />
                Stellar Expert
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
