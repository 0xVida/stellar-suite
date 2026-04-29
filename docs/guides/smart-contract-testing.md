# Smart Contract Testing Guide

A comprehensive walkthrough of writing, running, and interpreting tests for Soroban contracts in the Stellar Suite IDE.

---

## Table of Contents

1. [Overview](#overview)
2. [Test Environment Setup](#test-environment-setup)
3. [Writing Unit Tests](#writing-unit-tests)
4. [Mocking Auth and Ledger State](#mocking-auth-and-ledger-state)
5. [Property-Based Testing](#property-based-testing)
6. [Running Tests in the IDE](#running-tests-in-the-ide)
7. [Interpreting Test Output](#interpreting-test-output)
8. [Common Testing Patterns](#common-testing-patterns)
9. [Sample Contract References](#sample-contract-references)

---

## Overview

Soroban contracts are compiled to WebAssembly and run inside a deterministic host environment. The `soroban_sdk` ships a `testutils` feature that gives you an in-process `Env` — no live network required. Tests run via `cargo test` and the results are streamed directly into the IDE terminal.

**Key properties of the Soroban test environment:**

- Fully in-process — no RPC node needed
- Deterministic ledger state (sequence, timestamp, network ID)
- Auth can be mocked per-address or blanket-mocked
- Budget (CPU + memory) is tracked and inspectable

---

## Test Environment Setup

### Cargo.toml

Add `testutils` as a dev-dependency feature so the test helpers are compiled only for `cfg(test)` targets:

```toml
[dependencies]
soroban-sdk = { version = "22", features = [] }

[dev-dependencies]
soroban-sdk = { version = "22", features = ["testutils"] }
```

### File Layout

Soroban projects conventionally keep unit tests in a sibling `test.rs` (or `tests/` for integration tests):

```
my_contract/
├── Cargo.toml
├── src/
│   ├── lib.rs          ← contract logic
│   └── test.rs         ← unit tests (cfg(test) module)
└── tests/
    └── test.rs         ← integration tests (separate crate)
```

Wire the test module in `lib.rs`:

```rust
#![no_std]

use soroban_sdk::{contract, contractimpl, Env, Symbol};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env, to: Symbol) -> Symbol {
        to
    }
}

#[cfg(test)]
mod test;
```

---

## Writing Unit Tests

### Minimal Test Skeleton

```rust
// src/test.rs
#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, Symbol};

#[test]
fn test_hello_returns_input() {
    let env = Env::default();
    env.mock_all_auths();

    // Register the contract and get a typed client
    let contract_id = env.register(HelloContract, ());
    let client = HelloContractClient::new(&env, &contract_id);

    let result = client.hello(&Symbol::new(&env, "World"));
    assert_eq!(result, Symbol::new(&env, "World"));
}
```

### Testing Storage

```rust
#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_balance_stored_and_retrieved() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &1_000_000_i128);

    let balance = client.balance(&admin);
    assert_eq!(balance, 1_000_000_i128);
}
```

### Testing Error Cases

```rust
#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialize_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &1_000_000_i128);
    // Second call must panic
    client.initialize(&admin, &500_i128);
}
```

Using typed `Result`-returning functions:

```rust
#[test]
fn test_transfer_invalid_amount_returns_error() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let from = Address::generate(&env);
    let to   = Address::generate(&env);

    // Negative amount should produce Error::InvalidAmount
    let result = client.try_transfer(&from, &to, &-1_i128);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}
```

---

## Mocking Auth and Ledger State

### Blanket Auth Mock

The simplest approach: all `require_auth` calls succeed regardless of who calls them.

```rust
env.mock_all_auths();
```

Use this for happy-path tests where auth correctness is not under test.

### Scoped Auth Mock

Assert that a *specific* address authorised a *specific* call with *specific* args:

```rust
use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::IntoVal;

#[test]
fn test_transfer_requires_from_auth() {
    let env = Env::default();

    let contract_id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &contract_id);

    let from   = Address::generate(&env);
    let to     = Address::generate(&env);
    let amount = 100_i128;

    client
        .mock_auths(&[MockAuth {
            address: &from,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "transfer",
                args: (&from, &to, &amount).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .transfer(&from, &to, &amount);
}
```

### Verifying What Was Authorised

After a call you can inspect the recorded auth tree:

```rust
let auths = env.auths();
// auths is a Vec of (Address, AuthorizedInvocation) pairs
assert_eq!(auths.len(), 1);
assert_eq!(auths[0].0, from);
```

### Mocking Ledger State

Control the ledger sequence, timestamp, and network ID:

```rust
use soroban_sdk::testutils::Ledger as _;

#[test]
fn test_deadline_not_expired() {
    let env = Env::default();
    env.mock_all_auths();

    // Set the ledger to sequence 100, timestamp 1_700_000_000
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1_700_000_000,
        protocol_version: 22,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 4096,
        max_entry_ttl: 6_312_000,
    });

    let contract_id = env.register(AuctionContract, ());
    let client = AuctionContractClient::new(&env, &contract_id);

    // Deadline is at sequence 200 — we're at 100, so this should not panic
    client.place_bid(&Address::generate(&env), &500_i128);
}
```

Advance ledger between calls to simulate time passing:

```rust
env.ledger().with_mut(|li| {
    li.sequence_number += 100;
    li.timestamp       += 500;
});
```

### Injecting Mock Ledger Entries (IDE Feature)

In the Stellar Suite IDE you can populate the **Mock Ledger State** panel before running tests. Each entry corresponds to a `contractData` or `tokenBalance` ledger key that the contract will read. Entries injected this way are passed to `cargo test` via `--ledger-snapshot`.

---

## Property-Based Testing

Property tests exercise contracts with randomly generated inputs to surface edge cases that hand-written examples miss.

### Setup

Add `proptest` to dev-dependencies:

```toml
[dev-dependencies]
soroban-sdk  = { version = "22", features = ["testutils"] }
proptest     = { version = "1", default-features = false, features = ["std"] }
```

### Example: Token Balance Never Goes Negative

```rust
use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Env};

proptest! {
    #[test]
    fn prop_balance_never_negative(initial in 1_i128..1_000_000, transfer in 0_i128..500_000) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TokenContract, ());
        let client = TokenContractClient::new(&env, &contract_id);

        let alice = Address::generate(&env);
        let bob   = Address::generate(&env);

        client.initialize(&alice, &initial);

        // Only transfer if alice has sufficient balance
        if transfer <= initial {
            client.transfer(&alice, &bob, &transfer);
            prop_assert!(client.balance(&alice) >= 0);
            prop_assert!(client.balance(&bob)   >= 0);
        }
    }
}
```

### Generate Property Tests in the IDE

The IDE includes a **Generate** tab in the Testing sidebar. Select a contract function, choose a strategy (range, enum, arbitrary), and the IDE produces a `proptest!` block you can paste into your test file.

---

## Running Tests in the IDE

### Using the Test Button

1. Open any contract file in the editor.
2. Click the **Test** button in the toolbar (or press the keyboard shortcut shown in **Hotkeys**).
3. The terminal pane expands and shows the `cargo test` output.

### Test Discovery

The IDE automatically discovers tests by scanning the open workspace for:

- `#[test]` functions in `src/test.rs` or `src/lib.rs`
- Files inside a `tests/` directory at the contract root
- Integration test targets listed in `Cargo.toml` under `[[test]]`

A summary line is printed before tests run:

```
Detected 6 test(s): 2 integration, 4 unit.
Integration tests folder detected at contract root: tests/.
```

### Rerunning Failed Tests

After a partial failure you can click **Rerun Failed** in the test results panel. The IDE reruns only the failing test names with `cargo test <name> -- --exact`, saving compilation time.

### Keyboard Shortcut

Open the Hotkeys modal (`?` or the hotkeys button in the toolbar) to see the current test shortcut binding.

---

## Interpreting Test Output

### Passed Run

```
running 4 tests
test test::test_hello_returns_input        ... ok
test test::test_balance_stored_and_retrieved ... ok
test test::test_transfer_requires_from_auth  ... ok
test test::test_deadline_not_expired         ... ok

test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured
```

All rows ending in `ok` indicate the assertion succeeded. The summary line shows totals.

### Failed Run

```
running 4 tests
test test::test_double_initialize_panics ... FAILED

failures:
---- test::test_double_initialize_panics stdout ----
thread 'test::test_double_initialize_panics' panicked at 'called `Result::unwrap()` on an `Err` value ...'

test result: FAILED. 3 passed; 1 failed
```

Click the failing test name in the **Test Results** pane to jump to the source line. The IDE resolves workspace-relative paths from the panic trace automatically.

### Budget Output

When you call `env.budget()` inside a test the IDE renders the resource table in the terminal:

```
+------------------+----------+
| Resource         | Used     |
+------------------+----------+
| Instructions     | 142,310  |
| Memory (bytes)   |  8,192   |
+------------------+----------+
```

Values that exceed recommended thresholds are highlighted in amber.

### Property Test Shrinking

When `proptest` finds a failing input it shrinks it to the minimal counterexample:

```
thread 'prop_balance_never_negative' panicked at 'assertion failed: ...'
    Shrunk to: initial = 1, transfer = 2
```

The shrunk values are the smallest inputs that reproduce the failure — start debugging from those numbers.

---

## Common Testing Patterns

### Before/After State Assertions

```rust
#[test]
fn test_transfer_moves_balance() {
    let env = Env::default();
    env.mock_all_auths();

    let id     = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &id);

    let alice = Address::generate(&env);
    let bob   = Address::generate(&env);
    client.initialize(&alice, &1_000_i128);

    let before_alice = client.balance(&alice);
    let before_bob   = client.balance(&bob);

    client.transfer(&alice, &bob, &100_i128);

    assert_eq!(client.balance(&alice), before_alice - 100);
    assert_eq!(client.balance(&bob),   before_bob   + 100);
}
```

### Multi-Contract Interaction

```rust
#[test]
fn test_escrow_releases_on_approval() {
    let env = Env::default();
    env.mock_all_auths();

    let token_id   = env.register(TokenContract, ());
    let escrow_id  = env.register(EscrowContract, ());

    let token  = TokenContractClient::new(&env, &token_id);
    let escrow = EscrowContractClient::new(&env, &escrow_id);

    let depositor  = Address::generate(&env);
    let beneficiary = Address::generate(&env);

    token.initialize(&depositor, &500_i128);
    escrow.initialize(&token_id, &depositor, &beneficiary);
    escrow.deposit(&depositor, &200_i128);
    escrow.release(&depositor);

    assert_eq!(token.balance(&beneficiary), 200_i128);
}
```

### Event Assertions

```rust
use soroban_sdk::testutils::Events as _;

#[test]
fn test_transfer_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let id     = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &id);

    let alice = Address::generate(&env);
    let bob   = Address::generate(&env);
    client.initialize(&alice, &1_000_i128);
    client.transfer(&alice, &bob, &100_i128);

    let events = env.events().all();
    // Expect one transfer event with topic "transfer"
    assert!(events.iter().any(|(_, topics, _)| {
        topics.contains(soroban_sdk::symbol_short!("transfer").into())
    }));
}
```

---

## Sample Contract References

The Stellar Suite IDE ships with several example contracts in the `templates/` directory that you can use as reference:

| Template | Location | What it tests |
|---|---|---|
| Token (SEP-41) | `templates/token/` | Mint, transfer, burn, allowances |
| Auction | `templates/auction/` | Bid ordering, deadline enforcement |
| Escrow | `templates/escrow/` | Conditional release, dispute |
| Multisig | `templates/multisig/` | Threshold signatures |
| NFT | `templates/nft/` | Ownership, transfer, royalties |
| Staking | `templates/staking/` | Deposit, rewards accrual, withdrawal |
| Voting | `templates/voting/` | Proposal creation, ballot counting |

Each template includes a `test_snapshots/` directory with JSON fixtures used by the snapshot test runner built into the IDE. Open any template via **File → Open Template** to explore the full test suite in context.

---

## Further Reading

- [Soroban SDK testutils docs](https://docs.rs/soroban-sdk/latest/soroban_sdk/testutils/index.html)
- [EVM to Soroban migration guide](./evm-to-soroban.md)
- [Simulation Features guide](../simulation-features.md)
