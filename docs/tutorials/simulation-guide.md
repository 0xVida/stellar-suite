# Interactive Simulation Walkthrough Guide

Welcome to the Stellar Suite IDE Simulation Guide! This interactive tutorial will walk you through the powerful simulation features of the Stellar Suite IDE, allowing you to test and validate your smart contracts in a safe, controlled environment before deploying to live networks.

## Prerequisites

Before you begin, ensure you have:

- **Stellar Suite IDE access** – available at [stellar-suite.dev/ide](https://stellar-suite.dev/ide)
- **A Stellar wallet** – for signing authentication operations during simulation
- **A sample Soroban contract** – we'll provide one if you don't have your own ready

> 💡 **Tip:** If you need a contract to practice with, [open the IDE with a pre-loaded sample contract](https://stellar-suite.dev/ide?contract=hello_world_contract&mode=simulate&step=1).

## Walkthrough

### Step 1: Opening the Simulation Environment

To start simulating your contract, first access the simulation panel in the IDE. The simulation environment provides a sandboxed space where you can test contract invocations without any on-chain effects.

1. Navigate to the Stellar Suite IDE in your browser
2. Click the **Simulation** tab in the left sidebar
3. Select **New Simulation** to create a fresh simulation session

[Open in IDE →](https://stellar-suite.dev/ide?contract=hello_world_contract&mode=simulate&step=1)

### Step 2: Loading Your Contract

Load a Soroban contract into the simulation environment. You can import your own contract or use one of the built-in templates.

For this guide, we'll use the Hello World contract template:

1. In the simulation panel, click **Load Contract**
2. Select **Templates** → **Getting Started** → **Hello World**
3. The contract will appear in the editor with syntax highlighting

[Open in IDE →](https://stellar-suite.dev/ide?contract=hello_world_contract&mode=simulate&step=2)

### Step 3: Setting Simulation Parameters

Configure the parameters for your simulation. The Hello World contract's `hello` function takes a single `to` parameter of type `Symbol`.

1. Select the `hello` function from the dropdown
2. For the `to` parameter, enter `world` (without quotes)
3. Verify the parameters look correct in the preview panel

```rust
// The hello function signature
pub fn hello(env: Env, to: Symbol) -> Symbol
```

[Open in IDE →](https://stellar-suite.dev/ide?contract=hello_world_contract&mode=simulate&step=3)

### Step 4: Running Your First Simulation

Execute the simulation and observe the results. This step shows how the IDE processes your transaction and displays the return value.

1. Click the **Run Simulation** button (play icon)
2. Watch the progress indicator as the transaction executes
3. View the **Return Value** in the results panel: `["Hello", "world"]`

The simulation panel will display:
- Transaction status (success/failure)
- Resource usage (CPU instructions, memory)
- Any events emitted during execution

[Open in IDE →](https://stellar-suite.dev/ide?contract=hello_world_contract&mode=simulate&step=4)

### Step 5: Simulating Token Transfer

Now let's simulate a more complex interaction using a token contract. This demonstrates how to work with contracts that transfer value.

1. Switch to the **Token Contract** template (or load `token_transfer` if you have your own)
2. Select the `transfer` function
3. Enter the required parameters:
   - `from`: the sender's address
   - `to`: the recipient's address  
   - `amount`: the amount to transfer

```rust
// Transfer function
pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> bool
```

[Open in IDE →](https://stellar-suite.dev/ide?contract=token_transfer&mode=simulate&step=5)

### Step 6: Testing Multi-Signature Vault

Explore advanced simulation with a multi-signature vault contract. This contract requires multiple signers for operations.

1. Load the `multi_sig_vault` contract template
2. Select the `deposit` function
3. The contract will prompt for signer authorizations
4. Simulate the transaction and review the state changes

Multi-signature contracts help you understand how authorization works in Soroban simulations.

[Open in IDE →](https://stellar-suite.dev/ide?contract=multi_sig_vault&mode=simulate&step=6)

### Step 7: Analyzing Simulation Results

After running simulations, use the analysis tools to verify your contract behaves correctly.

1. Open the **Results** tab to view transaction details
2. Check the **State Diff** to see how storage changed
3. Review **Resource Usage** for optimization opportunities
4. Use **Export** to save results for later reference

[Open in IDE →](https://stellar-suite.dev/ide?contract=hello_world_contract&mode=simulate&step=7)

## Troubleshooting

### Simulation fails with "Auth error"

If your simulation fails due to authorization errors, ensure you have:
- Enabled **Mock Auth** in the simulation settings
- Added the required signer addresses to the authorization list
- Correctly formatted address strings (should start with `G` and be 56 characters)

### Contract not loading from template

If the template contract won't load:
- Check your internet connection – templates are fetched from remote storage
- Clear your browser cache and reload the IDE
- Try loading a different template to isolate the issue

### Resource limit exceeded during simulation

If you see resource warnings or failures:
- Reduce the input values being passed to the function
- Optimize your contract's logic to use fewer CPU instructions
- Check for unbounded loops or infinite recursion in your code

## Next Steps

Now that you've completed the interactive simulation walkthrough, here are some ways to continue your learning:

- **[Advanced Simulation Guide](../simulation-features.md)** – Learn about forking mainnet, gas profiling, and state-diff analysis
- **[Smart Contract Testing](guides/smart-contract-testing.md)** – Deep dive into writing unit tests for your contracts
- **[EVM to Soroban Guide](guides/evm-to-soroban.md)** – If you're migrating from Ethereum, see how patterns translate
- **[Simulation History](https://stellar-suite.dev/ide?panel=history&mode=simulate)** – Explore past simulations and compare results