import { z } from "zod";

/**
 * Roadmap & feature-request model.
 *
 * The frontend has no backend yet, so roadmap state is persisted locally:
 *  - a fixed set of seeded roadmap items (the "official" roadmap), and
 *  - user-submitted feature requests + the set of items the visitor upvoted.
 *
 * Vote counts are never mutated on the seed items; the visitor's own vote is
 * layered on top via `votedIds`, which keeps voting idempotent (one vote per
 * visitor, toggleable) without a server.
 */

export const STORAGE_KEY = "stellar-kit:roadmap";

export type RoadmapStatus = "planned" | "in-progress" | "done";

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  status: RoadmapStatus;
  /** Baseline community votes (excludes the current visitor's vote). */
  baseVotes: number;
  /** True for items submitted by the visitor on this device. */
  community?: boolean;
}

/** Ordered status metadata used for columns, badges and indicators. */
export const STATUS_ORDER: RoadmapStatus[] = ["planned", "in-progress", "done"];

export const STATUS_META: Record<
  RoadmapStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  planned: {
    label: "Planned",
    badgeClass: "bg-muted text-muted-foreground",
    dotClass: "bg-muted-foreground",
  },
  "in-progress": {
    label: "In Progress",
    badgeClass: "bg-blue-500/15 text-blue-500",
    dotClass: "bg-blue-500",
  },
  done: {
    label: "Done",
    badgeClass: "bg-green-500/15 text-green-500",
    dotClass: "bg-green-500",
  },
};

/** The seeded, "official" roadmap. */
export const SEED_ITEMS: RoadmapItem[] = [
  {
    id: "seed-dark-mode",
    title: "Dark mode support",
    description: "A first-class dark theme across the entire IDE and website.",
    status: "done",
    baseVotes: 120,
  },
  {
    id: "seed-soroban-cli",
    title: "Soroban CLI integration",
    description: "Run soroban-cli commands directly from the in-browser terminal.",
    status: "in-progress",
    baseVotes: 85,
  },
  {
    id: "seed-faucet",
    title: "Advanced testnet faucet",
    description: "Fund test accounts with custom assets and amounts in one click.",
    status: "in-progress",
    baseVotes: 64,
  },
  {
    id: "seed-template-generator",
    title: "Contract template generator",
    description: "Scaffold common Soroban contracts from vetted templates.",
    status: "planned",
    baseVotes: 45,
  },
  {
    id: "seed-collab",
    title: "Real-time collaboration",
    description: "Pair-program on contracts with shared cursors and presence.",
    status: "planned",
    baseVotes: 30,
  },
];

export const featureRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give your idea a short title (at least 3 characters)")
    .max(80, "Keep the title under 80 characters"),
  description: z
    .string()
    .trim()
    .max(280, "Keep the description under 280 characters")
    .optional(),
});

export type FeatureRequestInput = z.infer<typeof featureRequestSchema>;

export interface RoadmapState {
  /** Feature requests submitted by the visitor on this device. */
  submitted: RoadmapItem[];
  /** Ids of items the visitor has upvoted. */
  votedIds: string[];
}

export const EMPTY_STATE: RoadmapState = { submitted: [], votedIds: [] };

const isRoadmapStatus = (value: unknown): value is RoadmapStatus =>
  value === "planned" || value === "in-progress" || value === "done";

/** Read roadmap state from localStorage, tolerating absent/corrupt data. */
export function loadState(): RoadmapState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<RoadmapState>;
    const submitted = Array.isArray(parsed.submitted)
      ? parsed.submitted.filter(
          (item): item is RoadmapItem =>
            !!item &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            isRoadmapStatus(item.status),
        )
      : [];
    const votedIds = Array.isArray(parsed.votedIds)
      ? parsed.votedIds.filter((id): id is string => typeof id === "string")
      : [];
    return { submitted, votedIds };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: RoadmapState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be full or unavailable — ignore */
  }
}
