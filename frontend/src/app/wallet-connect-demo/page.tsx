"use client";

/**
 * Example client integration of the StellarWalletConnect binding.
 *
 * The page wires the binding to a mock SignClient by default so the
 * example is fully exercisable without a real WalletConnect bridge or
 * projectId. To talk to a real wallet, replace `mockSignClientFactory`
 * with one that constructs `@walletconnect/sign-client` and forwards the
 * provided projectId/metadata.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  STELLAR_CHAINS,
  StellarWalletConnect,
  WalletConnectError,
  memorySessionStorage,
  type SignClientFactory,
  type StellarChain,
  type StellarSession,
} from "@/lib/wallet";

import { mockSignClientFactory } from "./mockSignClientFactory";

const EXAMPLE_XDR =
  "AAAAAgAAAAA8B6T1jD1htNVnL6IZ+12dpQ7Z6BU4Tq3i4+9rXSn3SAAAAGQADIAVAAAAAQAAAAEAAAAAAAAAAAAAAABnTNkHAAAAAAAAAAEAAAAAAAAAAQAAAAAR6E2K4SuRmYqLuoG5cd7CqxxbDjF1zxFmHCWHzPVKqgAAAAAAAAAATEtAAAAAAAAAAAAA";

interface DemoState {
  uri: string | null;
  session: StellarSession | null;
  error: string | null;
  busy: boolean;
  signedXdr: string | null;
}

const INITIAL_STATE: DemoState = {
  uri: null,
  session: null,
  error: null,
  busy: false,
  signedXdr: null,
};

export default function WalletConnectDemoPage() {
  const [chain, setChain] = useState<StellarChain>(STELLAR_CHAINS.testnet);
  const [xdr, setXdr] = useState<string>(EXAMPLE_XDR);
  const [state, setState] = useState<DemoState>(INITIAL_STATE);

  // Memo-stable connector so unmounting/remounting doesn't recreate it.
  const connector = useMemo(
    () =>
      new StellarWalletConnect({
        projectId: "demo-project-id",
        metadata: {
          name: "Stellar Kit Demo",
          description: "WalletConnect bindings example.",
          url: "https://example.com",
          icons: [],
        },
        storage: memorySessionStorage(),
      }),
    [],
  );

  const factory: SignClientFactory = useCallback(
    () => Promise.resolve(mockSignClientFactory(chain)),
    [chain],
  );

  useEffect(() => {
    let cancelled = false;
    void connector.init({ signClientFactory: factory }).catch((err) => {
      if (!cancelled) {
        setState((s) => ({ ...s, error: describeError(err) }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [connector, factory]);

  useEffect(() => {
    const off = connector.on("disconnect", () =>
      setState((s) => ({ ...s, session: null, signedXdr: null, uri: null })),
    );
    return () => {
      off();
    };
  }, [connector]);

  const handleConnect = useCallback(async () => {
    setState({ ...INITIAL_STATE, busy: true });
    try {
      const { uri, session: sessionPromise } = await connector.connect({
        chains: [chain],
      });
      setState((s) => ({ ...s, uri }));
      const session = await sessionPromise;
      setState((s) => ({ ...s, session, busy: false }));
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: describeError(err),
      }));
    }
  }, [chain, connector]);

  const handleSign = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null, signedXdr: null }));
    try {
      const session = connector.getSession();
      const { signedXdr } = await connector.signTransaction({
        xdr,
        chain,
        account: session?.accounts[0]?.split(":").pop(),
      });
      setState((s) => ({ ...s, busy: false, signedXdr }));
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: describeError(err),
      }));
    }
  }, [chain, connector, xdr]);

  const handleDisconnect = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      await connector.disconnect();
      setState({ ...INITIAL_STATE });
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: describeError(err),
      }));
    }
  }, [connector]);

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">WalletConnect demo</h1>
          <p className="text-sm text-muted-foreground">
            Example integration of the Stellar WalletConnect bindings. The
            mock factory simulates a wallet so the page is fully clickable
            without a real bridge.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="chain-select">Chain</Label>
                <select
                  id="chain-select"
                  value={chain}
                  onChange={(e) => setChain(e.target.value as StellarChain)}
                  className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={!!state.session}
                >
                  <option value={STELLAR_CHAINS.testnet}>
                    {STELLAR_CHAINS.testnet}
                  </option>
                  <option value={STELLAR_CHAINS.pubnet}>
                    {STELLAR_CHAINS.pubnet}
                  </option>
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <div
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  data-testid="session-status"
                >
                  {state.session
                    ? `connected: ${state.session.peer.name}`
                    : state.uri
                      ? "waiting for approval"
                      : "disconnected"}
                </div>
              </div>
            </div>

            {state.uri ? (
              <div>
                <Label>Pairing URI</Label>
                <Input value={state.uri} readOnly className="font-mono text-xs" />
              </div>
            ) : null}

            {state.session ? (
              <div className="rounded-md border border-input p-3 text-xs font-mono">
                <div>topic: {state.session.topic}</div>
                <div>chains: {state.session.chains.join(", ")}</div>
                <div>account: {state.session.accounts[0]}</div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button
                onClick={handleConnect}
                disabled={state.busy || !!state.session}
                data-testid="connect-btn"
              >
                Connect
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={state.busy || !state.session}
                variant="secondary"
                data-testid="disconnect-btn"
              >
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign transaction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="xdr">Transaction XDR (base64)</Label>
              <Textarea
                id="xdr"
                value={xdr}
                onChange={(e) => setXdr(e.target.value)}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
            <Button
              onClick={handleSign}
              disabled={state.busy || !state.session}
              data-testid="sign-btn"
            >
              Sign XDR
            </Button>
            {state.signedXdr ? (
              <div>
                <Label>Signed XDR</Label>
                <Textarea
                  value={state.signedXdr}
                  readOnly
                  rows={4}
                  className="font-mono text-xs"
                  data-testid="signed-xdr"
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {state.error ? (
          <div
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
            data-testid="error-banner"
          >
            {state.error}
          </div>
        ) : null}
      </div>
    </main>
  );
}

const describeError = (err: unknown): string => {
  if (err instanceof WalletConnectError) {
    return `[${err.code}] ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
};
