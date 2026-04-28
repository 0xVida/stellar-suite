// ─────────────────────────────────────────────────────────────────────────────
// All FAQ content lives here.
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
    id: "general",
    label: "General",
    items: [
      {
        id: "gen-1",
        question: "What is Stellar Kit?",
        answer:
          "Stellar Kit is a complete toolkit for building, deploying, and simulating Soroban smart contracts on the Stellar network. It comes in two flavours: Kit Studio (a VS Code extension) and Kit Canvas (a browser-based IDE).",
      },
      {
        id: "gen-2",
        question: "What is the difference between Kit Studio and Kit Canvas?",
        answer:
          "Kit Studio is a VS Code extension — install it and work inside your existing editor with full access to your local file system, terminal, and extensions. Kit Canvas runs entirely in the browser so you can build and deploy contracts from any device with no setup required. Both share the same core features.",
      },
      {
        id: "gen-3",
        question: "Is Stellar Kit free to use?",
        answer:
          "Yes. Both Kit Studio and Kit Canvas are free. You can install Kit Studio from the VS Code Marketplace and access Kit Canvas at canvas.stellarkit.xyz.",
      },
    ],
  },
  {
    id: "studio",
    label: "Kit Studio",
    items: [
      {
        id: "st-1",
        question: "How do I install Kit Studio?",
        answer:
          'Open VS Code, go to the Extensions view (Cmd+Shift+X / Ctrl+Shift+X), search for "Stellar Kit", and click Install. Alternatively, download the .vsix from the GitHub releases page and install via Extensions → ... → Install from VSIX.',
      },
      {
        id: "st-2",
        question: "What prerequisites does Kit Studio need?",
        answer:
          "You need VS Code 1.80 or later, Node.js 18+, and the Stellar CLI on your PATH. Kit Studio will warn you on activation if anything is missing.",
      },
      {
        id: "st-3",
        question: "Does Kit Studio work on Windows, macOS, and Linux?",
        answer:
          "Yes. Kit Studio runs on all three platforms wherever VS Code and the Stellar CLI are supported. Some CLI features require WSL on Windows — the extension surfaces a clear message if that applies.",
      },
      {
        id: "st-4",
        question: "How does Kit Studio store my private keys?",
        answer:
          "Private keys are stored using VS Code's SecretStorage API, which maps to the OS keychain on macOS, libsecret on Linux, and Windows Credential Manager on Windows. Keys never leave your machine.",
      },
    ],
  },
  {
    id: "canvas",
    label: "Kit Canvas",
    items: [
      {
        id: "cv-1",
        question: "How do I access Kit Canvas?",
        answer:
          "Open your browser and go to canvas.stellarkit.xyz. No installation required — everything runs in the browser.",
      },
      {
        id: "cv-2",
        question: "Can I deploy contracts from Kit Canvas?",
        answer:
          "Yes. Kit Canvas supports full contract deployment to testnet and mainnet, just like Kit Studio. Connect a signing key and deploy directly from the browser.",
      },
      {
        id: "cv-3",
        question: "Is my code saved in Kit Canvas?",
        answer:
          "Kit Canvas stores your project data in your browser's local storage. You can also export projects and import them later or into Kit Studio.",
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
          'In Kit Studio, open the Deploy tab, select "Testnet", pick your compiled contract, and click Deploy. In Kit Canvas, the same workflow is available from the Deploy panel. Both tools show the resulting contract ID in the output.',
      },
      {
        id: "dep-2",
        question: "Can I deploy to mainnet?",
        answer:
          'Yes, in both Kit Studio and Kit Canvas. Switch the network dropdown to "Mainnet" and confirm the action. Ensure you have the correct signing key selected.',
      },
      {
        id: "dep-3",
        question: "What happens if a deployment fails?",
        answer:
          'Both tools surface the raw Stellar RPC error alongside a plain-English explanation and suggested fix — for example, "Insufficient balance on signing account" with a link to Friendbot for testnet funding.',
      },
    ],
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    items: [
      {
        id: "ts-1",
        question: "Kit Studio isn't activating. What should I check?",
        answer:
          "Confirm you have a Soroban project open (a Cargo.toml referencing soroban-sdk). Check the Output panel → Stellar Kit for errors. Verify the Stellar CLI is on your PATH by running `stellar --version` in a terminal.",
      },
      {
        id: "ts-2",
        question: "I'm getting an RPC connection error. How do I fix it?",
        answer:
          "In either tool, verify the RPC URL for your selected network. For testnet the default is https://soroban-testnet.stellar.org. If you're using a custom node, ensure it's running and accessible.",
      },
      {
        id: "ts-3",
        question: "How do I report a bug or request a feature?",
        answer:
          "Open an issue on the GitHub repository. Include your tool (Studio or Canvas), browser/VS Code version, Stellar CLI version, OS, and steps to reproduce.",
      },
    ],
  },
];


// Helpers

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
