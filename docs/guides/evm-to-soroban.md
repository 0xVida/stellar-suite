# Soroban Quickstart for Ethereum Developers

If you have written Solidity contracts and are exploring the Stellar ecosystem, this guide maps the concepts you already know onto Soroban so you can be productive immediately. Every section pairs an EVM concept with its Soroban equivalent and shows practical code.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Concept Comparison Table](#concept-comparison-table)
3. [Hello World: Solidity vs Soroban](#hello-world-solidity-vs-soroban)
4. [Storage](#storage)
5. [Types and Value Encoding](#types-and-value-encoding)
6. [Contract Calls and Composability](#contract-calls-and-composability)
7. [Events and Ledger Entries](#events-and-ledger-entries)
8. [Access Control and Auth](#access-control-and-auth)
9. [Tokens — ERC-20 vs SEP-41](#tokens--erc-20-vs-sep-41)
10. [Toolchain Comparison](#toolchain-comparison)
11. [Deploying with Stellar Suite IDE](#deploying-with-stellar-suite-ide)
12. [Key Gotchas](#key-gotchas)
13. [Further Reading](#further-reading)

---

## Architecture Overview

| Dimension | Ethereum / EVM | Stellar / Soroban |
|---|---|---|
| Smart contract runtime | EVM bytecode | WASM (compiled from Rust) |
| Consensus | Proof-of-Stake | Federated Byzantine Agreement (SCP) |
| Native currency | ETH | XLM (Lumens) |
| Fee model | Gas (auction-based) | Resource fees (CPU, memory, storage) + inclusion fee |
| Block time | ~12 seconds | ~5 seconds (ledger close) |
| Account model | EOA / Contract accounts | Stellar accounts with sequence numbers |
| State storage | Contract storage slots (256-bit) | Typed ledger entries (Persistent / Temporary / Instance) |
| Finality | Probabilistic (reorgs possible) | Deterministic per ledger close |
| Token standard | ERC-20, ERC-721 | SEP-41 (fungible), SEP-39 (NFT-like) |

---

## Concept Comparison Table

| EVM Concept | Soroban Equivalent | Notes |
|---|---|---|
| `contract` / `pragma solidity` | `#[contract]` + `#[contractimpl]` | Rust macros, no VM-level ABI encoding needed |
| `public` function | `pub fn` inside `#[contractimpl]` | All `pub` fns are callable; no `external`/`internal` split |
| `view` / `pure` | Read-only fn (no `env.storage().set`) | No `view` keyword; purity is enforced by not writing |
| `mapping(K => V)` | `env.storage().persistent().get/set` | Keys are typed `ScVal`, values are XDR-encoded |
| `uint256` | `i128` / `u128` / `i64` / `u64` | No 256-bit integers natively; use `i128` for token amounts |
| `address` | `soroban_sdk::Address` | Covers both accounts and contracts |
| `msg.sender` | `env.current_contract_address()` or auth context | No implicit caller; use `require_auth()` |
| `require(cond, msg)` | `if !cond { panic!("msg") }` | Panics unwind cleanly; error codes via `contracterror` |
| `emit EventName(...)` | `env.events().publish(...)` | Events stored as ledger entries, not in logs |
| `delegatecall` | Not available | Soroban does not support storage delegation |
| `selfdestruct` | Not available | Contracts are permanent; expire only via TTL |
| `payable` | Not applicable | XLM transfers use SAC (Stellar Asset Contract) |
| `constructor` | `fn __constructor` or first-call init | Typically a `fn initialize` protected by a one-time flag |
| `interface` | `trait` (Rust) | Call cross-contract via `ContractClient` |
| OpenZeppelin | Soroban SDK built-ins + community crates | `soroban-sdk` ships auth, tokens, and upgrade helpers |

---

## Hello World: Solidity vs Soroban

### Solidity

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Greeter {
    string private greeting;

    constructor(string memory _greeting) {
        greeting = _greeting;
    }

    function greet() public view returns (string memory) {
        return greeting;
    }

    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }
}
```

### Soroban (Rust)

```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Env, String};

#[contracttype]
enum DataKey { Greeting }

#[contract]
pub struct Greeter;

#[contractimpl]
impl Greeter {
    /// One-time initialisation (replaces Solidity constructor).
    pub fn initialize(env: Env, greeting: String) {
        if env.storage().instance().has(&DataKey::Greeting) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Greeting, &greeting);
    }

    pub fn greet(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Greeting)
            .unwrap_or(String::from_str(&env, "Hello"))
    }

    pub fn set_greeting(env: Env, greeting: String) {
        env.storage().instance().set(&DataKey::Greeting, &greeting);
    }
}
```

**Key differences:**
- `no_std` — Soroban contracts cannot use the Rust standard library. Use `soroban_sdk::String`, `Vec`, `Map` instead of `std` equivalents.
- No constructor — use an explicit `initialize` function with a guard.
- Storage is typed and explicit — no implicit slot layout.

---

## Storage

### EVM storage slots

```solidity
mapping(address => uint256) private balances;
uint256 public totalSupply;
```

Solidity assigns sequential 256-bit slots. Mappings hash the key with the slot index.

### Soroban storage tiers

Soroban has three distinct storage tiers:

| Tier | Soroban API | EVM equivalent | Cost / Behaviour |
|---|---|---|---|
| **Persistent** | `env.storage().persistent()` | `SSTORE` to a normal slot | Survives indefinitely (requires TTL extension); most expensive |
| **Temporary** | `env.storage().temporary()` | No direct equivalent | Expires automatically after TTL; cheaper than persistent |
| **Instance** | `env.storage().instance()` | Contract bytecode storage | Tied to contract instance lifetime; cheapest for small config |

```rust
// Write a user balance (persistent — survives between ledgers)
env.storage().persistent().set(&(DataKey::Balance, &user), &amount);

// Read it back
let balance: i128 = env.storage()
    .persistent()
    .get(&(DataKey::Balance, &user))
    .unwrap_or(0);

// Extend TTL so the entry doesn't expire
env.storage().persistent().extend_ttl(&(DataKey::Balance, &user), 100, 100);
```

> **Gotcha:** Persistent entries expire unless you call `extend_ttl`. Unlike EVM slots that persist forever, Soroban storage has built-in rent mechanics.

---

## Types and Value Encoding

### EVM types → Soroban types

| Solidity | Soroban / Rust | Notes |
|---|---|---|
| `uint256` | `u128` or `i128` | No 256-bit; use i128 for token amounts (max ~170T with 7 decimals) |
| `int256` | `i128` | |
| `address` | `Address` | Validates checksum; works for accounts and contracts |
| `bool` | `bool` | Direct mapping |
| `bytes32` | `BytesN<32>` | Fixed-length byte arrays |
| `bytes` | `Bytes` | Dynamic byte array |
| `string` | `String` (soroban_sdk) | Not `std::String` |
| `struct Foo { ... }` | `#[contracttype] struct Foo { ... }` | Must derive `contracttype` to be storable |
| `enum` | `#[contracttype] enum` | Variants map to Soroban discriminants |
| `mapping(K => V)` | `Map<K, V>` or manual `env.storage()` | |
| `T[]` dynamic array | `Vec<T>` | |
| `T[N]` fixed array | `Vec<T>` or manual | No native fixed arrays in SDK |

### ABI encoding

EVM uses ABI encoding for all cross-contract calls. Soroban uses **XDR** (External Data Representation) — a binary format with explicit type tags. The Soroban SDK handles encoding and decoding automatically; you rarely interact with XDR directly unless you are building off-chain tooling.

---

## Contract Calls and Composability

### Solidity external call

```solidity
interface IGreeter {
    function greet() external view returns (string memory);
}

contract Caller {
    function callGreet(address greeter) external view returns (string memory) {
        return IGreeter(greeter).greet();
    }
}
```

### Soroban cross-contract call

```rust
use soroban_sdk::{contract, contractimpl, Address, Env, String};

mod greeter {
    soroban_sdk::contractimport!(file = "../greeter/target/wasm32-unknown-unknown/release/greeter.wasm");
}

#[contract]
pub struct Caller;

#[contractimpl]
impl Caller {
    pub fn call_greet(env: Env, greeter_id: Address) -> String {
        let client = greeter::Client::new(&env, &greeter_id);
        client.greet()
    }
}
```

`contractimport!` generates a typed client from the contract WASM. This is roughly equivalent to generating a Solidity interface from an ABI, but fully type-checked at compile time.

---

## Events and Ledger Entries

### Solidity events

```solidity
event Transfer(address indexed from, address indexed to, uint256 value);

emit Transfer(from, to, amount);
```

Events in EVM are stored in transaction receipts (bloom-filtered logs). They are cheap and indexed off-chain.

### Soroban events

```rust
env.events().publish(
    (symbol_short!("transfer"), from.clone(), to.clone()),
    amount,
);
```

Soroban events are stored as **contract events** in the ledger's transaction meta. They are queryable via horizon or RPC (`getEvents`). There is no bloom filter — filter by contract ID or topic.

> Soroban events cost resources (they increase ledger write bytes). Keep event payloads small.

---

## Access Control and Auth

### Solidity `onlyOwner`

```solidity
address public owner;

modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
}

function setAdmin(address admin) public onlyOwner { ... }
```

### Soroban `require_auth`

```rust
pub fn set_admin(env: Env, caller: Address, new_admin: Address) {
    caller.require_auth();  // panics if caller did not sign
    env.storage().instance().set(&DataKey::Admin, &new_admin);
}
```

`require_auth()` checks that the invocation was authorized by the given address — either by a direct signature (for accounts) or by the calling contract's logic (for contract-to-contract calls). There is no implicit `msg.sender`; you must pass and verify the caller explicitly.

### Multi-sig / custom auth

Soroban's auth framework supports custom authorization policies via `require_auth_for_args`, letting you implement multi-sig, time-locks, and spending limits without external contracts.

---

## Tokens — ERC-20 vs SEP-41

### ERC-20 interface (abbreviated)

```solidity
function totalSupply() external view returns (uint256);
function balanceOf(address account) external view returns (uint256);
function transfer(address to, uint256 amount) external returns (bool);
function approve(address spender, uint256 amount) external returns (bool);
function transferFrom(address from, address to, uint256 amount) external returns (bool);
```

### SEP-41 interface (Soroban)

```rust
pub trait Sep41Token {
    fn total_supply(env: Env) -> i128;
    fn balance(env: Env, id: Address) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32);
    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128);
    fn allowance(env: Env, from: Address, spender: Address) -> i128;
}
```

Notable differences:

| Feature | ERC-20 | SEP-41 |
|---|---|---|
| Amount type | `uint256` | `i128` |
| `approve` expiry | No expiry | `expiration_ledger: u32` (required) |
| `decimals` | Often 18 | Convention is 7 (like XLM) |
| Native asset wrapping | WETH pattern | SAC (Stellar Asset Contract) — auto-deployed by protocol |
| `mint` / `burn` | Non-standard (ERC-20 extension) | Part of reference implementation |

The Stellar protocol ships a **Stellar Asset Contract (SAC)** for every classic Stellar asset (including XLM). You can call `transfer`, `balance`, etc. on XLM from Soroban without deploying anything.

---

## Toolchain Comparison

| Task | Ethereum | Soroban / Stellar Suite |
|---|---|---|
| Compile | `solc` / `hardhat compile` | `cargo build --target wasm32-unknown-unknown --release` |
| Test | Hardhat / Foundry (`forge test`) | `cargo test` + Vitest (JS/TS bindings) |
| Deploy | `hardhat deploy` / `forge create` | Stellar Suite IDE → **Deploy Contract** |
| Simulate | Tenderly / Foundry `--fork-url` | Stellar Suite **Simulation** panel |
| Interact | Etherscan, cast | Stellar Suite **Contract Invocation** panel |
| Local node | Hardhat node / Anvil | `stellar-quickstart` (Docker) |
| Explorer | Etherscan | Stellar Expert, Horizon |
| Key management | MetaMask / Ledger | Freighter wallet |

---

## Deploying with Stellar Suite IDE

1. Open **Stellar Suite** and create a new project using the **SEP-41 Token** template.
2. Press `Ctrl+Shift+B` to build. The output panel shows WASM size and any warnings.
3. Click **Fund Account** to get testnet XLM from Friendbot (or connect Freighter).
4. Click **Deploy Contract → Testnet**. The IDE uploads the WASM and calls `installContractCode` + `createContract` in sequence.
5. Copy the resulting Contract ID (56-char `C...` string).
6. Open the **Contract Invocation** panel, paste the Contract ID, and call `initialize`.
7. Open the **Simulation** panel to verify `total_supply`, `balance`, and `transfer` behave as expected without spending real fees.

**Deep-link — open the IDE with a SEP-41 token template:**

```
stellar-suite://open?template=sep41-token&network=testnet
```

---

## Key Gotchas

### 1. No 256-bit integers

ERC-20 amounts use `uint256`. Soroban uses `i128` (max ~1.7 × 10³⁸). For tokens with 7 decimals the practical max supply is ~1.7 × 10³¹ — effectively unlimited.

### 2. Explicit TTL management

Ledger entries expire. Call `extend_ttl` on persistent entries during write operations (or in a maintenance function) or your contract state will become inaccessible.

### 3. No `msg.sender` — pass the caller explicitly

Every function that needs authorization must accept an `Address` argument and call `address.require_auth()`. This is safer than implicit sender but requires a different mental model.

### 4. `no_std` environment

You cannot use `HashMap`, `Vec` from std, `format!`, `println!`, or any crate that links libc. Use `soroban_sdk::{Map, Vec, String}` and the `log!` macro for debug output.

### 5. Storage rent

Unlike Ethereum where `SSTORE` costs gas once and persists forever, Soroban storage has a time-to-live. Design your storage layout to minimize persistent entries or budget for periodic TTL extensions.

### 6. WASM size matters

Larger WASM binaries cost more to deploy. Keep dependencies minimal and use `opt-level = 'z'` in `Cargo.toml` to minimize binary size.

```toml
[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
codegen-units = 1
```

### 7. No `delegatecall` / upgradeable proxies

Soroban contracts cannot modify their own WASM in-place via a proxy pattern. Upgradeability is supported through the `update_current_contract_wasm` host function, which replaces the contract's WASM atomically. Implement an `upgrade` function protected by admin auth.

```rust
pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
    admin.require_auth();
    env.deployer().update_current_contract_wasm(new_wasm_hash);
}
```

---

## Further Reading

- [Soroban Documentation](https://developers.stellar.org/docs/build/smart-contracts/overview) — official reference
- [soroban-sdk crate](https://docs.rs/soroban-sdk) — Rust API reference
- [SEP-41 Token Standard](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md) — full spec
- [Stellar Asset Contract](https://developers.stellar.org/docs/build/smart-contracts/tokens/stellar-asset-contract) — wrap any Stellar asset
- [Simulation Features](../simulation-features.md) — Stellar Suite simulation guide
- [Interactive Simulation Walkthrough](../tutorials/simulation-guide.md) — step-by-step tutorial
