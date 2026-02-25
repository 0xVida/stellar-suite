import { ContentItem } from "./content";

export const FEATURE_CONTENT: ContentItem[] = [
  {
    id: "feature-build",
    type: "feature",
    title: "One-Click Build",
    description:
      "Compile Soroban smart contracts to WASM with a single command. Auto-detects Cargo.toml, streams CLI output, and reports errors inline.",
    tags: ["build", "compile", "productivity"],
    category: "Core",
    keywords: ["compile", "wasm", "cargo", "rust", "stellar cli"],
    icon: "hammer",
  },
  {
    id: "feature-deploy",
    type: "feature",
    title: "Deploy to Network",
    description:
      "Deploy contracts to testnet or mainnet with interactive prompts, retry logic with exponential backoff, and deployment history tracking.",
    tags: ["deploy", "network", "testnet"],
    category: "Core",
    keywords: ["deploy", "testnet", "mainnet", "futurenet", "network"],
    icon: "rocket",
  },
  {
    id: "feature-simulate",
    type: "feature",
    title: "Transaction Simulation",
    description:
      "Simulate contract invocations before committing. View formatted returns, execution costs, storage diffs, and resource profiles.",
    tags: ["simulate", "testing", "transactions"],
    category: "Core",
    keywords: ["simulate", "transaction", "invoke", "test", "resource", "cost"],
    icon: "play",
  },
  {
    id: "feature-sidebar",
    type: "feature",
    title: "Interactive Sidebar",
    description:
      "A dedicated VS Code sidebar for contract discovery, build status, deployment history, and quick actions — all without leaving your editor.",
    tags: ["sidebar", "ui", "dashboard"],
    category: "UI",
    keywords: ["sidebar", "panel", "dashboard", "webview", "contracts"],
    icon: "layout",
  },
  {
    id: "feature-signing",
    type: "feature",
    title: "Signing Workflows",
    description:
      "Multiple signing methods: interactive prompts, keypair files, secure storage, and hardware wallet support for production deployments.",
    tags: ["signing", "security", "identity"],
    category: "Security",
    keywords: ["sign", "keypair", "ledger", "hardware", "wallet", "identity"],
    icon: "key",
  },
  {
    id: "feature-templates",
    type: "feature",
    title: "Contract Templates",
    description:
      "8 production-ready Soroban contract templates — Token, NFT, Escrow, Voting, Multisig, Staking, Auction — each with full test suites.",
    tags: ["templates", "scaffolding", "contracts"],
    category: "Productivity",
    keywords: ["template", "scaffold", "starter", "boilerplate"],
    icon: "file-code",
  },
];

export interface FeatureComparisonRow {
  feature: string;
  cli: string;
  extension: string;
}

export const FEATURE_COMPARISON_DATA: FeatureComparisonRow[] = [
  {
    feature: "Project Initialization",
    cli: "Manual folder creation & config setup",
    extension: "One-click scaffolding with templates",
  },
  {
    feature: "Smart Contract Deployment",
    cli: "Complex CLI flags & key management",
    extension: "Interactive UI with network selection",
  },
  {
    feature: "Network Configuration",
    cli: "Manual TOML editing or flag passing",
    extension: "Pre-configured networks (Testnet/Mainnet)",
  },
  {
    feature: "Logs & Feedback",
    cli: "Standard terminal output",
    extension: "Real-time, color-coded logs in panel",
  },
  {
    feature: "Error Visibility",
    cli: "Stack traces in terminal",
    extension: "Inline error highlighting & context",
  },
  {
    feature: "Developer Workflow",
    cli: "Context switching between editor & terminal",
    extension: "Integrated workflow within VS Code",
  },
  {
    feature: "IDE Integration",
    cli: "None (External tool)",
    extension: "Native VS Code sidebar & commands",
  },
  {
    feature: "Command Discoverability",
    cli: "Requires memorizing commands/flags",
    extension: "Visual menus & command palette",
  },
  {
    feature: "Productivity / DX",
    cli: "Steep learning curve",
    extension: "Accelerated development cycle",
  },
];

export interface ComparisonRow {
  task: string;
  cli: { steps: string; command: string; time: string };
  extension: { steps: string; action: string; time: string };
}

export const COMPARISON_DATA: ComparisonRow[] = [
  {
    task: "Build a contract",
    cli: {
      steps: "3 steps",
      command: "cd project && stellar contract build",
      time: "~30s with context switching",
    },
    extension: {
      steps: "1 click",
      action: "Click Build in sidebar or Cmd+Alt+B",
      time: "~5s",
    },
  },
  {
    task: "Deploy to testnet",
    cli: {
      steps: "5+ steps",
      command: "stellar contract deploy --wasm target/... --source ... --network testnet",
      time: "~2min with flag lookup",
    },
    extension: {
      steps: "2 clicks",
      action: "Click Deploy, select network",
      time: "~15s",
    },
  },
  {
    task: "Simulate a transaction",
    cli: {
      steps: "4+ steps",
      command: "stellar contract invoke --id ... --source ... -- fn_name --arg ...",
      time: "~1min composing flags",
    },
    extension: {
      steps: "Fill form",
      action: "Select function, fill params, click Simulate",
      time: "~10s",
    },
  },
  {
    task: "Inspect contract ABI",
    cli: {
      steps: "3 steps",
      command: "stellar contract info interface --contract-id ...",
      time: "~20s",
    },
    extension: {
      steps: "1 click",
      action: "Open sidebar, view auto-detected ABI",
      time: "~2s",
    },
  },
  {
    task: "Switch signing identity",
    cli: {
      steps: "4 steps",
      command: "stellar keys use ... && stellar config ...",
      time: "~30s",
    },
    extension: {
      steps: "1 click",
      action: "Select identity from dropdown",
      time: "~3s",
    },
  },
];
