#!/usr/bin/env node

declare function require(name: string): any;
declare const process: { exitCode?: number };

const path = require('path');
const fs = require('fs');

// Import test runners
import { runIntegrationTests } from './rpc.integration.test';
import { runCleanupTests } from './rpc/rpcCleanup.test';
import { runConnectionPoolingTests } from './rpc/rpcConnectionPooling.test';
import { runErrorHandlingTests } from './rpc/rpcErrorHandling.test';
import { runRateLimitingTests } from './rpc/rpcRateLimiting.test';
import { runRpcRequestTests } from './rpc/rpcRequests.test';
import { runResponseProcessingTests } from './rpc/rpcResponseProcessing.test';

// ── Test Configuration ─────────────────────────────────────

interface TestConfig {
    verbose: boolean;
    coverage: boolean;
    parallel: boolean;
    timeout: number;
    retries: number;
}

interface TestResult {
    name: string;
    passed: number;
    failed: number;
    total: number;
    duration: number;
    errors: string[];
}

interface TestSuite {
    name: string;
    description: string;
    runner: () => Promise<{ passed: number; failed: number; total: number }>;
    category: 'unit' | 'integration' | 'performance';
}

// ── Test Suites ─────────────────────────────────────────

const testSuites: TestSuite[] = [
    {
        name: 'RPC Requests',
        description: 'Test RPC request processing and formatting',
        runner: runRpcRequestTests,
        category: 'unit'
    },
    {
        name: 'Response Processing',
        description: 'Test RPC response parsing and handling',
        runner: runResponseProcessingTests,
        category: 'unit'
    },
    {
        name: 'Error Handling',
        description: 'Test RPC error scenarios and recovery',
        runner: runErrorHandlingTests,
        category: 'unit'
    },
    {
        name: 'Connection Pooling',
        description: 'Test connection management and retry mechanisms',
        runner: runConnectionPoolingTests,
        category: 'integration'
    },
    {
        name: 'Rate Limiting',
        description: 'Test rate limiting and backoff strategies',
        runner: runRateLimitingTests,
        category: 'integration'
    },
    {
        name: 'Cleanup & Teardown',
        description: 'Test resource cleanup and memory management',
        runner: runCleanupTests,
        category: 'integration'
    },
    {
        name: 'Integration Tests',
        description: 'End-to-end RPC integration scenarios',
        runner: runIntegrationTests,
        category: 'integration'
    }
];

// ── Test Runner Class ─────────────────────────────────────

class RpcTestRunner {
    private config: TestConfig;
    private results: TestResult[] = [];

    constructor(config: Partial<TestConfig> = {}) {
        this.config = {
            verbose: false,
            coverage: false,
            parallel: false,
            timeout: 30000,
            retries: 1,
            ...config
        };
    }

    async runSuite(suite: TestSuite): Promise<TestResult> {
        const startTime = Date.now();
        const errors: string[] = [];

        console.log(`\n🧪 Running ${suite.name}`);
        console.log(`   ${suite.description}`);
        console.log('─'.repeat(50));

        try {
            const result = await this.runWithTimeout(
                suite.runner(),
                this.config.timeout
            );

            const duration = Date.now() - startTime;

            const testResult: TestResult = {
                name: suite.name,
                passed: result.passed,
                failed: result.failed,
                total: result.total,
                duration,
                errors
            };

            this.results.push(testResult);
            return testResult;

        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(errorMsg);

            const testResult: TestResult = {
                name: suite.name,
                passed: 0,
                failed: 1,
                total: 1,
                duration,
                errors
            };

            this.results.push(testResult);
            return testResult;
        }
    }

    async runWithTimeout<T>(
        fn: () => Promise<T>,
        timeoutMs: number
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Test suite timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            fn()
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    async runAll(): Promise<void> {
        console.log('🚀 Stellar Suite RPC Integration Tests');
        console.log('='.repeat(60));
        console.log(`Configuration: ${JSON.stringify(this.config, null, 2)}`);
        console.log(`Test Suites: ${testSuites.length}`);
        console.log('='.repeat(60));

        const startTime = Date.now();

        if (this.config.parallel) {
            // Run suites in parallel
            const promises = testSuites.map(suite => this.runSuite(suite));
            await Promise.all(promises);
        } else {
            // Run suites sequentially
            for (const suite of testSuites) {
                await this.runSuite(suite);
            }
        }

        const totalDuration = Date.now() - startTime;
        this.printSummary(totalDuration);
        this.generateReports();

        if (this.hasFailures()) {
            process.exitCode = 1;
        }
    }

    async runByCategory(category: 'unit' | 'integration' | 'performance'): Promise<void> {
        const filteredSuites = testSuites.filter(suite => suite.category === category);

        console.log(`🧪 Running ${category} tests`);
        console.log('='.repeat(60));

        const startTime = Date.now();

        for (const suite of filteredSuites) {
            await this.runSuite(suite);
        }

        const totalDuration = Date.now() - startTime;
        this.printSummary(totalDuration);
        this.generateReports();

        if (this.hasFailures()) {
            process.exitCode = 1;
        }
    }

    private hasFailures(): boolean {
        return this.results.some(result => result.failed > 0);
    }

    private printSummary(totalDuration: number): void {
        console.log('\n' + '='.repeat(60));
        console.log('📊 Test Summary');
        console.log('='.repeat(60));

        let totalPassed = 0;
        let totalFailed = 0;
        let totalTests = 0;

        for (const result of this.results) {
            totalPassed += result.passed;
            totalFailed += result.failed;
            totalTests += result.total;

            const status = result.failed === 0 ? '✅' : '❌';
            const duration = `${result.duration}ms`;
            const passRate = totalTests > 0 ? ((result.passed / result.total) * 100).toFixed(1) : '0.0';

            console.log(`${status} ${result.name.padEnd(20)} ${result.passed}/${result.total} (${passRate}%) ${duration}`);

            if (this.config.verbose && result.errors.length > 0) {
                for (const error of result.errors) {
                    console.log(`    ❌ ${error}`);
                }
            }
        }

        console.log('─'.repeat(60));
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${totalPassed}`);
        console.log(`Failed: ${totalFailed}`);
        console.log(`Success Rate: ${totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0.0}%`);
        console.log(`Total Duration: ${totalDuration}ms`);
        console.log('='.repeat(60));
    }

    private generateReports(): void {
        if (!this.config.coverage) {
            return;
        }

        // Generate JSON report
        const jsonReport = {
            timestamp: new Date().toISOString(),
            config: this.config,
            results: this.results,
            summary: {
                total: this.results.reduce((sum, r) => sum + r.total, 0),
                passed: this.results.reduce((sum, r) => sum + r.passed, 0),
                failed: this.results.reduce((sum, r) => sum + r.failed, 0),
                duration: this.results.reduce((sum, r) => sum + r.duration, 0)
            }
        };

        const reportPath = path.join(__dirname, '../../test-results');
        if (!fs.existsSync(reportPath)) {
            fs.mkdirSync(reportPath, { recursive: true });
        }

        fs.writeFileSync(
            path.join(reportPath, 'rpc-test-results.json'),
            JSON.stringify(jsonReport, null, 2)
        );

        // Generate JUnit XML report for CI/CD
        const junitXml = this.generateJUnitXml(jsonReport);
        fs.writeFileSync(
            path.join(reportPath, 'rpc-test-results.xml'),
            junitXml
        );

        console.log(`\n📄 Test reports generated: ${reportPath}`);
    }

    private generateJUnitXml(report: any): string {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<testsuites>\n';

        for (const suite of this.results) {
            xml += `  <testsuite name="${suite.name}" tests="${suite.total}" failures="${suite.failed}" time="${suite.duration / 1000}">\n`;

            if (suite.errors.length > 0) {
                xml += `    <failure message="${suite.errors.join('; ')}">\n`;
                xml += `      ${suite.errors.join('\\n')}\n`;
                xml += '    </failure>\n';
            }

            xml += '  </testsuite>\n';
        }

        xml += '</testsuites>';
        return xml;
    }
}

// ── CLI Interface ─────────────────────────────────────────

function parseArgs(): TestConfig & { category?: string; help?: boolean } {
    const args = process.argv.slice(2);
    const config: TestConfig & { category?: string; help?: boolean } = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--verbose':
            case '-v':
                config.verbose = true;
                break;
            case '--coverage':
            case '-c':
                config.coverage = true;
                break;
            case '--parallel':
            case '-p':
                config.parallel = true;
                break;
            case '--timeout':
            case '-t':
                config.timeout = parseInt(args[++i]) || 30000;
                break;
            case '--retries':
            case '-r':
                config.retries = parseInt(args[++i]) || 1;
                break;
            case '--category':
                config.category = args[++i];
                break;
            case '--help':
            case '-h':
                config.help = true;
                break;
        }
    }

    return config;
}

function printHelp(): void {
    console.log(`
Stellar Suite RPC Integration Test Runner

Usage: node rpc-test-runner.js [options]

Options:
  -v, --verbose     Enable verbose output
  -c, --coverage    Generate test coverage reports
  -p, --parallel    Run test suites in parallel
  -t, --timeout     Set test timeout in milliseconds (default: 30000)
  -r, --retries     Set number of retries for failed tests (default: 1)
  --category <type>  Run specific category: unit, integration, performance
  -h, --help        Show this help message

Examples:
  node rpc-test-runner.js                           # Run all tests
  node rpc-test-runner.js --verbose                  # Run with verbose output
  node rpc-test-runner.js --coverage                # Generate coverage reports
  node rpc-test-runner.js --category unit           # Run only unit tests
  node rpc-test-runner.js --parallel --coverage     # Run in parallel with coverage
`);
}

// ── Main Execution ─────────────────────────────────────

async function main(): Promise<void> {
    const config = parseArgs();

    if (config.help) {
        printHelp();
        return;
    }

    const runner = new RpcTestRunner(config);

    try {
        if (config.category) {
            await runner.runByCategory(config.category as any);
        } else {
            await runner.runAll();
        }
    } catch (error) {
        console.error('❌ Test runner failed:', error);
        process.exitCode = 1;
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    });
}

export { RpcTestRunner, TestConfig, TestResult };
