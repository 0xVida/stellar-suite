# Stellar Suite - Getting Started Guide

## Introduction
Welcome to the Stellar Suite! This comprehensive getting started guide will help you install, configure, and begin using the Stellar Suite extension. This extension improves the developer experience when building smart contracts on Stellar, allowing you to build, deploy, and manage contracts directly from your editor.

## Installation

### Installation from Marketplace
1. Open Visual Studio Code.
2. Go to the Extensions view by clicking on the square icon in the Activity Bar or pressing `Ctrl+Shift+X` (`Cmd+Shift+X` on macOS).
3. Search for "Stellar Suite" in the Extensions view search bar.
4. Click on the **Install** button next to the Stellar Suite extension.
5. Once installed, the Stellar Suite icon will appear in the Activity Bar.

### Installation from Source
1. Clone the repository: `git clone https://github.com/0xVida/stellar-suite.git`
2. Navigate to the project directory: `cd stellar-suite`
3. Install dependencies: `npm install`
4. Compile the extension: `npm run compile`
5. Open the project in VS Code: `code .`
6. Press `F5` to start debugging and open a new Extension Development Host window.

## Basic Configuration
After installation, you can configure the Stellar Suite to match your development environment.

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`).
2. Search for "Stellar Suite".
3. Configure the following important settings:
   - **RPC Endpoint**: Set your preferred Stellar RPC endpoint (e.g., `https://soroban-testnet.stellar.org:443`).
   - **CLI Path**: Specify the path to the `stellar` CLI. By default, it uses `stellar`.
   - **Network**: Choose your target network (e.g., `testnet` or `mainnet`).
   - **Signing Method**: Select your preferred signing method for deployments.

## Simple Tutorial Walkthrough

Let's walk through deploying your first Stellar smart contract!

### 1. Build a Contract
From the Stellar Suite view in the Activity Bar:
- Click the **Refresh** icon to load your workspace contracts.
- Once a contract is listed, click the **Build Contract** button (or use `Ctrl+Alt+B`). The extension will run `stellar contract build`.

### 2. Simulate a Transaction
Before deploying, it's good practice to simulate the contract to understand its behavior and resource usage.
- Right-click on a contract in the Stellar Suite view.
- Select **Simulate Transaction** (or use `Ctrl+Alt+S`).
- Check the output logs for the simulation results and resource profile.

### 3. Deploy the Contract
- Right-click the built contract and select **Deploy Contract** (or use `Ctrl+Alt+D`).
- The extension will handle the deployment securely using your configured signing method.
- You will receive a success notification with the contract ID once the deployment is confirmed.

![Stellar Suite Sidebar](https://raw.githubusercontent.com/0xVida/stellar-suite/main/resources/stellar-icon.png)

## Common Use Cases
- **Batch Deployments**: Deploy multiple contracts seamlessly using the **Deploy Batch** feature.
- **Resource Profiling**: Track how much CPU and memory your smart contracts use during simulations to optimize your code.
- **Simulation Diffing**: Compare the state differences before and after simulating a transaction to debug storage issues.

## Troubleshooting Tips
- **CLI Version Mismatch**: Ensure your `stellar` CLI version matches the minimum required version (`21.0.0`). You can use the `Stellar Suite: Check CLI Version` command to verify.
- **RPC Rate Limits**: If you see rate limit errors during interactions, check the output channel. The extension handles retries automatically, but you may need to wait if limit ceilings are strictly enforced.
- **Missing CLI Path**: If the extension cannot find the Stellar CLI, provide the absolute path in the `Stellar Suite: CLI Path` extension setting.

## Additional Resources
- [Stellar Developer Documentation](https://developers.stellar.org/)
- [Stellar Smart Contracts (Soroban)](https://soroban.stellar.org/)
- [Stellar Suite GitHub Repository](https://github.com/0xVida/stellar-suite)
