import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, X } from "lucide-react";
import {
  WalletAdapter,
  type ConsentDescriptor,
  type ConsentDecision,
  type WalletScope,
} from "@/lib/wallet/WalletAdapter";

interface PendingRequest {
  descriptor: ConsentDescriptor;
  resolve: (decision: ConsentDecision) => void;
}

const SCOPE_COPY: Record<WalletScope, { label: string; description: string; sensitive: boolean }> = {
  "connect:read": {
    label: "Connect wallet",
    description: "Read your wallet's public key. No signing permission is granted.",
    sensitive: false,
  },
  "sign:invoke": {
    label: "Sign contract invocation",
    description:
      "Authorize a single contract function call. The session is consumed after one signature.",
    sensitive: true,
  },
  "sign:deploy": {
    label: "Sign deployment transaction",
    description:
      "Authorize a single deployment step (upload or instantiate). The session is consumed after one signature.",
    sensitive: true,
  },
  "sign:transaction": {
    label: "Sign transaction",
    description: "Authorize a single Stellar transaction. The session is consumed after one signature.",
    sensitive: true,
  },
};

/**
 * Sits in the React tree and brokers wallet consent requests issued by the
 * WalletAdapter. Mount once near the root.
 */
export function WalletPermissionPrompt() {
  const [pending, setPending] = useState<PendingRequest | null>(null);

  useEffect(() => {
    const unregister = WalletAdapter.registerConsentHandler((descriptor) =>
      new Promise<ConsentDecision>((resolve) => {
        setPending({ descriptor, resolve });
      }),
    );
    return () => {
      unregister();
    };
  }, []);

  const copy = useMemo(() => {
    if (!pending) return null;
    return SCOPE_COPY[pending.descriptor.scope];
  }, [pending]);

  if (!pending || !copy) return null;

  const { descriptor, resolve } = pending;
  const detailEntries = Object.entries(descriptor.details ?? {}).filter(
    ([, value]) => value && value.trim() !== "",
  );

  const approve = () => {
    resolve({ approved: true });
    setPending(null);
  };

  const deny = (reason?: string) => {
    resolve({ approved: false, reason });
    setPending(null);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-consent-title"
    >
      <div className="w-full max-w-md rounded-lg border border-primary/30 bg-card p-6 shadow-xl shadow-primary/10 relative">
        <button
          onClick={() => deny("User dismissed the consent prompt.")}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div
            className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full ${
              copy.sensitive ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"
            }`}
          >
            {copy.sensitive ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <h2 id="wallet-consent-title" className="text-base font-semibold text-foreground">
              {copy.label}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Requested by Stellar Suite IDE · {descriptor.walletType}
            </p>
          </div>
        </div>

        <p className="text-sm text-foreground mb-4">{descriptor.action}</p>

        <div className="rounded-md border border-border bg-muted/40 p-3 mb-4">
          <p className="text-xs text-muted-foreground mb-2">{copy.description}</p>
          {detailEntries.length > 0 && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
              {detailEntries.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="font-mono text-foreground break-all">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {copy.sensitive && (
          <p className="text-[11px] text-muted-foreground mb-4">
            A scoped session key is minted for this single action and revoked immediately after it
            completes. The IDE never retains long-lived signing authority.
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => deny()}
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-background hover:bg-muted transition-colors"
          >
            Deny
          </button>
          <button
            onClick={approve}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            autoFocus
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
