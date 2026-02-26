# Stellar Suite

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/stellar-suite.stellar-suite?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=stellar-suite.stellar-suite)
[![License](https://img.shields.io/github/license/0xVida/stellar-suite?style=flat-square)](LICENSE.md)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-black?style=flat-square&logo=stellar)](https://stellar.org)

**Stellar Suite** is a developer toolkit for building, deploying, and managing smart contracts on the Stellar network—directly from your editor. Build, deploy, and simulate Soroban contracts from VS Code without jumping between the terminal and the editor: the Stellar CLI is wired into a sidebar and commands so you can stay in the flow.

---

## What it does

- **Build and deploy** contracts with a few clicks. The extension runs the CLI, captures contract IDs, and stores deployment metadata.
- **Sidebar** for your workspace: see contracts, build status, deployment history, and run Build / Deploy / Simulate from there.
- **Simulate transactions** against the network and get formatted results, resource usage, and storage diffs in the editor.
- **Signing** is built in: interactive prompt, keypair file, VS Code secure storage, or paste a signature from a hardware wallet.
- **Errors and progress** from the CLI are streamed and parsed so you get clear feedback when something fails.

![Stellar Suite MVP Screenshot](https://raw.githubusercontent.com/0xVida/stellar-suite/refs/heads/main/assets/screenshot.png)

*Screenshot of the current Stellar Suite MVP.*

---

## Install and run

Install **Stellar Suite** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=stellar-suite.stellar-suite) (Extensions view, `Ctrl+Shift+X` / `Cmd+Shift+X`).

1. Open a workspace that has a Soroban contract (e.g. a `Cargo.toml` with `soroban-sdk`).
2. Open the **Stellar Suite** sidebar from the Activity Bar.
3. Use **Build** on a contract, then **Deploy** or **Simulate** as needed.

**Build from source:** clone the repo, run `npm install` and `npm run compile`, then press `F5` in VS Code to launch the Extension Development Host.

---

## Main workflows

**Deploy:** Command Palette → **Stellar Suite: Deploy Contract**. Pick WASM, network, source account, and signing method. The extension runs the CLI, handles signing, and shows the result and contract ID.

**Build:** Command Palette → **Stellar Suite: Build Contract**, or use the sidebar. Chooses the contract folder if you have more than one.

**Simulate:** Command Palette → **Stellar Suite: Simulate Soroban Transaction**. Enter contract ID, function, and arguments; results show in a panel with return values and resource usage.

**Configure CLI:** **Stellar Suite: Configure CLI** lets you manage profiles, validate network/source/RPC settings, and export/import config as JSON.

---

## Configuration

Relevant VS Code settings:

- `stellarSuite.network` – default network (e.g. testnet)
- `stellarSuite.cliPath` – path to the Stellar CLI binary
- `stellarSuite.source` – source identity for invocations
- `stellarSuite.rpcUrl` – RPC endpoint for simulation (when not using local CLI)
- `stellarSuite.signing.defaultMethod` – default signing method (interactive, file, secure storage, etc.)
- `stellarSuite.signing.enableSecureKeyStorage` – allow storing keypairs in VS Code SecretStorage

---

## Custom contract templates


### Using the Sidebar

The Stellar Suite sidebar provides a visual interface for 
managing contracts:

- View all detected contracts in your workspace
- See build status at a glance
- See detected contract template/category (token, escrow, 
voting, custom, unknown)
- Access quick actions (Build, Deploy, Simulate)
- Run template-specific actions from the contract card/
context menu
- Manually assign template categories from the context menu
- View deployment history
- Inspect contract functions


You can define templates so the sidebar can categorize and offer actions for your contract types. In the workspace root, add `stellar-suite.templates.json` (or `.stellar-suite/templates.json`):

```json
{
  "version": "1",
  "templates": [
    {
      "id": "amm",
      "displayName": "AMM",
      "category": "amm",
      "keywords": ["swap", "liquidity_pool"],
      "dependencies": ["soroban-sdk"],
      "actions": [
        { "id": "amm.swap", "label": "Swap Assets" }
      ]
    }
  ]
}
```

Contracts that don’t match a template show as “Unknown” until they match or you assign a category from the sidebar context menu.

---

## Contributing

Fork the repo, clone it, run `npm install` and `npm run compile`. Use `npm test` to run the test suite and `F5` in VS Code to try your changes in the Extension Development Host. Keep changes focused, handle errors clearly, and update docs when you change behavior.

---

## Support

Open an issue on GitHub for bugs or feature ideas, or visit our
[community page](https://stellar-suite.com/community) for discussions,
community guidelines, and a support ticket form (used internally when the
website is deployed).

The front‑end site also includes:

- **Forum integration** via GitHub Discussions
- **Support ticket system** with issue creation
- **Community guidelines** (see docs/community-guidelines.md)
- **Contributor recognition** that pulls data from GitHub
- **Discussion/comment sections** with basic moderation tools
