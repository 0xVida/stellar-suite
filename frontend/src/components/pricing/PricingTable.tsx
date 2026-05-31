"use client";

import { useState } from "react";
import { Check, Minus, Zap, Star, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type BillingCycle = "monthly" | "annual";

interface Feature {
  label: string;
  included: boolean | string;
}

interface Tier {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  icon: React.ReactNode;
  badge?: string;
  highlighted?: boolean;
  cta: string;
  features: Feature[];
}

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    description: "Get started with Stellar development at no cost.",
    monthlyPrice: 0,
    annualPrice: 0,
    icon: <Zap className="h-5 w-5" />,
    cta: "Get started free",
    features: [
      { label: "Soroban contract editor", included: true },
      { label: "Up to 3 projects", included: true },
      { label: "Basic deployment tools", included: true },
      { label: "Testnet deployments", included: true },
      { label: "Community support", included: true },
      { label: "Advanced simulation", included: false },
      { label: "Contract history & versioning", included: false },
      { label: "Team collaboration", included: false },
      { label: "Priority support", included: false },
      { label: "Custom integrations", included: false },
      { label: "SLA guarantee", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For developers building production-grade Stellar apps.",
    monthlyPrice: 29,
    annualPrice: 23,
    icon: <Star className="h-5 w-5" />,
    badge: "Most popular",
    highlighted: true,
    cta: "Start Pro trial",
    features: [
      { label: "Soroban contract editor", included: true },
      { label: "Unlimited projects", included: true },
      { label: "Advanced deployment tools", included: true },
      { label: "Testnet & Mainnet deployments", included: true },
      { label: "Email & chat support", included: true },
      { label: "Advanced simulation", included: true },
      { label: "Contract history & versioning", included: true },
      { label: "Team collaboration", included: "Up to 5 members" },
      { label: "Priority support", included: false },
      { label: "Custom integrations", included: false },
      { label: "SLA guarantee", included: false },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Tailored solutions for teams and organizations at scale.",
    monthlyPrice: null,
    annualPrice: null,
    icon: <Building2 className="h-5 w-5" />,
    cta: "Contact sales",
    features: [
      { label: "Soroban contract editor", included: true },
      { label: "Unlimited projects", included: true },
      { label: "Advanced deployment tools", included: true },
      { label: "Testnet & Mainnet deployments", included: true },
      { label: "Dedicated account support", included: true },
      { label: "Advanced simulation", included: true },
      { label: "Contract history & versioning", included: true },
      { label: "Team collaboration", included: "Unlimited members" },
      { label: "Priority support", included: true },
      { label: "Custom integrations", included: true },
      { label: "SLA guarantee", included: true },
    ],
  },
];

interface CheckoutModalProps {
  tier: Tier;
  billing: BillingCycle;
  onClose: () => void;
}

function CheckoutModal({ tier, billing, onClose }: CheckoutModalProps) {
  const price = billing === "annual" ? tier.annualPrice : tier.monthlyPrice;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {tier.icon}
          </div>
          <div>
            <h2
              id="checkout-title"
              className="font-display font-bold text-foreground text-lg"
            >
              {tier.name} Plan
            </h2>
            <p className="text-sm font-body text-muted-foreground">
              {price !== null
                ? `$${price}/mo · billed ${billing}`
                : "Custom pricing"}
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs font-semibold font-display uppercase tracking-widest text-muted-foreground block mb-1.5">
              Email address
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
            />
          </div>
          {tier.id !== "enterprise" && (
            <>
              <div>
                <label className="text-xs font-semibold font-display uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Card number
                </label>
                <input
                  type="text"
                  placeholder="4242 4242 4242 4242"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold font-display uppercase tracking-widest text-muted-foreground block mb-1.5">
                    Expiry
                  </label>
                  <input
                    type="text"
                    placeholder="MM / YY"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold font-display uppercase tracking-widest text-muted-foreground block mb-1.5">
                    CVC
                  </label>
                  <input
                    type="text"
                    placeholder="123"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                  />
                </div>
              </div>
            </>
          )}
          {tier.id === "enterprise" && (
            <div>
              <label className="text-xs font-semibold font-display uppercase tracking-widest text-muted-foreground block mb-1.5">
                Company name
              </label>
              <input
                type="text"
                placeholder="Acme Corp"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
              />
            </div>
          )}
        </div>

        <p className="text-xs font-body text-muted-foreground text-center mb-5">
          This is a mock checkout. No real payment will be processed.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold font-display text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button onClick={onClose} className="flex-1 btn-primary text-sm">
            {tier.id === "enterprise" ? "Send inquiry" : "Subscribe now"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PricingTable() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [activeTier, setActiveTier] = useState<Tier | null>(null);

  return (
    <div className="w-full">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-10 sm:mb-12">
        <span
          className={cn(
            "text-sm font-semibold font-display transition-colors",
            billing === "monthly" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          Monthly
        </span>
        <button
          role="switch"
          aria-checked={billing === "annual"}
          onClick={() =>
            setBilling((prev) => (prev === "monthly" ? "annual" : "monthly"))
          }
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-background",
            billing === "annual" ? "bg-primary" : "bg-border"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
              billing === "annual" ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
        <span
          className={cn(
            "text-sm font-semibold font-display transition-colors flex items-center gap-1.5",
            billing === "annual" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          Annual
          <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-body font-medium">
            Save 20%
          </span>
        </span>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
        {TIERS.map((tier) => {
          const price =
            billing === "annual" ? tier.annualPrice : tier.monthlyPrice;
          return (
            <div
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 sm:p-8 transition-shadow duration-200",
                tier.highlighted
                  ? "border-primary/50 bg-primary/5 shadow-xl shadow-primary/10 ring-1 ring-primary/20"
                  : "border-border bg-card hover:shadow-md"
              )}
            >
              {tier.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="whitespace-nowrap rounded-full bg-primary px-3.5 py-1 text-xs font-bold font-display text-primary-foreground shadow-sm">
                    {tier.badge}
                  </span>
                </div>
              )}

              {/* Header */}
              <div className="mb-6">
                <div
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4",
                    tier.highlighted
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary"
                  )}
                >
                  {tier.icon}
                </div>
                <h3 className="font-display font-bold text-foreground text-xl mb-1.5">
                  {tier.name}
                </h3>
                <p className="text-sm font-body text-muted-foreground leading-relaxed">
                  {tier.description}
                </p>
              </div>

              {/* Price */}
              <div className="mb-6 min-h-[3.5rem]">
                {price !== null ? (
                  <>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-display font-extrabold tracking-tight text-foreground">
                        ${price}
                      </span>
                      <span className="text-sm font-body text-muted-foreground mb-1.5">
                        /mo
                      </span>
                    </div>
                    {billing === "annual" && price > 0 && (
                      <p className="text-xs font-body text-muted-foreground mt-1">
                        ${price * 12} billed annually
                      </p>
                    )}
                    {price === 0 && (
                      <p className="text-xs font-body text-muted-foreground mt-1">
                        No credit card required
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-4xl font-display font-extrabold tracking-tight text-foreground">
                      Custom
                    </div>
                    <p className="text-xs font-body text-muted-foreground mt-1">
                      Volume discounts available
                    </p>
                  </>
                )}
              </div>

              {/* CTA */}
              <button
                onClick={() => setActiveTier(tier)}
                className={cn(
                  "w-full rounded-lg px-4 py-2.5 text-sm font-semibold font-display transition-all duration-150 mb-7",
                  tier.highlighted
                    ? "btn-primary"
                    : "border border-border text-foreground hover:bg-muted hover:border-foreground/20"
                )}
              >
                {tier.cta}
              </button>

              {/* Divider */}
              <div className="border-t border-border mb-6" />

              {/* Features */}
              <ul className="space-y-3 flex-1">
                {tier.features.map((feature) => (
                  <li
                    key={feature.label}
                    className="flex items-start gap-2.5 text-sm font-body"
                  >
                    {feature.included ? (
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    ) : (
                      <Minus className="h-4 w-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                    )}
                    <span
                      className={cn(
                        feature.included
                          ? "text-foreground"
                          : "text-muted-foreground/50"
                      )}
                    >
                      {feature.label}
                      {typeof feature.included === "string" && (
                        <span className="ml-1 text-xs text-muted-foreground font-medium">
                          ({feature.included})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Checkout modal */}
      {activeTier && (
        <CheckoutModal
          tier={activeTier}
          billing={billing}
          onClose={() => setActiveTier(null)}
        />
      )}
    </div>
  );
}
