// ============================================================
// src/services/formAutocompleteService.ts
// Autocomplete service for contract function form inputs.
// Provides suggestions based on contract function signatures,
// previous user inputs, and common Soroban type patterns.
// Supports pluggable custom suggestion sources.
// ============================================================

import {
  AutocompleteContext,
  AutocompleteError,
  AutocompleteFilter,
  AutocompleteResult,
  AutocompleteSource,
  AutocompleteSourceType,
  AutocompleteSuggestion,
  InputHistoryEntry,
} from "../types/formAutocomplete";

import { ContractFunction } from "./contractInspector";

// ── Minimal VS Code-compatible interfaces ────────────────────
//
// Structural interfaces keep this service testable in plain
// Node.js without the VS Code extension host.

interface SimpleOutputChannel {
  appendLine(value: string): void;
}

interface SimpleWorkspaceState {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

interface SimpleExtensionContext {
  workspaceState: SimpleWorkspaceState;
}

// ── Internal constants ───────────────────────────────────────

const HISTORY_STORAGE_KEY = "stellarSuite.autocompleteHistory";
const MAX_HISTORY_ENTRIES = 200;
const DEFAULT_MAX_RESULTS = 20;

// ── Scoring helpers ──────────────────────────────────────────

/**
 * Compute a fuzzy match score between a query and a candidate string.
 * Returns 0–100 where 100 is an exact match.
 */
function computeScore(
  query: string,
  candidate: string,
  caseSensitive: boolean,
): number {
  if (query.length === 0) {
    return 50;
  } // empty query: neutral score

  const q = caseSensitive ? query : query.toLowerCase();
  const c = caseSensitive ? candidate : candidate.toLowerCase();

  if (c === q) {
    return 100;
  } // exact match
  if (c.startsWith(q)) {
    return 90;
  } // prefix match
  if (c.includes(q)) {
    return 70;
  } // substring match

  // Levenshtein-based partial match
  const dist = levenshtein(q, c.slice(0, q.length + 5));
  if (dist <= 2) {
    return Math.max(0, 60 - dist * 10);
  }

  return 0;
}

/** Compute Levenshtein distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Built-in suggestion sources ──────────────────────────────

/**
 * Suggests contract function names from a supplied function list.
 */
class FunctionNameSource implements AutocompleteSource {
  public readonly id = "builtin:functions";
  public readonly name = "Function Names";
  public enabled = true;

  constructor(private functions: ContractFunction[]) {}

  public setFunctions(functions: ContractFunction[]): void {
    this.functions = functions;
  }

  public getSuggestions(
    context: AutocompleteContext,
    filter?: AutocompleteFilter,
  ): AutocompleteSuggestion[] {
    if (context.parameterName) {
      return [];
    } // only for function-name input

    const caseSensitive = filter?.caseSensitive ?? false;

    return this.functions
      .map((fn) => ({
        label: fn.name,
        value: fn.name,
        type: "function" as AutocompleteSourceType,
        description: fn.description || `${fn.parameters.length} param(s)`,
        score: computeScore(context.currentInput, fn.name, caseSensitive),
        source: this.id,
      }))
      .filter((s) => s.score > 0);
  }
}

/**
 * Suggests values based on the Soroban parameter type.
 */
class TypePatternSource implements AutocompleteSource {
  public readonly id = "builtin:patterns";
  public readonly name = "Type Patterns";
  public enabled = true;

  /** Common patterns keyed by parameter type. */
  private readonly patterns: Record<
    string,
    { label: string; value: string; description: string }[]
  > = {
    bool: [
      { label: "true", value: "true", description: "Boolean true" },
      { label: "false", value: "false", description: "Boolean false" },
    ],
    boolean: [
      { label: "true", value: "true", description: "Boolean true" },
      { label: "false", value: "false", description: "Boolean false" },
    ],
    address: [
      {
        label: "G... (public key)",
        value: "G",
        description: "Stellar public key (starts with G)",
      },
      {
        label: "C... (contract)",
        value: "C",
        description: "Contract address (starts with C)",
      },
    ],
    u32: [
      { label: "0", value: "0", description: "Minimum u32" },
      { label: "1", value: "1", description: "Common default" },
      { label: "100", value: "100", description: "Common amount" },
    ],
    i32: [
      { label: "0", value: "0", description: "Zero" },
      { label: "-1", value: "-1", description: "Negative one" },
      { label: "1", value: "1", description: "Positive one" },
    ],
    u64: [
      { label: "0", value: "0", description: "Minimum u64" },
      {
        label: "1000000",
        value: "1000000",
        description: "Common large amount",
      },
    ],
    i64: [
      { label: "0", value: "0", description: "Zero" },
      {
        label: "1000000",
        value: "1000000",
        description: "Common large amount",
      },
    ],
    u128: [
      { label: "0", value: "0", description: "Minimum u128" },
      {
        label: "1000000000",
        value: "1000000000",
        description: "Common token amount",
      },
    ],
    i128: [
      { label: "0", value: "0", description: "Zero" },
      {
        label: "1000000000",
        value: "1000000000",
        description: "Common token amount",
      },
    ],
    string: [{ label: '""', value: "", description: "Empty string" }],
    bytes: [
      {
        label: "0x (hex bytes)",
        value: "0x",
        description: "Hex-encoded bytes",
      },
    ],
    symbol: [
      {
        label: "symbol_value",
        value: "",
        description: "Short string identifier",
      },
    ],
  };

  public getSuggestions(
    context: AutocompleteContext,
    filter?: AutocompleteFilter,
  ): AutocompleteSuggestion[] {
    if (!context.parameterType) {
      return [];
    }

    const typeLower = context.parameterType.toLowerCase();
    const entries = this.patterns[typeLower];
    if (!entries) {
      return [];
    }

    const caseSensitive = filter?.caseSensitive ?? false;

    return entries
      .map((p) => ({
        label: p.label,
        value: p.value,
        type: "pattern" as AutocompleteSourceType,
        description: p.description,
        score: computeScore(
          context.currentInput,
          p.value || p.label,
          caseSensitive,
        ),
        source: this.id,
      }))
      .filter((s) => s.score > 0);
  }
}

/**
 * Suggests values based on the user's input history.
 */
class HistorySource implements AutocompleteSource {
  public readonly id = "builtin:history";
  public readonly name = "Input History";
  public enabled = true;

  constructor(private readonly getHistory: () => InputHistoryEntry[]) {}

  public getSuggestions(
    context: AutocompleteContext,
    filter?: AutocompleteFilter,
  ): AutocompleteSuggestion[] {
    const history = this.getHistory();
    const caseSensitive = filter?.caseSensitive ?? false;

    return history
      .filter((h) => {
        // Optionally narrow to current contract / function / parameter
        if (context.contractId && h.contractId !== context.contractId) {
          return false;
        }
        if (context.functionName && h.functionName !== context.functionName) {
          return false;
        }
        if (
          context.parameterName &&
          h.parameterName !== context.parameterName
        ) {
          return false;
        }
        return true;
      })
      .map((h) => {
        const baseScore = computeScore(
          context.currentInput,
          h.value,
          caseSensitive,
        );
        // Boost by use count (diminishing returns)
        const boost = Math.min(h.useCount * 2, 10);
        return {
          label: h.value,
          value: h.value,
          type: "history" as AutocompleteSourceType,
          description: `Used ${h.useCount} time(s)`,
          score: Math.min(100, baseScore + boost),
          source: this.id,
        };
      })
      .filter((s) => s.score > 0);
  }
}

/**
 * Suggests parameter names/values from contract function signatures.
 */
class ParameterSource implements AutocompleteSource {
  public readonly id = "builtin:parameters";
  public readonly name = "Parameter Values";
  public enabled = true;

  constructor(private functions: ContractFunction[]) {}

  public setFunctions(functions: ContractFunction[]): void {
    this.functions = functions;
  }

  public getSuggestions(
    context: AutocompleteContext,
    filter?: AutocompleteFilter,
  ): AutocompleteSuggestion[] {
    if (!context.functionName) {
      return [];
    }

    const fn = this.functions.find((f) => f.name === context.functionName);
    if (!fn) {
      return [];
    }

    const caseSensitive = filter?.caseSensitive ?? false;

    return fn.parameters
      .map((p) => ({
        label: `--${p.name}`,
        value: p.name,
        type: "parameter" as AutocompleteSourceType,
        description: p.description || (p.type ? `Type: ${p.type}` : undefined),
        score: computeScore(context.currentInput, p.name, caseSensitive),
        source: this.id,
      }))
      .filter((s) => s.score > 0);
  }
}

// ── Service class ────────────────────────────────────────────

/**
 * FormAutocompleteService is responsible for:
 * - Aggregating suggestions from multiple sources
 * - Scoring and ranking suggestions using fuzzy matching
 * - Recording and retrieving input history
 * - Supporting pluggable custom suggestion sources
 * - Providing keyboard navigation helpers
 */
export class FormAutocompleteService {
  private readonly outputChannel: SimpleOutputChannel;
  private readonly sources: Map<string, AutocompleteSource> = new Map();
  private readonly errors: AutocompleteError[] = [];

  // Navigation state
  private currentSuggestions: AutocompleteSuggestion[] = [];
  private selectedIndex: number = -1;

  // Built-in sources (exposed for function-list updates)
  private readonly functionSource: FunctionNameSource;
  private readonly parameterSource: ParameterSource;
  private readonly typePatternSource: TypePatternSource;
  private readonly historySource: HistorySource;

  constructor(
    private readonly context: SimpleExtensionContext,
    outputChannel?: SimpleOutputChannel,
  ) {
    this.outputChannel = outputChannel ?? {
      appendLine: (_msg: string) => {
        /* no-op outside VS Code */
      },
    };

    // Register built-in sources
    this.functionSource = new FunctionNameSource([]);
    this.parameterSource = new ParameterSource([]);
    this.typePatternSource = new TypePatternSource();
    this.historySource = new HistorySource(() => this.loadHistory());

    this.sources.set(this.functionSource.id, this.functionSource);
    this.sources.set(this.parameterSource.id, this.parameterSource);
    this.sources.set(this.typePatternSource.id, this.typePatternSource);
    this.sources.set(this.historySource.id, this.historySource);
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Update the known contract functions used by built-in sources.
   */
  public setContractFunctions(functions: ContractFunction[]): void {
    this.functionSource.setFunctions(functions);
    this.parameterSource.setFunctions(functions);
    this.log(
      `[Autocomplete] Updated contract functions: ${functions.length} function(s)`,
    );
  }

  /**
   * Get autocomplete suggestions for the given context.
   */
  public getSuggestions(
    context: AutocompleteContext,
    filter?: AutocompleteFilter,
  ): AutocompleteResult {
    const start = Date.now();
    this.errors.length = 0;
    const allSuggestions: AutocompleteSuggestion[] = [];

    const allowedTypes = filter?.sourceTypes;

    for (const source of this.sources.values()) {
      if (!source.enabled) {
        continue;
      }
      if (
        allowedTypes &&
        !allowedTypes.includes(
          source.getSuggestions.length ? this.sourceType(source) : "custom",
        )
      ) {
        // Check if source type is in allowed list via id convention
        if (!this.isSourceTypeAllowed(source, allowedTypes)) {
          continue;
        }
      }

      try {
        const suggestions = source.getSuggestions(context, filter);
        allSuggestions.push(...suggestions);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.errors.push({
          code: "SOURCE_ERROR",
          message: errorMessage,
          source: source.id,
          recoverable: true,
        });
        this.log(
          `[Autocomplete] Error from source ${source.id}: ${errorMessage}`,
        );
      }
    }

    // Apply min score filter
    const minScore = filter?.minScore ?? 0;
    let filtered = allSuggestions.filter((s) => s.score >= minScore);

    // Deduplicate by value (keep highest score)
    const dedupMap = new Map<string, AutocompleteSuggestion>();
    for (const s of filtered) {
      const existing = dedupMap.get(s.value);
      if (!existing || s.score > existing.score) {
        dedupMap.set(s.value, s);
      }
    }
    filtered = Array.from(dedupMap.values());

    // Sort by score descending, then label ascending
    filtered.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.label.localeCompare(b.label);
    });

    const totalCount = filtered.length;
    const maxResults = filter?.maxResults ?? DEFAULT_MAX_RESULTS;
    const truncated = filtered.length > maxResults;
    if (truncated) {
      filtered = filtered.slice(0, maxResults);
    }

    // Update navigation state
    this.currentSuggestions = filtered;
    this.selectedIndex = filtered.length > 0 ? 0 : -1;

    const queryTimeMs = Date.now() - start;
    this.log(
      `[Autocomplete] ${filtered.length} suggestion(s) in ${queryTimeMs}ms`,
    );

    return {
      suggestions: filtered,
      totalCount,
      truncated,
      queryTimeMs,
    };
  }

  /**
   * Record a user input for future history-based suggestions.
   */
  public async recordInput(
    entry: Omit<InputHistoryEntry, "timestamp" | "useCount">,
  ): Promise<void> {
    const history = this.loadHistory();
    const existing = history.find(
      (h) =>
        h.value === entry.value &&
        h.contractId === entry.contractId &&
        h.functionName === entry.functionName &&
        h.parameterName === entry.parameterName,
    );

    if (existing) {
      existing.useCount += 1;
      existing.timestamp = new Date().toISOString();
    } else {
      history.push({
        ...entry,
        timestamp: new Date().toISOString(),
        useCount: 1,
      });
    }

    // Trim oldest entries if exceeding cap
    if (history.length > MAX_HISTORY_ENTRIES) {
      // Sort by timestamp ascending so oldest come first, then trim
      history.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      history.splice(0, history.length - MAX_HISTORY_ENTRIES);
    }

    await this.saveHistory(history);
    this.log(
      `[Autocomplete] Recorded input: "${entry.value}" for ${entry.functionName}.${entry.parameterName}`,
    );
  }

  /**
   * Get input history entries, optionally filtered by contract/function.
   */
  public getInputHistory(
    contractId?: string,
    functionName?: string,
  ): InputHistoryEntry[] {
    let history = this.loadHistory();
    if (contractId) {
      history = history.filter((h) => h.contractId === contractId);
    }
    if (functionName) {
      history = history.filter((h) => h.functionName === functionName);
    }
    // Return most-used first
    return [...history].sort((a, b) => b.useCount - a.useCount);
  }

  /**
   * Clear all input history.
   */
  public async clearHistory(): Promise<void> {
    await this.saveHistory([]);
    this.log("[Autocomplete] Input history cleared");
  }

  /**
   * Register a custom autocomplete source.
   */
  public registerSource(source: AutocompleteSource): void {
    this.sources.set(source.id, source);
    this.log(`[Autocomplete] Registered source: ${source.id}`);
  }

  /**
   * Unregister a custom autocomplete source by ID.
   * Built-in sources cannot be unregistered.
   */
  public unregisterSource(id: string): boolean {
    if (id.startsWith("builtin:")) {
      this.log(`[Autocomplete] Cannot unregister built-in source: ${id}`);
      return false;
    }
    const removed = this.sources.delete(id);
    if (removed) {
      this.log(`[Autocomplete] Unregistered source: ${id}`);
    }
    return removed;
  }

  /**
   * Get the list of registered source IDs.
   */
  public getRegisteredSources(): string[] {
    return Array.from(this.sources.keys());
  }

  /**
   * Get errors from the last getSuggestions call.
   */
  public getLastErrors(): AutocompleteError[] {
    return [...this.errors];
  }

  // ── Keyboard Navigation ──────────────────────────────────

  /**
   * Get the currently selected suggestion index.
   */
  public getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /**
   * Move selection to the next suggestion.
   * Returns the newly selected suggestion or undefined if none.
   */
  public selectNext(): AutocompleteSuggestion | undefined {
    if (this.currentSuggestions.length === 0) {
      return undefined;
    }
    this.selectedIndex =
      (this.selectedIndex + 1) % this.currentSuggestions.length;
    return this.currentSuggestions[this.selectedIndex];
  }

  /**
   * Move selection to the previous suggestion.
   * Returns the newly selected suggestion or undefined if none.
   */
  public selectPrevious(): AutocompleteSuggestion | undefined {
    if (this.currentSuggestions.length === 0) {
      return undefined;
    }
    this.selectedIndex =
      this.selectedIndex <= 0
        ? this.currentSuggestions.length - 1
        : this.selectedIndex - 1;
    return this.currentSuggestions[this.selectedIndex];
  }

  /**
   * Accept the currently selected suggestion.
   * Returns the accepted suggestion or undefined if none selected.
   */
  public acceptSelected(): AutocompleteSuggestion | undefined {
    if (
      this.selectedIndex < 0 ||
      this.selectedIndex >= this.currentSuggestions.length
    ) {
      return undefined;
    }
    return this.currentSuggestions[this.selectedIndex];
  }

  /**
   * Reset keyboard navigation state.
   */
  public resetSelection(): void {
    this.selectedIndex = -1;
    this.currentSuggestions = [];
  }

  // ── Persistence helpers ──────────────────────────────────

  private loadHistory(): InputHistoryEntry[] {
    return this.context.workspaceState.get<InputHistoryEntry[]>(
      HISTORY_STORAGE_KEY,
      [],
    );
  }

  private async saveHistory(entries: InputHistoryEntry[]): Promise<void> {
    await this.context.workspaceState.update(HISTORY_STORAGE_KEY, entries);
  }

  // ── Internal helpers ─────────────────────────────────────

  private sourceType(source: AutocompleteSource): AutocompleteSourceType {
    const id = source.id;
    if (id === "builtin:functions") {
      return "function";
    }
    if (id === "builtin:parameters") {
      return "parameter";
    }
    if (id === "builtin:patterns") {
      return "pattern";
    }
    if (id === "builtin:history") {
      return "history";
    }
    return "custom";
  }

  private isSourceTypeAllowed(
    source: AutocompleteSource,
    allowed: AutocompleteSourceType[],
  ): boolean {
    return allowed.includes(this.sourceType(source));
  }

  private log(msg: string): void {
    this.outputChannel.appendLine(msg);
  }
}
