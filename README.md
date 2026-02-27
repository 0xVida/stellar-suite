# Stellar Kit (prev. Stellar Suite)

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/0xVida.stellar-kit?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=0xVida.stellar-kit)
[![License](https://img.shields.io/github/license/0xVida/stellar-suite?style=flat-square)](LICENSE.md)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-black?style=flat-square&logo=stellar)](https://stellar.org)

- **Extension:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=0xVida.stellar-kit) · **Manage:** [Publisher Hub](https://marketplace.visualstudio.com/manage/publishers/0xVida/extensions/stellar-kit/hub)

**Stellar Kit** is a developer toolkit for building, deploying, and managing smart contracts on the Stellar network—directly from your editor. Build, deploy, and simulate Soroban contracts from VS Code without jumping between the terminal and the editor: the Stellar CLI is wired into a sidebar and commands so you can stay in the flow.

---

## What it does

- **Build and deploy** contracts with a few clicks. The extension runs the CLI, captures contract IDs, and stores deployment metadata.
- **Sidebar** for your workspace: see contracts, build status, deployment history, and run Build / Deploy / Simulate from there.
- **Simulate transactions** against the network and get formatted results, resource usage, and storage diffs in the editor.
- **Signing** is built in: interactive prompt, keypair file, VS Code secure storage, or paste a signature from a hardware wallet.
- **Errors and progress** from the CLI are streamed and parsed so you get clear feedback when something fails.

![Stellar Kit MVP Screenshot](https://github.com/user-attachments/assets/da4063c8-ff36-4e5b-87c2-f17194099098)

*Screenshot of the current Stellar Kit MVP. The project and repo were originally released as Stellar Suite; the product is now named Stellar Kit.*

---

## Install and run

Install **Stellar Kit** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=0xVida.stellar-kit) (Extensions view, `Ctrl+Shift+X` / `Cmd+Shift+X`).

1. Open a workspace that has a Soroban contract (e.g. a `Cargo.toml` with `soroban-sdk`).
2. Open the **Stellar Kit** sidebar from the Activity Bar.
3. Use **Build** on a contract, then **Deploy** or **Simulate** as needed.

**Build from source:** clone the repo, run `npm install` and `npm run compile`, then press `F5` in VS Code to launch the Extension Development Host.

---

## Main workflows

**Deploy:** Command Palette → **Stellar Kit: Deploy Contract**. Pick WASM, network, source account, and signing method. The extension runs the CLI, handles signing, and shows the result and contract ID.

**Build:** Command Palette → **Stellar Kit: Build Contract**, or use the sidebar. Chooses the contract folder if you have more than one.

**Simulate:** Command Palette → **Stellar Kit: Simulate Soroban Transaction**. Enter contract ID, function, and arguments; results show in a panel with return values and resource usage.

**Configure CLI:** **Stellar Kit: Configure CLI** lets you manage profiles, validate network/source/RPC settings, and export/import config as JSON.

---

### Using the Sidebar

The Stellar Kit sidebar provides a visual interface for
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

Open an issue on GitHub for bugs or feature ideas.
