# Performance Testing Quick Start

## 5-Minute Setup

### 1. Run Performance Tests

```bash
# Run UI performance tests
npm run test:ui-performance

# Run performance reporting tests
npm run test:performance-reporting

# Run all tests including performance
npm run test
```

### 2. Expected Output

```
UI Performance Tests
  [ok] sidebar rendering: avg 425.32ms, p95 612.45ms
  [ok] sidebar updates: avg 245.12ms, p95 389.45ms
  [ok] form generation: avg 142.34ms, p95 234.56ms
  [ok] form validation: avg 78.23ms
  [ok] simulation panel rendering: avg 312.45ms
  [ok] simulation panel updates: avg 156.78ms
  [ok] UI interactions: avg 18.45ms, p95 32.12ms
  [ok] benchmark validation passes for acceptable performance
  [ok] benchmark warning triggered for degraded performance
  [ok] benchmark critical triggered for severe performance degradation
  [ok] regression detection: 80.00% increase detected
  [ok] no regression detected for minor performance variations

12 tests: 12 passed, 0 failed
```

## Common Tasks

### Measure a Specific Operation

```typescript
import { PerformanceMonitoringService } from './services/performanceMonitoringService';

const monitor = new PerformanceMonitoringService();

// Measure async operation
const result = await monitor.measureAsync(
    'my-operation',
    'render',
    async () => {
        // Your code here
        return doSomething();
    },
    { context: 'value' }
);

// Get statistics
const stats = monitor.calculateStats('my-operation');
console.log(`Average: ${stats.average}ms, P95: ${stats.p95}ms`);
```

### Generate a Report

```typescript
import { PerformanceReportService } from './services/performanceReportService';

const reportService = new PerformanceReportService();
const snapshot = monitor.createSnapshot();
const report = reportService.generateReport(snapshot);

// Export in different formats
const json = reportService.exportAsJson(report);
const html = reportService.exportAsHtml(report);
const markdown = reportService.exportAsMarkdown(report);
```

### Check Against Benchmarks

```typescript
// Check if operation meets benchmark
const check = monitor.checkBenchmark('sidebar-render-initial', duration);

if (check.status === 'critical') {
    console.warn('Performance critical!');
} else if (check.status === 'warning') {
    console.warn('Performance degraded');
} else {
    console.log('Performance OK');
}
```

### Detect Regressions

```typescript
// Create baseline snapshot
const baseline = monitor.createSnapshot();

// ... run more operations ...

// Create current snapshot
const current = monitor.createSnapshot();

// Detect regressions
const regressions = monitor.detectRegressions();

for (const regression of regressions) {
    console.warn(`${regression.metricName}: ${(regression.percentageChange * 100).toFixed(2)}% slower`);
}
```

## Performance Benchmarks

| Operation | Target | Warning | Critical |
|-----------|--------|---------|----------|
| Sidebar rendering | 500ms | 750ms | 1500ms |
| Sidebar updates | 200ms | 350ms | 750ms |
| Form generation | 100ms | 200ms | 500ms |
| Simulation panel | 300ms | 500ms | 1000ms |
| UI interactions | 100ms | 200ms | 500ms |

## Troubleshooting

### Tests Running Slowly
- Reduce number of iterations
- Use smaller datasets
- Close other applications

### Inconsistent Results
- Ensure consistent environment
- Run multiple times and average
- Check for background processes

### Regressions Not Detected
- Check regression threshold (default 15%)
- Verify benchmark configuration
- Ensure sufficient baseline data

## Integration with CI/CD

### GitHub Actions

```yaml
- name: Run performance tests
  run: npm run test:ui-performance

- name: Generate report
  run: node scripts/generate-performance-report.js
```

### Local Development

```bash
# Before committing
npm run test:ui-performance

# Monitor performance over time
npm run test:performance-reporting
```

## Tips & Tricks

### 1. Profile Before Optimizing
Always measure first to identify actual bottlenecks.

```typescript
const stats = monitor.calculateStats('operation');
console.log(`Slowest: ${stats.max}ms, Fastest: ${stats.min}ms`);
```

### 2. Track Trends
Keep historical snapshots to track improvements.

```typescript
const snapshots = [];
for (let i = 0; i < 10; i++) {
    // Run operations
    snapshots.push(monitor.createSnapshot());
}
```

### 3. Use Metadata
Attach context to metrics for better analysis.

```typescript
await monitor.measureAsync(
    'operation',
    'render',
    fn,
    { 
        contractCount: 50,
        environment: 'test',
        version: '1.0.0'
    }
);
```

### 4. Set Custom Benchmarks
Define benchmarks for your specific needs.

```typescript
monitor.registerBenchmark({
    name: 'custom-operation',
    category: 'render',
    targetMs: 200,
    warningThresholdMs: 350,
    criticalThresholdMs: 750,
});
```

## Next Steps

1. ✅ Run tests: `npm run test:ui-performance`
2. 📊 Review results and benchmarks
3. 🔧 Integrate into CI/CD pipeline
4. 📈 Monitor performance over time
5. 🚀 Optimize based on findings

## Resources

- [Full Performance Testing Guide](./performance-testing.md)
- [CI/CD Integration Guide](./performance-ci-cd-integration.md)
- [Implementation Summary](../PERFORMANCE_TESTING_SUMMARY.md)

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the full documentation
3. Check test output for specific errors
4. Verify benchmark configuration
