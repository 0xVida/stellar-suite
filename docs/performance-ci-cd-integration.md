# Performance Testing CI/CD Integration

## Overview

This guide explains how to integrate the performance testing suite into your CI/CD pipeline for automated performance monitoring and regression detection.

## GitHub Actions Integration

### Basic Setup

Create `.github/workflows/performance.yml`:

```yaml
name: Performance Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  performance:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Compile TypeScript
        run: npm run compile
      
      - name: Run UI performance tests
        run: npm run test:ui-performance
      
      - name: Run performance reporting tests
        run: npm run test:performance-reporting
      
      - name: Generate performance report
        run: node scripts/generate-performance-report.js
      
      - name: Upload performance report
        uses: actions/upload-artifact@v3
        with:
          name: performance-report
          path: |
            performance-report.html
            performance-report.json
            performance-report.csv
      
      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('performance-report.json', 'utf8'));
            
            let comment = '## Performance Test Results\n\n';
            comment += `- **Total Metrics:** ${report.summary.totalMetrics}\n`;
            comment += `- **Average Duration:** ${report.summary.averageMetricDuration.toFixed(2)}ms\n`;
            comment += `- **Slowest Operation:** ${report.summary.slowestMetric.name} (${report.summary.slowestMetric.duration.toFixed(2)}ms)\n`;
            
            if (report.regressions.length > 0) {
              comment += '\n### ⚠️ Performance Regressions Detected\n\n';
              for (const reg of report.regressions) {
                comment += `- **${reg.metricName}**: ${(reg.percentageChange * 100).toFixed(2)}% slower (${reg.severity})\n`;
              }
            } else {
              comment += '\n✅ No performance regressions detected\n';
            }
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### Advanced Setup with Baseline Comparison

```yaml
name: Performance Tests with Baseline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Compile TypeScript
        run: npm run compile
      
      - name: Download baseline report
        continue-on-error: true
        run: |
          mkdir -p performance-baseline
          aws s3 cp s3://my-bucket/performance-baseline.json performance-baseline/baseline.json || true
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      
      - name: Run performance tests
        run: npm run test:ui-performance
      
      - name: Generate current report
        run: node scripts/generate-performance-report.js
      
      - name: Compare with baseline
        run: node scripts/compare-performance.js
      
      - name: Upload new baseline
        if: github.ref == 'refs/heads/main'
        run: |
          aws s3 cp performance-report.json s3://my-bucket/performance-baseline.json
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      
      - name: Fail if critical regression
        run: |
          if grep -q '"severity":"critical"' performance-report.json; then
            echo "Critical performance regression detected!"
            exit 1
          fi
```

## Performance Report Generation Script

Create `scripts/generate-performance-report.js`:

```javascript
const fs = require('fs');
const path = require('path');

// Import the services (after compilation)
const { PerformanceMonitoringService } = require('../out/services/performanceMonitoringService');
const { PerformanceReportService } = require('../out/services/performanceReportService');

async function generateReport() {
    const monitor = new PerformanceMonitoringService();
    
    // Run performance tests and collect metrics
    // (This would typically be done by the test suite)
    
    // Create snapshot
    const snapshot = monitor.createSnapshot();
    
    // Detect regressions
    const regressions = monitor.detectRegressions();
    
    // Generate report
    const reportService = new PerformanceReportService();
    const report = reportService.generateReport(
        snapshot,
        regressions,
        `Performance Report - ${new Date().toISOString()}`
    );
    
    // Export in multiple formats
    const reportDir = 'performance-reports';
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(
        path.join(reportDir, 'performance-report.json'),
        reportService.exportAsJson(report)
    );
    
    fs.writeFileSync(
        path.join(reportDir, 'performance-report.csv'),
        reportService.exportAsCsv(report)
    );
    
    fs.writeFileSync(
        path.join(reportDir, 'performance-report.html'),
        reportService.exportAsHtml(report)
    );
    
    fs.writeFileSync(
        path.join(reportDir, 'performance-report.md'),
        reportService.exportAsMarkdown(report)
    );
    
    console.log('Performance reports generated successfully');
    console.log(`Total metrics: ${report.summary.totalMetrics}`);
    console.log(`Average duration: ${report.summary.averageMetricDuration.toFixed(2)}ms`);
    
    if (regressions.length > 0) {
        console.warn(`\n⚠️ ${regressions.length} performance regression(s) detected:`);
        for (const reg of regressions) {
            console.warn(`  - ${reg.metricName}: ${(reg.percentageChange * 100).toFixed(2)}% slower`);
        }
    }
}

generateReport().catch(error => {
    console.error('Failed to generate performance report:', error);
    process.exit(1);
});
```

## Performance Comparison Script

Create `scripts/compare-performance.js`:

```javascript
const fs = require('fs');
const path = require('path');

function compareReports(baselineReport, currentReport) {
    const comparison = {
        timestamp: new Date().toISOString(),
        baseline: baselineReport.timestamp,
        current: currentReport.timestamp,
        improvements: [],
        regressions: [],
        unchanged: [],
    };
    
    // Compare metrics
    for (const [metric, currentAvg] of Object.entries(currentReport.summary)) {
        const baselineAvg = baselineReport.summary[metric];
        if (!baselineAvg) continue;
        
        const change = (currentAvg - baselineAvg) / baselineAvg;
        const percentChange = (change * 100).toFixed(2);
        
        if (change < -0.05) {
            comparison.improvements.push({
                metric,
                baseline: baselineAvg,
                current: currentAvg,
                percentChange,
            });
        } else if (change > 0.15) {
            comparison.regressions.push({
                metric,
                baseline: baselineAvg,
                current: currentAvg,
                percentChange,
            });
        } else {
            comparison.unchanged.push({
                metric,
                baseline: baselineAvg,
                current: currentAvg,
                percentChange,
            });
        }
    }
    
    return comparison;
}

async function main() {
    const baselinePath = 'performance-baseline/baseline.json';
    const currentPath = 'performance-reports/performance-report.json';
    
    if (!fs.existsSync(baselinePath)) {
        console.log('No baseline report found. Skipping comparison.');
        return;
    }
    
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
    
    const comparison = compareReports(baseline, current);
    
    // Save comparison
    fs.writeFileSync(
        'performance-comparison.json',
        JSON.stringify(comparison, null, 2)
    );
    
    // Print summary
    console.log('\n=== Performance Comparison ===\n');
    
    if (comparison.improvements.length > 0) {
        console.log('✅ Improvements:');
        for (const imp of comparison.improvements) {
            console.log(`  ${imp.metric}: ${imp.percentChange}% faster`);
        }
    }
    
    if (comparison.regressions.length > 0) {
        console.log('\n⚠️ Regressions:');
        for (const reg of comparison.regressions) {
            console.log(`  ${reg.metric}: ${reg.percentChange}% slower`);
        }
    }
    
    if (comparison.unchanged.length > 0) {
        console.log('\n➡️ Unchanged:');
        for (const unch of comparison.unchanged) {
            console.log(`  ${unch.metric}: ${unch.percentChange}% change`);
        }
    }
}

main().catch(error => {
    console.error('Comparison failed:', error);
    process.exit(1);
});
```

## GitLab CI Integration

Create `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - report

performance_tests:
  stage: test
  image: node:18
  script:
    - npm ci
    - npm run compile
    - npm run test:ui-performance
    - npm run test:performance-reporting
    - node scripts/generate-performance-report.js
  artifacts:
    paths:
      - performance-reports/
    reports:
      performance: performance-reports/performance-report.json
  only:
    - merge_requests
    - main

performance_comparison:
  stage: report
  image: node:18
  script:
    - npm ci
    - npm run compile
    - node scripts/compare-performance.js
  artifacts:
    paths:
      - performance-comparison.json
  only:
    - merge_requests
```

## Jenkins Integration

Create `Jenkinsfile`:

```groovy
pipeline {
    agent any
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm ci'
                sh 'npm run compile'
            }
        }
        
        stage('Performance Tests') {
            steps {
                sh 'npm run test:ui-performance'
                sh 'npm run test:performance-reporting'
            }
        }
        
        stage('Generate Report') {
            steps {
                sh 'node scripts/generate-performance-report.js'
            }
        }
        
        stage('Compare with Baseline') {
            when {
                branch 'main'
            }
            steps {
                sh 'node scripts/compare-performance.js'
            }
        }
    }
    
    post {
        always {
            archiveArtifacts artifacts: 'performance-reports/**', allowEmptyArchive: true
            publishHTML([
                reportDir: 'performance-reports',
                reportFiles: 'performance-report.html',
                reportName: 'Performance Report'
            ])
        }
        
        failure {
            emailext(
                subject: 'Performance Tests Failed',
                body: 'Check the performance report for details.',
                to: '${DEFAULT_RECIPIENTS}'
            )
        }
    }
}
```

## Performance Thresholds

Configure performance thresholds in `performance-config.json`:

```json
{
  "benchmarks": {
    "sidebar-render-initial": {
      "target": 500,
      "warning": 750,
      "critical": 1500
    },
    "form-generation": {
      "target": 100,
      "warning": 200,
      "critical": 500
    },
    "simulation-panel-render": {
      "target": 300,
      "warning": 500,
      "critical": 1000
    }
  },
  "regression": {
    "threshold": 0.15,
    "failOnCritical": true,
    "failOnWarning": false
  },
  "reporting": {
    "formats": ["json", "csv", "html", "markdown"],
    "uploadToS3": true,
    "s3Bucket": "my-bucket",
    "s3Prefix": "performance-reports"
  }
}
```

## Monitoring and Alerting

### Slack Integration

```javascript
const axios = require('axios');

async function notifySlack(report, webhookUrl) {
    const regressions = report.regressions || [];
    const criticalCount = regressions.filter(r => r.severity === 'critical').length;
    
    const color = criticalCount > 0 ? 'danger' : 'good';
    const title = criticalCount > 0 
        ? `⚠️ Performance Regressions Detected (${criticalCount} critical)`
        : '✅ Performance Tests Passed';
    
    const message = {
        attachments: [{
            color,
            title,
            fields: [
                {
                    title: 'Total Metrics',
                    value: report.summary.totalMetrics,
                    short: true
                },
                {
                    title: 'Average Duration',
                    value: `${report.summary.averageMetricDuration.toFixed(2)}ms`,
                    short: true
                },
                {
                    title: 'Slowest Operation',
                    value: `${report.summary.slowestMetric.name} (${report.summary.slowestMetric.duration.toFixed(2)}ms)`,
                    short: false
                }
            ]
        }]
    };
    
    if (regressions.length > 0) {
        message.attachments[0].fields.push({
            title: 'Regressions',
            value: regressions.map(r => 
                `• ${r.metricName}: ${(r.percentageChange * 100).toFixed(2)}% slower`
            ).join('\n'),
            short: false
        });
    }
    
    await axios.post(webhookUrl, message);
}
```

## Best Practices

1. **Run Tests Consistently**
   - Same hardware/environment
   - Same time of day
   - Minimal background processes

2. **Set Realistic Thresholds**
   - Based on target hardware
   - Account for variance
   - Review regularly

3. **Monitor Trends**
   - Keep historical data
   - Track improvements
   - Identify patterns

4. **Automate Alerts**
   - Notify on regressions
   - Fail builds on critical issues
   - Track in issue tracker

5. **Document Results**
   - Archive reports
   - Link to commits
   - Share with team

## Troubleshooting

### Tests Timing Out
- Increase timeout in CI configuration
- Reduce test dataset size
- Check for resource constraints

### Inconsistent Results
- Ensure consistent environment
- Disable CPU frequency scaling
- Close background processes

### False Positives
- Adjust regression threshold
- Review benchmark values
- Increase baseline sample size
