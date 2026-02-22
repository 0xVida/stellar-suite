# Simulation Workflow Integration Test - Quick Reference

## Test File Location
`src/test/simulationWorkflow.integration.test.ts`

## Prerequisites

Before running the tests, ensure dependencies are installed:

```bash
npm install
```

## Running the Tests

### Run simulation workflow integration tests only:
```bash
npm run test:simulation-workflow-integration
```

### Run all tests (including this integration test):
```bash
npm test
```

### Run with real CLI/RPC (optional):
```bash
STELLAR_SUITE_RUN_REAL_SIMULATION=1 npm run test:simulation-workflow-integration
```

## Test Coverage Summary

The integration test suite includes 17 test scenarios:

1. ✅ Complete simulation flow (success path)
2. ✅ Complete simulation flow (failure path)
3. ✅ Simulation result caching
4. ✅ Simulation cache TTL expiration
5. ✅ Simulation cache invalidation
6. ✅ Simulation history recording
7. ✅ Simulation history query and filtering
8. ✅ State diff calculation (modified entries)
9. ✅ State diff calculation (created entries)
10. ✅ State diff calculation (deleted entries)
11. ✅ State diff export
12. ✅ Simulation history export and import
13. ✅ Simulation cleanup (history and cache)
14. ✅ Simulation with complex parameters
15. ✅ Simulation error scenarios
16. ✅ Simulation result verification
17. ⏭️ Optional real simulation smoke test (requires env var)

## What Gets Tested

### End-to-End Workflow
- Parameter input and validation
- Simulation execution (mocked)
- Result processing
- State capture (before/after)
- State diff calculation
- History recording
- Result caching
- Display/output formatting

### Caching Behavior
- Cache miss → execute → cache set
- Cache hit → return cached result
- TTL expiration
- Cache invalidation
- Cache key generation with complex parameters

### History Management
- Recording successful simulations
- Recording failed simulations
- Querying by contract ID
- Querying by function name
- Querying by outcome (success/failure)
- Pagination
- Export to JSON
- Import from JSON
- Statistics calculation

### State Diff
- Capturing before/after snapshots
- Detecting created entries
- Detecting modified entries
- Detecting deleted entries
- Detecting unchanged entries
- Exporting diffs with/without snapshots

### Error Handling
- Invalid contract ID
- Invalid function name
- Invalid arguments
- Network timeouts
- Execution failures
- Multiple error types (validation, network, execution)

### Cleanup
- Deleting individual history entries
- Clearing all history
- Clearing cache
- Resource cleanup verification

## Test Data

All test data is defined in `src/test/fixtures/simulationFixtures.ts`:

- Mock simulation responses (CLI and RPC)
- Error scenarios
- State snapshots
- Test contract IDs
- Parameter examples
- Expected results

## Extending the Tests

To add a new test:

1. Add test data to `simulationFixtures.ts` if needed
2. Write test function following the pattern:
   ```typescript
   async function testYourFeature() {
       const env = createTestEnvironment();
       // ... test logic ...
       console.log('  [ok] your feature description');
   }
   ```
3. Add test to the runner array in `run()` function
4. Run the test to verify it works

## Troubleshooting

### Tests don't run
- Ensure `npm install` has been run
- Check that TypeScript is installed: `npm list typescript`

### Tests fail unexpectedly
- Check that you're using the correct Node.js version (18+)
- Verify test isolation (each test should be independent)
- Check for missing await on async operations

### Need to debug a specific test
- Add console.log statements in the test
- Run only that test by commenting out others in the runner
- Check the test environment state: `console.log(env.context._store)`

## CI/CD Integration

The test is included in the main test suite and will run automatically in CI/CD pipelines.

For dedicated integration test jobs, use:
```yaml
- run: npm run test:simulation-workflow-integration
```

To run real CLI/RPC tests in CI (optional):
```yaml
- run: STELLAR_SUITE_RUN_REAL_SIMULATION=1 npm run test:simulation-workflow-integration
```
