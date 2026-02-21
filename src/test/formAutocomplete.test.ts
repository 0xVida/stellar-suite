// ============================================================
// src/test/formAutocomplete.test.ts
// Unit tests for FormAutocompleteService.
//
// Run with:  node out-test/test/formAutocomplete.test.js
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require("assert");

import { FormAutocompleteService } from "../services/formAutocompleteService";
import {
  AutocompleteContext,
  AutocompleteFilter,
  AutocompleteSource,
  AutocompleteSuggestion,
} from "../types/formAutocomplete";
import { ContractFunction } from "../services/contractInspector";

// ── Mock helpers ──────────────────────────────────────────────

function createMockContext() {
  const store: Record<string, unknown> = {};
  return {
    workspaceState: {
      get<T>(key: string, defaultValue: T): T {
        return (store[key] as T) ?? defaultValue;
      },
      update(key: string, value: unknown): Promise<void> {
        store[key] = value;
        return Promise.resolve();
      },
    },
    _store: store,
  };
}

function createMockOutputChannel() {
  const lines: string[] = [];
  return {
    appendLine(value: string) {
      lines.push(value);
    },
    lines,
  };
}

function createService() {
  const ctx = createMockContext();
  const out = createMockOutputChannel();
  const svc = new FormAutocompleteService(ctx, out);
  return { svc, ctx, out };
}

const sampleFunctions: ContractFunction[] = [
  {
    name: "initialize",
    description: "Initialize the contract",
    parameters: [
      {
        name: "admin",
        type: "address",
        required: true,
        description: "Admin address",
      },
      {
        name: "token",
        type: "address",
        required: true,
        description: "Token address",
      },
    ],
  },
  {
    name: "transfer",
    description: "Transfer tokens",
    parameters: [
      { name: "from", type: "address", required: true },
      { name: "to", type: "address", required: true },
      {
        name: "amount",
        type: "i128",
        required: true,
        description: "Amount to transfer",
      },
    ],
  },
  {
    name: "balance",
    description: "Get balance",
    parameters: [{ name: "id", type: "address", required: true }],
  },
  {
    name: "mint",
    parameters: [
      { name: "to", type: "address", required: true },
      { name: "amount", type: "u128", required: true },
    ],
  },
];

// ── Tests ─────────────────────────────────────────────────────

// ── Function name autocomplete ───────────────────────────────

function testFunctionNameExactPrefix() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({ currentInput: "trans" });
  assert.ok(result.suggestions.length > 0, "should have suggestions");
  assert.ok(
    result.suggestions.some((s) => s.value === "transfer"),
    'should suggest "transfer"',
  );
  console.log("  [ok] function name autocomplete with prefix match");
}

function testFunctionNameEmptyInput() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({ currentInput: "" });
  assert.strictEqual(
    result.suggestions.length,
    4,
    "should suggest all 4 functions",
  );
  console.log("  [ok] function name autocomplete with empty input returns all");
}

function testFunctionNameNoMatch() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({ currentInput: "zzzzz" });
  const funcSuggestions = result.suggestions.filter(
    (s) => s.type === "function",
  );
  assert.strictEqual(
    funcSuggestions.length,
    0,
    "should have no function suggestions",
  );
  console.log("  [ok] function name autocomplete with no match returns empty");
}

function testFunctionNameSubstringMatch() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({ currentInput: "fer" });
  assert.ok(
    result.suggestions.some((s) => s.value === "transfer"),
    'should suggest "transfer" via substring match',
  );
  console.log("  [ok] function name autocomplete with substring match");
}

// ── Parameter value autocomplete ─────────────────────────────

function testParameterSuggestions() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({
    currentInput: "",
    functionName: "transfer",
    parameterName: "amount",
  });
  // Parameter source should suggest parameter names when functionName is set
  // but we are asking about a specific parameter, so parameter source won't match
  // The history/pattern sources may return results
  assert.ok(result.queryTimeMs >= 0, "should have non-negative query time");
  console.log("  [ok] parameter suggestions complete without error");
}

function testParameterNameSuggestions() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({
    currentInput: "am",
    functionName: "transfer",
  });
  assert.ok(
    result.suggestions.some(
      (s) => s.value === "amount" && s.type === "parameter",
    ),
    'should suggest "amount" parameter',
  );
  console.log("  [ok] parameter name autocomplete matches prefix");
}

// ── Type pattern autocomplete ────────────────────────────────

function testTypePatternBool() {
  const { svc } = createService();

  const result = svc.getSuggestions({
    currentInput: "",
    parameterType: "bool",
    parameterName: "active",
  });
  const patternSuggestions = result.suggestions.filter(
    (s) => s.type === "pattern",
  );
  assert.ok(
    patternSuggestions.length >= 2,
    "should suggest true and false for bool",
  );
  const values = patternSuggestions.map((s) => s.value);
  assert.ok(values.includes("true"), "should include true");
  assert.ok(values.includes("false"), "should include false");
  console.log("  [ok] type pattern suggests true/false for bool");
}

function testTypePatternAddress() {
  const { svc } = createService();

  const result = svc.getSuggestions({
    currentInput: "",
    parameterType: "address",
    parameterName: "to",
  });
  const patternSuggestions = result.suggestions.filter(
    (s) => s.type === "pattern",
  );
  assert.ok(patternSuggestions.length >= 2, "should suggest address patterns");
  console.log("  [ok] type pattern suggests address formats");
}

function testTypePatternU128() {
  const { svc } = createService();

  const result = svc.getSuggestions({
    currentInput: "",
    parameterType: "u128",
    parameterName: "amount",
  });
  const patternSuggestions = result.suggestions.filter(
    (s) => s.type === "pattern",
  );
  assert.ok(patternSuggestions.length >= 1, "should suggest u128 patterns");
  console.log("  [ok] type pattern suggests u128 values");
}

function testTypePatternUnknownType() {
  const { svc } = createService();

  const result = svc.getSuggestions({
    currentInput: "",
    parameterType: "unknowntype",
    parameterName: "x",
  });
  const patternSuggestions = result.suggestions.filter(
    (s) => s.type === "pattern",
  );
  assert.strictEqual(
    patternSuggestions.length,
    0,
    "should have no pattern suggestions for unknown type",
  );
  console.log("  [ok] type pattern returns empty for unknown type");
}

// ── History-based suggestions ────────────────────────────────

async function testHistoryRecordAndRetrieve() {
  const { svc } = createService();

  await svc.recordInput({
    value: "GABC123",
    contractId: "CONTRACT1",
    functionName: "transfer",
    parameterName: "to",
  });

  const history = svc.getInputHistory();
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].value, "GABC123");
  assert.strictEqual(history[0].useCount, 1);
  console.log("  [ok] history records and retrieves input");
}

async function testHistoryIncrementUseCount() {
  const { svc } = createService();

  await svc.recordInput({
    value: "GABC123",
    contractId: "CONTRACT1",
    functionName: "transfer",
    parameterName: "to",
  });
  await svc.recordInput({
    value: "GABC123",
    contractId: "CONTRACT1",
    functionName: "transfer",
    parameterName: "to",
  });

  const history = svc.getInputHistory();
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].useCount, 2);
  console.log("  [ok] history increments use count for duplicate entries");
}

async function testHistoryFilterByContract() {
  const { svc } = createService();

  await svc.recordInput({
    value: "val1",
    contractId: "C1",
    functionName: "fn",
    parameterName: "p",
  });
  await svc.recordInput({
    value: "val2",
    contractId: "C2",
    functionName: "fn",
    parameterName: "p",
  });

  const history = svc.getInputHistory("C1");
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].value, "val1");
  console.log("  [ok] history filters by contractId");
}

async function testHistoryFilterByFunction() {
  const { svc } = createService();

  await svc.recordInput({
    value: "val1",
    contractId: "C1",
    functionName: "mint",
    parameterName: "p",
  });
  await svc.recordInput({
    value: "val2",
    contractId: "C1",
    functionName: "burn",
    parameterName: "p",
  });

  const history = svc.getInputHistory(undefined, "mint");
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].value, "val1");
  console.log("  [ok] history filters by functionName");
}

async function testHistoryBasedSuggestions() {
  const { svc } = createService();

  await svc.recordInput({
    value: "GABC123",
    contractId: "C1",
    functionName: "transfer",
    parameterName: "to",
  });

  const result = svc.getSuggestions({
    currentInput: "GAB",
    contractId: "C1",
    functionName: "transfer",
    parameterName: "to",
  });

  const historySuggestions = result.suggestions.filter(
    (s) => s.type === "history",
  );
  assert.ok(historySuggestions.length >= 1, "should have history suggestions");
  assert.strictEqual(historySuggestions[0].value, "GABC123");
  console.log("  [ok] history-based suggestions match input prefix");
}

async function testHistoryClearing() {
  const { svc } = createService();

  await svc.recordInput({
    value: "val",
    contractId: "C",
    functionName: "f",
    parameterName: "p",
  });
  assert.strictEqual(svc.getInputHistory().length, 1);

  await svc.clearHistory();
  assert.strictEqual(svc.getInputHistory().length, 0);
  console.log("  [ok] clearHistory removes all history entries");
}

async function testHistoryTrimming() {
  const { svc, ctx } = createService();

  // Seed 200 entries
  const entries: any[] = [];
  for (let i = 0; i < 200; i++) {
    entries.push({
      value: `val_${i}`,
      contractId: "C",
      functionName: "f",
      parameterName: "p",
      timestamp: new Date(Date.now() + i).toISOString(),
      useCount: 1,
    });
  }
  await ctx.workspaceState.update("stellarSuite.autocompleteHistory", entries);
  assert.strictEqual(svc.getInputHistory().length, 200);

  // Add one more should trim to 200
  await svc.recordInput({
    value: "new_val",
    contractId: "C",
    functionName: "f",
    parameterName: "p",
  });
  assert.ok(
    svc.getInputHistory().length <= 200,
    "should trim to max 200 entries",
  );
  console.log("  [ok] history trims to max 200 entries");
}

// ── Suggestion filtering ─────────────────────────────────────

function testFilterByMinScore() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({ currentInput: "" }, { minScore: 60 });
  assert.ok(
    result.suggestions.every((s) => s.score >= 60),
    "all suggestions should meet min score",
  );
  console.log("  [ok] filter by minScore works");
}

function testFilterByMaxResults() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({ currentInput: "" }, { maxResults: 2 });
  assert.ok(
    result.suggestions.length <= 2,
    "should return at most 2 suggestions",
  );
  assert.strictEqual(result.truncated, true, "should be truncated");
  console.log("  [ok] filter by maxResults truncates correctly");
}

function testFilterBySourceType() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions(
    { currentInput: "" },
    { sourceTypes: ["function"] },
  );
  assert.ok(
    result.suggestions.every((s) => s.type === "function"),
    "all suggestions should be from function source",
  );
  console.log("  [ok] filter by sourceTypes works");
}

// ── Fuzzy matching ───────────────────────────────────────────

function testFuzzyScoring() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  // "initial" should match "initialize" with high score
  const result = svc.getSuggestions({ currentInput: "initial" });
  const initSuggestion = result.suggestions.find(
    (s) => s.value === "initialize",
  );
  assert.ok(initSuggestion, 'should find "initialize"');
  assert.ok(initSuggestion!.score >= 70, "prefix match should have high score");
  console.log("  [ok] fuzzy scoring ranks prefix matches highly");
}

// ── Custom sources ───────────────────────────────────────────

function testRegisterCustomSource() {
  const { svc } = createService();

  const customSource: AutocompleteSource = {
    id: "custom:test",
    name: "Test Source",
    enabled: true,
    getSuggestions: (_ctx: AutocompleteContext) => [
      {
        label: "custom-value",
        value: "custom-value",
        type: "custom",
        score: 80,
        source: "custom:test",
      },
    ],
  };

  svc.registerSource(customSource);
  assert.ok(
    svc.getRegisteredSources().includes("custom:test"),
    "should be registered",
  );

  const result = svc.getSuggestions({ currentInput: "" });
  assert.ok(
    result.suggestions.some((s) => s.value === "custom-value"),
    "should include custom source suggestions",
  );
  console.log("  [ok] custom source registration and suggestion works");
}

function testUnregisterCustomSource() {
  const { svc } = createService();

  const customSource: AutocompleteSource = {
    id: "custom:temp",
    name: "Temp Source",
    enabled: true,
    getSuggestions: () => [
      {
        label: "temp",
        value: "temp",
        type: "custom",
        score: 80,
        source: "custom:temp",
      },
    ],
  };

  svc.registerSource(customSource);
  const removed = svc.unregisterSource("custom:temp");
  assert.strictEqual(removed, true, "should return true");
  assert.ok(
    !svc.getRegisteredSources().includes("custom:temp"),
    "should be unregistered",
  );

  const result = svc.getSuggestions({ currentInput: "" });
  assert.ok(
    !result.suggestions.some((s) => s.source === "custom:temp"),
    "should not include unregistered source suggestions",
  );
  console.log("  [ok] custom source unregistration works");
}

function testCannotUnregisterBuiltinSource() {
  const { svc } = createService();

  const removed = svc.unregisterSource("builtin:functions");
  assert.strictEqual(
    removed,
    false,
    "should not allow unregistering built-in source",
  );
  assert.ok(
    svc.getRegisteredSources().includes("builtin:functions"),
    "built-in source should still be registered",
  );
  console.log("  [ok] cannot unregister built-in sources");
}

function testUnregisterNonexistentSource() {
  const { svc } = createService();

  const removed = svc.unregisterSource("nonexistent");
  assert.strictEqual(removed, false, "should return false for unknown source");
  console.log("  [ok] unregistering nonexistent source returns false");
}

// ── Keyboard navigation ──────────────────────────────────────

function testKeyboardNavigation() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  svc.getSuggestions({ currentInput: "" });

  // Initial selection should be 0
  assert.strictEqual(
    svc.getSelectedIndex(),
    0,
    "initial selection should be 0",
  );

  // Navigate next
  const next = svc.selectNext();
  assert.ok(next, "selectNext should return a suggestion");
  assert.strictEqual(svc.getSelectedIndex(), 1, "index should advance to 1");

  // Navigate previous
  const prev = svc.selectPrevious();
  assert.ok(prev, "selectPrevious should return a suggestion");
  assert.strictEqual(svc.getSelectedIndex(), 0, "index should go back to 0");

  console.log("  [ok] keyboard navigation next/previous works");
}

function testKeyboardNavigationWrapAround() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({ currentInput: "" });
  const count = result.suggestions.length;

  // Navigate to the end and wrap
  for (let i = 0; i < count; i++) {
    svc.selectNext();
  }
  // Should wrap back to 0
  assert.strictEqual(svc.getSelectedIndex(), 0, "should wrap around to 0");

  // Navigate previous from 0 should wrap to end
  svc.selectPrevious();
  assert.strictEqual(svc.getSelectedIndex(), count - 1, "should wrap to last");
  console.log("  [ok] keyboard navigation wraps around");
}

function testAcceptSelected() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  svc.getSuggestions({ currentInput: "" });
  const accepted = svc.acceptSelected();
  assert.ok(accepted, "should accept current selection");
  assert.ok(accepted!.value, "accepted suggestion should have a value");
  console.log("  [ok] acceptSelected returns current suggestion");
}

function testAcceptSelectedEmpty() {
  const { svc } = createService();

  // No suggestions generated
  const accepted = svc.acceptSelected();
  assert.strictEqual(
    accepted,
    undefined,
    "should return undefined with no suggestions",
  );
  console.log("  [ok] acceptSelected returns undefined when no suggestions");
}

function testResetSelection() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  svc.getSuggestions({ currentInput: "" });
  svc.selectNext();
  svc.resetSelection();

  assert.strictEqual(
    svc.getSelectedIndex(),
    -1,
    "index should be -1 after reset",
  );
  assert.strictEqual(
    svc.acceptSelected(),
    undefined,
    "no selection after reset",
  );
  console.log("  [ok] resetSelection clears navigation state");
}

// ── Error handling ───────────────────────────────────────────

function testSourceErrorHandling() {
  const { svc } = createService();

  const failingSource: AutocompleteSource = {
    id: "custom:failing",
    name: "Failing Source",
    enabled: true,
    getSuggestions: () => {
      throw new Error("Source explosion");
    },
  };

  svc.registerSource(failingSource);
  svc.setContractFunctions(sampleFunctions);

  // Should not throw, should return partial results
  const result = svc.getSuggestions({ currentInput: "" });
  assert.ok(
    result.suggestions.length > 0,
    "should still have suggestions from other sources",
  );

  const errors = svc.getLastErrors();
  assert.strictEqual(errors.length, 1, "should record one error");
  assert.strictEqual(errors[0].source, "custom:failing");
  assert.strictEqual(errors[0].recoverable, true);
  console.log("  [ok] source errors produce partial results and are recorded");
}

// ── Result metadata ──────────────────────────────────────────

function testResultMetadata() {
  const { svc } = createService();
  svc.setContractFunctions(sampleFunctions);

  const result = svc.getSuggestions({ currentInput: "" });
  assert.ok(result.queryTimeMs >= 0, "queryTimeMs should be non-negative");
  assert.ok(
    typeof result.totalCount === "number",
    "totalCount should be a number",
  );
  assert.ok(
    typeof result.truncated === "boolean",
    "truncated should be a boolean",
  );
  console.log("  [ok] result metadata is populated correctly");
}

// ── Deduplication ────────────────────────────────────────────

function testSuggestionDeduplication() {
  const { svc } = createService();

  // Create two custom sources that return the same value
  const source1: AutocompleteSource = {
    id: "custom:dup1",
    name: "Dup 1",
    enabled: true,
    getSuggestions: () => [
      {
        label: "same-val",
        value: "same-val",
        type: "custom",
        score: 60,
        source: "custom:dup1",
      },
    ],
  };
  const source2: AutocompleteSource = {
    id: "custom:dup2",
    name: "Dup 2",
    enabled: true,
    getSuggestions: () => [
      {
        label: "same-val",
        value: "same-val",
        type: "custom",
        score: 80,
        source: "custom:dup2",
      },
    ],
  };

  svc.registerSource(source1);
  svc.registerSource(source2);

  const result = svc.getSuggestions({ currentInput: "" });
  const sameValSuggestions = result.suggestions.filter(
    (s) => s.value === "same-val",
  );
  assert.strictEqual(
    sameValSuggestions.length,
    1,
    "duplicates should be deduplicated",
  );
  assert.strictEqual(
    sameValSuggestions[0].score,
    80,
    "should keep highest score",
  );
  console.log(
    "  [ok] duplicate suggestions are deduplicated keeping highest score",
  );
}

// ── Disabled source ──────────────────────────────────────────

function testDisabledSourceSkipped() {
  const { svc } = createService();

  const disabledSource: AutocompleteSource = {
    id: "custom:disabled",
    name: "Disabled",
    enabled: false,
    getSuggestions: () => [
      {
        label: "should-not-appear",
        value: "should-not-appear",
        type: "custom",
        score: 100,
        source: "custom:disabled",
      },
    ],
  };

  svc.registerSource(disabledSource);

  const result = svc.getSuggestions({ currentInput: "" });
  assert.ok(
    !result.suggestions.some((s) => s.source === "custom:disabled"),
    "disabled source should not produce suggestions",
  );
  console.log("  [ok] disabled source is skipped");
}

// ── Output channel logging ───────────────────────────────────

function testOutputChannelLogging() {
  const { svc, out } = createService();
  svc.setContractFunctions(sampleFunctions);
  svc.getSuggestions({ currentInput: "" });
  assert.ok(out.lines.length > 0, "should log to output channel");
  assert.ok(out.lines.some((l) => l.includes("[Autocomplete]")));
  console.log("  [ok] service logs to output channel");
}

// ── Edge cases ───────────────────────────────────────────────

function testEmptyContextNoFunctions() {
  const { svc } = createService();
  // No functions set, no history
  const result = svc.getSuggestions({ currentInput: "" });
  assert.strictEqual(
    result.suggestions.length,
    0,
    "should have no suggestions",
  );
  assert.strictEqual(result.truncated, false);
  console.log("  [ok] empty context with no functions returns empty");
}

function testSelectNextWithNoSuggestions() {
  const { svc } = createService();
  const next = svc.selectNext();
  assert.strictEqual(
    next,
    undefined,
    "selectNext with no suggestions returns undefined",
  );
  console.log("  [ok] selectNext with no suggestions returns undefined");
}

function testSelectPreviousWithNoSuggestions() {
  const { svc } = createService();
  const prev = svc.selectPrevious();
  assert.strictEqual(
    prev,
    undefined,
    "selectPrevious with no suggestions returns undefined",
  );
  console.log("  [ok] selectPrevious with no suggestions returns undefined");
}

// ── Runner ────────────────────────────────────────────────────

async function run() {
  const tests: (() => void | Promise<void>)[] = [
    // Function name autocomplete
    testFunctionNameExactPrefix,
    testFunctionNameEmptyInput,
    testFunctionNameNoMatch,
    testFunctionNameSubstringMatch,

    // Parameter autocomplete
    testParameterSuggestions,
    testParameterNameSuggestions,

    // Type pattern autocomplete
    testTypePatternBool,
    testTypePatternAddress,
    testTypePatternU128,
    testTypePatternUnknownType,

    // History-based suggestions
    testHistoryRecordAndRetrieve,
    testHistoryIncrementUseCount,
    testHistoryFilterByContract,
    testHistoryFilterByFunction,
    testHistoryBasedSuggestions,
    testHistoryClearing,
    testHistoryTrimming,

    // Suggestion filtering
    testFilterByMinScore,
    testFilterByMaxResults,
    testFilterBySourceType,

    // Fuzzy matching
    testFuzzyScoring,

    // Custom sources
    testRegisterCustomSource,
    testUnregisterCustomSource,
    testCannotUnregisterBuiltinSource,
    testUnregisterNonexistentSource,

    // Keyboard navigation
    testKeyboardNavigation,
    testKeyboardNavigationWrapAround,
    testAcceptSelected,
    testAcceptSelectedEmpty,
    testResetSelection,

    // Error handling
    testSourceErrorHandling,

    // Result metadata
    testResultMetadata,

    // Deduplication
    testSuggestionDeduplication,

    // Disabled source
    testDisabledSourceSkipped,

    // Logging
    testOutputChannelLogging,

    // Edge cases
    testEmptyContextNoFunctions,
    testSelectNextWithNoSuggestions,
    testSelectPreviousWithNoSuggestions,
  ];

  let passed = 0;
  let failed = 0;

  console.log("\nformAutocomplete unit tests");
  for (const test of tests) {
    try {
      await test();
      passed += 1;
    } catch (err) {
      failed += 1;
      console.error(`  [fail] ${test.name}`);
      console.error(
        `         ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exitCode = 1;
});
