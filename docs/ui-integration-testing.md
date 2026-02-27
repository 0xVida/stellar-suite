# UI Integration Testing Documentation

This document describes the UI integration testing suite for the Stellar Kit VS Code extension.

## Overview

The UI integration tests verify the communication and logic between the VS Code extension host and its Webview components (Sidebar, Simulation Panel, and Contract Forms).

## Test Suite Components

### 1. UI Interaction Tests
- **Location**: `src/test/uiInteraction.integration.test.ts`
- **Coverage**:
  - **Sidebar**: Handlers for build, deploy, simulate, and refresh commands.
  - **Simulation Panel**: Handlers for exporting results (JSON, CSV, PDF) and charts.
  - **Contract Form**: Form submission, cancellation, and validation round-trips.
  - **State Updates**: Verification of messages sent from host to Webview.

### 2. UI Accessibility Tests
- **Location**: `src/test/uiAccessibility.test.ts`
- **Coverage**:
  - Verification of `role`, `aria-label`, and `title` attributes in generated HTML.
  - Security verification of HTML escaping helpers.

## Running Tests

### Independent UI Tests
To run only the UI integration tests:
```bash
npm run test:ui-integration
```

To run only the UI accessibility tests:
```bash
npm run test:ui-accessibility
```

### Full Test Suite
The UI tests are integrated into the main project test command:
```bash
npm run test
```

## CI/CD Integration

The UI integration tests are integrated into the project's standard CI workflow by being included in the `test` script in `package.json`. Any CI environment (GitHub Actions, GitLab CI, etc.) that runs `npm test` will automatically execute these UI tests.

The tests use a custom mock runner that does not require a graphical environment (no HEADLESS browser needed), making them fast and reliable for CI/CD runners.

## Test Reporting

The tests provide a clear console-based summary:
- Individual test status (`[ok]` or `[fail]`).
- Summary line (e.g., `4 tests: 4 passed, 0 failed`).
- Failure details with stack traces for debugging.

The scripts return a non-zero exit code on failure, ensuring that the CI pipeline correctly identifies and reports test failures.

## Test Fixtures and Mocks

The suite uses the following mocks to simulate the VS Code environment:
- `MockWebview`: Simulates `postMessage` and `onDidReceiveMessage`.
- `MockWebviewView`: Simulates the sidebar container.
- `MockExtensionContext`: Provides a dummy workspace/global state.
- `mockVscode`: A subset of the `vscode` API (window, workspace, commands, Uri).
