"use client";

import { useState } from "react";

export default function LayoutQaPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <main className="min-h-screen bg-background p-4 text-foreground" data-testid="qa-layout-page">
      <div className="mb-3 flex items-center gap-2">
        <button
          data-testid="qa-toggle-sidebar"
          className="rounded border border-border px-3 py-1 text-sm"
          onClick={() => setSidebarOpen((prev) => !prev)}
        >
          Toggle Sidebar
        </button>
        <button
          data-testid="qa-toggle-panel"
          className="rounded border border-border px-3 py-1 text-sm"
          onClick={() => setPanelOpen((prev) => !prev)}
        >
          Toggle Panel
        </button>
      </div>

      <section className="grid min-h-[80vh] grid-cols-12 gap-3" data-testid="qa-layout-shell">
        {sidebarOpen ? (
          <aside
            data-testid="qa-sidebar"
            className="col-span-2 rounded border border-border bg-sidebar p-3"
          >
            <h2 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Sidebar</h2>
            <ul className="space-y-1 text-sm">
              <li>Explorer</li>
              <li>Git</li>
              <li>Deployments</li>
              <li>Testing</li>
            </ul>
          </aside>
        ) : null}

        <div
          data-testid="qa-editor"
          className={`${sidebarOpen ? "col-span-7" : "col-span-9"} rounded border border-border bg-card p-4`}
        >
          <h2 className="mb-3 text-sm font-semibold">Editor Surface</h2>
          <div className="rounded border border-border bg-background p-3 font-mono text-xs">
            fn invoke_contract() - sample editor payload
          </div>
        </div>

        {panelOpen ? (
          <aside
            data-testid="qa-right-panel"
            className="col-span-3 rounded border border-border bg-card p-3"
          >
            <h2 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Interact Panel</h2>
            <div className="space-y-2 text-xs">
              <div className="rounded border border-border bg-background px-2 py-1">Function: transfer</div>
              <div className="rounded border border-border bg-background px-2 py-1">Args: [to, amount]</div>
              <div className="rounded border border-border bg-background px-2 py-1">Network: testnet</div>
            </div>
          </aside>
        ) : null}
      </section>
    </main>
  );
}
