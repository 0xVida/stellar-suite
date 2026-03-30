import { useState } from "react";
import {
  Trash2,
  Plus,
  Search,
  Globe,
  Clock,
  Check,
  History,
} from "lucide-react";
import { useDeployedContractsStore } from "@/store/useDeployedContractsStore";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { NetworkKey } from "@/lib/networkConfig";
import { CopyToClipboard } from "@/components/ide/CopyToClipboard";
import useEnvironmentSlotsStore from "@/store/useEnvironmentSlotsStore";

interface DeploymentsViewProps {
  activeContractId: string | null;
  onSelectContract: (id: string, network: string) => void;
}

export function DeploymentsView({
  activeContractId,
  onSelectContract,
}: DeploymentsViewProps) {
  const { deployedContracts, addContract, removeContract } =
    useDeployedContractsStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newNetwork, setNewNetwork] = useState<NetworkKey>("testnet");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredContracts = deployedContracts
    .filter(
      (c) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.id.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .slice()
    .reverse(); // Show newest first

  const handleAdd = () => {
    if (!newId.trim()) {
      toast.error("Contract ID is required");
      return;
    }
    // Stellar contract IDs are typically 56 chars starting with C
    if (!newId.startsWith("C") || newId.length !== 56) {
      toast.error(
        "Invalid Contract ID format (must be 56 characters starting with 'C')",
      );
      return;
    }

    addContract(
      newId.trim(),
      newNetwork,
      newName.trim() || "Imported Contract",
    );
    toast.success("Contract added to address book");
    setNewId("");
    setNewName("");
    setIsAdding(false);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Remove this contract from your recent deployments?")) {
      removeContract(id);
      toast.success("Deployment removed");
    }
  };

  const truncateId = (id: string) =>
    `${id.substring(0, 6)}...${id.substring(50)}`;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getNetworkBadgeStyles = (network: string) => {
    switch (network) {
      case "mainnet":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "testnet":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "futurenet":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default:
        return "bg-slate-500/10 text-slate-500 border-slate-500/20";
    }
  };

  return (
    <div
      id="tour-deploy-sidebar"
      className="h-full bg-sidebar flex flex-col overflow-hidden animate-in fade-in duration-300"
    >
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" />
          <span>Recent Deployments</span>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className={`p-1 rounded transition-all ${isAdding ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
          title="Add Contract ID"
        >
          <Plus
            className={`h-3.5 w-3.5 transition-transform duration-200 ${isAdding ? "rotate-45" : ""}`}
          />
        </button>
      </div>

      {isAdding && (
        <div className="p-3 border-b border-sidebar-border bg-sidebar-accent/30 space-y-2 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-mono">
              Contract ID
            </label>
            <input
              autoFocus
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              placeholder="CABC...1234"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-mono">
              Label (Optional)
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              placeholder="e.g. My Token"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={newNetwork}
              onChange={(e) => setNewNetwork(e.target.value as NetworkKey)}
              className="flex-1 bg-background border border-border rounded px-1 py-1 text-[10px] font-mono focus:outline-none text-foreground"
            >
              <option value="testnet">Testnet</option>
              <option value="futurenet">Futurenet</option>
              <option value="mainnet">Mainnet</option>
              <option value="local">Local</option>
            </select>
            <div className="flex gap-1 justify-end">
              <button
                onClick={handleAdd}
                className="bg-primary text-primary-foreground px-2 py-1 text-[10px] font-bold rounded hover:bg-primary/90 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setIsAdding(false)}
                className="bg-muted text-muted-foreground px-2 py-1 text-[10px] font-bold rounded border border-border hover:bg-background transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-3 py-1.5 border-b border-sidebar-border">
        <div className="relative group">
          <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search deployments..."
            className="w-full bg-sidebar-accent/50 border-none rounded-md pl-7 pr-2 py-1 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all text-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pt-1 pb-4">
        {filteredContracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 px-6 text-center text-muted-foreground">
            <Globe className="h-8 w-8 mb-2 opacity-10" />
            <p className="text-[11px] italic">No deployments found</p>
          </div>
        ) : (
          <div className="px-2 space-y-1">
            {filteredContracts.map((contract) => (
              <button
                key={contract.id}
                onClick={() => onSelectContract(contract.id, contract.network)}
                className={`w-full group text-left px-2.5 py-2.5 rounded-lg transition-all relative border ${
                  activeContractId === contract.id
                    ? "bg-primary/10 border-primary/30 ring-1 ring-primary/20 shadow-sm shadow-primary/10"
                    : "hover:bg-sidebar-accent/50 border-transparent"
                }`}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={`text-[12px] font-bold truncate ${
                          activeContractId === contract.id
                            ? "text-primary"
                            : "text-sidebar-foreground"
                        }`}
                      >
                        {contract.name}
                      </span>
                      {activeContractId === contract.id && (
                        <Check className="h-3 w-3 text-primary shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">
                      <span>{truncateId(contract.id)}</span>
                      <CopyToClipboard
                        text={contract.id}
                        label="Copy contract ID"
                        copiedLabel="Copied!"
                        onClick={(e) => e.stopPropagation()}
                        className="p-0.5 opacity-0 group-hover:opacity-100 transition-all"
                        title="Copy Contract ID"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge
                      variant="outline"
                      className={`capitalize text-[8px] py-0 h-4 px-1 leading-none ${getNetworkBadgeStyles(contract.network)}`}
                    >
                      {contract.network}
                    </Badge>
                    <div className="mt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const selected =
                            useEnvironmentSlotsStore.getState().selectedSlotId;
                          const slots =
                            useEnvironmentSlotsStore.getState().slots;
                          if (!selected) {
                            toast.error("Select an environment slot to pin to");
                            return;
                          }
                          useEnvironmentSlotsStore
                            .getState()
                            .pinContract(selected, contract.id);
                          toast.success(
                            `Pinned to ${slots[selected]?.label ?? selected}`,
                          );
                        }}
                        title="Pin to current slot"
                        className="text-[10px] px-2 py-0.5 rounded bg-secondary border border-border"
                      >
                        Pin
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-1 text-[8px] text-muted-foreground/60 font-medium">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{formatDate(contract.deployedAt)}</span>
                  </div>

                  <button
                    onClick={(e) => handleDelete(contract.id, e)}
                    className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all -mr-1"
                    title="Remove from history"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Glassmorphism line for active state */}
                {activeContractId === contract.id && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-sidebar-border bg-sidebar-accent/10">
        <div className="flex items-center gap-2 text-primary font-bold text-[9px] mb-1">
          <Globe className="h-3 w-3" />
          <span>SMART CONTRACTS BOOK</span>
        </div>
        <p className="text-[9px] text-muted-foreground leading-tight italic">
          Select a contract to set it as the active target for interactions in
          the right pane.
        </p>
      </div>
    </div>
  );
}
