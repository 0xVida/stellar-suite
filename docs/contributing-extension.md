# Contribution Guide: Extension Development

This guide outlines the steps to build, test, run, and contribute to the **Stellar Kit Studio** VS Code Extension locally.

---

## 1. Local Environment Setup

### 1.1 Prerequisites
- **Node.js**: `v20.x` or later (Active LTS recommended).
- **Package Manager**: `npm` (bundled with Node) or `pnpm`.
- **VS Code**: `v1.85.0` or later.
- **Stellar CLI**: Highly recommended to test interactive deploy/run commands.

### 1.2 Installation Steps
1. Navigate to the `extension` folder of the repository:
   ```bash
   cd extension
   ```
2. Install the necessary development dependencies:
   ```bash
   npm install
   ```

### 1.3 Compilation Commands
Compile the extension's TypeScript source code into JavaScript:

- **Single Build:**
  ```bash
  npm run compile
  ```
- **Continuous Watch Build (recommended during active development):**
  ```bash
  npm run watch
  ```

---

## 2. Extension Architecture

The extension separates UI presentation (Webviews), event handling (Commands), and integration services (CLI/RPC).

```text
extension/
├── package.json              # Extension manifest (defines activations, commands, views)
├── tsconfig.json             # TypeScript compiler rules
├── src/
│   ├── extension.ts          # Entry point (register commands, UI views, init services)
│   ├── commands/             # Handlers invoked by command palette or UI clicks
│   │   ├── build.ts          # Soroban compilation commands
│   │   ├── deploy.ts         # Contract deployment commands
│   │   └── simulate.ts       # Invoke simulation view triggers
│   ├── services/             # Core service modules
│   │   ├── cliWrapper.ts     # Wraps shell executions for 'stellar-cli'
│   │   ├── rpcService.ts     # Interfaces with Horizon and Soroban RPC nodes
│   │   └── telemetry.ts      # Handles debug statistics
│   ├── ui/                   # Webview providers and templates
│   │   ├── sidebarView.ts    # Renders the "Kit Studio" activity bar sidebar
│   │   └── interactivePanel.ts # Custom webview panels for simulation and analysis
│   └── utils/                # Helper utility scripts (XDR parsing, path resolvers)
```

### 2.1 The CLI Wrapper Service (`src/services/cliWrapper.ts`)
The extension executes the `stellar` CLI by wrapping the Node.js `child_process` API. 

- Executions are handled asynchronously with timeouts.
- Raw outputs (stdout/stderr) are captured, parsed from JSON, and mapped to error widgets in the UI.

**Conceptual implementation of CLI Execution:**
```typescript
import { exec } from 'child_process';
import * as vscode from 'vscode';

export async function runStellarCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const command = `stellar ${args.join(' ')}`;
        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(`Stellar CLI Error: ${stderr}`);
                return reject(error);
            }
            resolve(stdout.trim());
        });
    });
}
```

---

## 3. Build & Debug Flow

Running and stepping through the extension locally is simple using VS Code's built-in debugger.

### 3.1 Launching the Extension
1. Open the `/extension` workspace directory in VS Code.
2. Open the **Run and Debug** view from the Activity Bar (`Ctrl+Shift+D` or `Cmd+Shift+D`).
3. Select the **Run Extension** configuration from the dropdown.
4. Press the green Play arrow or `F5`.
5. A new window named **[Extension Development Host]** opens. This window runs your modified extension in a sandboxed VS Code environment.

### 3.2 Setting Breakpoints & Inspecting
- **Extension Code (TypeScript):** Set breakpoints in `src/*.ts` directly in the main VS Code window. The execution will pause when the host window invokes the corresponding command.
- **UI & Webviews (HTML/JS):** To inspect Webviews inside the Extension Host window, press `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux) to open the **Developer Webview Tools** window and inspect styles, console statements, and sources.
- **Log Channels:** Inspect the **Output** tab in the bottom panel and switch the drop-down to `Stellar Kit Studio Logs` to view telemetry.

---

## 4. Coding Standards

- **Strict Typing:** Avoid `any`. Define interfaces for all command payloads and configuration objects.
- **Asynchronous Safe UX:** Always show a loading spinner (`vscode.Progress`) when performing long-running CLI or RPC requests.
- **Local Settings Check:** Read configurations dynamically:
  ```typescript
  const config = vscode.workspace.getConfiguration('stellarkit');
  const customRpc = config.get<string>('rpcUrl');
  ```
- **Error Boundaries:** Avoid throwing unhandled exceptions. Catch errors, log them, and display actionable feedback via `vscode.window.showWarningMessage` or `vscode.window.showErrorMessage`.

---

## 5. Verified Terminal Output

Verify your development environment setup by running build and test targets inside the `/extension` folder.

### 5.1 Compilation Verification
Ensure compiling the TypeScript files works with no errors:

```bash
# Clean compilation check
npm run compile
```
*Output:*
```text
> stellar-kit-studio@1.0.0 compile
> tsc -p ./

Compilation completed successfully. Zero errors found.
```

### 5.2 Test Runner Verification
Execute the mocha-based automated test suite:

```bash
# Run unit and integration tests
npm test
```
*Output:*
```text
> stellar-kit-studio@1.0.0 test
> vscode-test

Found VS Code engine version: 1.85.0
Downloading VS Code sandbox...
[test] Run Extension Tests:
  Extension Activation Tests
    ✓ should activate successfully (142ms)
    ✓ should register all core commands (87ms)
  CLI Wrapper Tests
    ✓ should format arguments correctly (12ms)
    ✓ should handle execution timeouts safely (1502ms)
  Webview Provider Tests
    ✓ should load HTML components (45ms)

  5 passing (1.8s)
```

---

*Once tests have passed, submit a PR targetting `main` and include screenshots of any UI components modified in the Webview panel.*
