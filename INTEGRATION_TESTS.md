# Integration Tests for Simulation Workflow

This document explains how to run, write, and maintain integration tests for the complete simulation workflow in Stellar Suite.

## Overview

The simulation workflow integration tests verify the end-to-end functionality of contract simulation, including:

- Parameter input and validation
- Simulation execution (CLI and RPC)
- Result processing and caching
- History recording and retrieval
- State diff calculation
- Cleanup and resource management

## Running Tests

### Run All Integration Tests

```bash
npm run test:simulation-workflow-integration
```

### Run All Tests (Including Integration Tests)

```bash
npm test
```

### Run with Real CLI/RPC (Optional)

By default, tests use mocked services. To test against real Stellar CLI or RPC endpoints:

```bash
STELLAR_SUITE_RUN_REAL_SIMULATION=1 npm run test:simulation-workflow-integration
```

**Prerequisites for real CLI/RPC tests:**
- Stellar CLI installed and accessible in PATH
- Test contract deployed on testnet
- Valid network configuration

## Test Structure

### Test Files

- `src/test/simulationWorkflow.integration.test.ts` - Main integration test suite
- `src/test/fixtures/simulationFixtures.ts` - Test data and fixtures
- `src/test/mocks/mockCliOutputStreamingService.ts` - Mock CLI service

### Test Coverage

The integration test suite covers:

1. **Complete Simulation Flow**
   - Success path: parameter input → execution → result processing → display
   - Failure path: error handling and reporting

2. **Result Caching**
   - Cache miss and cache hit scenarios
   - TTL expiration
   - Cache invalidation
   - Cache key generation with complex parameters

3. **Simulation History**
   - Recording simulations
   - Querying and filtering history
   - Export and import
   - Statistics calculation

4. **State Diff**
   - Capturing before/after state snapshots
   - Calculating diffs (created, modified, deleted entries)
   - Exporting state diffs

5. **Error Scenarios**
   - Invalid contract ID
   - Invalid function name
   - Invalid arguments
   - Network timeouts
   - Execution failures

6. **Cleanup**
   - History deletion
   - Cache clearing
   - Resource cleanup after simulation

## Test Environment Configuration

### Environment Variables

- `STELLAR_SUITE_RUN_REAL_SIMULATION` - Set to `1` to run tests against real CLI/RPC
- `STELLAR_CLI_PATH` - Path to Stellar CLI executable (default: `stellar`)
- `STELLAR_RPC_URL` - RPC endpoint URL (default: testnet)

### Mock vs Real Services

Tests use mocked services by default to ensure:
- Fast execution
- No external dependencies
- Deterministic results
- CI/CD compatibility

Real CLI/RPC tests are gated behind environment variables and should be run manually or in dedicated CI jobs.

## Writing New Integration Tests

### Test Template

```typescript
async function testYourFeature() {
    const env = createTestEnvironment();

    // 1. Setup test data
    const contractId = SimulationFixtures.TEST_CONTRACT_ID;
    const functionName = 'your_function';
    const args = [{ param: 'value' }];

    // 2. Execute the workflow
    const result = await simulateTransaction(contractId, functionName, args);

    // 3. Verify results
    assert.strictEqual(result.success, true);
    assert.ok(result.result);

    // 4. Verify side effects (history, cache, etc.)
    const historyEntry = env.historyService.getEntry(result.historyId);
    assert.ok(historyEntry);

    console.log('  [ok] your feature description');
}
```

### Using Fixtures

Create reusable test data in `simulationFixtures.ts`:

```typescript
export const SimulationFixtures = {
    YOUR_TEST_DATA: {
        contractId: 'CTEST...',
        functionName: 'test',
        args: [{ param: 'value' }],
    },
};
```

Use factory functions for variations:

```typescript
const result = SimulationFixtureFactory.createSuccessResult({
    result: { custom: 'data' },
    resourceUsage: { cpuInstructions: 1000000 },
});
```

### Test Isolation

Each test should:
- Create its own test environment
- Not depend on other tests
- Clean up resources after execution
- Use unique identifiers to avoid conflicts

### Assertions

Use descriptive assertions:

```typescript
// Good
assert.strictEqual(result.outcome, 'success', 'simulation should succeed');
assert.ok(result.resourceUsage, 'resource usage should be captured');

// Avoid
assert.ok(result);
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:simulation-workflow-integration
      
  test-real-cli:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install Stellar CLI
        run: |
          curl -L https://github.com/stellar/stellar-cli/releases/download/v21.0.0/stellar-cli-x86_64-unknown-linux-gnu.tar.gz | tar xz
          sudo mv stellar /usr/local/bin/
      - run: npm install
      - run: STELLAR_SUITE_RUN_REAL_SIMULATION=1 npm run test:simulation-workflow-integration
```

### Test Reporting

Tests output results in a simple format:

```
simulation workflow integration tests
  [ok] complete simulation flow (success path)
  [ok] complete simulation flow (failure path)
  [ok] simulation result caching
  ...

17 tests: 17 passed, 0 failed
```

For CI/CD, check the exit code:
- `0` = all tests passed
- `1` = one or more tests failed

## Debugging Tests

### Enable Verbose Logging

Modify the test to log more details:

```typescript
const env = createTestEnvironment();
console.log('Context store:', env.context._store);
console.log('Output channel:', env.outputChannel.lines);
```

### Run Single Test

Comment out other tests in the runner:

```typescript
async function run() {
    const tests = [
        // testCompleteSimulationFlowSuccess,
        testYourSpecificTest,
        // ...
    ];
    // ...
}
```

### Inspect Test Fixtures

Log fixture data to verify correctness:

```typescript
console.log('Fixture:', JSON.stringify(SimulationFixtures.YOUR_DATA, null, 2));
```

## Common Issues

### Test Timeout

If tests hang, check for:
- Missing `await` on async operations
- Infinite loops in test logic
- External service calls without timeouts

### Flaky Tests

If tests fail intermittently:
- Ensure proper test isolation
- Check for race conditions
- Verify mock data is deterministic
- Add explicit waits for async operations

### Mock Service Issues

If mocked services don't behave as expected:
- Verify mock responses are set correctly
- Check that mock methods are called with expected parameters
- Ensure mock state is reset between tests

## Best Practices

1. **Test Real Scenarios** - Write tests that reflect actual user workflows
2. **Use Descriptive Names** - Test names should explain what is being tested
3. **Keep Tests Fast** - Use mocks by default, real services only when necessary
4. **Maintain Fixtures** - Keep test data organized and reusable
5. **Document Edge Cases** - Add comments explaining non-obvious test logic
6. **Verify Side Effects** - Don't just test return values, verify state changes
7. **Test Error Paths** - Ensure error handling works correctly
8. **Clean Up Resources** - Always clean up after tests to prevent leaks

## Adding New Test Scenarios

To add a new test scenario:

1. **Identify the workflow** - What user action are you testing?
2. **Create fixtures** - Add test data to `simulationFixtures.ts`
3. **Write the test** - Follow the test template above
4. **Add assertions** - Verify all expected outcomes
5. **Update documentation** - Add notes about the new test
6. **Run the test** - Ensure it passes in isolation and with the full suite

## Performance Considerations

Integration tests should complete quickly:
- Target: < 5 seconds for the full suite with mocks
- Target: < 30 seconds for real CLI/RPC tests

If tests are slow:
- Profile test execution to find bottlenecks
- Reduce unnecessary setup/teardown
- Parallelize independent tests (future enhancement)
- Use smaller test datasets

## Maintenance

### Regular Tasks

- Review and update fixtures when data structures change
- Add tests for new features
- Remove tests for deprecated features
- Update documentation when test patterns change
- Monitor test execution time and optimize as needed

### When to Update Tests

Update integration tests when:
- Simulation workflow changes
- New error scenarios are discovered
- Cache behavior is modified
- History storage format changes
- State diff calculation logic changes

## Support

For questions or issues with integration tests:
- Check this documentation first
- Review existing tests for examples
- Open an issue on GitHub with test output and error messages
- Include environment details (OS, Node version, CLI version)

## References

- [Stellar CLI Documentation](https://developers.stellar.org/docs/tools/cli)
- [Stellar RPC API](https://developers.stellar.org/docs/data/rpc)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
