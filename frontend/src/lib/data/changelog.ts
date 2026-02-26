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
