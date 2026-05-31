"use client";

import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  GitBranch,
  MailPlus,
  Save,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type TeamRole = "Admin" | "Developer" | "Viewer";
type InviteStatus = "Active" | "Pending";

interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: TeamRole;
  status: InviteStatus;
}

interface ConfigVersion {
  id: string;
  label: string;
  author: string;
  createdAt: string;
  summary: string;
  content: string;
}

const INITIAL_CONFIG = `{
  "environment": "shared-testnet",
  "network": "testnet",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "horizonUrl": "https://horizon-testnet.stellar.org",
  "contractAliases": {
    "token": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUV..."
  },
  "variables": {
    "DEFAULT_ADMIN": "GBZXN7PIRZGNMHGA6..."
  }
}`;

const INITIAL_MEMBERS: TeamMember[] = [
  { id: 1, name: "Alice Smith", email: "alice@example.com", role: "Admin", status: "Active" },
  { id: 2, name: "Bob Jones", email: "bob@example.com", role: "Developer", status: "Active" },
  { id: 3, name: "Mina Patel", email: "mina@example.com", role: "Viewer", status: "Pending" },
];

const roleTone: Record<TeamRole, string> = {
  Admin: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  Developer: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Viewer: "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

function nextVersionLabel(current: string) {
  const [major, minor, patch] = current.replace("v", "").split(".").map(Number);
  return `v${major}.${minor}.${patch + 1}`;
}

export default function TeamsPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(INITIAL_MEMBERS);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("Developer");
  const [configContent, setConfigContent] = useState(INITIAL_CONFIG);
  const [versions, setVersions] = useState<ConfigVersion[]>([
    {
      id: "v1.0.0",
      label: "v1.0.0",
      author: "Alice Smith",
      createdAt: "2026-05-31 09:20",
      summary: "Initial shared testnet environment",
      content: INITIAL_CONFIG,
    },
  ]);
  const [selectedVersionId, setSelectedVersionId] = useState("v1.0.0");
  const [saveSummary, setSaveSummary] = useState("Updated network configuration");

  const activeVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const pendingInvites = useMemo(
    () => teamMembers.filter((member) => member.status === "Pending").length,
    [teamMembers],
  );

  const handleInvite = (event: React.FormEvent) => {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;

    setTeamMembers((members) => [
      ...members,
      {
        id: Date.now(),
        name: "Pending Invite",
        email,
        role: inviteRole,
        status: "Pending",
      },
    ]);
    setInviteEmail("");
  };

  const handleRoleChange = (id: number, role: TeamRole) => {
    setTeamMembers((members) =>
      members.map((member) => (member.id === id ? { ...member, role } : member)),
    );
  };

  const handleSaveConfig = () => {
    const nextLabel = nextVersionLabel(versions[versions.length - 1].label);
    const nextVersion: ConfigVersion = {
      id: nextLabel,
      label: nextLabel,
      author: "You",
      createdAt: new Date().toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      summary: saveSummary.trim() || "Configuration update",
      content: configContent,
    };

    setVersions((current) => [...current, nextVersion]);
    setSelectedVersionId(nextVersion.id);
  };

  const handleRestoreVersion = (version: ConfigVersion) => {
    setConfigContent(version.content);
    setSelectedVersionId(version.id);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Shared Environment Management</h1>
            <p className="text-sm text-muted-foreground">
              Coordinate team access, Stellar network settings, and versioned workspace configuration.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border border-border px-3 py-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                Members
              </div>
              <p className="mt-1 text-xl font-semibold">{teamMembers.length}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                Invites
              </div>
              <p className="mt-1 text-xl font-semibold">{pendingInvites}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <GitBranch className="h-4 w-4" />
                Version
              </div>
              <p className="mt-1 text-xl font-semibold">{activeVersion.label}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-sky-500" />
                  Team Access
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleInvite} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@example.com"
                    required
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as TeamRole)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="Developer">Developer</option>
                    <option value="Viewer">Viewer</option>
                    <option value="Admin">Admin</option>
                  </select>
                  <Button type="submit">
                    <MailPlus className="mr-2 h-4 w-4" />
                    Invite
                  </Button>
                </form>

                <div className="divide-y divide-border rounded-md border border-border">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_120px_120px] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{member.name}</p>
                          {member.status === "Active" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Clock3 className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <Badge variant="outline" className={roleTone[member.role]}>
                        {member.role}
                      </Badge>
                      <select
                        value={member.role}
                        onChange={(event) => handleRoleChange(member.id, event.target.value as TeamRole)}
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Developer">Developer</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <GitBranch className="h-5 w-5 text-emerald-500" />
                  Version History
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {versions
                  .slice()
                  .reverse()
                  .map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => handleRestoreVersion(version)}
                      className={`w-full rounded-md border p-3 text-left transition-colors ${
                        selectedVersionId === version.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-sm font-semibold">{version.label}</span>
                        <span className="text-xs text-muted-foreground">{version.createdAt}</span>
                      </div>
                      <p className="mt-1 text-sm">{version.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Saved by {version.author}</p>
                    </button>
                  ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="h-5 w-5 text-violet-500" />
                Shared Configuration Editor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <Input
                  value={saveSummary}
                  onChange={(event) => setSaveSummary(event.target.value)}
                  placeholder="Version summary"
                />
                <Button onClick={handleSaveConfig}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Version
                </Button>
              </div>

              <Textarea
                value={configContent}
                onChange={(event) => setConfigContent(event.target.value)}
                spellCheck={false}
                className="min-h-[460px] resize-y font-mono text-xs leading-5"
              />

              <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Active shared config: <strong className="text-foreground">{activeVersion.label}</strong>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => navigator.clipboard.writeText(configContent)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy JSON
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
