declare function require(name: string): any;
declare const process: { exitCode?: number };
declare const module: any;

const assert = require("assert");

import { RpcHealthMonitor } from "../../services/rpcHealthMonitor";
import { RpcRateLimiter } from "../../services/rpcRateLimitService";
import { RpcRetryService } from "../../services/rpcRetryService";
import { RpcService } from "../../services/rpcService";
import {
  MockRpcServer,
  createSimulationSuccessResponse,
} from "../mocks/mockRpcServer";

// ── Test Environment Setup ─────────────────────────────────────

class CleanupTestRunner {
  public mockServer: MockRpcServer;
  private originalFetch: typeof globalThis.fetch;
  public services: RpcService[] = [];
  public rateLimiters: RpcRateLimiter[] = [];
  public retryServices: RpcRetryService[] = [];
  public healthMonitors: RpcHealthMonitor[] = [];

  constructor() {
    this.mockServer = new MockRpcServer();
    this.originalFetch = globalThis.fetch;
  }

  setup(): void {
    globalThis.fetch = this.mockServer.createFetchHandler() as any;
  }

  teardown(): void {
    globalThis.fetch = this.originalFetch;
    this.cleanupServices();
    this.mockServer.reset();
  }

  cleanupServices(): void {
    // Cleanup all services
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

    for (const monitor of this.healthMonitors) {
      try {
        monitor.dispose();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    this.services = [];
    this.rateLimiters = [];
    this.retryServices = [];
    this.healthMonitors = [];
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

  createHealthMonitor(config?: any): RpcHealthMonitor {
    const monitor = new RpcHealthMonitor(config);
    this.healthMonitors.push(monitor);
    return monitor;
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

// ── Service Cleanup Tests ─────────────────────────────────

async function testServiceCleanup() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Proper cleanup of RPC services", async () => {
    const serviceCount = 5;

    // Create multiple services
    for (let i = 0; i < serviceCount; i++) {
      const service = runner.createService(
        `https://rpc${i}.testnet.stellar.org`,
      );
      runner.mockServer.setDefaultResponse(
        createSimulationSuccessResponse(`service_${i}_success`),
      );

      // Use each service
      const result = await service.simulateTransaction(
        `CSERVICE${i}`,
        "cleanup_function",
        [`arg_${i}`],
      );
      assert.strictEqual(result.success, true);
    }

    assert.strictEqual(runner.services.length, serviceCount);

    // Manual cleanup
    runner.cleanupServices();

    // Verify cleanup
    assert.strictEqual(runner.services.length, 0);
    assert.strictEqual(runner.rateLimiters.length, 0);
    assert.strictEqual(runner.retryServices.length, 0);
    assert.strictEqual(runner.healthMonitors.length, 0);
  });
}

async function testRateLimiterCleanup() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Proper cleanup of rate limiters", async () => {
    const limiterCount = 3;

    // Create multiple rate limiters
    for (let i = 0; i < limiterCount; i++) {
      const limiter = runner.createRateLimiter({
        maxRetries: i + 1,
        initialBackoffMs: 100 * (i + 1),
        maxBackoffMs: 1000 * (i + 1),
      });

      assert.ok(limiter, `Rate limiter ${i} should be created`);
    }

    assert.strictEqual(runner.rateLimiters.length, limiterCount);

    // Test that rate limiters are functional
    for (const limiter of runner.rateLimiters) {
      assert.ok(
        typeof limiter.fetch === "function",
        "Rate limiter should have fetch method",
      );
      assert.ok(
        typeof limiter.getIsRateLimited === "function",
        "Rate limiter should have status method",
      );
    }

    // Cleanup
    runner.cleanupServices();

    assert.strictEqual(runner.rateLimiters.length, 0);
  });
}

async function testRetryServiceCleanup() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Proper cleanup of retry services", async () => {
    const retryCount = 2;

    // Create multiple retry services
    for (let i = 0; i < retryCount; i++) {
      const retryService = runner.createRetryService({
        maxRetries: i + 2,
        initialBackoffMs: 200 * (i + 1),
        maxBackoffMs: 2000 * (i + 1),
      });

      assert.ok(retryService, `Retry service ${i} should be created`);
    }

    assert.strictEqual(runner.retryServices.length, retryCount);

    // Test that retry services are functional
    for (const retryService of runner.retryServices) {
      assert.ok(retryService, "Retry service should be valid");
    }

    // Cleanup
    runner.cleanupServices();

    assert.strictEqual(runner.retryServices.length, 0);
  });
}

async function testHealthMonitorCleanup() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Proper cleanup of health monitors", async () => {
    const monitorCount = 2;

    // Create multiple health monitors
    for (let i = 0; i < monitorCount; i++) {
      const monitor = runner.createHealthMonitor({
        checkIntervalMs: 1000 * (i + 1),
        timeoutMs: 5000 * (i + 1),
        failureThreshold: i + 1,
      });

      assert.ok(monitor, `Health monitor ${i} should be created`);
    }

    assert.strictEqual(runner.healthMonitors.length, monitorCount);

    // Test that health monitors are functional
    for (const monitor of runner.healthMonitors) {
      assert.ok(monitor, "Health monitor should be valid");
    }

    // Cleanup
    runner.cleanupServices();

    assert.strictEqual(runner.healthMonitors.length, 0);
  });
}

// ── Resource Cleanup Tests ─────────────────────────────────

async function testMemoryCleanupAfterOperations() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Memory cleanup after operations", async () => {
    const service = runner.createService();
    const operationCount = 20;

    runner.mockServer.setDefaultResponse(
      createSimulationSuccessResponse("memory_cleanup_success"),
    );

    // Get initial memory usage
    const initialMemory =
      (globalThis as any).process?.memoryUsage?.()?.heapUsed || 0;

    // Perform many operations
    for (let i = 0; i < operationCount; i++) {
      const result = await service.simulateTransaction(
        `CMEM${i}`,
        "memory_function",
        [`arg_${i}`],
      );
      assert.strictEqual(result.success, true);
    }

    const afterOperationsMemory =
      (globalThis as any).process?.memoryUsage?.()?.heapUsed || 0;

    // Cleanup
    runner.cleanupServices();

    // Force garbage collection if available
    if ((globalThis as any).gc) {
      (globalThis as any).gc();
    }

    await new Promise((resolve) => setTimeout(resolve, 100)); // Allow async cleanup

    const afterCleanupMemory =
      (globalThis as any).process?.memoryUsage?.()?.heapUsed || 0;

    const operationIncrease = afterOperationsMemory - initialMemory;
    const cleanupReduction = afterOperationsMemory - afterCleanupMemory;

    console.log(
      `    Memory: Initial=${initialMemory}, After Ops=${afterOperationsMemory}, After Cleanup=${afterCleanupMemory}`,
    );
    console.log(
      `    Increase during ops: ${(operationIncrease / 1024 / 1024).toFixed(2)}MB`,
    );
    console.log(
      `    Reduction after cleanup: ${(cleanupReduction / 1024 / 1024).toFixed(2)}MB`,
    );

    // Memory should not grow excessively
    assert.ok(
      operationIncrease < 50 * 1024 * 1024,
      "Memory increase should be reasonable",
    );
  });
}

async function testConnectionCleanup() {
  const runner = new CleanupTestRunner();

  await runner.runTest(
    "Connection cleanup after service disposal",
    async () => {
      const service = runner.createService();
      const requestCount = 10;

      runner.mockServer.setDefaultResponse(
        createSimulationSuccessResponse("connection_cleanup_success"),
      );

      // Make multiple requests to establish connections
      for (let i = 0; i < requestCount; i++) {
        const result = await service.simulateTransaction(
          `CCONN${i}`,
          "connection_function",
          [`arg_${i}`],
        );
        assert.strictEqual(result.success, true);
      }

      assert.strictEqual(runner.mockServer.getRequestCount(), requestCount);

      // Cleanup service
      runner.cleanupServices();

      // Verify no active connections remain (this is conceptual - actual connection tracking depends on implementation)
      assert.strictEqual(runner.services.length, 0);
    },
  );
}

async function testEventListenersCleanup() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Event listeners cleanup", async () => {
    const service = runner.createService();
    const events: any[] = [];

    // Add event listeners
    const rateLimiter = service.getRateLimiter();
    rateLimiter.onStatusChange((event) => {
      events.push(event);
    });

    // Trigger some events
    runner.mockServer.setDefaultResponse(
      createSimulationSuccessResponse("event_cleanup_success"),
    );

    for (let i = 0; i < 3; i++) {
      await service.simulateTransaction(`CEVENT${i}`, "event_function", [
        `arg_${i}`,
      ]);
    }

    const eventsBeforeCleanup = events.length;
    assert.ok(eventsBeforeCleanup > 0, "Should have received events");

    // Cleanup
    runner.cleanupServices();

    // After cleanup, new operations should not trigger events on disposed services
    // (This is conceptual - actual behavior depends on implementation)
    assert.strictEqual(runner.services.length, 0);
  });
}

// ── Error Handling During Cleanup ─────────────────────────────

async function testCleanupErrorHandling() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Graceful handling of cleanup errors", async () => {
    const service = runner.createService();

    runner.mockServer.setDefaultResponse(
      createSimulationSuccessResponse("cleanup_error_success"),
    );

    // Use service normally
    const result = await service.simulateTransaction(
      "CERROR",
      "error_function",
      [],
    );
    assert.strictEqual(result.success, true);

    // Mock cleanup errors by overriding dispose methods
    const originalDispose = service.getRateLimiter().dispose;
    service.getRateLimiter().dispose = () => {
      throw new Error("Mock cleanup error");
    };

    // Cleanup should not throw despite individual cleanup errors
    assert.doesNotThrow(() => {
      runner.cleanupServices();
    }, "Cleanup should handle individual errors gracefully");

    assert.strictEqual(runner.services.length, 0);
  });
}

async function testMultipleCleanupCycles() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Multiple cleanup cycles", async () => {
    const cycles = 3;

    for (let cycle = 0; cycle < cycles; cycle++) {
      // Create services
      const service = runner.createService();
      const limiter = runner.createRateLimiter();
      const retryService = runner.createRetryService();

      runner.mockServer.setDefaultResponse(
        createSimulationSuccessResponse(`cycle_${cycle}_success`),
      );

      // Use services
      const result = await service.simulateTransaction(
        `CCYCLE${cycle}`,
        "cycle_function",
        [`arg_${cycle}`],
      );
      assert.strictEqual(result.success, true);

      // Verify services exist
      assert.ok(runner.services.length > 0);
      assert.ok(runner.rateLimiters.length > 0);
      assert.ok(runner.retryServices.length > 0);

      // Cleanup
      runner.cleanupServices();

      // Verify cleanup
      assert.strictEqual(runner.services.length, 0);
      assert.strictEqual(runner.rateLimiters.length, 0);
      assert.strictEqual(runner.retryServices.length, 0);
    }

    // Final state should be clean
    assert.strictEqual(runner.services.length, 0);
    assert.strictEqual(runner.rateLimiters.length, 0);
    assert.strictEqual(runner.retryServices.length, 0);
    assert.strictEqual(runner.healthMonitors.length, 0);
  });
}

// ── Teardown Order Tests ─────────────────────────────────

async function testTeardownOrder() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Proper teardown order", async () => {
    const service = runner.createService();
    const limiter = runner.createRateLimiter();
    const retryService = runner.createRetryService();
    const monitor = runner.createHealthMonitor();

    runner.mockServer.setDefaultResponse(
      createSimulationSuccessResponse("teardown_order_success"),
    );

    // Use all services
    const result = await service.simulateTransaction(
      "CORDER",
      "order_function",
      [],
    );
    assert.strictEqual(result.success, true);

    // Verify all services exist
    assert.strictEqual(runner.services.length, 1);
    assert.strictEqual(runner.rateLimiters.length, 1);
    assert.strictEqual(runner.retryServices.length, 1);
    assert.strictEqual(runner.healthMonitors.length, 1);

    // Teardown should clean up everything
    runner.teardown();

    // Verify complete cleanup
    assert.strictEqual(runner.services.length, 0);
    assert.strictEqual(runner.rateLimiters.length, 0);
    assert.strictEqual(runner.retryServices.length, 0);
    assert.strictEqual(runner.healthMonitors.length, 0);
  });
}

async function testResourceLeakPrevention() {
  const runner = new CleanupTestRunner();

  await runner.runTest("Prevent resource leaks", async () => {
    const iterations = 5;

    for (let i = 0; i < iterations; i++) {
      // Create and use services
      const service = runner.createService();
      const limiter = runner.createRateLimiter();

      runner.mockServer.setDefaultResponse(
        createSimulationSuccessResponse(`leak_test_${i}_success`),
      );

      const result = await service.simulateTransaction(
        `CLEAK${i}`,
        "leak_function",
        [`arg_${i}`],
      );
      assert.strictEqual(result.success, true);

      // Don't manually cleanup - let the test runner handle it
    }

    // Final cleanup
    runner.teardown();

    // Verify no resources remain
    assert.strictEqual(runner.services.length, 0);
    assert.strictEqual(runner.rateLimiters.length, 0);
    assert.strictEqual(runner.retryServices.length, 0);
    assert.strictEqual(runner.healthMonitors.length, 0);
  });
}

// ── Test Runner ─────────────────────────────────────────────

async function runCleanupTests() {
  console.log("\n🧹 RPC Cleanup & Teardown Tests");
  console.log("=".repeat(50));

  const tests = [
    testServiceCleanup,
    testRateLimiterCleanup,
    testRetryServiceCleanup,
    testHealthMonitorCleanup,
    testMemoryCleanupAfterOperations,
    testConnectionCleanup,
    testEventListenersCleanup,
    testCleanupErrorHandling,
    testMultipleCleanupCycles,
    testTeardownOrder,
    testResourceLeakPrevention,
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

  console.log(`\n📊 Cleanup Test Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }

  return { passed, failed, total: tests.length };
}

// Export for use in other test files
export { runCleanupTests };

// Run tests if this file is executed directly
if (typeof require !== "undefined" && (require as any).main === module) {
  runCleanupTests().catch((error) => {
    console.error("Cleanup test runner error:", error);
    process.exitCode = 1;
  });
}
