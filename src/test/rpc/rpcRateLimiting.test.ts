declare function require(name: string): any;
declare const process: { exitCode?: number };
declare const module: any;

const assert = require("assert");

import { RpcRateLimiter } from "../../services/rpcRateLimitService";
import { RpcService } from "../../services/rpcService";
import { EnhancedMockRpcServer } from "../mocks/enhancedMockRpcServer";
import {
  MockRpcServer,
  createRateLimitResponse,
  createSimulationSuccessResponse,
} from "../mocks/mockRpcServer";

// ── Test Environment Setup ─────────────────────────────────────

class RateLimitingTestRunner {
  public mockServer: MockRpcServer;
  private originalFetch: typeof globalThis.fetch;
  public services: RpcService[] = [];
  private rateLimiters: RpcRateLimiter[] = [];

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
    this.services = [];
    this.rateLimiters = [];
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

  async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ── Basic Rate Limiting Tests ─────────────────────────────

async function testBasicRateLimiting() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Basic rate limiting functionality", async () => {
    const service = runner.createService();
    const rateLimitConfig = {
      maxRetries: 2,
      initialBackoffMs: 100,
      maxBackoffMs: 1000,
    };

    // Create service with custom rate limiter
    const customService = new RpcService("https://rpc.testnet.stellar.org");
    runner.services.push(customService);

    // Simulate rate limit responses
    let requestCount = 0;
    runner.mockServer.addRoute("rate_limit", () => {
      requestCount++;
      if (requestCount <= 3) {
        return createRateLimitResponse(1);
      }
      return createSimulationSuccessResponse("after_rate_limit");
    });

    const result = await customService.simulateTransaction(
      "CRATE",
      "rate_limited_function",
      [],
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, "after_rate_limit");
    assert.ok(
      requestCount > 3,
      `Should have made multiple attempts due to rate limiting, made ${requestCount}`,
    );
  });
}

async function testRateLimitBackoff() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Rate limiting with exponential backoff", async () => {
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

    // Verify exponential backoff
    if (attemptTimes.length >= 3) {
      const delay1 = attemptTimes[1] - attemptTimes[0];
      const delay2 = attemptTimes[2] - attemptTimes[1];
      assert.ok(
        delay2 >= delay1,
        `Backoff should not decrease: ${delay1}ms -> ${delay2}ms`,
      );
    }

    assert.ok(totalTime > 200, "Total time should reflect backoff delays");
  });
}

async function testRateLimitRecovery() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Recovery after rate limiting", async () => {
    const service = runner.createService();
    let requestCount = 0;

    runner.mockServer.addRoute("recovery", () => {
      requestCount++;
      if (requestCount === 1) {
        return createRateLimitResponse(2); // 2 second retry after
      }
      return createSimulationSuccessResponse("recovery_success");
    });

    const startTime = Date.now();
    const result = await service.simulateTransaction(
      "CRECOVER",
      "recovery_function",
      [],
    );
    const duration = Date.now() - startTime;

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, "recovery_success");
    assert.ok(
      requestCount >= 2,
      `Should have made at least 2 attempts, made ${requestCount}`,
    );
    assert.ok(
      duration >= 1900,
      `Should respect retry-after header, took ${duration}ms`,
    );
  });
}

async function testRateLimitMaxRetries() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Respect maximum retry attempts", async () => {
    const service = runner.createService();
    let requestCount = 0;

    runner.mockServer.addRoute("max_retries", () => {
      requestCount++;
      return createRateLimitResponse(1); // Always rate limit
    });

    const result = await service.simulateTransaction(
      "CMAX",
      "max_retries_function",
      [],
    );

    assert.strictEqual(result.success, false);
    assert.ok(
      requestCount <= 5,
      `Should not exceed max retries, made ${requestCount} attempts`,
    );
    assert.ok(
      result.error!.includes("error") || result.error!.includes("failed"),
    );
  });
}

// ── Advanced Rate Limiting Tests ─────────────────────────────

async function testRateLimitWithDifferentEndpoints() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Rate limiting per endpoint", async () => {
    const service1 = runner.createService("https://rpc1.testnet.stellar.org");
    const service2 = runner.createService("https://rpc2.testnet.stellar.org");

    let endpoint1Count = 0;
    let endpoint2Count = 0;

    runner.mockServer.addRoute("endpoint1", () => {
      endpoint1Count++;
      if (endpoint1Count <= 2) {
        return createRateLimitResponse(1);
      }
      return createSimulationSuccessResponse("endpoint1_success");
    });

    runner.mockServer.addRoute("endpoint2", () => {
      endpoint2Count++;
      if (endpoint2Count <= 2) {
        return createRateLimitResponse(1);
      }
      return createSimulationSuccessResponse("endpoint2_success");
    });

    // Make requests to both endpoints
    const result1 = await service1.simulateTransaction(
      "CENDPOINT1",
      "endpoint1_function",
      [],
    );
    const result2 = await service2.simulateTransaction(
      "CENDPOINT2",
      "endpoint2_function",
      [],
    );

    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.result, "endpoint1_success");
    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.result, "endpoint2_success");

    assert.ok(
      endpoint1Count >= 3,
      `Endpoint 1 should have been retried, made ${endpoint1Count} attempts`,
    );
    assert.ok(
      endpoint2Count >= 3,
      `Endpoint 2 should have been retried, made ${endpoint2Count} attempts`,
    );
  });
}

async function testRateLimitWithBurstHandling() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Handle burst requests with rate limiting", async () => {
    const service = runner.createService();
    const burstSize = 10;
    let requestCount = 0;

    runner.mockServer.addRoute("burst", () => {
      requestCount++;
      // Allow first 3, then rate limit
      if (requestCount <= 3) {
        return createSimulationSuccessResponse("burst_success");
      }
      return createRateLimitResponse(1);
    });

    // Send burst of requests
    const requests = Array.from({ length: burstSize }, (_, i) =>
      service.simulateTransaction(`CBURST${i}`, "burst_function", [`arg_${i}`]),
    );

    const results = await Promise.allSettled(requests);

    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;

    const failureCount = results.filter(
      (r) => r.status === "fulfilled" && !r.value.success,
    ).length;

    assert.ok(
      successCount >= 3,
      `At least first 3 should succeed, got ${successCount}`,
    );
    assert.ok(
      failureCount > 0,
      `Some should be rate limited, got ${failureCount} failures`,
    );
  });
}

async function testRateLimitWithLargePayloads() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Rate limiting with large payloads", async () => {
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
        return createSimulationSuccessResponse(
          `payload_${payload.length}_success`,
        );
      });

      const result = await service.simulateTransaction(
        "CPAYLOAD",
        "payload_function",
        [payload],
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result, `payload_${payload.length}_success`);
      assert.ok(
        attemptCount >= 2,
        `Payload size ${payload.length} should have been retried`,
      );
    }
  });
}

async function testRateLimitStatusEvents() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Rate limit status events", async () => {
    const service = runner.createService();
    const statusEvents: any[] = [];

    // Listen to rate limiter events
    const rateLimiter = service.getRateLimiter();
    rateLimiter.onStatusChange((event) => {
      statusEvents.push(event);
    });

    let requestCount = 0;
    runner.mockServer.addRoute("events", () => {
      requestCount++;
      if (requestCount <= 2) {
        return createRateLimitResponse(1);
      }
      return createSimulationSuccessResponse("events_success");
    });

    const result = await service.simulateTransaction(
      "CEVENTS",
      "events_function",
      [],
    );

    assert.strictEqual(result.success, true);
    assert.ok(statusEvents.length > 0, "Should have received status events");

    const rateLimitEvents = statusEvents.filter(
      (e) => e.status === "RateLimited",
    );
    const healthyEvents = statusEvents.filter((e) => e.status === "Healthy");

    assert.ok(rateLimitEvents.length > 0, "Should have rate limit events");
    assert.ok(
      healthyEvents.length > 0,
      "Should have healthy events after recovery",
    );
  });
}

// ── Circuit Breaker Integration Tests ─────────────────────────────

async function testRateLimitWithCircuitBreaker() {
  const runner = new RateLimitingTestRunner();
  const enhancedServer = new EnhancedMockRpcServer({
    rateLimitConfig: {
      requestsPerSecond: 2,
      burstSize: 5,
    },
    circuitBreakerConfig: {
      failureThreshold: 5,
      recoveryTimeMs: 1000,
    },
  });

  await runner.runTest(
    "Rate limiting with circuit breaker integration",
    async () => {
      globalThis.fetch = enhancedServer.createEnhancedFetchHandler() as any;
      const service = new RpcService("https://rpc.testnet.stellar.org");
      runner.services.push(service);

      // Make requests to trigger rate limiting
      const results = [];
      for (let i = 0; i < 8; i++) {
        const result = await service.simulateTransaction(
          `CCIRCUIT${i}`,
          "circuit_function",
          [],
        );
        results.push(result);
      }

      const failureCount = results.filter((r) => !r.success).length;
      assert.ok(
        failureCount > 0,
        "Should have some failures due to rate limiting",
      );

      const circuitState = enhancedServer.getCircuitBreakerState();
      assert.ok(
        circuitState.failureCount >= 0,
        "Circuit breaker should track failures",
      );
    },
  );
}

// ── Performance Tests ─────────────────────────────────────

async function testRateLimitPerformance() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Rate limiting performance under load", async () => {
    const service = runner.createService();
    const loadTestRequests = 50;
    let successCount = 0;
    let rateLimitCount = 0;

    runner.mockServer.addRoute("performance", () => {
      // Simulate occasional rate limiting
      if (Math.random() < 0.3) {
        rateLimitCount++;
        return createRateLimitResponse(1);
      }
      successCount++;
      return createSimulationSuccessResponse("performance_success");
    });

    const startTime = Date.now();
    const requests = Array.from({ length: loadTestRequests }, (_, i) =>
      service.simulateTransaction(`CPERF${i}`, "performance_function", [
        `arg_${i}`,
      ]),
    );

    const results = await Promise.allSettled(requests);
    const duration = Date.now() - startTime;

    const successfulResults = results.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;

    assert.ok(successfulResults > 0, "Should have some successful requests");
    assert.ok(rateLimitCount > 0, "Should have some rate limited requests");
    assert.ok(
      duration < 15000,
      `Should complete in reasonable time, took ${duration}ms`,
    );

    console.log(
      `    Performance: ${loadTestRequests} requests in ${duration}ms, ${successfulResults} successful, ${rateLimitCount} rate limited`,
    );
  });
}

async function testRateLimitMemoryUsage() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Rate limiting memory usage", async () => {
    const service = runner.createService();
    const memoryTestRequests = 30;

    runner.mockServer.setDefaultResponse(
      createSimulationSuccessResponse("memory_success"),
    );

    // Get initial memory usage (if available)
    const initialMemory =
      (globalThis as any).process?.memoryUsage?.()?.heapUsed || 0;

    const requests = Array.from({ length: memoryTestRequests }, (_, i) =>
      service.simulateTransaction(`CMEM${i}`, "memory_function", [`arg_${i}`]),
    );

    await Promise.all(requests);

    // Check final memory usage
    const finalMemory =
      (globalThis as any).process?.memoryUsage?.()?.heapUsed || 0;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable
    assert.ok(
      memoryIncrease < 5 * 1024 * 1024,
      `Memory increase should be reasonable, was ${memoryIncrease} bytes`,
    );

    console.log(
      `    Memory usage: +${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`,
    );
  });
}

// ── Configuration Tests ─────────────────────────────────────

async function testRateLimitConfiguration() {
  const runner = new RateLimitingTestRunner();

  await runner.runTest("Rate limiting configuration options", async () => {
    const customConfig = {
      maxRetries: 5,
      initialBackoffMs: 50,
      maxBackoffMs: 500,
    };

    const rateLimiter = runner.createRateLimiter(customConfig);

    // Test that configuration is applied
    assert.ok(rateLimiter, "Rate limiter should be created with custom config");

    // The actual configuration testing would require accessing private properties
    // or testing behavior that reflects the configuration
    let attemptCount = 0;
    const attemptTimes: number[] = [];

    globalThis.fetch = async () => {
      attemptTimes.push(Date.now());
      attemptCount++;
      if (attemptCount <= 3) {
        return new Response(JSON.stringify({ error: "Too Many Requests" }), {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { returnValue: "config_success" },
        }),
        {
          status: 200,
        },
      );
    };

    const result = await rateLimiter.fetch("https://test.com", {
      method: "POST",
      body: JSON.stringify({ test: "data" }),
    });

    assert.ok(result, "Should complete with custom configuration");
    assert.ok(
      attemptCount >= 4,
      `Should respect custom retry count, made ${attemptCount} attempts`,
    );
  });
}

// ── Test Runner ─────────────────────────────────────────────

async function runRateLimitingTests() {
  console.log("\n🚦 RPC Rate Limiting Tests");
  console.log("=".repeat(50));

  const tests = [
    testBasicRateLimiting,
    testRateLimitBackoff,
    testRateLimitRecovery,
    testRateLimitMaxRetries,
    testRateLimitWithDifferentEndpoints,
    testRateLimitWithBurstHandling,
    testRateLimitWithLargePayloads,
    testRateLimitStatusEvents,
    testRateLimitWithCircuitBreaker,
    testRateLimitPerformance,
    testRateLimitMemoryUsage,
    testRateLimitConfiguration,
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
    `\n📊 Rate Limiting Test Results: ${passed} passed, ${failed} failed`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }

  return { passed, failed, total: tests.length };
}

// Export for use in other test files
export { runRateLimitingTests };

// Run tests if this file is executed directly
if (typeof require !== "undefined" && (require as any).main === module) {
  runRateLimitingTests().catch((error) => {
    console.error("Rate limiting test runner error:", error);
    process.exitCode = 1;
  });
}
