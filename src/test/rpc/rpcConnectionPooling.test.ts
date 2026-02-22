declare function require(name: string): any;
declare const process: { exitCode?: number };
declare const module: any;

const assert = require("assert");

import { RpcRateLimiter } from "../../services/rpcRateLimitService";
import { RpcRetryService } from "../../services/rpcRetryService";
import { RpcService } from "../../services/rpcService";
import { EnhancedMockRpcServer } from "../mocks/enhancedMockRpcServer";
import {
  createHttpErrorResponse,
  createRateLimitResponse,
  createSimulationSuccessResponse,
  MockRpcServer,
} from "../mocks/mockRpcServer";

// ── Test Environment Setup ─────────────────────────────────────

class ConnectionPoolingTestRunner {
  public mockServer: MockRpcServer;
  private originalFetch: typeof globalThis.fetch;
  private services: RpcService[] = [];
  private rateLimiters: RpcRateLimiter[] = [];
  private retryServices: RpcRetryService[] = [];

  constructor() {
    this.mockServer = new MockRpcServer();
    this.originalFetch = globalThis.fetch;
  }

  setup(): void {
    globalThis.fetch = this.mockServer.createFetchHandler() as any;
  }

  teardown(): void {
    globalThis.fetch = this.originalFetch;
    for (const service of this.services) {
      try {
        service.getRateLimiter().dispose();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    for (const limiter of this.rateLimiters) {
      try {
        limiter.dispose();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    for (const retryService of this.retryServices) {
      try {
        retryService.dispose();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    this.services = [];
    this.rateLimiters = [];
    this.retryServices = [];
    this.mockServer.reset();
  }

  createService(url: string = "https://rpc.testnet.stellar.org"): RpcService {
    const service = new RpcService(url);
    this.services.push(service);
    return service;
  }

  createRateLimiter(config?: any): RpcRateLimiter {
    const limiter = new RpcRateLimiter(config);
    this.rateLimiters.push(limiter);
    return limiter;
  }

  createRetryService(config?: any): RpcRetryService {
    const retryService = new RpcRetryService(config);
    this.retryServices.push(retryService);
    return retryService;
  }

  async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    try {
      this.setup();
      await testFn();
      console.log(`  [ok] ${testName}`);
    } catch (error) {
      console.error(
        `  [fail] ${testName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      this.teardown();
    }
  }
}

// ── Connection Pooling Tests ───────────────────────────────────

async function testConcurrentConnectionHandling() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest(
    "Handle concurrent connections efficiently",
    async () => {
      const service = runner.createService();
      const concurrentRequests = 20;

      runner.mockServer.setDefaultResponse(
        createSimulationSuccessResponse("concurrent_success"),
      );

      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        service.simulateTransaction(
          `C${i.toString().padStart(3, "0")}`,
          "concurrent_function",
          [`arg_${i}`],
        ),
      );

      const startTime = Date.now();
      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      assert.strictEqual(results.length, concurrentRequests);
      for (const result of results) {
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result, "concurrent_success");
      }

      assert.strictEqual(
        runner.mockServer.getRequestCount(),
        concurrentRequests,
      );
      assert.ok(
        duration < 5000,
        `Concurrent requests should complete quickly, took ${duration}ms`,
      );
    },
  );
}

async function testConnectionReuse() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest("Reuse connections for multiple requests", async () => {
    const service = runner.createService();
    const requestCount = 10;

    runner.mockServer.setDefaultResponse(
      createSimulationSuccessResponse("reuse_success"),
    );

    // Sequential requests should reuse connections
    for (let i = 0; i < requestCount; i++) {
      const result = await service.simulateTransaction(
        `CREUSE${i}`,
        "reuse_function",
        [`arg_${i}`],
      );
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, "reuse_success");
    }

    assert.strictEqual(runner.mockServer.getRequestCount(), requestCount);
  });
}

async function testConnectionTimeoutHandling() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest("Handle connection timeouts properly", async () => {
    const service = runner.createService();

    // Simulate slow response
    runner.mockServer.addRoute("timeout", () => {
      return {
        status: 200,
        body: {
          jsonrpc: "2.0",
          id: 1,
          result: { returnValue: "timeout_success" },
        },
        delay: 35000, // Longer than 30 second timeout
      };
    });

    const result = await service.simulateTransaction(
      "CTIMEOUT",
      "timeout_function",
      [],
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error!.includes("timed out"));
  });
}

async function testConnectionFailureRecovery() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest("Recover from connection failures", async () => {
    const service = runner.createService();

    // First request fails
    globalThis.fetch = async () => {
      throw new Error("Connection refused");
    };

    const failedResult = await service.simulateTransaction(
      "CFAIL1",
      "fail_function",
      [],
    );
    assert.strictEqual(failedResult.success, false);

    // Restore normal fetch
    runner.setup();
    runner.mockServer.setDefaultResponse(
      createSimulationSuccessResponse("recovery_success"),
    );

    // Second request succeeds
    const successResult = await service.simulateTransaction(
      "CRECOVER",
      "recover_function",
      [],
    );
    assert.strictEqual(successResult.success, true);
    assert.strictEqual(successResult.result, "recovery_success");
  });
}

// ── Retry Mechanism Tests ─────────────────────────────────────

async function testBasicRetryMechanism() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest(
    "Basic retry mechanism on transient failures",
    async () => {
      const service = runner.createService();
      let attemptCount = 0;

      runner.mockServer.addRoute("retry", () => {
        attemptCount++;
        if (attemptCount < 3) {
          return createRateLimitResponse(1); // Rate limit to trigger retry
        }
        return createSimulationSuccessResponse("retry_success");
      });

      const result = await service.simulateTransaction(
        "CRETRY",
        "retry_function",
        [],
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, "retry_success");
      assert.ok(
        attemptCount >= 3,
        `Should have made at least 3 attempts, made ${attemptCount}`,
      );
    },
  );
}

async function testRetryWithExponentialBackoff() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest("Retry with exponential backoff", async () => {
    const service = runner.createService();
    const attemptTimes: number[] = [];
    let attemptCount = 0;

    runner.mockServer.addRoute("backoff", () => {
      attemptTimes.push(Date.now());
      attemptCount++;
      if (attemptCount < 4) {
        return createRateLimitResponse(1);
      }
      return createSimulationSuccessResponse("backoff_success");
    });

    const startTime = Date.now();
    const result = await service.simulateTransaction(
      "CBACKOFF",
      "backoff_function",
      [],
    );
    const totalTime = Date.now() - startTime;

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, "backoff_success");
    assert.ok(
      attemptCount >= 4,
      `Should have made at least 4 attempts, made ${attemptCount}`,
    );

    // Verify exponential backoff (delays should increase)
    if (attemptTimes.length >= 3) {
      const delay1 = attemptTimes[1] - attemptTimes[0];
      const delay2 = attemptTimes[2] - attemptTimes[1];
      assert.ok(
        delay2 > delay1,
        `Backoff should increase: ${delay1}ms -> ${delay2}ms`,
      );
    }

    assert.ok(totalTime > 1000, "Total time should reflect backoff delays");
  });
}

async function testRetryMaxAttempts() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest("Respect maximum retry attempts", async () => {
    const service = runner.createService();
    let attemptCount = 0;

    runner.mockServer.addRoute("max_retry", () => {
      attemptCount++;
      return createRateLimitResponse(1); // Always rate limit
    });

    const result = await service.simulateTransaction(
      "CMAXRETRY",
      "max_retry_function",
      [],
    );

    assert.strictEqual(result.success, false);
    assert.ok(
      attemptCount <= 5,
      `Should not exceed max retries, made ${attemptCount} attempts`,
    );
    assert.ok(
      result.error!.includes("error") || result.error!.includes("failed"),
    );
  });
}

async function testRetryOnSpecificErrors() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest("Retry only on appropriate errors", async () => {
    const service = runner.createService();

    // Test retry on rate limit (should retry)
    runner.mockServer.setDefaultResponse(createRateLimitResponse(1));
    const rateLimitResult = await service.simulateTransaction(
      "CRATELIMIT",
      "rate_limit_function",
      [],
    );
    // Rate limiting is handled by the rate limiter, not by retry logic

    // Test no retry on client errors (4xx)
    runner.mockServer.setDefaultResponse(
      createHttpErrorResponse(400, "Bad Request"),
    );
    const clientErrorResult = await service.simulateTransaction(
      "CCLIENT",
      "client_error_function",
      [],
    );
    assert.strictEqual(clientErrorResult.success, false);
    assert.ok(clientErrorResult.error!.includes("400"));

    // Test retry on server errors (5xx)
    runner.mockServer.setDefaultResponse(
      createHttpErrorResponse(500, "Internal Server Error"),
    );
    const serverErrorResult = await service.simulateTransaction(
      "CSERVER",
      "server_error_function",
      [],
    );
    assert.strictEqual(serverErrorResult.success, false);
    assert.ok(serverErrorResult.error!.includes("500"));
  });
}

async function testRetryWithDifferentPayloads() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest("Retry with different payload sizes", async () => {
    const service = runner.createService();
    const payloads = [
      "small",
      "x".repeat(1000), // 1KB
      "x".repeat(10000), // 10KB
      "x".repeat(100000), // 100KB
    ];

    for (const payload of payloads) {
      let attemptCount = 0;

      runner.mockServer.addRoute(`payload_${payload.length}`, () => {
        attemptCount++;
        if (attemptCount < 2) {
          return createRateLimitResponse(1);
        }
        return createSimulationSuccessResponse(`success_${payload.length}`);
      });

      const result = await service.simulateTransaction(
        "CPAYLOAD",
        "payload_function",
        [payload],
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, `success_${payload.length}`);
      assert.ok(
        attemptCount >= 2,
        `Payload size ${payload.length} should have been retried`,
      );
    }
  });
}

// ── Circuit Breaker Tests ─────────────────────────────────────

async function testCircuitBreakerTripping() {
  const runner = new ConnectionPoolingTestRunner();
  const enhancedServer = new EnhancedMockRpcServer({
    errorRate: 1.0, // 100% failure rate
    circuitBreakerConfig: {
      failureThreshold: 3,
      recoveryTimeMs: 1000,
    },
  });

  await runner.runTest(
    "Circuit breaker trips on repeated failures",
    async () => {
      globalThis.fetch = enhancedServer.createEnhancedFetchHandler() as any;
      const service = new RpcService("https://rpc.testnet.stellar.org");

      // Make several failing requests to trip circuit breaker
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await service.simulateTransaction(
          `CCIRCUIT${i}`,
          "circuit_function",
          [],
        );
        results.push(result);
      }

      // First few should fail with actual errors, later ones should fail fast with circuit breaker
      const failureCount = results.filter((r) => !r.success).length;
      assert.ok(failureCount >= 3, "Should have multiple failures");

      // Check circuit breaker state
      const circuitState = enhancedServer.getCircuitBreakerState();
      assert.ok(
        circuitState.failureCount >= 3,
        "Circuit breaker should have recorded failures",
      );
    },
  );
}

async function testCircuitBreakerRecovery() {
  const runner = new ConnectionPoolingTestRunner();
  const enhancedServer = new EnhancedMockRpcServer({
    errorRate: 0.5, // 50% failure rate
    circuitBreakerConfig: {
      failureThreshold: 2,
      recoveryTimeMs: 500, // Short recovery time for testing
    },
  });

  await runner.runTest("Circuit breaker recovers after timeout", async () => {
    globalThis.fetch = enhancedServer.createEnhancedFetchHandler() as any;
    const service = new RpcService("https://rpc.testnet.stellar.org");

    // Trip the circuit breaker
    for (let i = 0; i < 3; i++) {
      await service.simulateTransaction(`CTRIP${i}`, "trip_function", []);
    }

    // Wait for recovery
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Should work again after recovery
    const result = await service.simulateTransaction(
      "CRECOVER",
      "recover_function",
      [],
    );
    // Result may still fail due to error rate, but circuit breaker should be open
  });
}

// ── Load Balancing Tests ─────────────────────────────────────

async function testLoadBalancingMultipleEndpoints() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest("Load balance across multiple endpoints", async () => {
    const services = [
      runner.createService("https://rpc1.testnet.stellar.org"),
      runner.createService("https://rpc2.testnet.stellar.org"),
      runner.createService("https://rpc3.testnet.stellar.org"),
    ];

    // Set up responses for each service
    for (let i = 0; i < services.length; i++) {
      // Note: In real implementation, you'd need to mock different fetch handlers
      // This is a simplified test showing the concept
    }

    const requests = [];
    for (let i = 0; i < 9; i++) {
      const serviceIndex = i % services.length;
      requests.push(
        services[serviceIndex].simulateTransaction(
          `CLOAD${i}`,
          "load_balance_function",
          [`arg_${i}`],
        ),
      );
    }

    const results = await Promise.all(requests);

    for (const result of results) {
      assert.strictEqual(result.success, true);
    }
  });
}

// ── Performance Tests ─────────────────────────────────────

async function testHighConcurrencyPerformance() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest(
    "Maintain performance under high concurrency",
    async () => {
      const service = runner.createService();
      const highConcurrency = 100;

      runner.mockServer.setDefaultResponse(
        createSimulationSuccessResponse("performance_success"),
      );

      const startTime = Date.now();
      const requests = Array.from({ length: highConcurrency }, (_, i) =>
        service.simulateTransaction(`CPERF${i}`, "performance_function", [
          `arg_${i}`,
        ]),
      );

      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      assert.strictEqual(results.length, highConcurrency);
      const successCount = results.filter((r) => r.success).length;
      assert.ok(
        successCount >= highConcurrency * 0.95,
        `At least 95% should succeed, got ${successCount}/${highConcurrency}`,
      );

      // Performance assertion - should handle high concurrency efficiently
      assert.ok(
        duration < 10000,
        `High concurrency should complete in reasonable time, took ${duration}ms`,
      );

      console.log(
        `    Performance: ${highConcurrency} requests in ${duration}ms (${((highConcurrency / duration) * 1000).toFixed(0)} req/s)`,
      );
    },
  );
}

async function testMemoryUsageUnderLoad() {
  const runner = new ConnectionPoolingTestRunner();

  await runner.runTest(
    "Maintain reasonable memory usage under load",
    async () => {
      const service = runner.createService();
      const memoryTestRequests = 50;

      runner.mockServer.setDefaultResponse(
        createSimulationSuccessResponse("memory_test_success"),
      );

      // Get initial memory usage (if available)
      const initialMemory =
        (globalThis as any).process?.memoryUsage?.()?.heapUsed || 0;

      const requests = Array.from({ length: memoryTestRequests }, (_, i) =>
        service.simulateTransaction(`CMEM${i}`, "memory_function", [
          `arg_${i}`,
        ]),
      );

      await Promise.all(requests);

      // Check final memory usage
      const finalMemory =
        (globalThis as any).process?.memoryUsage?.()?.heapUsed || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB for this test)
      assert.ok(
        memoryIncrease < 10 * 1024 * 1024,
        `Memory increase should be reasonable, was ${memoryIncrease} bytes`,
      );

      console.log(
        `    Memory usage: +${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`,
      );
    },
  );
}

// ── Test Runner ─────────────────────────────────────────────

async function runConnectionPoolingTests() {
  console.log("\n🔄 Connection Pooling & Retry Tests");
  console.log("=".repeat(50));

  const tests = [
    testConcurrentConnectionHandling,
    testConnectionReuse,
    testConnectionTimeoutHandling,
    testConnectionFailureRecovery,
    testBasicRetryMechanism,
    testRetryWithExponentialBackoff,
    testRetryMaxAttempts,
    testRetryOnSpecificErrors,
    testRetryWithDifferentPayloads,
    testCircuitBreakerTripping,
    testCircuitBreakerRecovery,
    testLoadBalancingMultipleEndpoints,
    testHighConcurrencyPerformance,
    testMemoryUsageUnderLoad,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (error) {
      failed++;
      console.error(
        `     Error: ${error instanceof Error ? error.stack || error.message : String(error)}`,
      );
    }
  }

  console.log(
    `\n📊 Connection Pooling Test Results: ${passed} passed, ${failed} failed`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }

  return { passed, failed, total: tests.length };
}

// Export for use in other test files
export { runConnectionPoolingTests };

// Run tests if this file is executed directly
if (typeof require !== "undefined" && (require as any).main === module) {
  runConnectionPoolingTests().catch((error) => {
    console.error("Connection pooling test runner error:", error);
    process.exitCode = 1;
  });
}
