import { get as idbGet, set as idbSet } from "idb-keyval";

export interface DelegationEntry {
  /** The sub-account (delegate) public key that is being granted sponsorship rights */
  delegatePublicKey: string;
  /** The sponsor's public key that will pay fees on behalf of the delegate */
  sponsorPublicKey: string;
  /** Human-readable label for this delegation */
  label: string;
  /** Timestamp (ISO 8601) when this delegation was created */
  createdAt: string;
  /** Optional expiry (ISO 8601); undefined means indefinite */
  expiresAt?: string;
  /** Whether this delegation is currently active */
  active: boolean;
}

export interface DelegationAuditEntry {
  id: string;
  delegatePublicKey: string;
  sponsorPublicKey: string;
  action: "sponsored" | "revoked" | "expired";
  timestamp: string;
  details?: string;
}

interface DelegationStoreState {
  delegations: DelegationEntry[];
  auditLog: DelegationAuditEntry[];
}

const STORAGE_KEY = "stellar_delegation_store";
const AUDIT_STORAGE_KEY = "stellar_delegation_audit";
const MAX_AUDIT_ENTRIES = 500;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class DelegationStore {
  private static instance: DelegationStore;
  private state: DelegationStoreState = { delegations: [], auditLog: [] };

  private constructor() {}

  static getInstance(): DelegationStore {
    if (!DelegationStore.instance) {
      DelegationStore.instance = new DelegationStore();
    }
    return DelegationStore.instance;
  }

  async load(): Promise<void> {
    const [delegations, auditLog] = await Promise.all([
      idbGet<DelegationEntry[]>(STORAGE_KEY),
      idbGet<DelegationAuditEntry[]>(AUDIT_STORAGE_KEY),
    ]);
    this.state = {
      delegations: delegations ?? [],
      auditLog: auditLog ?? [],
    };
  }

  private async persist(): Promise<void> {
    await Promise.all([
      idbSet(STORAGE_KEY, this.state.delegations),
      idbSet(AUDIT_STORAGE_KEY, this.state.auditLog),
    ]);
  }

  private addAuditEntry(entry: Omit<DelegationAuditEntry, "id" | "timestamp">): void {
    const newEntry: DelegationAuditEntry = {
      ...entry,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };
    this.state.auditLog = [newEntry, ...this.state.auditLog].slice(0, MAX_AUDIT_ENTRIES);
  }

  getDelegations(): DelegationEntry[] {
    return [...this.state.delegations];
  }

  getActiveDelegations(): DelegationEntry[] {
    const now = new Date().toISOString();
    return this.state.delegations.filter(
      (d) => d.active && (!d.expiresAt || d.expiresAt > now)
    );
  }

  /** Returns the sponsor key for a given delegate, or null if no active delegation exists */
  getSponsorForDelegate(delegatePublicKey: string): string | null {
    const delegation = this.getActiveDelegations().find(
      (d) => d.delegatePublicKey === delegatePublicKey
    );
    return delegation?.sponsorPublicKey ?? null;
  }

  /** Returns all delegates currently assigned to a sponsor */
  getDelegatesForSponsor(sponsorPublicKey: string): DelegationEntry[] {
    return this.getActiveDelegations().filter(
      (d) => d.sponsorPublicKey === sponsorPublicKey
    );
  }

  async addDelegation(entry: Omit<DelegationEntry, "createdAt" | "active">): Promise<DelegationEntry> {
    const existing = this.state.delegations.find(
      (d) => d.delegatePublicKey === entry.delegatePublicKey && d.sponsorPublicKey === entry.sponsorPublicKey
    );
    if (existing) {
      throw new Error(
        `Delegation from ${entry.sponsorPublicKey} to ${entry.delegatePublicKey} already exists`
      );
    }

    const newEntry: DelegationEntry = {
      ...entry,
      createdAt: new Date().toISOString(),
      active: true,
    };
    this.state.delegations = [...this.state.delegations, newEntry];

    this.addAuditEntry({
      delegatePublicKey: entry.delegatePublicKey,
      sponsorPublicKey: entry.sponsorPublicKey,
      action: "sponsored",
      details: `Delegation created: ${entry.label}`,
    });

    await this.persist();
    return newEntry;
  }

  async revokeDelegation(delegatePublicKey: string, sponsorPublicKey: string): Promise<void> {
    const idx = this.state.delegations.findIndex(
      (d) => d.delegatePublicKey === delegatePublicKey && d.sponsorPublicKey === sponsorPublicKey
    );
    if (idx === -1) {
      throw new Error("Delegation not found");
    }

    this.state.delegations = this.state.delegations.map((d, i) =>
      i === idx ? { ...d, active: false } : d
    );

    this.addAuditEntry({
      delegatePublicKey,
      sponsorPublicKey,
      action: "revoked",
      details: "Delegation manually revoked",
    });

    await this.persist();
  }

  async removeDelegation(delegatePublicKey: string, sponsorPublicKey: string): Promise<void> {
    await this.revokeDelegation(delegatePublicKey, sponsorPublicKey);
    this.state.delegations = this.state.delegations.filter(
      (d) => !(d.delegatePublicKey === delegatePublicKey && d.sponsorPublicKey === sponsorPublicKey)
    );
    await this.persist();
  }

  /** Mark expired delegations and write audit entries */
  async pruneExpired(): Promise<number> {
    const now = new Date().toISOString();
    let pruned = 0;
    this.state.delegations = this.state.delegations.map((d) => {
      if (d.active && d.expiresAt && d.expiresAt <= now) {
        this.addAuditEntry({
          delegatePublicKey: d.delegatePublicKey,
          sponsorPublicKey: d.sponsorPublicKey,
          action: "expired",
          details: `Delegation expired at ${d.expiresAt}`,
        });
        pruned++;
        return { ...d, active: false };
      }
      return d;
    });
    if (pruned > 0) await this.persist();
    return pruned;
  }

  /** Record that a delegate used a sponsor for a transaction */
  async recordUsage(delegatePublicKey: string, sponsorPublicKey: string, details?: string): Promise<void> {
    this.addAuditEntry({
      delegatePublicKey,
      sponsorPublicKey,
      action: "sponsored",
      details,
    });
    await idbSet(AUDIT_STORAGE_KEY, this.state.auditLog);
  }

  getAuditLog(filter?: { delegatePublicKey?: string; sponsorPublicKey?: string }): DelegationAuditEntry[] {
    if (!filter) return [...this.state.auditLog];
    return this.state.auditLog.filter((entry) => {
      if (filter.delegatePublicKey && entry.delegatePublicKey !== filter.delegatePublicKey) return false;
      if (filter.sponsorPublicKey && entry.sponsorPublicKey !== filter.sponsorPublicKey) return false;
      return true;
    });
  }

  clearAuditLog(): void {
    this.state.auditLog = [];
    idbSet(AUDIT_STORAGE_KEY, []);
  }
}
