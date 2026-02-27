export interface ChangelogEntry {
  version: string;
  date: string;
  entries: {
    type: "Added" | "Fixed" | "Changed" | "Breaking";
    items: string[];
  }[];
}

export const changelogData: ChangelogEntry[] = [
  {
    version: "Unreleased",
    date: "—",
    entries: [
      {
        type: "Changed",
        items: [
          "Product rename: Stellar Suite is now Stellar Kit. The extension is published on the VS Code Marketplace as 0xVida.stellar-kit. User-facing names, docs, and marketing have been updated; repo name and config keys (e.g. stellarSuite.*, stellar-suite.templates.json) stay the same for compatibility. MVP screenshots and some assets may still show \"Stellar Suite\" in the UI — they refer to this same product.",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2024-02-23",
    entries: [
      {
        type: "Added",
        items: [
          "Initial MVP release.",
          "One-click contract build and deployment.",
          "Interactive Sidebar for contract management.",
          "Soroban transaction simulation with resource profiling.",
          "Support for multiple signing methods (Interactive, File, Secure Storage, External).",
          "Enhanced CLI error guidance.",
          "Contract template detection and classification.",
          "RPC configuration management with fallback support.",
          "API Documentation generation via TypeDoc.",
          "GitHub Actions workflow for automated documentation deployment.",
        ],
      },
    ],
  },
];
