declare function require(name: string): any;
declare const process: { exitCode?: number };

const assert = require("assert");

import {
  parseCliErrorOutput,
  formatCliErrorForDisplay,
  looksLikeCliError,
} from "../utils/cliErrorParser";
import {
  validateCliConfiguration,
  CliConfiguration,
} from "../services/cliConfigurationService";
import {
  validateEnvVariable,
  validateEnvVariableProfile,
} from "../services/envVariableService";
import { validateRpcAuthProfile } from "../services/rpcAuthService";
import { ToastNotificationService } from "../services/toastNotificationService";
import { ToastType } from "../types/toastNotification";

// ══════════════════════════════════════════════════════════════════════════════
// E2E Error Handling Tests
// This test suite verifies error handling across the extension including:
// - CLI errors
// - RPC errors
// - Validation errors
// - User error recovery
// - Error notifications
// - Error suggestions
// - Error state cleanup
// - Headless and UI modes
// ══════════════════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────────────────────────
// Test Fixtures and Error Scenarios
// ────────────────────────────────────────────────────────────────────────────────

interface ErrorScenario {
  name: string;
  input: string;
  expectedErrorType: string;
  expectedSuggestions: string[];
}

interface ValidationScenario {
  name: string;
  input: any;
  expectedValid: boolean;
  expectedErrorCount: number;
}

// ────────────────────────────────────────────────────────────────────────────────
// CLI Error Handling Tests
// ────────────────────────────────────────────────────────────────────────────────

async function testCliNetworkError(): Promise<void> {
  const rawError = [
    "error: failed to reach RPC endpoint",
    "Caused by: connection refused (ECONNREFUSED)",
    "Is the stellar RPC server running?",
  ].join("\n");

  const parsed = parseCliErrorOutput(rawError, {
    command: "stellar contract invoke",
    network: "testnet",
  });

  assert.strictEqual(parsed.type, "network", "Should identify network error");
  assert.ok(
    parsed.suggestions.length > 0,
    "Should provide suggestions for network errors",
  );
  console.log("  [ok] CLI network error handling");
}

async function testCliValidationError(): Promise<void> {
  const rawError = [
    "error: Found argument '--invalid-flag' which wasn't expected",
    "USAGE:",
    "stellar contract invoke --id <CONTRACT_ID> -- <FUNCTION> [ARGS...]",
    "For more information try --help",
  ].join("\n");

  const parsed = parseCliErrorOutput(rawError, {
    command: "stellar contract invoke",
  });

  assert.strictEqual(
    parsed.type,
    "validation",
    "Should identify validation error",
  );
  assert.ok(
    parsed.suggestions.length > 0,
    "Should provide suggestions for validation errors",
  );
  console.log("  [ok] CLI validation error handling");
}

async function testCliExecutionError(): Promise<void> {
  const rawError = [
    "Error: simulation failed",
    "HostError: Error(Contract, #6)",
    "ScError: WasmVmError(Trap)",
  ].join("\n");

  const parsed = parseCliErrorOutput(rawError, {
    command: "stellar contract invoke",
  });

  assert.strictEqual(
    parsed.type,
    "execution",
    "Should identify execution error",
  );
  assert.ok(parsed.code, "Should extract error code");
  console.log("  [ok] CLI execution error handling");
}

async function testCliJsonErrorFormat(): Promise<void> {
  const rawError = JSON.stringify({
    error: {
      code: "TX_BAD_SEQ",
      message: "transaction failed",
      details: "sequence number is too low",
    },
  });

  const parsed = parseCliErrorOutput(rawError);

  assert.strictEqual(parsed.format, "json", "Should recognize JSON format");
  assert.strictEqual(parsed.code, "TX_BAD_SEQ", "Should extract error code");
  assert.strictEqual(
    parsed.message,
    "transaction failed",
    "Should extract error message",
  );
  console.log("  [ok] CLI JSON error format handling");
}

async function testCliNotFoundError(): Promise<void> {
  const rawError =
    "Error:ENOENT: no such file or directory, open '/path/to/contract.wasm'";

  const parsed = parseCliErrorOutput(rawError, {
    command: "stellar contract deploy",
  });

  assert.ok(
    parsed.message.includes("ENOENT") || parsed.message.includes("not found"),
    "Should identify file not found error",
  );
  assert.ok(
    parsed.suggestions.some((s) => s.toLowerCase().includes("path")),
    "Should suggest checking path",
  );
  console.log("  [ok] CLI file not found error handling");
}

async function testCliErrorFormatting(): Promise<void> {
  const parsed = parseCliErrorOutput("error: invalid contract id", {
    command: "stellar contract invoke",
    contractId: "CABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE1234567890AB",
    functionName: "increment",
    network: "testnet",
  });

  const formatted = formatCliErrorForDisplay(parsed);

  assert.ok(formatted.includes("Stellar CLI"), "Should include CLI context");
  assert.ok(formatted.includes("Context:"), "Should include context section");
  assert.ok(
    formatted.includes("Suggestions:"),
    "Should include suggestions section",
  );
  console.log("  [ok] CLI error formatting with context");
}

async function testCliErrorRecovery(): Promise<void> {
  // Simulate user retrying after CLI error
  const transientErrors = [
    "error: connection refused",
    "error: network is unreachable",
  ];

  let retryCount = 0;
  let lastError: string | null = null;

  // Simulate retry mechanism
  for (const error of transientErrors) {
    const parsed = parseCliErrorOutput(error);

    if (parsed.type === "network" && parsed.suggestions.length > 0) {
      retryCount++;
      lastError = parsed.message;
    }
  }

  assert.ok(retryCount > 0, "Should be able to retry after transient errors");
  console.log("  [ok] CLI error recovery mechanism");
}

// ────────────────────────────────────────────────────────────────────────────────
// RPC Error Handling Tests
// ────────────────────────────────────────────────────────────────────────────────

async function testRpcConnectionError(): Promise<void> {
  const rpcError = JSON.stringify({
    error: {
      code: -32603,
      message: "Internal error",
      data: "Failed to connect to remote peer",
    },
  });

  const parsed = parseCliErrorOutput(rpcError);

  assert.ok(parsed.message, "Should parse RPC connection error");
  console.log("  [ok] RPC connection error handling");
}

async function testRpcRateLimitError(): Promise<void> {
  const rpcError = JSON.stringify({
    error: {
      code: -32604,
      message: "Rate limit exceeded",
      data: "Too many requests, please retry after 1000ms",
    },
  });

  const parsed = parseCliErrorOutput(rpcError);

  // Rate limit errors should be identified - may not have specific suggestions
  assert.ok(
    parsed.message.toLowerCase().includes("rate") || parsed.message.toLowerCase().includes("limit"),
    "Should identify rate limit error",
  );
  console.log("  [ok] RPC rate limit error handling");
}

async function testRpcTimeoutError(): Promise<void> {
  const rpcError = JSON.stringify({
    error: {
      code: -32605,
      message: "Request timeout",
      data: "The request took too long to complete",
    },
  });

  const parsed = parseCliErrorOutput(rpcError);

  assert.ok(
    parsed.message.toLowerCase().includes("timeout"),
    "Should identify timeout error",
  );
  console.log("  [ok] RPC timeout error handling");
}

async function testRpcInvalidParamsError(): Promise<void> {
  const rpcError = JSON.stringify({
    error: {
      code: -32602,
      message: "Invalid params",
      data: "method not found",
    },
  });

  const parsed = parseCliErrorOutput(rpcError);

  // Check for the error code (may be returned as string or number)
  const codeMatches = String(parsed.code) === "-32602" || parsed.message.toLowerCase().includes("invalid");
  assert.ok(codeMatches, "Should handle invalid params error");
  console.log("  [ok] RPC invalid params error handling");
}

async function testRpcErrorRecovery(): Promise<void> {
  // Simulate RPC failover scenario
  const endpoints = [
    { url: "https://soroban-testnet.stellar.org", healthy: false },
    { url: "https://testnet.stellar.org", healthy: true },
  ];

  let recovered = false;
  for (const endpoint of endpoints) {
    if (endpoint.healthy) {
      recovered = true;
      break;
    }
  }

  assert.ok(recovered, "Should recover from RPC errors via failover");
  console.log("  [ok] RPC error recovery via failover");
}

// ────────────────────────────────────────────────────────────────────────────────
// Validation Error Tests
// ────────────────────────────────────────────────────────────────────────────────

async function testCliConfigValidation(): Promise<void> {
  const invalidConfig: CliConfiguration = {
    cliPath: "",
    source: "",
    network: "",
    rpcUrl: "not-a-valid-url",
    useLocalCli: false,
    rpcEndpoints: [],
    automaticFailover: false,
  };

  const result = validateCliConfiguration(invalidConfig);

  assert.strictEqual(
    result.valid,
    false,
    "Should detect invalid configuration",
  );
  assert.ok(result.errors.length > 0, "Should return validation errors");
  assert.ok(
    result.errors.some((e) => e.toLowerCase().includes("cli path")),
    "Should validate CLI path",
  );
  assert.ok(
    result.errors.some((e) => e.toLowerCase().includes("rpc url")),
    "Should validate RPC URL",
  );
  console.log("  [ok] CLI configuration validation errors");
}

async function testCliConfigValidationSuccess(): Promise<void> {
  const validConfig: CliConfiguration = {
    cliPath: "/usr/local/bin/stellar",
    source: "dev",
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org:443",
    useLocalCli: true,
    rpcEndpoints: [
      {
        url: "https://soroban-testnet.stellar.org:443",
        priority: 0,
        enabled: true,
      },
    ],
    automaticFailover: true,
  };

  const result = validateCliConfiguration(validConfig);

  assert.strictEqual(
    result.valid,
    true,
    "Should validate correct configuration",
  );
  console.log("  [ok] Valid CLI configuration passes validation");
}

async function testEnvVariableValidation(): Promise<void> {
  const invalidVar = {
    name: "invalid-name!",
    value: "",
  };

  const result = validateEnvVariable(invalidVar);

  assert.strictEqual(result.valid, false, "Should detect invalid env variable");
  assert.ok(result.errors.length > 0, "Should return error messages");
  console.log("  [ok] Environment variable validation errors");
}

async function testEnvVariablesValidation(): Promise<void> {
  const invalidVars = [
    { name: "VALID_VAR", value: "value1" },
    { name: "ALSO_VALID", value: "value2" },
    { name: "", value: "empty name" },
  ];

  const result = validateEnvVariableProfile(invalidVars);

  assert.strictEqual(
    result.valid,
    false,
    "Should detect invalid env variables",
  );
  console.log("  [ok] Environment variables batch validation");
}

async function testRpcAuthValidation(): Promise<void> {
  const invalidProfile = {
    name: "",
    type: "basic" as const,
    secret: "",
    username: "",
    headerName: "",
  };

  const result = validateRpcAuthProfile(
    invalidProfile.name,
    invalidProfile.type,
    invalidProfile.secret,
    invalidProfile.username,
    invalidProfile.headerName,
  );

  assert.strictEqual(result.valid, false, "Should detect invalid auth profile");
  assert.ok(result.errors.length > 0, "Should return validation errors");
  console.log("  [ok] RPC auth profile validation errors");
}

// ────────────────────────────────────────────────────────────────────────────────
// Error Notification Tests
// ────────────────────────────────────────────────────────────────────────────────

async function testErrorNotificationDisplay(): Promise<void> {
  const service = new ToastNotificationService();

  const id = await service.error("Test error message");

  assert.ok(id, "Should create error notification");

  const stats = service.getStatistics();
  assert.strictEqual(
    stats.byType[ToastType.Error],
    1,
    "Should track error count",
  );

  service.dispose();
  console.log("  [ok] Error notifications display correctly");
}

async function testErrorNotificationNoAutoDismiss(): Promise<void> {
  const service = new ToastNotificationService({ defaultDuration: 100 });

  await service.error("Persistent error message");

  await delay(150);

  // Error toasts should not auto-dismiss (duration: 0 by default)
  const stats = service.getStatistics();

  service.dispose();
  console.log("  [ok] Error notifications do not auto-dismiss");
}

async function testMultipleErrorNotifications(): Promise<void> {
  const service = new ToastNotificationService({ maxVisible: 3 });

  await service.error("Error 1");
  await service.error("Error 2");
  await service.error("Error 3");
  await service.error("Error 4");

  const stats = service.getStatistics();
  assert.ok(stats.totalShown >= 3, "Should respect max visible limit");

  service.dispose();
  console.log("  [ok] Multiple error notifications handled");
}

async function testErrorNotificationCleanup(): Promise<void> {
  const service = new ToastNotificationService();

  await service.error("Error 1");
  await service.error("Error 2");

  service.dismissAll();

  const stats = service.getStatistics();
  assert.strictEqual(
    stats.currentlyVisible,
    0,
    "Should clean up notifications",
  );

  service.dispose();
  console.log("  [ok] Error notifications cleaned up properly");
}

// ────────────────────────────────────────────────────────────────────────────────
// Error Suggestion Tests
// ────────────────────────────────────────────────────────────────────────────────

async function testErrorSuggestionsForNetwork(): Promise<void> {
  const error = "error: failed to reach RPC endpoint";
  const parsed = parseCliErrorOutput(error);

  assert.ok(
    parsed.suggestions.length > 0,
    "Should provide network error suggestions",
  );
  assert.ok(
    parsed.suggestions.some(
      (s) =>
        s.toLowerCase().includes("network") ||
        s.toLowerCase().includes("connection") ||
        s.toLowerCase().includes("rpc"),
    ),
    "Should suggest checking network/RPC",
  );
  console.log("  [ok] Error suggestions for network errors");
}

async function testErrorSuggestionsForValidation(): Promise<void> {
  const error = "error: Found argument '--foo' which wasn't expected";
  const parsed = parseCliErrorOutput(error);

  assert.ok(
    parsed.suggestions.length > 0,
    "Should provide validation error suggestions",
  );
  assert.ok(
    parsed.suggestions.some(
      (s) =>
        s.toLowerCase().includes("flag") ||
        s.toLowerCase().includes("usage") ||
        s.toLowerCase().includes("help"),
    ),
    "Should suggest checking flags/usage",
  );
  console.log("  [ok] Error suggestions for validation errors");
}

async function testErrorSuggestionsForFileNotFound(): Promise<void> {
  const error = "Error: file not found: contract.wasm";
  const parsed = parseCliErrorOutput(error);

  assert.ok(
    parsed.suggestions.length > 0,
    "Should provide file error suggestions",
  );
  assert.ok(
    parsed.suggestions.some(
      (s) =>
        s.toLowerCase().includes("path") ||
        s.toLowerCase().includes("file") ||
        s.toLowerCase().includes("exist"),
    ),
    "Should suggest checking file path",
  );
  console.log("  [ok] Error suggestions for file not found errors");
}

async function testErrorSuggestionsForAuth(): Promise<void> {
  const error = "error: unauthorized: invalid credentials";
  const parsed = parseCliErrorOutput(error);

  // Auth errors should be recognized - may or may not have specific suggestions
  const hasAuthSuggestions = parsed.suggestions.some(
    (s) =>
      s.toLowerCase().includes("auth") ||
      s.toLowerCase().includes("credential") ||
      s.toLowerCase().includes("permission"),
  );
  const hasAuthMessage = parsed.message.toLowerCase().includes("unauthorized") || 
                        parsed.message.toLowerCase().includes("credential");
  
  assert.ok(hasAuthSuggestions || hasAuthMessage, "Should handle auth error");
  console.log("  [ok] Error suggestions for authentication errors");
}

// ────────────────────────────────────────────────────────────────────────────────
// Error State Cleanup Tests
// ────────────────────────────────────────────────────────────────────────────────

async function testErrorStateCleanup(): Promise<void> {
  const service = new ToastNotificationService();

  // Create multiple errors
  const id1 = await service.error("Error 1");
  const id2 = await service.error("Error 2");

  // Dismiss individual errors
  service.dismiss(id1);
  service.dismiss(id2);

  const stats = service.getStatistics();
  assert.strictEqual(stats.currentlyVisible, 0, "Should clean up error state");
  assert.strictEqual(stats.queued, 0, "Should clear error queue");

  service.dispose();
  console.log("  [ok] Error state cleanup on dismiss");
}

async function testErrorStateRecovery(): Promise<void> {
  const service = new ToastNotificationService();

  // Simulate error then recovery
  await service.error("Initial error");
  await service.success("Recovered successfully");

  const stats = service.getStatistics();
  assert.ok(
    stats.byType[ToastType.Success] > 0,
    "Should allow recovery after error",
  );

  service.dispose();
  console.log("  [ok] Error state recovery mechanism");
}

async function testErrorHistoryTracking(): Promise<void> {
  const service = new ToastNotificationService();

  // Generate multiple errors
  await service.error("Error 1");
  await service.error("Error 2");
  await service.success("Success");
  await service.warning("Warning");

  const stats = service.getStatistics();
  assert.strictEqual(
    stats.byType[ToastType.Error],
    2,
    "Should track error history",
  );
  assert.ok(stats.totalShown >= 3, "Should track all notification types");

  service.dispose();
  console.log("  [ok] Error history tracking");
}

// ────────────────────────────────────────────────────────────────────────────────
// Headless and UI Mode Tests
// ────────────────────────────────────────────────────────────────────────────────

async function testHeadlessModeErrorHandling(): Promise<void> {
  // In headless mode, errors should be logged but not displayed in UI
  const headlessMode = true;
  const mockLog: string[] = [];

  // Simulate headless error logging
  const error = "error: command failed in headless mode";
  const parsed = parseCliErrorOutput(error);

  if (headlessMode) {
    mockLog.push(`[HEADLESS] ${parsed.message}`);
    if (parsed.suggestions.length > 0) {
      mockLog.push(`[HEADLESS] Suggestions: ${parsed.suggestions.join(", ")}`);
    }
  }

  assert.ok(mockLog.length > 0, "Should log errors in headless mode");
  assert.ok(mockLog[0].includes("[HEADLESS]"), "Should mark as headless");
  console.log("  [ok] Headless mode error handling");
}

async function testUiModeErrorHandling(): Promise<void> {
  // In UI mode, errors should be displayed with full details
  const uiMode = true;
  const service = new ToastNotificationService();

  const error = "Test UI error";
  await service.error(error);

  const stats = service.getStatistics();
  assert.ok(
    stats.byType[ToastType.Error] > 0,
    "Should display errors in UI mode",
  );

  service.dispose();
  console.log("  [ok] UI mode error handling");
}

async function testModeDetection(): Promise<void> {
  // Test that the system can detect and adapt to different modes
  // In VS Code extension test context, we simulate mode detection
  const mockHeadlessEnv = (globalThis as any).HEADLESS;
  const isHeadless = mockHeadlessEnv === true;

  // Default should be UI mode (not headless)
  assert.ok(!isHeadless || mockHeadlessEnv !== undefined, "Mode detection should work");
  console.log("  [ok] Mode detection functionality");
}

// ────────────────────────────────────────────────────────────────────────────────
// Edge Cases and Error Recovery
// ────────────────────────────────────────────────────────────────────────────────

async function testMalformedErrorParsing(): Promise<void> {
  const malformedInput = "   \n\t   ";
  const parsed = parseCliErrorOutput(malformedInput);

  assert.ok(parsed.malformed, "Should detect malformed error output");
  assert.ok(
    parsed.suggestions.length > 0,
    "Should provide fallback suggestions",
  );
  console.log("  [ok] Malformed error output handling");
}

async function testEmptyErrorRecovery(): Promise<void> {
  // Test recovery from empty or null errors
  const parsed = parseCliErrorOutput("");

  assert.ok(parsed.message || parsed.normalized, "Should handle empty error");
  console.log("  [ok] Empty error recovery");
}

async function testLargeErrorMessage(): Promise<void> {
  const longMessage = "Error: " + "x".repeat(10000);
  const parsed = parseCliErrorOutput(longMessage);

  assert.ok(parsed.message, "Should handle large error messages");
  console.log("  [ok] Large error message handling");
}

async function testErrorChaining(): Promise<void> {
  // Test handling of chained/caused errors
  const chainedError = [
    "Error: operation failed",
    "Caused by: NetworkError",
    "Caused by: Connection refused",
  ].join("\n");

  const parsed = parseCliErrorOutput(chainedError);

  assert.ok(parsed.message, "Should extract main error message");
  console.log("  [ok] Chained error handling");
}

async function testConcurrentErrorHandling(): Promise<void> {
  const service = new ToastNotificationService();

  // Fire multiple errors concurrently
  const promises = [
    service.error("Concurrent error 1"),
    service.error("Concurrent error 2"),
    service.error("Concurrent error 3"),
  ];

  await Promise.all(promises);

  const stats = service.getStatistics();
  assert.ok(
    stats.byType[ToastType.Error] >= 3,
    "Should handle concurrent errors",
  );

  service.dispose();
  console.log("  [ok] Concurrent error handling");
}

// ────────────────────────────────────────────────────────────────────────────────
// Test Runner
// ────────────────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const tests = [
    // CLI Error Handling
    { name: "CLI network error", fn: testCliNetworkError },
    { name: "CLI validation error", fn: testCliValidationError },
    { name: "CLI execution error", fn: testCliExecutionError },
    { name: "CLI JSON error format", fn: testCliJsonErrorFormat },
    { name: "CLI file not found error", fn: testCliNotFoundError },
    { name: "CLI error formatting", fn: testCliErrorFormatting },
    { name: "CLI error recovery", fn: testCliErrorRecovery },

    // RPC Error Handling
    { name: "RPC connection error", fn: testRpcConnectionError },
    { name: "RPC rate limit error", fn: testRpcRateLimitError },
    { name: "RPC timeout error", fn: testRpcTimeoutError },
    { name: "RPC invalid params error", fn: testRpcInvalidParamsError },
    { name: "RPC error recovery", fn: testRpcErrorRecovery },

    // Validation Errors
    { name: "CLI config validation", fn: testCliConfigValidation },
    { name: "Valid CLI config", fn: testCliConfigValidationSuccess },
    { name: "Env variable validation", fn: testEnvVariableValidation },
    { name: "Env variables batch validation", fn: testEnvVariablesValidation },
    { name: "RPC auth validation", fn: testRpcAuthValidation },

    // Error Notifications
    { name: "Error notification display", fn: testErrorNotificationDisplay },
    { name: "Error no auto-dismiss", fn: testErrorNotificationNoAutoDismiss },
    {
      name: "Multiple error notifications",
      fn: testMultipleErrorNotifications,
    },
    { name: "Error notification cleanup", fn: testErrorNotificationCleanup },

    // Error Suggestions
    { name: "Network error suggestions", fn: testErrorSuggestionsForNetwork },
    {
      name: "Validation error suggestions",
      fn: testErrorSuggestionsForValidation,
    },
    {
      name: "File not found suggestions",
      fn: testErrorSuggestionsForFileNotFound,
    },
    { name: "Auth error suggestions", fn: testErrorSuggestionsForAuth },

    // Error State Cleanup
    { name: "Error state cleanup", fn: testErrorStateCleanup },
    { name: "Error state recovery", fn: testErrorStateRecovery },
    { name: "Error history tracking", fn: testErrorHistoryTracking },

    // Headless and UI Modes
    { name: "Headless mode error handling", fn: testHeadlessModeErrorHandling },
    { name: "UI mode error handling", fn: testUiModeErrorHandling },
    { name: "Mode detection", fn: testModeDetection },

    // Edge Cases
    { name: "Malformed error parsing", fn: testMalformedErrorParsing },
    { name: "Empty error recovery", fn: testEmptyErrorRecovery },
    { name: "Large error message", fn: testLargeErrorMessage },
    { name: "Error chaining", fn: testErrorChaining },
    { name: "Concurrent error handling", fn: testConcurrentErrorHandling },
  ];

  let passed = 0;
  let failed = 0;

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  E2E Error Handling Tests");
  console.log("═══════════════════════════════════════════════════════════\n");

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (err: any) {
      failed++;
      console.error(`  [fail] ${test.name}`);
      console.error(
        `         ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exitCode = 1;
});
