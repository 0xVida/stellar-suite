"use client";

import { useState, useEffect, useRef } from "react";
import { Rocket, Play, FileCode, Terminal, Shield } from "lucide-react";

// ─── VS Code mock content per tab ───────────────────────────────────────────

const vscodeMocks: Record<
  string,
  {
    filename: string;
    language: string;
    lines: { indent: number; tokens: { text: string; color: string }[] }[];
    terminal?: string[];
    sidePanel?: {
      label: string;
      value: string;
      status?: "ok" | "warn" | "err";
    }[];
  }
> = {
  Deploy: {
    filename: "deploy.ts",
    language: "typescript",
    lines: [
      {
        indent: 0,
        tokens: [
          { text: "import", color: "#c792ea" },
          { text: " { StellarSuite } ", color: "#cdd3de" },
          { text: "from", color: "#c792ea" },
          { text: " 'stellar-kit'", color: "#c3e88d" },
        ],
      },
      { indent: 0, tokens: [] },
      {
        indent: 0,
        tokens: [
          { text: "const", color: "#c792ea" },
          { text: " suite ", color: "#cdd3de" },
          { text: "=", color: "#89ddff" },
          { text: " new ", color: "#c792ea" },
          { text: "StellarSuite", color: "#82aaff" },
          { text: "()", color: "#cdd3de" },
        ],
      },
      { indent: 0, tokens: [] },
      {
        indent: 0,
        tokens: [{ text: "// Deploy to testnet", color: "#546e7a" }],
      },
      {
        indent: 0,
        tokens: [
          { text: "await", color: "#c792ea" },
          { text: " suite.", color: "#cdd3de" },
          { text: "deploy", color: "#82aaff" },
          { text: "({", color: "#cdd3de" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "network", color: "#f07178" },
          { text: ": ", color: "#89ddff" },
          { text: "'testnet'", color: "#c3e88d" },
          { text: ",", color: "#cdd3de" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "contract", color: "#f07178" },
          { text: ": ", color: "#89ddff" },
          { text: "'HelloWorld'", color: "#c3e88d" },
          { text: ",", color: "#cdd3de" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "signer", color: "#f07178" },
          { text: ": ", color: "#89ddff" },
          { text: "identity", color: "#cdd3de" },
        ],
      },
      { indent: 0, tokens: [{ text: "})", color: "#cdd3de" }] },
    ],
    terminal: [
      "$ stellar deploy --network testnet",
      "✓ Compiled HelloWorld.wasm (2.3kb)",
      "✓ Uploaded to testnet",
      "✓ Contract ID: CCHKN...XF72",
      "  Deployed in 1.42s",
    ],
    sidePanel: [
      { label: "Network", value: "Testnet", status: "ok" },
      { label: "Contract", value: "HelloWorld", status: "ok" },
      { label: "Status", value: "Deployed ✓", status: "ok" },
      { label: "Gas used", value: "14,820 stroops" },
    ],
  },
  Simulate: {
    filename: "simulate.ts",
    language: "typescript",
    lines: [
      {
        indent: 0,
        tokens: [{ text: "// Simulate before sending", color: "#546e7a" }],
      },
      {
        indent: 0,
        tokens: [
          { text: "const", color: "#c792ea" },
          { text: " result ", color: "#cdd3de" },
          { text: "=", color: "#89ddff" },
          { text: " await ", color: "#c792ea" },
          { text: "suite.", color: "#cdd3de" },
          { text: "simulate", color: "#82aaff" },
          { text: "({", color: "#cdd3de" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "fn", color: "#f07178" },
          { text: ": ", color: "#89ddff" },
          { text: "'transfer'", color: "#c3e88d" },
          { text: ",", color: "#cdd3de" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "args", color: "#f07178" },
          { text: ": ", color: "#89ddff" },
          { text: "[from, to, amount]", color: "#cdd3de" },
        ],
      },
      { indent: 0, tokens: [{ text: "})", color: "#cdd3de" }] },
      { indent: 0, tokens: [] },
      {
        indent: 0,
        tokens: [
          { text: "console", color: "#cdd3de" },
          { text: ".", color: "#89ddff" },
          { text: "log", color: "#82aaff" },
          { text: "(result.", color: "#cdd3de" },
          { text: "returnValue", color: "#f07178" },
          { text: ")", color: "#cdd3de" },
        ],
      },
    ],
    terminal: [
      "$ stellar simulate transfer",
      "  Simulating transaction...",
      "✓ Return value: true",
      "✓ Fee estimate: 203 stroops",
      "✓ No state changes detected",
    ],
    sidePanel: [
      { label: "Function", value: "transfer()", status: "ok" },
      { label: "Fee est.", value: "203 stroops", status: "ok" },
      { label: "Return", value: "true", status: "ok" },
      { label: "Warnings", value: "None", status: "ok" },
    ],
  },
  Build: {
    filename: "HelloWorld.rs",
    language: "rust",
    lines: [
      { indent: 0, tokens: [{ text: "#![no_std]", color: "#546e7a" }] },
      {
        indent: 0,
        tokens: [
          { text: "use", color: "#c792ea" },
          { text: " soroban_sdk", color: "#cdd3de" },
          { text: "::{", color: "#89ddff" },
          { text: "contract, contractimpl, Env", color: "#82aaff" },
          { text: "};", color: "#cdd3de" },
        ],
      },
      { indent: 0, tokens: [] },
      { indent: 0, tokens: [{ text: "#[contract]", color: "#c3e88d" }] },
      {
        indent: 0,
        tokens: [
          { text: "pub", color: "#c792ea" },
          { text: " struct ", color: "#cdd3de" },
          { text: "HelloWorld", color: "#82aaff" },
          { text: ";", color: "#cdd3de" },
        ],
      },
      { indent: 0, tokens: [] },
      { indent: 0, tokens: [{ text: "#[contractimpl]", color: "#c3e88d" }] },
      {
        indent: 0,
        tokens: [
          { text: "impl", color: "#c792ea" },
          { text: " HelloWorld {", color: "#cdd3de" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "pub", color: "#c792ea" },
          { text: " fn ", color: "#cdd3de" },
          { text: "hello", color: "#82aaff" },
          { text: "(_env: ", color: "#cdd3de" },
          { text: "Env", color: "#82aaff" },
          { text: ") -> ", color: "#cdd3de" },
          { text: "String", color: "#82aaff" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "  {", color: "#cdd3de" },
          { text: ' "Hello, Stellar!"', color: "#c3e88d" },
          { text: ".into() }", color: "#cdd3de" },
        ],
      },
      { indent: 0, tokens: [{ text: "}", color: "#cdd3de" }] },
    ],
    terminal: [
      "$ cargo build --target wasm32-unknown-unknown",
      "   Compiling hello_world v0.1.0",
      "✓ Finished release [optimized]",
      "✓ hello_world.wasm → target/wasm32/",
      "  Build time: 3.1s",
    ],
    sidePanel: [
      { label: "Target", value: "wasm32", status: "ok" },
      { label: "Output", value: "hello_world.wasm", status: "ok" },
      { label: "Size", value: "2.3 KB", status: "ok" },
      { label: "Errors", value: "0", status: "ok" },
    ],
  },
  Test: {
    filename: "hello_world_test.rs",
    language: "rust",
    lines: [
      { indent: 0, tokens: [{ text: "#[cfg(test)]", color: "#c3e88d" }] },
      {
        indent: 0,
        tokens: [
          { text: "mod", color: "#c792ea" },
          { text: " tests {", color: "#cdd3de" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "use", color: "#c792ea" },
          { text: " super::*;", color: "#cdd3de" },
        ],
      },
      { indent: 0, tokens: [] },
      { indent: 2, tokens: [{ text: "#[test]", color: "#c3e88d" }] },
      {
        indent: 2,
        tokens: [
          { text: "fn", color: "#c792ea" },
          { text: " test_hello", color: "#82aaff" },
          { text: "() {", color: "#cdd3de" },
        ],
      },
      {
        indent: 4,
        tokens: [
          { text: "let", color: "#c792ea" },
          { text: " env ", color: "#cdd3de" },
          { text: "=", color: "#89ddff" },
          { text: " Env::", color: "#cdd3de" },
          { text: "default", color: "#82aaff" },
          { text: "();", color: "#cdd3de" },
        ],
      },
      {
        indent: 4,
        tokens: [
          { text: "assert_eq!", color: "#82aaff" },
          { text: "(hello(env), ", color: "#cdd3de" },
          { text: '"Hello, Stellar!"', color: "#c3e88d" },
          { text: ");", color: "#cdd3de" },
        ],
      },
      { indent: 2, tokens: [{ text: "}", color: "#cdd3de" }] },
      { indent: 0, tokens: [{ text: "}", color: "#cdd3de" }] },
    ],
    terminal: [
      "$ cargo test",
      "  running 3 tests",
      "✓ test_hello ... ok",
      "✓ test_transfer ... ok",
      "✓ test_balance ... ok",
      "  test result: ok. 3 passed; 0 failed",
    ],
    sidePanel: [
      { label: "Tests run", value: "3", status: "ok" },
      { label: "Passed", value: "3 ✓", status: "ok" },
      { label: "Failed", value: "0", status: "ok" },
      { label: "Coverage", value: "94%", status: "ok" },
    ],
  },
  Manage: {
    filename: "accounts.ts",
    language: "typescript",
    lines: [
      {
        indent: 0,
        tokens: [{ text: "// Create & fund a new account", color: "#546e7a" }],
      },
      {
        indent: 0,
        tokens: [
          { text: "const", color: "#c792ea" },
          { text: " account ", color: "#cdd3de" },
          { text: "=", color: "#89ddff" },
          { text: " await ", color: "#c792ea" },
          { text: "suite.", color: "#cdd3de" },
          { text: "createAccount", color: "#82aaff" },
          { text: "({", color: "#cdd3de" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "alias", color: "#f07178" },
          { text: ": ", color: "#89ddff" },
          { text: "'alice'", color: "#c3e88d" },
          { text: ",", color: "#cdd3de" },
        ],
      },
      {
        indent: 2,
        tokens: [
          { text: "fund", color: "#f07178" },
          { text: ": ", color: "#89ddff" },
          { text: "true", color: "#c792ea" },
        ],
      },
      { indent: 0, tokens: [{ text: "})", color: "#cdd3de" }] },
      { indent: 0, tokens: [] },
      {
        indent: 0,
        tokens: [{ text: "// Switch network config", color: "#546e7a" }],
      },
      {
        indent: 0,
        tokens: [
          { text: "suite.", color: "#cdd3de" },
          { text: "setNetwork", color: "#82aaff" },
          { text: "('mainnet')", color: "#c3e88d" },
        ],
      },
    ],
    terminal: [
      "$ stellar account create alice --fund",
      "✓ Keypair generated",
      "✓ Funded via Friendbot",
      "  Balance: 10,000 XLM",
      "  Public: GDTKN...WQ9X",
    ],
    sidePanel: [
      { label: "Alias", value: "alice", status: "ok" },
      { label: "Balance", value: "10,000 XLM", status: "ok" },
      { label: "Network", value: "Testnet", status: "ok" },
      { label: "Keys", value: "Stored ✓", status: "ok" },
    ],
  },
};

// ─── Animated typing cursor ──────────────────────────────────────────────────
function TypingCursor() {
  return (
    <span
      className="inline-block w-[2px] h-[14px] bg-[#aeafad] align-middle ml-0.5"
      style={{ animation: "blink 1s step-end infinite" }}
    />
  );
}

// ─── VS Code Mock Window ─────────────────────────────────────────────────────
function VSCodeWindow({ tabLabel }: { tabLabel: string }) {
  const mock = vscodeMocks[tabLabel];
  const [visibleLines, setVisibleLines] = useState(0);
  const [visibleTermLines, setVisibleTermLines] = useState(0);
  const animatingRef = useRef(false);

  useEffect(() => {
    setVisibleLines(0);
    setVisibleTermLines(0);
    animatingRef.current = true;

    // Animate code lines
    let line = 0;
    const codeInterval = setInterval(() => {
      line++;
      setVisibleLines(line);
      if (line >= mock.lines.length) {
        clearInterval(codeInterval);
        // Then animate terminal
        if (mock.terminal) {
          let tLine = 0;
          const termInterval = setInterval(() => {
            tLine++;
            setVisibleTermLines(tLine);
            if (tLine >= mock.terminal!.length) clearInterval(termInterval);
          }, 160);
        }
      }
    }, 80);

    return () => {
      clearInterval(codeInterval);
      animatingRef.current = false;
    };
  }, [tabLabel, mock.lines.length, mock.terminal]);

  const statusColor = (s?: "ok" | "warn" | "err") =>
    s === "ok"
      ? "#4ec9b0"
      : s === "warn"
        ? "#dcdcaa"
        : s === "err"
          ? "#f44747"
          : "#858585";

  return (
    <div
      className="w-full rounded-xl overflow-hidden border border-[#1e1e2e] shadow-2xl"
      style={{
        background: "#1e1e1e",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ background: "#323233" }}
      >
        <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
        <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
        <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
        <span className="ml-3 text-xs text-[#858585] flex-1 text-center">
          {mock.filename} — Stellar Kit
        </span>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-0 text-xs border-b border-[#252526]"
        style={{ background: "#252526" }}
      >
        <div
          className="px-4 py-2 border-r border-[#1e1e1e] border-t-2 border-t-[#007acc] text-[#cdd3de]"
          style={{ background: "#1e1e1e" }}
        >
          {mock.filename}
        </div>
        <div className="px-4 py-2 text-[#858585]">stellar.config.ts</div>
      </div>

      {/* Main layout: editor + side panel */}
      <div className="flex" style={{ minHeight: "240px" }}>
        {/* Line numbers + code */}
        <div className="flex-1 overflow-hidden">
          <div className="flex">
            {/* Line numbers */}
            <div
              className="select-none text-right pr-4 pt-3 pb-2 text-xs leading-[1.7] min-w-[2.5rem]"
              style={{ color: "#495162", background: "#1e1e1e" }}
            >
              {mock.lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            {/* Code */}
            <div className="pt-3 pb-2 pr-4 text-xs leading-[1.7] overflow-x-auto flex-1">
              {mock.lines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    paddingLeft: `${line.indent * 0.85}rem`,
                    opacity: i < visibleLines ? 1 : 0,
                    transition: "opacity 0.15s ease",
                  }}
                >
                  {line.tokens.length === 0 ? (
                    <span>&nbsp;</span>
                  ) : (
                    line.tokens.map((t, j) => (
                      <span key={j} style={{ color: t.color }}>
                        {t.text}
                      </span>
                    ))
                  )}
                  {i === visibleLines - 1 && i < mock.lines.length - 1 && (
                    <TypingCursor />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side panel */}
        {mock.sidePanel && (
          <div
            className="border-l border-[#252526] px-4 py-3 flex flex-col gap-2 min-w-[140px]"
            style={{ background: "#252526" }}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-widest mb-1"
              style={{ color: "#858585" }}
            >
              Stellar Kit
            </div>
            {mock.sidePanel.map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <span className="text-[10px]" style={{ color: "#858585" }}>
                  {item.label}
                </span>
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: statusColor(item.status) }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Terminal panel */}
      {mock.terminal && (
        <div
          className="border-t border-[#252526]"
          style={{ background: "#1a1a1a" }}
        >
          <div
            className="flex items-center gap-3 px-4 py-1.5 border-b border-[#252526]"
            style={{ background: "#252526" }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "#007acc" }}
            >
              Terminal
            </span>
            <span className="text-[10px]" style={{ color: "#858585" }}>
              zsh
            </span>
          </div>
          <div className="px-4 py-2.5 text-xs leading-[1.8] min-h-[90px]">
            {mock.terminal.map((line, i) => (
              <div
                key={i}
                style={{
                  opacity: i < visibleTermLines ? 1 : 0,
                  transition: "opacity 0.2s ease",
                  color: line.startsWith("✓")
                    ? "#4ec9b0"
                    : line.startsWith("$")
                      ? "#dcdcaa"
                      : "#858585",
                }}
              >
                {line}
                {i === visibleTermLines - 1 &&
                  i < mock.terminal!.length - 1 && <TypingCursor />}
              </div>
            ))}
            {visibleTermLines >= mock.terminal.length && (
              <div style={{ color: "#858585" }}>
                $ <TypingCursor />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status bar */}
      <div
        className="flex items-center gap-4 px-4 py-1 text-[10px]"
        style={{ background: "#007acc", color: "#fff" }}
      >
        <span>⎇ main</span>
        <span>Stellar Kit</span>
        <span className="ml-auto">TypeScript</span>
        <span>UTF-8</span>
        <span>Ln {mock.lines.length}, Col 1</span>
      </div>
    </div>
  );
}

// ─── Tab data ────────────────────────────────────────────────────────────────

const tabs = [
  {
    label: "Deploy",
    icon: Rocket,
    description:
      "One-click deployment lets you push Soroban smart contracts to testnet or mainnet without leaving VS Code.",
    bullets: [
      {
        title: "One-click deploy:",
        text: "Select your target network and deploy instantly — no terminal commands needed.",
      },
      {
        title: "Environment management:",
        text: "Switch between testnet, futurenet, and mainnet environments effortlessly.",
      },
      {
        title: "Deploy history:",
        text: "Track every deployment with built-in logs and contract addresses.",
      },
      {
        title: "Error handling:",
        text: "Get clear, actionable error messages right in your editor when deployments fail.",
      },
    ],
  },
  {
    label: "Simulate",
    icon: Play,
    description:
      "Test transactions before committing them to the blockchain — simulate any contract invocation with real-time feedback.",
    bullets: [
      {
        title: "Transaction preview:",
        text: "See exactly what a transaction will do before you send it.",
      },
      {
        title: "Gas estimation:",
        text: "Get accurate resource and fee estimates for every transaction.",
      },
      {
        title: "Debug outputs:",
        text: "View detailed logs and return values from simulated contract calls.",
      },
      {
        title: "Iterate faster:",
        text: "Catch bugs in seconds instead of waiting for on-chain failures.",
      },
    ],
  },
  {
    label: "Build",
    icon: FileCode,
    description:
      "Scaffold, compile, and manage Soroban projects with built-in tooling that understands your contract structure.",
    bullets: [
      {
        title: "Project scaffolding:",
        text: "Create new Soroban projects from templates with a single command.",
      },
      {
        title: "Auto-compile:",
        text: "Contracts are built automatically on save with real-time error reporting.",
      },
      {
        title: "WASM management:",
        text: "Compiled WASM files are organized and ready for deployment.",
      },
      {
        title: "Multi-contract support:",
        text: "Manage multiple contracts in a single workspace seamlessly.",
      },
    ],
  },
  {
    label: "Test",
    icon: Shield,
    description:
      "Run your contract tests with integrated test runners and get results right in the editor.",
    bullets: [
      {
        title: "Inline test results:",
        text: "See pass/fail status next to each test function.",
      },
      {
        title: "Coverage reports:",
        text: "Understand which parts of your contract are tested.",
      },
      {
        title: "Watch mode:",
        text: "Tests re-run automatically as you edit your contracts.",
      },
      {
        title: "Snapshot testing:",
        text: "Compare contract state before and after transactions.",
      },
    ],
  },
  {
    label: "Manage",
    icon: Terminal,
    description:
      "Manage accounts, keys, identities, and network configurations — all from a visual interface.",
    bullets: [
      {
        title: "Account management:",
        text: "Create, fund, and manage Stellar accounts without the CLI.",
      },
      {
        title: "Key management:",
        text: "Securely store and use signing keys within VS Code.",
      },
      {
        title: "Network config:",
        text: "Configure custom RPC endpoints and network settings visually.",
      },
      {
        title: "Contract interactions:",
        text: "Invoke deployed contracts with a graphical form interface.",
      },
    ],
  },
];

// ─── Main Section ─────────────────────────────────────────────────────────────

const UseCasesSection = () => {
  const [active, setActive] = useState(0);
  const current = tabs[active];

  return (
    <>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>

      <section id="use-cases" className="section-padding">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-display font-extrabold tracking-tight text-foreground leading-tight">
              Endless ways to build on Stellar.
            </h2>
            <p className="mt-4 text-lg font-body text-muted-foreground max-w-2xl mx-auto">
              From deploying contracts to simulating transactions, Stellar Kit
              delivers the tools you need. Every workflow is faster, easier, and
              more intuitive.
            </p>
          </div>

          {/* Tabs */}
          <div
            className="flex flex-wrap justify-center gap-2 mb-14"
            role="tablist"
            aria-label="Use cases"
          >
            {tabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActive(i)}
                className={`rounded-full px-6 py-2.5 text-sm font-semibold font-display transition-all duration-200 border ${
                  active === i
                    ? "border-foreground bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                role="tab"
                id={`use-case-tab-${i}`}
                aria-selected={active === i}
                aria-controls={`use-case-panel-${i}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start"
            role="tabpanel"
            id={`use-case-panel-${active}`}
            aria-labelledby={`use-case-tab-${active}`}
          >
            {/* Left: description + bullets */}
            <div>
              <p className="font-body text-muted-foreground text-base leading-relaxed mb-8">
                {current.description}
              </p>
              <ul className="space-y-5">
                {current.bullets.map((b) => (
                  <li key={b.title} className="flex items-start gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                    <span className="font-body text-muted-foreground leading-relaxed">
                      <strong className="text-foreground font-semibold">
                        {b.title}
                      </strong>{" "}
                      {b.text}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <a href="#get-started" className="btn-primary">
                  Get started
                </a>
              </div>
            </div>

            {/* Right: VS Code mock */}
            <div className="w-full">
              <VSCodeWindow key={current.label} tabLabel={current.label} />
              <p className="mt-3 text-center text-xs text-muted-foreground font-body">
                Visual workflow in VS Code · Stellar Kit (prev. Stellar Suite) extension. MVP screenshots may show &quot;Stellar Suite&quot; in the UI.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default UseCasesSection;
