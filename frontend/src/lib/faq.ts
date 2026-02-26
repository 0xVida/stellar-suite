// ─────────────────────────────────────────────────────────────────────────────
// All FAQ content lives here. To add a question:
//   1. Find the right category (or add a new one to FAQ_CATEGORIES)
//   2. Append an { id, question, answer } entry to its `items` array
// ─────────────────────────────────────────────────────────────────────────────

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type FaqCategory = {
  id: string;
  label: string;
  items: FaqItem[];
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    items: [
      {
        id: "gs-1",
        question: "What is Stellar Suite?",
        answer:
          "Stellar Suite is a VS Code extension that brings the full Soroban smart-contract development workflow into your editor. You can deploy contracts, simulate transactions, build and test, and manage accounts — all without leaving VS Code.",
      },
      {
        id: "gs-2",
        question: "How do I install Stellar Suite?",
        answer:
          'Open VS Code, go to the Extensions view (Cmd+Shift+X / Ctrl+Shift+X), search for "Stellar Suite", and click Install. Alternatively, download the .vsix from the GitHub releases page and install it via Extensions → ... → Install from VSIX.',
      },
      {
        id: "gs-3",
        question: "What prerequisites do I need?",
        answer:
          "You need VS Code 1.80 or later, Node.js 18+, and the Stellar CLI installed on your PATH. The extension will warn you if anything is missing when it first activates.",
      },
      {
        id: "gs-4",
        question: "Does Stellar Suite work on Windows, macOS, and Linux?",
        answer:
          "Yes. Stellar Suite works on all three platforms wherever VS Code and the Stellar CLI are supported. Some CLI features require WSL on Windows — the extension will surface a clear message if that applies.",
      },
    ],
  },
  {
    id: "deploying",
    label: "Deploying Contracts",
    items: [
      {
        id: "dep-1",
        question: "How do I deploy a contract to testnet?",
        answer:
          'Open the Stellar Suite sidebar, select the Deploy tab, choose "Testnet" from the network dropdown, pick your compiled contract, and click Deploy. The extension handles the RPC call and shows the resulting contract ID in the output panel.',
      },
      {
        id: "dep-2",
        question: "Can I deploy to mainnet?",
        answer:
          'Yes. Switch the network dropdown to "Mainnet" in the Deploy tab. You will be prompted to confirm since mainnet transactions are irreversible. Ensure you have the correct signing key selected before confirming.',
      },
      {
        id: "dep-3",
        question: "Where are my deployed contract IDs stored?",
        answer:
          "Every deployment is logged in the Deploy History panel within the sidebar. Entries include the contract ID, network, timestamp, and transaction hash. You can copy any contract ID directly from this panel.",
      },
      {
        id: "dep-4",
        question: "What happens if a deployment fails?",
        answer:
          'The extension surfaces the raw error from the Stellar RPC alongside a plain-English explanation and suggested fix — for example, "Insufficient balance on signing account" with a link to Friendbot for testnet funding.',
      },
    ],
  },
  {
    id: "simulating",
    label: "Simulating Transactions",
    items: [
      {
        id: "sim-1",
        question: "What does simulation actually do?",
        answer:
          "Simulation calls the Stellar RPC's simulateTransaction endpoint, which runs your transaction against the current ledger state without committing it. You get back the return value, fee estimate, resource usage, and any diagnostic events — all before spending gas.",
      },
      {
        id: "sim-2",
        question: "Can I simulate any contract function?",
        answer:
          "Yes. Select a deployed contract in the Simulate panel, pick the exported function from the dropdown (populated automatically from the WASM), fill in the arguments, and click Simulate. The extension handles auth footprint generation automatically.",
      },
      {
        id: "sim-3",
        question: "How accurate are the fee estimates from simulation?",
        answer:
          "Simulation fee estimates are the same figures the network would charge for the real transaction. They can vary slightly if ledger state changes between simulation and submission, but in practice they are highly accurate.",
      },
    ],
  },
  {
    id: "accounts",
    label: "Accounts & Keys",
    items: [
      {
        id: "acc-1",
        question: "How does Stellar Suite store my private keys?",
        answer:
          "Private keys are stored using VS Code's SecretStorage API, which maps to the OS keychain on macOS, libsecret on Linux, and Windows Credential Manager on Windows. Keys are never written to disk in plaintext and never leave your machine.",
      },
      {
        id: "acc-2",
        question: "Can I import an existing keypair?",
        answer:
          'Yes. In the Manage tab, click "Import Account", give it an alias, and paste your secret key. The extension stores it securely and makes it available as a signer for all other actions.',
      },
      {
        id: "acc-3",
        question: "How do I fund a testnet account?",
        answer:
          'Create or import an account in the Manage tab and click "Fund via Friendbot". The extension calls the Stellar Friendbot automatically and credits 10,000 XLM to your testnet account within seconds.',
      },
      {
        id: "acc-4",
        question: "Is hardware wallet support planned?",
        answer:
          "Yes, Ledger hardware wallet support is on the roadmap. Follow the GitHub repository or the releases page to be notified when it ships.",
      },
    ],
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    items: [
      {
        id: "ts-1",
        question: "The extension isn't activating. What should I check?",
        answer:
          "First, confirm you have a folder open in VS Code that contains a Soroban project (a Cargo.toml referencing soroban-sdk is the trigger). Second, check the Output panel → Stellar Suite for activation errors. Third, verify the Stellar CLI is on your PATH by running `stellar --version` in a terminal.",
      },
      {
        id: "ts-2",
        question: "I'm getting an RPC connection error. How do I fix it?",
        answer:
          "Go to the Manage tab → Network Config and verify the RPC URL for your selected network. For testnet, the default is https://soroban-testnet.stellar.org. If you're using a custom node, ensure it's running and accessible.",
      },
      {
        id: "ts-3",
        question: "Compilation is failing silently. Where are the logs?",
        answer:
          'Open the Output panel in VS Code (View → Output) and select "Stellar Suite" from the dropdown. All compilation stdout and stderr is streamed there. You can also run `cargo build` directly in the terminal for the raw Rust compiler output.',
      },
      {
        id: "ts-4",
        question: "How do I report a bug or request a feature?",
        answer:
          "Open an issue on the GitHub repository at github.com/0xVida/stellar-suite. Include your VS Code version, Stellar CLI version, OS, and steps to reproduce. For feature requests, check existing issues first to avoid duplicates.",
      },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getAllFaqItems(): FaqItem[] {
  return FAQ_CATEGORIES.flatMap((c) => c.items);
}

export function searchFaq(query: string): FaqItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return getAllFaqItems().filter(
    (item) =>
      item.question.toLowerCase().includes(q) ||
      item.answer.toLowerCase().includes(q),
  );
}
