import { useState } from "react";
import { Rocket, Copy, ExternalLink, UserPlus, ShieldAlert, Key, Trash2, Braces, Download } from "lucide-react";
import { useIdentityStore } from "@/store/useIdentityStore";
import { useFileStore } from "@/store/useFileStore";
import { resolveContractSchema, type FunctionSpec } from "@/lib/contractAbiParser";
import { createBindingsExportFromWorkspace, downloadBindingsFile } from "@/lib/bindingsGenerator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface ContractPanelProps {
  contractId: string | null;
  onInvoke: (fn: string, args: string, isSimulation: boolean) => void;
}

export function ContractPanel({ contractId, onInvoke }: ContractPanelProps) {
  const [fnName, setFnName] = useState("hello");
  const [args, setArgs] = useState('"Dev"');
  const [showManager, setShowManager] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [isResolvingAbi, setIsResolvingAbi] = useState(false);
  const [schemaPreview, setSchemaPreview] = useState("");
  const [schemaSource, setSchemaSource] = useState("");
  const [isSimulation, setIsSimulation] = useState(true);
  const [functions, setFunctions] = useState<FunctionSpec[]>([]);

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
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
      });

      setSchemaPreview(result.preview);
      setSchemaSource(result.source === "contract-id" ? `Fetched from ${rpcUrl}` : `Parsed from ${result.source}`);
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
                        <button onClick={() => copyToClipboard(id.publicKey, "Public Key")} className="shrink-0 p-0.5 hover:bg-muted rounded text-muted-foreground">
                          <Copy className="h-2.5 w-2.5" />
                        </button>
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
                  <button onClick={() => copyToClipboard(contractId, "Contract ID")} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <p className="text-[10px] md:text-xs text-muted-foreground/50 italic">No contract deployed</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] md:text-xs text-muted-foreground font-mono block">Function</label>
              {functions.length > 0 ? (
                <Select
                  value={fnName}
                  onValueChange={(value) => {
                    setFnName(value);
                    const fn = functions.find(f => f.name === value);
                    if (fn?.mutability === 'readonly') {
                      setIsSimulation(true);
                    } else if (fn?.mutability === 'write') {
                      setIsSimulation(false);
                    }
                    // else keep current
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-muted border-border">
                    <SelectValue placeholder="Select function" />
                  </SelectTrigger>
                  <SelectContent>
                    {functions.map(fn => (
                      <SelectItem key={fn.name} value={fn.name}>
                        {fn.name} {fn.mutability === 'readonly' ? '(read-only)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <input
                  type="text"
                  value={fnName}
                  onChange={(e) => setFnName(e.target.value)}
                  className="w-full bg-muted border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="function_name"
                />
              )}
              <label className="text-[10px] md:text-xs text-muted-foreground font-mono block">Arguments (JSON)</label>
              <textarea
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                rows={2}
                className="w-full bg-muted border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                placeholder='["arg1", "arg2"]'
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="simulation-toggle"
                  checked={isSimulation}
                  onChange={(e) => setIsSimulation(e.target.checked)}
                  disabled={functions.find(f => f.name === fnName)?.mutability === 'readonly'}
                  className="h-3 w-3"
                />
                <label htmlFor="simulation-toggle" className="text-[10px] md:text-xs text-muted-foreground font-mono">
                  Treat as Query / Simulation only
                </label>
              </div>
              <button
                onClick={() => onInvoke(fnName, args, isSimulation)}
                disabled={!contractId || !activeContext}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-colors"
              >
                <Rocket className="h-3.5 w-3.5" />
                {isSimulation ? "Run Query" : "Send Tx"}
              </button>
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
            </div>

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
                    <button
                      onClick={() => copyToClipboard(schemaPreview, "Contract schema")}
                      className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy ABI preview"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
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

