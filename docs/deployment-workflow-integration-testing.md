# Deployment Workflow Integration Testing

## Overview

The deployment workflow integration suite validates the end-to-end contract deployment path in a single runner:

- Contract detection in workspace fixtures
- Contract build + deploy flow
- Deployment result verification (contract ID + transaction hash)
- Error scenarios (build failure and malformed deploy output)
- Retry logic integration
- Multi-network deployment using CLI configuration profiles
- Fixture cleanup after deployment
- Optional real CLI smoke test

## Run Locally

```bash
npm run test:deployment-workflow-integration
```

The test runner prints per-test status and a final summary (`N tests: X passed, Y failed`).

## Mock vs Real CLI

Default mode uses `MockCliOutputStreamingService`, so tests do not require network or a local Stellar CLI installation.

To enable the optional real CLI smoke test:

```bash
STELLAR_SUITE_RUN_REAL_CLI_INTEGRATION=1 npm run test:deployment-workflow-integration
```

Optional CLI override:

```bash
STELLAR_CLI_PATH=/path/to/stellar STELLAR_SUITE_RUN_REAL_CLI_INTEGRATION=1 npm run test:deployment-workflow-integration
```

## CI/CD Integration

`npm test` now includes `test:deployment-workflow-integration`, so the suite runs in existing CI pipelines that execute the project test script.
