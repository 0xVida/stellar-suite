# Performance Testing Suite

## Overview

The Stellar Suite performance testing suite provides comprehensive tools for measuring, monitoring, and reporting UI performance metrics. It ensures the extension remains responsive and fast across various scenarios.

## Architecture

### Core Components

#### 1. PerformanceMonitoringService
**Location:** `src/services/performanceMonitoringService.ts`

Core service for collecting and analyzing performance metrics.

**Key Features:**
- Record metrics with categories (render, update, generation, interaction, network)
- Measure async and sync function execution time
- Calculate statistics (average, min, max, p50, p95, p99)
- Create performance snapshots
- Detect performance regressions
- Manage performance benchmarks

**Usage:**
```typescript
import { PerformanceMonitoringService } from './services/performanceMonitoringService';

const monitor = new PerformanceMonitoringService();

// Measure async operation
const result = await monitor.measureAsync(
    'sidebar-render-initial',
    'render',
    async () => {
        // Your rendering code
        return renderSidebar();
    },
    { contractCount: 50 }
);

// Measure sync operation
const data = monitor.measureSync(
    'form-generation',
    'generation',
    () => generateForm(params),
    { paramCount: 10 }
);

// Get statistics
const stats = monitor.calculateStats('sidebar-render-initial');
console.log(`Average: ${stats.average}ms, P95: ${stats.p95}ms`);

// Create snapshot for analysis
const snapshot = monitor.createSnapshot();

// Detect regressions
const regressions = monitor.detectRegressions();
```

#### 2. PerformanceReportService
**Location:** `src/services/performanceReportService.ts`

Generates comprehensive performance reports in multiple formats.

**Supported Formats:**
- JSON - Machine-readable format for CI/CD integration
- CSV - Spreadsheet-compatible format
- HTML - Interactive web-based reports
- Markdown - Documentation-friendly format

**Usage:**
```typescript
import { PerformanceReportService } from './services/performanceReportService';

const reportService = new PerformanceReportService();
const report = reportService.generateReport(snapshot, regressions);

// Export in different formats
const json = reportService.exportAsJson(report);
const csv = reportService.exportAsCsv(report);
const html = reportService.exportAsHtml(report);
const markdown = reportService.exportAsMarkdown(report);
```

### Test Suites

#### 1. UI Performance Tests
**Location:** `src/test/uiPerformance.test.ts`

Comprehensive tests for UI rendering and interaction performance.

**Test Categories:**

**Sidebar Rendering:**
- Small contract list (10 contracts)
- Medium contract list (50 contracts)
- Large contract list (200 contracts)
- Update performance (10 rapid updates)

**Form Generation:**
- Few parameters (3 params)
- Many parameters (20 params)
- Batch generation (50 forms)

**Form Validation:**
- Few fields (3 fields)
- Many fields (50 fields)

**Simulation Panel:**
- Small result rendering
- Large result rendering
- Update performance

**UI Interaction:**
- Response time for 20 rapid interactions

**Benchmarking:**
- Validation against benchmarks
- Warning threshold detection
- Critical threshold detection

**Regression Detection:**
- Detect significant performance degradation
- Ignore minor variations

#### 2. Performance Reporting Tests
**Location:** `src/test/performanceReporting.test.ts`

Tests for report generation and export functionality.

**Test Coverage:**
- Report generation and structure
- Category statistics calculation
- Slowest operations identification
- Regression inclusion
- Recommendation generation
- JSON/CSV/HTML/Markdown export
- Empty report handling
- Report consistency

## Running Tests

### Individual Test Suites

```bash
# UI performance tests
npm run test:ui-performance

# Performance reporting tests
npm run test:performance-reporting

# All tests including performance
npm run test
```

### Performance Test Output

Tests output performance metrics in real-time:

```
UI Performance Tests
  [ok] sidebar render (10 contracts): 425.32ms
  [ok] sidebar render (50 contracts): 892.15ms
  [ok] sidebar render (200 contracts): 1845.67ms
  [ok] sidebar updates: avg 245.12ms, p95 389.45ms
  [ok] form generation (3 params): 85.23ms
  [ok] form generation (20 params): 156.78ms
  [ok] form generation batch: avg 142.34ms, p95 234.56ms
  ...

38 tests: 38 passed, 0 failed
```

## Performance Benchmarks

### Default Benchmarks

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| sidebar-render-initial | 500ms | 750ms | 1500ms |
| sidebar-render-update | 200ms | 350ms | 750ms |
| form-generation | 100ms | 200ms | 500ms |
| simulation-panel-render | 300ms | 500ms | 1000ms |
| simulation-panel-update | 150ms | 300ms | 750ms |
| ui-interaction-response | 100ms | 200ms | 500ms |

### Custom Benchmarks

Register custom benchmarks:

```typescript
monitor.registerBenchmark({
    name: 'custom-operation',
    category: 'render',
    targetMs: 200,
    warningThresholdMs: 350,
    criticalThresholdMs: 750,
});

// Check against benchmark
const check = monitor.checkBenchmark('custom-operation', duration);
if (check.status === 'critical') {
    console.warn('Performance critical!');
}
```

## Regression Detection

### How It Works

1. **Baseline Snapshot:** First performance snapshot establishes baseline
2. **Current Snapshot:** New metrics are collected
3. **Comparison:** Current metrics compared against baseline
4. **Threshold:** 15% increase (configurable) triggers regression alert
5. **Severity:** Classified as warning or critical based on benchmark

### Configuration

```typescript
// Set regression threshold to 20%
monitor.setRegressionThreshold(0.20);

// Detect regressions
const regressions = monitor.detectRegressions();

// Regressions include:
// - metricName: Name of the metric
// - previousAverage: Baseline average
// - currentAverage: Current average
// - percentageChange: Percentage increase
// - severity: 'warning' or 'critical'
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Performance Tests

on: [push, pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run performance tests
        run: npm run test:ui-performance
      
      - name: Generate performance report
        run: npm run test:performance-reporting
      
      - name: Upload report
        uses: actions/upload-artifact@v2
        with:
          name: performance-report
          path: performance-report.html
```

### Performance Report Generation

```typescript
// Generate and save report
const monitor = new PerformanceMonitoringService();
// ... run operations ...
const snapshot = monitor.createSnapshot();
const regressions = monitor.detectRegressions();

const reportService = new PerformanceReportService();
const report = reportService.generateReport(snapshot, regressions);

// Save in multiple formats
fs.writeFileSync('report.json', reportService.exportAsJson(report));
fs.writeFileSync('report.csv', reportService.exportAsCsv(report));
fs.writeFileSync('report.html', reportService.exportAsHtml(report));
fs.writeFileSync('report.md', reportService.exportAsMarkdown(report));
```

## Performance Profiling

### Measuring Sidebar Rendering

```typescript
const monitor = new PerformanceMonitoringService();

// Measure with different contract counts
for (const count of [10, 50, 100, 200]) {
    await monitor.measureAsync(
        'sidebar-render-initial',
        'render',
        async () => renderSidebar(contracts.slice(0, count)),
        { contractCount: count }
    );
}

const stats = monitor.calculateStats('sidebar-render-initial');
console.log(`Sidebar rendering scales from ${stats.min}ms to ${stats.max}ms`);
```

### Measuring Form Generation

```typescript
// Measure with different parameter counts
for (const paramCount of [3, 10, 20, 50]) {
    const params = generateMockParams(paramCount);
    await monitor.measureAsync(
        'form-generation',
        'generation',
        async () => formGenerator.generateForm(contractId, fn, params),
        { paramCount }
    );
}

const stats = monitor.calculateStats('form-generation');
console.log(`Form generation: ${stats.average}ms average`);
```

### Measuring Simulation Panel Updates

```typescript
// Measure update performance with various result sizes
for (let i = 0; i < 10; i++) {
    await monitor.measureAsync(
        'simulation-panel-update',
        'update',
        async () => updateSimulationPanel(largeResult),
        { updateNumber: i }
    );
}

const stats = monitor.calculateStats('simulation-panel-update');
console.log(`Panel updates: avg ${stats.average}ms, p95 ${stats.p95}ms`);
```

## Performance Optimization Tips

### Based on Report Recommendations

1. **Rendering Performance (> 500ms)**
   - Use virtualization for large lists
   - Implement lazy loading
   - Optimize component re-renders
   - Consider memoization

2. **Form Generation (> 200ms)**
   - Cache generated forms
   - Lazy load complex fields
   - Batch field generation
   - Use web workers for heavy computation

3. **UI Updates (> 300ms)**
   - Batch DOM updates
   - Use requestAnimationFrame
   - Implement debouncing
   - Optimize event handlers

4. **High Variance (p99 > 2x average)**
   - Investigate outliers
   - Optimize worst-case scenarios
   - Add caching for expensive operations
   - Profile with DevTools

## Monitoring Performance Over Time

### Snapshot History

```typescript
// Create snapshots at regular intervals
const snapshots = [];
for (let i = 0; i < 10; i++) {
    // Run operations
    snapshots.push(monitor.createSnapshot());
}

// Analyze trends
const firstSnapshot = snapshots[0];
const lastSnapshot = snapshots[snapshots.length - 1];

const improvement = (
    (firstSnapshot.averages['form-generation'] - 
     lastSnapshot.averages['form-generation']) / 
    firstSnapshot.averages['form-generation']
) * 100;

console.log(`Performance improved by ${improvement.toFixed(2)}%`);
```

### Regression Alerts

```typescript
// Monitor for regressions across builds
const regressions = monitor.detectRegressions();

for (const regression of regressions) {
    if (regression.severity === 'critical') {
        // Alert team
        console.error(`CRITICAL: ${regression.metricName} degraded by ${(regression.percentageChange * 100).toFixed(2)}%`);
    }
}
```

## Report Examples

### JSON Report Structure

```json
{
  "timestamp": 1234567890,
  "title": "Performance Report",
  "summary": {
    "totalMetrics": 80,
    "totalDuration": 15234.56,
    "averageMetricDuration": 190.43,
    "slowestMetric": {
      "name": "sidebar-render-initial",
      "duration": 1845.67
    },
    "fastestMetric": {
      "name": "ui-interaction-response",
      "duration": 12.34
    }
  },
  "byCategory": {
    "render": {
      "count": 40,
      "average": 425.12,
      "min": 250.45,
      "max": 1845.67,
      "p95": 1234.56,
      "p99": 1789.23
    }
  },
  "slowestOperations": [...],
  "regressions": [...],
  "recommendations": [...]
}
```

### HTML Report

Generated HTML reports include:
- Summary statistics
- Category performance breakdown
- Slowest operations table
- Regression alerts
- Actionable recommendations
- Interactive styling

### Markdown Report

Markdown reports are suitable for:
- Documentation
- Pull request comments
- Performance tracking
- Team communication

## Best Practices

1. **Run Tests Regularly**
   - Include in CI/CD pipeline
   - Run before and after optimizations
   - Track trends over time

2. **Set Realistic Benchmarks**
   - Based on target hardware
   - Consider user expectations
   - Account for network conditions

3. **Monitor Regressions**
   - Set appropriate thresholds
   - Alert on critical issues
   - Investigate outliers

4. **Profile Before Optimizing**
   - Identify actual bottlenecks
   - Measure impact of changes
   - Avoid premature optimization

5. **Document Performance**
   - Keep historical reports
   - Track optimization efforts
   - Share findings with team

## Troubleshooting

### Tests Running Slowly

- Reduce number of iterations
- Use smaller datasets
- Run on faster hardware
- Profile with DevTools

### Inconsistent Results

- Ensure consistent test environment
- Close other applications
- Disable background processes
- Run multiple times and average

### Regressions Not Detected

- Check regression threshold
- Verify benchmark configuration
- Ensure sufficient baseline data
- Review metric collection

## Future Enhancements

- [ ] Real-time performance dashboard
- [ ] Automated performance optimization suggestions
- [ ] Integration with performance monitoring services
- [ ] Historical trend analysis
- [ ] Comparative analysis across versions
- [ ] Memory profiling
- [ ] Network performance tracking
- [ ] Custom metric definitions
