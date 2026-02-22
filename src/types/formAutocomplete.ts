// ============================================================
// src/types/formAutocomplete.ts
// Shared type definitions for form autocomplete system.
// Defines suggestion types, contexts, filters, and sources
// for contract function form inputs.
// ============================================================

// ── Source Types ──────────────────────────────────────────────

/** Identifies the origin of an autocomplete suggestion. */
export type AutocompleteSourceType =
  | "function"
  | "parameter"
  | "history"
  | "pattern"
  | "custom";

// ── Suggestion Types ─────────────────────────────────────────

/** A single autocomplete suggestion presented to the user. */
export interface AutocompleteSuggestion {
  /** Display text shown in the dropdown. */
  label: string;
  /** Value to insert when the suggestion is accepted. */
  value: string;
  /** Category of this suggestion. */
  type: AutocompleteSourceType;
  /** Optional description shown alongside the label. */
  description?: string;
  /** Relevance score (0–100). Higher = more relevant. */
  score: number;
  /** Source identifier that produced this suggestion. */
  source: string;
}

// ── Context Types ────────────────────────────────────────────

/** Contextual information about the field requesting autocomplete. */
export interface AutocompleteContext {
  /** Contract address or ID being interacted with. */
  contractId?: string;
  /** Function name currently selected. */
  functionName?: string;
  /** Parameter name the cursor is on. */
  parameterName?: string;
  /** Expected type of the parameter (e.g., 'address', 'u128'). */
  parameterType?: string;
  /** Current text in the input field. */
  currentInput: string;
}

// ── Filter Types ─────────────────────────────────────────────

/** Criteria for filtering autocomplete results. */
export interface AutocompleteFilter {
  /** Minimum relevance score to include (0–100). */
  minScore?: number;
  /** Maximum number of suggestions to return. */
  maxResults?: number;
  /** Only include suggestions from these source types. */
  sourceTypes?: AutocompleteSourceType[];
  /** Whether matching should be case-sensitive. */
  caseSensitive?: boolean;
}

// ── Source Interface ─────────────────────────────────────────

/** A pluggable source of autocomplete suggestions. */
export interface AutocompleteSource {
  /** Unique identifier for this source. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Whether this source is currently active. */
  enabled: boolean;
  /** Produce suggestions for the given context. */
  getSuggestions(
    context: AutocompleteContext,
    filter?: AutocompleteFilter,
  ): AutocompleteSuggestion[];
}

// ── Result Types ─────────────────────────────────────────────

/** Aggregated autocomplete result returned to the caller. */
export interface AutocompleteResult {
  /** Ordered list of suggestions (highest score first). */
  suggestions: AutocompleteSuggestion[];
  /** Total number of suggestions before truncation. */
  totalCount: number;
  /** Whether the result was truncated due to maxResults. */
  truncated: boolean;
  /** Time taken to compute suggestions in milliseconds. */
  queryTimeMs: number;
}

// ── Error Types ──────────────────────────────────────────────

/** Describes an error that occurred during suggestion generation. */
export interface AutocompleteError {
  /** Machine-readable error code. */
  code: string;
  /** Human-readable error message. */
  message: string;
  /** Source that caused the error. */
  source?: string;
  /** Whether the caller can retry or degrade gracefully. */
  recoverable: boolean;
}

// ── History Types ────────────────────────────────────────────

/** A record of a value previously entered by the user. */
export interface InputHistoryEntry {
  /** The value the user entered. */
  value: string;
  /** Contract ID the value was used with. */
  contractId: string;
  /** Function name the value was used with. */
  functionName: string;
  /** Parameter name the value was used for. */
  parameterName: string;
  /** ISO-8601 timestamp of the most recent use. */
  timestamp: string;
  /** Number of times this value has been used. */
  useCount: number;
}
