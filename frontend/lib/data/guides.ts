import { ContentItem } from "./content";

export const GUIDE_CONTENT: ContentItem[] = [
  {
    id: "guide-getting-started",
    type: "guide",
    title: "Getting Started",
    description:
      "Install the extension, configure your CLI path, set an RPC endpoint, and deploy your first contract in minutes.",
    tags: ["setup", "installation", "quickstart"],
    category: "Guides",
    keywords: ["install", "setup", "configure", "quickstart", "first", "tutorial"],
  },
  {
    id: "guide-contract-management",
    type: "guide",
    title: "Contract Lifecycle",
    description:
      "Manage the full contract lifecycle — from scaffolding with templates to building, deploying, and monitoring on-chain.",
    tags: ["contracts", "lifecycle", "management"],
    category: "Guides",
    keywords: ["lifecycle", "manage", "contracts", "build", "deploy", "monitor"],
  },
  {
    id: "guide-simulation",
    type: "guide",
    title: "Simulation Deep Dive",
    description:
      "Cache simulations, replay with modified params, compare results side by side, and export resource profiles.",
    tags: ["simulation", "testing", "advanced"],
    category: "Guides",
    keywords: ["cache", "replay", "compare", "diff", "export", "resource"],
  },
  {
    id: "guide-rpc",
    type: "guide",
    title: "RPC Configuration",
    description:
      "Configure RPC endpoints with health monitoring, automatic failover, rate limit handling, and circuit breaker patterns.",
    tags: ["rpc", "network", "configuration"],
    category: "Guides",
    keywords: ["rpc", "endpoint", "health", "failover", "circuit-breaker", "rate-limit"],
  },
  {
    id: "guide-security",
    type: "guide",
    title: "Security Best Practices",
    description:
      "Input sanitization, secure signing methods, key management, and safe deployment workflows.",
    tags: ["security", "signing", "best-practices"],
    category: "Guides",
    keywords: ["security", "sanitization", "keys", "signing", "safe", "best-practices"],
  },
];
