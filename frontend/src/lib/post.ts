// ─────────────────────────────────────────────────────────────────────────────
// File-based blog post store.
// To add a new post: add an entry to ALL_POSTS below.
// Fields: slug (URL key), title, excerpt, date (ISO), category, tags, readingTime, content (MDX/markdown string)
// ─────────────────────────────────────────────────────────────────────────────

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO 8601 e.g. "2025-01-15"
  category: string;
  tags: string[];
  readingTime: string;
  author: { name: string; avatar?: string };
  content: string; // Markdown/MDX string
};

export const ALL_POSTS: Post[] = [
  {
    slug: "introducing-stellar-suite",
    title: "Introducing Stellar Kit (prev. Stellar Suite): Soroban Development, Right in VS Code",
    excerpt:
      "We built Stellar Kit to eliminate the friction between writing Soroban smart contracts and shipping them — no more terminal juggling, no more context switching.",
    date: "2025-01-15",
    category: "Announcements",
    tags: ["release", "soroban", "vscode"],
    readingTime: "4 min read",
    author: { name: "Stellar Kit Team" },
    content: `
## The Problem We Kept Running Into

Every Soroban developer knows the rhythm: write a function, switch to your terminal, run \`stellar contract deploy\`, parse the output, switch back to your editor. Repeat fifty times a day.

It's not that the Stellar CLI is bad — it's excellent. But the constant context switch between editor and terminal fragments your focus and slows you down.

We built Stellar Kit to fix that.

## What Stellar Kit Does

Stellar Kit is a VS Code extension that brings the full Soroban development workflow into your editor:

- **Deploy** contracts to testnet or mainnet with one click, without touching a terminal
- **Simulate** transactions before committing them — see return values, fee estimates, and state changes inline
- **Build** and compile your contracts automatically on save
- **Test** with an integrated test runner that shows pass/fail status next to each function
- **Manage** accounts, keys, and network configs from a clean visual panel

## How It Works

The extension connects directly to the Stellar RPC and wraps the Soroban SDK. Everything runs locally — no cloud dependency, no telemetry, no keys leaving your machine.

\`\`\`typescript
// Before: terminal context switch every time
// $ stellar contract deploy --network testnet --source alice

// After: one command from the Command Palette
// > Stellar Kit: Deploy Contract
\`\`\`

## Getting Started

Install from the VS Code Marketplace, open any Soroban project, and the extension activates automatically. The sidebar panel gives you instant access to every workflow.

We're shipping fast. Follow the repo for weekly updates.
    `.trim(),
  },
  {
    slug: "simulating-transactions-before-you-commit",
    title: "Why You Should Always Simulate Before You Send",
    excerpt:
      "On-chain failures are expensive and embarrassing. Here's how Stellar Kit's simulation mode lets you catch bugs before they cost you gas — or worse, corrupt state.",
    date: "2025-02-03",
    category: "Tutorials",
    tags: ["simulation", "debugging", "soroban"],
    readingTime: "6 min read",
    author: { name: "Stellar Kit Team" },
    content: `
## The Cost of On-Chain Failures

When a Soroban contract call fails on-chain, you've already paid the transaction fee. Worse, if your contract has partial state mutations before hitting an error, you're debugging a mess.

The simulation API exists to prevent exactly this. Stellar Kit surfaces it directly in your editor so you never have to remember to call it manually.

## How Simulation Works

Under the hood, the Stellar RPC exposes a \`simulateTransaction\` endpoint. It runs your transaction against the current ledger state without committing it, returning:

- The **return value** your function would produce
- Accurate **resource and fee estimates**
- Any **diagnostic events** or error messages
- A diff of **ledger entries** that would change

Stellar Kit wraps this into a single "Simulate" action in the command palette and sidebar panel.

## A Real Example

Say you have a token transfer function:

\`\`\`rust
pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
    from.require_auth();
    let balance = get_balance(&env, &from);
    if balance < amount {
        panic!("insufficient balance");
    }
    // ... update balances
}
\`\`\`

Before Stellar Kit, you'd deploy, invoke, wait for the transaction, and check the result. With simulation:

1. Open the Stellar Kit sidebar
2. Select your function (\`transfer\`)
3. Fill in the args
4. Click **Simulate**

In under a second you'll see the return value, the fee (e.g. 203 stroops), and whether any auth is missing — all before touching the network.

## Iteration Speed

In practice, this turns a 30-second round-trip into a 1-second feedback loop. For complex contracts with multiple failure modes, that compounds quickly.

Simulate everything. It costs nothing and saves you from the worst bugs.
    `.trim(),
  },
  {
    slug: "managing-accounts-and-keys-in-vscode",
    title: "Account & Key Management Without the CLI",
    excerpt:
      "Managing Stellar accounts across testnet, futurenet, and mainnet used to mean memorizing CLI flags. Stellar Kit's Manage panel changes that.",
    date: "2025-02-20",
    category: "Tutorials",
    tags: ["accounts", "keys", "manage", "workflow"],
    readingTime: "5 min read",
    author: { name: "Stellar Kit Team" },
    content: `
## The Old Way

\`\`\`bash
stellar keys generate alice
stellar keys address alice
stellar network add testnet --rpc-url https://soroban-testnet.stellar.org ...
stellar contract invoke --network testnet --source alice ...
\`\`\`

Nothing wrong with any of that — but doing it dozens of times a day across multiple projects adds friction.

## The Stellar Kit Manage Panel

The Manage tab in the Stellar Kit sidebar gives you a visual interface for everything account-related:

### Creating and Funding Accounts

Click **New Account**, give it an alias (e.g. \`alice\`), and optionally auto-fund it via Friendbot on testnet. The keypair is generated locally and stored in VS Code's secret storage — encrypted, never in plaintext on disk.

### Switching Networks

A dropdown at the top of the panel lets you switch between testnet, futurenet, and mainnet in one click. The active network propagates to all other Stellar Kit actions automatically.

### Custom RPC Endpoints

If you're running a local Quickstart node or a private RPC, add it under **Network Config**:

\`\`\`
Name: local-quickstart
RPC URL: http://localhost:8000/soroban/rpc
Network Passphrase: Standalone Network ; February 2017
\`\`\`

### Invoking Deployed Contracts

Once you have a contract deployed and an account set up, the **Invoke** panel lets you call any exported function through a generated form — no ABI file needed, the extension reads your compiled WASM.

## Security Notes

Keys are stored using VS Code's \`SecretStorage\` API, which maps to the OS keychain (Keychain on macOS, libsecret on Linux, Credential Manager on Windows). They are never written to disk in plaintext and never leave your machine.

For mainnet keys, we recommend hardware wallet support — which is on our roadmap.
    `.trim(),
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getAllPosts(): Post[] {
  return [...ALL_POSTS].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function getPostBySlug(slug: string): Post | undefined {
  return ALL_POSTS.find((p) => p.slug === slug);
}

export function getAllCategories(): string[] {
  return Array.from(new Set(ALL_POSTS.map((p) => p.category)));
}

export function getAllTags(): string[] {
  return Array.from(new Set(ALL_POSTS.flatMap((p) => p.tags)));
}

export function getPostsByCategory(category: string): Post[] {
  return getAllPosts().filter((p) => p.category === category);
}

export function getPostsByTag(tag: string): Post[] {
  return getAllPosts().filter((p) => p.tags.includes(tag));
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
