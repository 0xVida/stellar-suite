import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Lock,
  Link,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

type RemoteProtocol = "https" | "ssh" | "unknown";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "stellar-suite-git-remotes";

function loadRemotes(): GitRemote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GitRemote[]) : [];
  } catch {
    return [];
  }
}

function saveRemotes(remotes: GitRemote[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(remotes));
}

function detectProtocol(url: string): RemoteProtocol {
  if (url.startsWith("https://")) return "https";
  if (url.startsWith("git@") || url.startsWith("ssh://")) return "ssh";
  return "unknown";
}

function validateUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "URL is required.";
  const proto = detectProtocol(trimmed);
  if (proto === "unknown") {
    return "URL must start with https:// or git@ (SSH).";
  }
  return null;
}

function validateName(name: string, existing: GitRemote[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Remote name is required.";
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed))
    return "Name can only contain letters, numbers, hyphens, and underscores.";
  if (existing.some((r) => r.name === trimmed))
    return `Remote "${trimmed}" already exists.`;
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProtocolBadge({ url }: { url: string }) {
  const proto = detectProtocol(url);
  if (proto === "https") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-400">
        <Lock className="h-2.5 w-2.5" />
        HTTPS
      </span>
    );
  }
  if (proto === "ssh") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
        <Link className="h-2.5 w-2.5" />
        SSH
      </span>
    );
  }
  return null;
}

interface RemoteRowProps {
  remote: GitRemote;
  onDelete: (name: string) => void;
  onFetch: (remote: GitRemote) => void;
  fetching: boolean;
}

function RemoteRow({ remote, onDelete, onFetch, fetching }: RemoteRowProps) {
  return (
    <div className="rounded border border-sidebar-border bg-muted/20 p-3 space-y-2">
      {/* Name + actions */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{remote.name}</span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={() => onFetch(remote)}
                disabled={fetching}
                aria-label={`Fetch ${remote.name}`}
              >
                {fetching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Fetch
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Fetch from {remote.name}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onDelete(remote.name)}
                className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label={`Remove remote ${remote.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Remove remote
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* URLs */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[10px] text-muted-foreground">Fetch</span>
          <code className="flex-1 truncate font-mono text-[10px] text-foreground">
            {remote.fetchUrl}
          </code>
          <ProtocolBadge url={remote.fetchUrl} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[10px] text-muted-foreground">Push</span>
          <code className="flex-1 truncate font-mono text-[10px] text-foreground">
            {remote.pushUrl}
          </code>
          <ProtocolBadge url={remote.pushUrl} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RemoteManager() {
  const [remotes, setRemotes] = useState<GitRemote[]>(() => loadRemotes());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fetchingRemote, setFetchingRemote] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<{
    name: string;
    ok: boolean;
    message: string;
  } | null>(null);

  // Add remote form state
  const [newName, setNewName] = useState("origin");
  const [newFetchUrl, setNewFetchUrl] = useState("");
  const [separatePush, setSeparatePush] = useState(false);
  const [newPushUrl, setNewPushUrl] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const persist = (updated: GitRemote[]) => {
    setRemotes(updated);
    saveRemotes(updated);
  };

  const handleAddRemote = useCallback(() => {
    const nErr = validateName(newName, remotes);
    const uErr = validateUrl(newFetchUrl);
    setNameError(nErr);
    setUrlError(uErr);
    if (nErr || uErr) return;

    const pushUrl = separatePush && newPushUrl.trim() ? newPushUrl.trim() : newFetchUrl.trim();
    const remote: GitRemote = {
      name: newName.trim(),
      fetchUrl: newFetchUrl.trim(),
      pushUrl,
    };
    persist([...remotes, remote]);
    setDialogOpen(false);
    setNewName("origin");
    setNewFetchUrl("");
    setNewPushUrl("");
    setSeparatePush(false);
    setNameError(null);
    setUrlError(null);
  }, [newName, newFetchUrl, newPushUrl, separatePush, remotes]);

  const handleDelete = useCallback(
    (name: string) => {
      if (!window.confirm(`Remove remote "${name}"?`)) return;
      persist(remotes.filter((r) => r.name !== name));
      if (fetchStatus?.name === name) setFetchStatus(null);
    },
    [remotes, fetchStatus]
  );

  const handleFetch = useCallback(async (remote: GitRemote) => {
    setFetchingRemote(remote.name);
    setFetchStatus(null);
    // Simulate a fetch operation — in a real environment this would call
    // isomorphic-git's git.fetch() with the remote URL.
    await new Promise((r) => setTimeout(r, 1200));
    setFetchingRemote(null);
    setFetchStatus({
      name: remote.name,
      ok: true,
      message: `Fetched from ${remote.name} (${remote.fetchUrl})`,
    });
  }, []);

  const openDialog = () => {
    setNameError(null);
    setUrlError(null);
    setDialogOpen(true);
  };

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-sidebar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span>Remotes</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] gap-1 normal-case tracking-normal font-normal"
            onClick={openDialog}
            aria-label="Add remote"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Remote
          </Button>
        </div>

        {/* Fetch status banner */}
        {fetchStatus && (
          <div
            className={`flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[10px] ${
              fetchStatus.ok
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-red-400 bg-red-500/10"
            }`}
          >
            {fetchStatus.ok ? (
              <CheckCircle2 className="h-3 w-3 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">{fetchStatus.message}</span>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {remotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Globe className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  No remotes configured. Add one to push and fetch.
                </p>
              </div>
            ) : (
              remotes.map((remote) => (
                <RemoteRow
                  key={remote.name}
                  remote={remote}
                  onDelete={handleDelete}
                  onFetch={handleFetch}
                  fetching={fetchingRemote === remote.name}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Add Remote Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4" />
                Add Remote
              </DialogTitle>
              <DialogDescription className="text-xs">
                Add a Git remote. Supports HTTPS and SSH (git@) URLs.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="remote-name">
                  Name
                </label>
                <Input
                  id="remote-name"
                  placeholder="origin"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNameError(null);
                  }}
                  className="h-8 text-xs font-mono"
                  aria-describedby={nameError ? "remote-name-error" : undefined}
                />
                {nameError && (
                  <p id="remote-name-error" className="text-[10px] text-red-500">
                    {nameError}
                  </p>
                )}
              </div>

              {/* Fetch URL */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="remote-url">
                  URL
                </label>
                <Input
                  id="remote-url"
                  placeholder="https://github.com/user/repo.git"
                  value={newFetchUrl}
                  onChange={(e) => {
                    setNewFetchUrl(e.target.value);
                    setUrlError(null);
                  }}
                  className="h-8 text-xs font-mono"
                  aria-describedby={urlError ? "remote-url-error" : undefined}
                />
                {urlError && (
                  <p id="remote-url-error" className="text-[10px] text-red-500">
                    {urlError}
                  </p>
                )}
                {newFetchUrl && !urlError && (
                  <div className="flex items-center gap-1">
                    <ProtocolBadge url={newFetchUrl} />
                    <span className="text-[10px] text-muted-foreground">detected</span>
                  </div>
                )}
              </div>

              {/* Separate push URL toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="separate-push"
                  checked={separatePush}
                  onChange={(e) => setSeparatePush(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <label htmlFor="separate-push" className="text-xs text-muted-foreground cursor-pointer">
                  Use separate Push URL
                </label>
              </div>

              {separatePush && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground" htmlFor="push-url">
                    Push URL
                  </label>
                  <Input
                    id="push-url"
                    placeholder="git@github.com:user/repo.git"
                    value={newPushUrl}
                    onChange={(e) => setNewPushUrl(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddRemote}
                disabled={!newName.trim() || !newFetchUrl.trim()}
              >
                Add Remote
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
