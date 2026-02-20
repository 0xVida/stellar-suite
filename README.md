# Stellar Suite

A Visual Studio Code extension that improves the developer experience when building smart contracts on Stellar.

Stellar Suite removes friction from contract development by bringing build, deployment, and contract interaction workflows directly into your editor. Instead of constantly switching between VS Code and the terminal, developers can deploy and manage contracts through an interactive IDE experience.

### Screenshot of current working MVP

![Stellar Suite MVP Screenshot](https://raw.githubusercontent.com/0xVida/stellar-suite/refs/heads/main/assets/screenshot.png)
*Screenshot showing the current Stellar Suite mvp*

## What is Stellar Suite?

Developing Stellar smart contracts currently relies heavily on manual CLI usage. Developers must repeatedly:

- Run build commands
- Deploy contracts through terminal commands
- Copy contract IDs manually
- Track deployment details themselves
- Manually prepare invocation parameters

This workflow works, but it slows development and increases the chance of human error.

Stellar Suite is designed to streamline this process by providing an interactive developer experience directly inside VS Code. The extension integrates with the official Stellar CLI while removing repetitive manual steps.

### Current Features (MVP)

The first release focuses on simplifying contract deployment, transaction simulation and invocation.

### Enhanced CLI Error Guidance

Stellar Suite parses Stellar CLI errors into structured, readable feedback:

- Detects error type (network, validation, execution)
- Extracts error codes and useful context
- Formats detailed error output for panels/output logs
- Provides actionable suggestions for faster recovery

### One-Click Contract Build & Deployment

Stellar Suite allows developers to build and deploy contracts using the official Stellar CLI without leaving VS Code.

**Features:**

- Run contract builds directly from the editor
- Deploy contracts using guided prompts
- Automatically capture deployed contract IDs
- Store deployment metadata for later use
- Display deployment results inside VS Code
- Remove the need to manually parse CLI output

### Automated Contract ID Management

After deployment, Stellar Suite automatically:

- Detects the contract ID from CLI output
- Stores it locally within the workspace
- Makes it available for future interactions

This removes the need to manually copy and store contract addresses.

### Interactive Deployment Workflow

Instead of remembering CLI flags, the extension provides guided prompts that allow developers to:

- Select network environments
- Select source accounts
- Choose compiled contract files
- Confirm deployment configuration

### Contract Sidebar

The extension includes a sidebar panel that displays:

- Detected contracts in the workspace
- Build status (Built/Not Built)
- Deployed contract IDs
- Deployment history
- Quick actions for build, deploy, and simulate

## Installation

### From VS Code Marketplace

*(Coming soon)*

### From Source

1. Clone the repository:

   ```bash
   git clone https://github.com/0xVida/stellar-suite.git
   cd stellar-suite
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Compile the extension:

   ```bash
   npm run compile
   ```

4. Run extension locally:

   - Open project in VS Code
   - Press `Fn + F5` (Mac) or `F5` (Windows/Linux)
   - A new Extension Development Host window will open

## Usage

### Deploying a Contract

1. Open your contract project in VS Code
2. Open the Command Palette:
   - `Cmd + Shift + P` (Mac)
   - `Ctrl + Shift + P` (Windows/Linux)
3. Run: **Stellar Suite: Deploy Contract**
4. Follow interactive prompts to:
   - Select compiled WASM file
   - Select network
   - Select source account
   - Choose deployment signing method

Stellar Suite will:

- Run build and deployment using the official CLI
- Run signing workflow before deployment submission
- Capture the deployed contract ID
- Display results inside VS Code
- Save deployment metadata for later use

### Deployment Signing Workflow

Deployment now includes a signing phase before transaction submission. Supported methods:

- Interactive signing (prompt for secret key)
- Keypair file signing
- Stored keypair signing from VS Code secure storage
- Hardware wallet signature verification (external sign + paste signature)
- Source-account delegated signing via Stellar CLI

For hardware wallet signing, Stellar Suite copies the payload hash to clipboard and validates the returned signature before deploy.
For local keypair signing and signature verification, install `@stellar/stellar-sdk` in the extension development environment.

### Building a Contract

1. Open the Command Palette
2. Run: **Stellar Suite: Build Contract**
3. Select the contract directory if multiple contracts are detected

The extension will compile your contract and display build results.

### Simulating Transactions

1. Open the Command Palette
2. Run: **Stellar Suite: Simulate Soroban Transaction**
3. Enter contract ID, function name, and arguments

Results are displayed in a formatted panel with return values and resource usage.

### CLI Configuration Management

Use **Stellar Suite: Configure CLI** to manage CLI settings with profiles.

You can:

- Create and switch configuration profiles
- Validate CLI/network/source/RPC settings
- Apply active profile settings to workspace configuration
- Export and import profiles as JSON

### Using the Sidebar

The Stellar Suite sidebar provides a visual interface for managing contracts:

- View all detected contracts in your workspace
- See build status at a glance
- See detected contract template/category (token, escrow, voting, custom, unknown)
- Access quick actions (Build, Deploy, Simulate)
- Run template-specific actions from the contract card/context menu
- Manually assign template categories from the context menu
- View deployment history
- Inspect contract functions

### Contract Template Configuration

Stellar Suite supports custom template definitions through a workspace config file:

- `stellar-suite.templates.json` (workspace root), or
- `.stellar-suite/templates.json`

Example:

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

Each template can define keyword, dependency, and path hints used for detection. Unknown contracts are shown as `Unknown / Unclassified` until matched or manually assigned.

## Configuration

Stellar Suite can be configured through VS Code settings.

### `stellarSuite.network`

Default network used for deployment.

### `stellarSuite.cliPath`

Path to the Stellar CLI executable.

### `stellarSuite.source`

Source identity to use for contract invocations (e.g., 'dev').

### `stellarSuite.rpcUrl`

RPC endpoint URL for transaction simulation when not using local CLI.

### `stellarSuite.useLocalCli`

Use local Stellar CLI instead of RPC endpoint.

### `stellarSuite.signing.defaultMethod`

Default signing method used when deployment signing begins.

### `stellarSuite.signing.requireValidatedSignature`

Require a validated signature before deployment is submitted.

### `stellarSuite.signing.enableSecureKeyStorage`

Allow saving keypairs in VS Code SecretStorage for reuse.

**Example:**

```json
{
  "stellarSuite.network": "testnet",
  "stellarSuite.cliPath": "stellar",
  "stellarSuite.source": "dev",
  "stellarSuite.rpcUrl": "https://soroban-testnet.stellar.org:443",
  "stellarSuite.useLocalCli": true,
  "stellarSuite.signing.defaultMethod": "interactive",
  "stellarSuite.signing.requireValidatedSignature": true,
  "stellarSuite.signing.enableSecureKeyStorage": true
}
```

## Project Vision

Stellar Suite aims to become a full smart contract development assistant for Stellar developers. The goal is to remove repetitive CLI workflows and replace them with interactive tooling built directly into VS Code.

## Roadmap

Stellar Suite is being developed in stages.

### Short-Term Goals

**Contract Invocation UI**

- Select deployed contracts from stored workspace data
- Automatically detect contract functions
- Generate input fields based on function parameters
- Run contract invocations directly from VS Code

**Simulation Integration**

- Run contract simulations before invoking transactions
- Display execution results in a readable interface
- Show authorization requirements
- Display resource usage metrics

**Deployment Profiles**

- Save deployment configurations per project
- Allow quick redeployment with saved settings
- Support multiple networks per workspace

### Medium-Term Goals

**Contract Interface Parsing**

- Read contract source files
- Extract function names and parameter types
- Automatically generate invocation forms
- Provide autocomplete for contract functions

**Deployment History & Replay**

- Track past deployments
- Allow redeployment of previous contract versions
- Provide version comparison tools

**Multi-Contract Workspace Support**

- Manage multiple deployed contracts per project
- Link deployments to specific contract files
- Provide workspace-level contract explorer

### Long-Term Vision

Stellar Suite aims to evolve into a full development environment for Stellar smart contracts, including:

- Interactive contract debugging tools
- Execution tracing and state inspection
- Transaction replay tools
- Gas and resource profiling dashboards
- Contract testing and simulation suites
- Visual contract interaction builder
- Multi-network contract management

## Contributing

Contributions are welcome.

### Setup

Fork the repository and clone your fork:

```bash
git clone https://github.com/0xVida/stellar-suite.git
cd stellar-suite
```

Install dependencies:

```bash
npm install
```

### Development Commands

Compile TypeScript:

```bash
npm run compile
```

Watch mode:

```bash
npm run watch
```

Run tests:

```bash
npm test
```

### Running Locally

1. Open project in VS Code
2. Press `Fn + F5` (Mac) or `F5` (Windows/Linux)
3. Test extension inside Extension Development Host

### Contribution Guidelines

- Keep code modular and readable
- Provide clear error handling
- Add tests when introducing new features
- Update documentation when functionality changes

## Philosophy

Stellar Suite follows several guiding principles:

- **Reduce developer friction**: Minimize context switching and manual steps
- **Stay lightweight and focused**: Essential features without bloat
- **Enhance existing CLI tooling**: Work with the official Stellar CLI rather than replace it
- **Provide interactive developer workflows**: Replace command-line prompts with IDE integration
- **Build practical tooling developers actually need**: Focus on real-world use cases

The extension is designed to feel like a natural extension of the development environment rather than a separate tool.

## Support

Issues and feature requests can be submitted through GitHub.
