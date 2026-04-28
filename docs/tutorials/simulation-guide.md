# Interactive Simulation Walkthrough

This guide teaches you how to use Stellar Suite's simulation features step by step. Every section includes deep-links that open the IDE with pre-filled state so you can follow along without copying and pasting.

---

## Table of Contents

1. [What is Simulation?](#what-is-simulation)
2. [Prerequisites](#prerequisites)
3. [Step 1 — Open a Contract in the IDE](#step-1--open-a-contract-in-the-ide)
4. [Step 2 — Write a Minimal Soroban Contract](#step-2--write-a-minimal-soroban-contract)
5. [Step 3 — Build and Deploy to Testnet](#step-3--build-and-deploy-to-testnet)
6. [Step 4 — Run Your First Simulation](#step-4--run-your-first-simulation)
7. [Step 5 — Inspect Simulation Results](#step-5--inspect-simulation-results)
8. [Step 6 — Use the State Diff Viewer](#step-6--use-the-state-diff-viewer)
9. [Step 7 — Profile Resource Usage](#step-7--profile-resource-usage)
10. [Step 8 — Export and Share Simulation Results](#step-8--export-and-share-simulation-results)
11. [Step 9 — Offline Simulation](#step-9--offline-simulation)
12. [Troubleshooting](#troubleshooting)

---

## What is Simulation?

Simulation lets you **invoke any Soroban contract function in a sandboxed environment** before submitting a real on-chain transaction. You get:

- Exact return values for any function call
- CPU instructions, memory bytes, and ledger read/write footprints
- A state diff showing which ledger entries change
- Error messages with Rust-level stack traces when a call panics
- Estimated fee breakdowns (execution fee + resource fee)

No real XLM is spent during simulation. Nothing is written to the ledger.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Stellar Suite IDE | latest |
| Freighter wallet | ≥ 5.0 (for signed simulations) |
| Network | Testnet or Futurenet |

> You can simulate **without a wallet** by selecting *Anonymous* as the source account. The IDE will substitute a placeholder key that the RPC node accepts for read-only calls.

---

## Step 1 — Open a Contract in the IDE

Open Stellar Suite and create a new workspace. Use the **File Explorer** panel on the left to create a new Rust project:

1. Click **New Project** in the sidebar.
2. Choose the **Soroban Hello World** template.
3. The IDE scaffolds `src/lib.rs`, `Cargo.toml`, and a `.stellar/` config folder.

**Deep-link** — click the link below to open the IDE with the Hello World template pre-loaded:

```
stellar-suite://open?template=hello-world&network=testnet
```

---

## Step 2 — Write a Minimal Soroban Contract

Replace the contents of `src/lib.rs` with the following contract. It stores a greeting message and lets callers read or update it.

```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String};

#[contracttype]
pub enum DataKey {
    Greeting,
}

#[contract]
pub struct GreetingContract;

#[contractimpl]
impl GreetingContract {
    /// Store a greeting on the ledger.
    pub fn set_greeting(env: Env, greeting: String) {
        env.storage()
            .instance()
            .set(&DataKey::Greeting, &greeting);
        env.storage().instance().extend_ttl(50, 50);
    }

    /// Read the stored greeting, defaulting to "Hello" if unset.
    pub fn get_greeting(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Greeting)
            .unwrap_or(String::from_str(&env, "Hello"))
    }
}
```

**Deep-link** — open the IDE with this source pre-filled:

```
stellar-suite://open?template=greeting-contract&network=testnet
```

---

## Step 3 — Build and Deploy to Testnet

### 3a. Build the Contract

Press `Ctrl+Shift+B` (macOS: `Cmd+Shift+B`) or click the **Build** button in the toolbar.

The terminal panel shows the compilation log. A successful build ends with:

```
Compiling greeting_contract v0.1.0
Finished release [optimized] target(s) in 4.23s
WASM binary: target/wasm32-unknown-unknown/release/greeting_contract.wasm (3.2 KB)
```

### 3b. Fund a Testnet Account

Click **Fund Account** in the sidebar to request testnet XLM from Friendbot. The IDE auto-detects your Freighter wallet address. If you are not connected to Freighter, you can paste any testnet public key.

### 3c. Deploy

Click **Deploy Contract** → **Testnet**. The IDE uploads the WASM binary and returns a 56-character contract ID starting with `C`. Copy and save this ID — you will need it in the next step.

Example contract ID: `CAAQYG...XJKZ` (56 chars)

---

## Step 4 — Run Your First Simulation

With the contract deployed you are ready to simulate a call.

1. Open the **Simulation** panel from the sidebar (rocket icon, or `Ctrl+Alt+S`).
2. Paste your contract ID into the **Contract ID** field.
3. The IDE fetches the contract ABI and lists available functions: `set_greeting` and `get_greeting`.
4. Click **get_greeting**.
5. No parameters are required. Click **Simulate**.

The panel shows the result almost instantly (usually < 500 ms over testnet RPC):

```json
{
  "result": "Hello",
  "fee_estimate": {
    "inclusion_fee": "100 stroops",
    "resource_fee": "220 stroops"
  },
  "resources": {
    "cpu_instructions": 521340,
    "mem_bytes": 1048576,
    "read_bytes": 128,
    "write_bytes": 0
  }
}
```

**Deep-link** — open the IDE with the Simulation panel focused on a pre-filled contract:

```
stellar-suite://simulate?contractId=CAAQYG...XJKZ&function=get_greeting&network=testnet
```

---

## Step 5 — Inspect Simulation Results

The **Results** tab has three sub-sections.

### Return Value

The return value is decoded from XDR automatically. For scalar types (strings, integers, booleans) the IDE shows the native value. For complex types (maps, vecs, structs) it shows an expandable tree view.

### Fee Breakdown

| Field | Meaning |
|---|---|
| `inclusion_fee` | Base fee to get the transaction included in a ledger |
| `resource_fee` | Fee proportional to CPU, memory, and storage footprint |
| `total_fee` | `inclusion_fee + resource_fee` |

### Error Panel

If the call panics or returns an error code, the **Error** tab activates and shows:

- The Soroban error code (e.g., `Error(Contract, #1)`)
- The Rust panic message (when `contractpanic` metadata is present)
- Suggested fixes based on common error patterns

---

## Step 6 — Use the State Diff Viewer

The state diff viewer shows which ledger entries a simulated invocation **reads** and **writes** without committing anything on-chain.

1. Simulate `set_greeting` with the argument `"World"`.
2. In the result panel, click the **State Diff** tab.

You will see something like:

```
MODIFIED  CONTRACT_INSTANCE  CAAQYG...XJKZ
  Greeting: "Hello" → "World"
```

Entries are colour-coded:

- **Green (CREATED)** — a new ledger entry would be written.
- **Yellow (MODIFIED)** — an existing entry would change.
- **Red (DELETED)** — an existing entry would be removed.
- **Blue (READ)** — an existing entry was accessed but not changed.

**Deep-link** — open the state diff view for a pre-configured simulation:

```
stellar-suite://simulate?contractId=CAAQYG...XJKZ&function=set_greeting&args=World&network=testnet&view=diff
```

---

## Step 7 — Profile Resource Usage

Click the **Resources** tab to open the profiler.

The profiler displays a bar chart of the five resource dimensions:

| Resource | Testnet Limit | Your Usage |
|---|---|---|
| CPU instructions | 100 000 000 | shown per call |
| Memory bytes | 40 MB | shown per call |
| Ledger read bytes | 200 KB | shown per call |
| Ledger write bytes | 65 KB | shown per call |
| Ledger read entries | 40 | shown per call |

Bars that exceed **80 %** of the limit turn amber. Bars that exceed **95 %** turn red.

### Comparing Multiple Calls

Use the **Add to Compare** button to pin a simulation result. Pin several calls and the profiler overlays them side-by-side, making it easy to spot regressions between contract versions.

---

## Step 8 — Export and Share Simulation Results

Click the **Export** button (download icon) in the simulation panel to save a JSON file containing:

```json
{
  "contractId": "CAAQYG...XJKZ",
  "network": "testnet",
  "function": "set_greeting",
  "args": ["World"],
  "result": null,
  "state_changes": [ ... ],
  "resources": { ... },
  "timestamp": "2025-06-01T12:00:00Z"
}
```

You can re-import any exported file to replay the simulation later, even against a different network or contract version, by clicking **Import Simulation** in the panel menu.

### Sharing via Deep-Link

The IDE can encode a full simulation configuration into a shareable URL. Click **Share** → **Copy Link**. Anyone with the link and Stellar Suite installed can reproduce the exact simulation with one click.

---

## Step 9 — Offline Simulation

Stellar Suite supports **offline simulation** using a bundled WASM execution engine. This is useful for:

- Rapid iteration without waiting for RPC round-trips
- Air-gapped or restricted network environments
- CI/CD pipelines that run contract tests in the browser

To enable offline simulation:

1. Open **Settings** → **Simulation** → toggle **Use Local WASM Engine**.
2. The IDE bundles `soroban-simulation.wasm` with each build; no download required.
3. Re-run any previous simulation — the result panel shows `(offline)` in the header.

> **Note:** Offline simulation does not reflect real ledger state. Ledger reads return mocked values. Use it for logic and arithmetic validation only; verify fee estimates on testnet before submitting.

---

## Troubleshooting

### "Contract not found" error

- Verify the contract ID is 56 characters starting with `C`.
- Check that the selected network (testnet / mainnet) matches where the contract was deployed.
- Wait 5–10 seconds after deployment for the RPC node to index the new contract.

### Simulation returns `HostError(WasmVm, InvalidAction)`

The contract WASM was compiled for a different Soroban environment version than the RPC node supports. Rebuild with the latest `soroban-sdk` version and redeploy.

### Fee estimate seems too high

- Inspect the **Resources** tab to identify which dimension is driving the cost.
- Large `write_bytes` values often indicate unnecessary storage writes or large data structures.
- Large `cpu_instructions` values may point to unbounded loops or expensive host functions.

### Deep-links do not open

Ensure Stellar Suite is installed and registered as the handler for the `stellar-suite://` URI scheme. On macOS/Linux run:

```bash
stellar-suite --register-protocol
```

On Windows, the installer registers the protocol automatically.

---

*For more information see the [Simulation Features reference](../simulation-features.md) and the [Soroban documentation](https://developers.stellar.org/docs/build/smart-contracts/overview).*
