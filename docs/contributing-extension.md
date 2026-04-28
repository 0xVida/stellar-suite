# Contribution Guide: Extension Development

This guide explains how to set up your local environment, build, and test the Stellar Kit Studio VS Code extension.

## Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v20 or later)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup#install-the-stellar-cli) (recommended for full functionality)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/0xVida/stellar-suite.git
   cd stellar-suite/extension
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

---

## Build and Debug

### Compiling
To compile the TypeScript source code:
```bash
npm run compile
```

To watch for changes and recompile automatically:
```bash
npm run watch
```

### Launching the Extension
1. Open the `extension` folder in VS Code.
2. Press `F5` or go to the **Run and Debug** view and select **Run Extension**.
3. A new **Extension Development Host** window will open with the Stellar Kit Studio extension loaded.

---

## Architecture Overview

The extension is organized into several key areas:

- **`src/extension.ts`**: The entry point where the extension is activated and commands are registered.
- **`src/commands/`**: Implementation of VS Code commands (e.g., Deploy, Build, Simulate).
- **`src/services/`**: Core logic for interacting with the Stellar network, RPC, and CLI.
- **`src/ui/`**: Webview implementations for the sidebar and interactive panels.
- **`src/utils/`**: Shared utility functions and XDR helpers.

### CLI Integration
The extension wraps the `stellar` CLI for many operations. It uses `child_process` to execute CLI commands and parses the output to provide feedback in the UI.

---

## Testing

### Automated Tests
Run the test suite using:
```bash
npm test
```

### Manual Testing
- Verify that the **Kit Studio** icon appears in the Activity Bar.
- Ensure that contracts in the workspace are correctly detected in the sidebar.
- Test the **Build**, **Deploy**, and **Simulate** workflows using a sample Soroban contract.

---

## Coding Standards

- **TypeScript**: Use strict typing where possible.
- **Error Handling**: Always provide user-friendly error messages via `vscode.window.showErrorMessage`.
- **UI Consistency**: Use the standard VS Code theme colors and icons (`vscode-icons`) for a native feel.
- **Documentation**: Update the `README.md` and this guide if you introduce major architectural changes.

---

## Pull Request Process

1. Create a feature branch from `main`.
2. Ensure all tests pass.
3. Lint your code: `npm run lint`.
4. Submit a PR with a clear description of the changes and screenshots of any UI updates.
