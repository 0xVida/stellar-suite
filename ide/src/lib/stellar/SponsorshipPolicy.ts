export type OperationType =
  | "createAccount"
  | "payment"
  | "pathPaymentStrictReceive"
  | "pathPaymentStrictSend"
  | "manageSellOffer"
  | "manageBuyOffer"
  | "createPassiveSellOffer"
  | "setOptions"
  | "changeTrust"
  | "allowTrust"
  | "accountMerge"
  | "manageData"
  | "bumpSequence"
  | "claimClaimableBalance"
  | "beginSponsoringFutureReserves"
  | "endSponsoringFutureReserves"
  | "revokeSponsorship"
  | "clawback"
  | "clawbackClaimableBalance"
  | "setTrustLineFlags"
  | "liquidityPoolDeposit"
  | "liquidityPoolWithdraw"
  | "invokeHostFunction"
  | "extendFootprintTtl"
  | "restoreFootprint";

export type EligibilityStatus = "eligible" | "ineligible" | "conditional";

export interface AssetFilter {
  assetCode?: string;
  issuer?: string;
  assetType?: "native" | "credit_alphanum4" | "credit_alphanum12" | "all";
}

export interface SponsorshipRule {
  id: string;
  name: string;
  allowedOperations: OperationType[];
  deniedOperations: OperationType[];
  assetFilter?: AssetFilter;
  maxFeePerOperation?: number;
  enabled: boolean;
  description?: string;
}

export interface PolicyViolation {
  operationType: OperationType;
  reason: string;
  ruleId?: string;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  eligible: OperationType[];
  ineligible: PolicyViolation[];
  conditional: { operation: OperationType; condition: string }[];
  badge: { label: string; color: string };
  policyName: string;
}

const STATUS_BADGE: Record<EligibilityStatus, { label: string; color: string }> = {
  eligible: { label: "Sponsored", color: "#10b981" },
  ineligible: { label: "Not Eligible", color: "#ef4444" },
  conditional: { label: "Conditional", color: "#f59e0b" },
};

export const DEFAULT_POLICY: SponsorshipRule = {
  id: "default",
  name: "Default Testnet Policy",
  allowedOperations: [
    "createAccount",
    "invokeHostFunction",
    "extendFootprintTtl",
    "restoreFootprint",
    "changeTrust",
    "payment",
  ],
  deniedOperations: ["accountMerge", "clawback", "clawbackClaimableBalance"],
  assetFilter: { assetType: "all" },
  maxFeePerOperation: 10_000_000, // 1 XLM in stroops
  enabled: true,
  description: "Allows common Soroban development operations",
};

export class SponsorshipPolicy {
  private rules: SponsorshipRule[];

  constructor(rules: SponsorshipRule[] = [DEFAULT_POLICY]) {
    this.rules = rules;
  }

  addRule(rule: SponsorshipRule): void {
    const existing = this.rules.findIndex((r) => r.id === rule.id);
    if (existing !== -1) {
      this.rules[existing] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  getRules(): SponsorshipRule[] {
    return [...this.rules];
  }

  getActiveRules(): SponsorshipRule[] {
    return this.rules.filter((r) => r.enabled);
  }

  /** Check a list of operation types against all active rules */
  checkEligibility(operations: OperationType[], sponsorPublicKey?: string): EligibilityResult {
    const activeRules = this.getActiveRules();
    if (activeRules.length === 0) {
      return {
        status: "ineligible",
        eligible: [],
        ineligible: operations.map((op) => ({ operationType: op, reason: "No active sponsorship rules" })),
        conditional: [],
        badge: STATUS_BADGE.ineligible,
        policyName: "None",
      };
    }

    // Merge all active rules: union of allowed, intersection logic for denied
    const allAllowed = new Set(activeRules.flatMap((r) => r.allowedOperations));
    const allDenied = new Set(activeRules.flatMap((r) => r.deniedOperations));
    const policyName = activeRules.map((r) => r.name).join(", ");

    const eligible: OperationType[] = [];
    const ineligible: PolicyViolation[] = [];
    const conditional: { operation: OperationType; condition: string }[] = [];

    for (const op of operations) {
      if (allDenied.has(op)) {
        const rule = activeRules.find((r) => r.deniedOperations.includes(op));
        ineligible.push({
          operationType: op,
          reason: `Denied by policy: ${rule?.name ?? "unknown"}`,
          ruleId: rule?.id,
        });
      } else if (allAllowed.has(op)) {
        const maxFeeRule = activeRules.find((r) => r.allowedOperations.includes(op) && r.maxFeePerOperation !== undefined);
        if (maxFeeRule?.maxFeePerOperation !== undefined) {
          conditional.push({
            operation: op,
            condition: `Fee must not exceed ${maxFeeRule.maxFeePerOperation} stroops`,
          });
        } else {
          eligible.push(op);
        }
      } else {
        ineligible.push({
          operationType: op,
          reason: "Operation not explicitly allowed by any active policy",
        });
      }
    }

    let status: EligibilityStatus = "eligible";
    if (ineligible.length > 0 && eligible.length === 0 && conditional.length === 0) {
      status = "ineligible";
    } else if (conditional.length > 0 || (ineligible.length > 0 && eligible.length > 0)) {
      status = "conditional";
    }

    return {
      status,
      eligible,
      ineligible,
      conditional,
      badge: STATUS_BADGE[status],
      policyName,
    };
  }

  /** Returns a human-readable summary of the active policy for display */
  getPolicySummary(): string {
    const active = this.getActiveRules();
    if (active.length === 0) return "No active sponsorship policies.";
    return active.map((r) => `[${r.name}] Allows: ${r.allowedOperations.join(", ")}`).join("\n");
  }

  /** Serialize policy to JSON for persistence */
  toJSON(): string {
    return JSON.stringify(this.rules, null, 2);
  }

  static fromJSON(json: string): SponsorshipPolicy {
    try {
      const rules = JSON.parse(json) as SponsorshipRule[];
      return new SponsorshipPolicy(rules);
    } catch {
      return new SponsorshipPolicy();
    }
  }
}
