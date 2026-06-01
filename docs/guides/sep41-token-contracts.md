# Deploying and Interacting with SEP-41 Token Contracts

This guide walks through creating, deploying, initializing, minting, and simulating transfers for a custom SEP-0041 token contract in the Stellar Suite browser IDE.

## Prerequisites

- A workspace opened in the browser IDE.
- Stellar CLI available in the IDE runtime.
- A funded Testnet identity selected as the source account.
- A Rust contract project with `soroban-sdk` configured.

## 1. Create the Contract

Create a new contract folder and add this `Cargo.toml`:

```toml
[package]
name = "sep41-token"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "22"

[dev-dependencies]
soroban-sdk = { version = "22", features = ["testutils"] }
```

SEP-0041 token contracts should expose the standard token surface. Use this as the implementation checklist while extending the tutorial contract:

```rust
pub trait Sep41Interface {
    fn allowance(env: Env, from: Address, spender: Address) -> i128;
    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32);
    fn balance(env: Env, id: Address) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128);
    fn burn(env: Env, from: Address, amount: i128);
    fn burn_from(env: Env, spender: Address, from: Address, amount: i128);
    fn decimals(env: Env) -> u32;
    fn name(env: Env) -> String;
    fn symbol(env: Env) -> String;
}
```

Then add `src/lib.rs`:

```rust
#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Symbol};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Balance(Address),
    Name,
    Symbol,
    Decimals,
}

#[contract]
pub struct Sep41Token;

#[contractimpl]
impl Sep41Token {
    pub fn initialize(env: Env, admin: Address, name: String, symbol: String, decimals: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let balance = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&DataKey::Balance(to), &(balance + amount));
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        if amount <= 0 {
            panic!("amount must be positive");
        }

        from.require_auth();
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }

        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&DataKey::Balance(from), &(from_balance - amount));
        env.storage().persistent().set(&DataKey::Balance(to), &(to_balance + amount));
        env.events().publish((Symbol::new(&env, "transfer"),), amount);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Balance(id)).unwrap_or(0)
    }

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&DataKey::Symbol).unwrap()
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).unwrap()
    }
}
```

Verification:

```bash
cargo test
cargo build --target wasm32-unknown-unknown --release
```

## 2. Build in the Browser IDE

1. Open the SEP-41 project in the IDE.
2. Select the token contract in the file explorer.
3. Click **Build**.
4. Confirm the terminal shows a release Wasm artifact under `target/wasm32-unknown-unknown/release/`.

Verification checklist:

- Build finishes without Rust compiler errors.
- The generated `.wasm` appears in the contract target directory.
- The contract remains selected in the deployment panel.

## 3. Deploy to Testnet

1. Open the deployment panel.
2. Choose `testnet`.
3. Select the funded source identity.
4. Click **Deploy**.
5. Save the returned contract ID.

Expected output:

```text
Contract deployed successfully
Contract ID: C...
Network: testnet
```

## 4. Initialize Token Metadata

In the interaction panel, select `initialize` and provide:

```json
{
  "admin": "GADMIN_PUBLIC_KEY",
  "name": "Suite Dollar",
  "symbol": "SUSD",
  "decimals": 7
}
```

Run the simulation first. If auth and arguments look correct, submit the transaction.

Verification checklist:

- Simulation succeeds.
- Submission succeeds.
- `name`, `symbol`, and `decimals` return the initialized metadata.

## 5. Mint Tokens

Select `mint` and provide:

```json
{
  "to": "GRECIPIENT_PUBLIC_KEY",
  "amount": "1000000000"
}
```

The amount is in stroop-like token units. With `decimals = 7`, `1000000000` represents `100` display tokens.

After submission, call `balance`:

```json
{
  "id": "GRECIPIENT_PUBLIC_KEY"
}
```

Expected result:

```text
1000000000
```

## 6. Simulate a Transfer

Select `transfer` and provide:

```json
{
  "from": "GRECIPIENT_PUBLIC_KEY",
  "to": "GDESTINATION_PUBLIC_KEY",
  "amount": "250000000"
}
```

Click **Simulate** before submitting. Review the auth tree, footprint, and estimated fee. Submit only after the simulation confirms the `from` address is the signer.

Verification checklist:

- `from` balance decreases by `250000000`.
- `to` balance increases by `250000000`.
- The event stream includes a `transfer` event.

## 7. Add Unit Tests

Create `src/test.rs`:

```rust
#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn initialize_mint_and_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Sep41Token, ());
    let client = Sep41TokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.initialize(
        &admin,
        &String::from_str(&env, "Suite Dollar"),
        &String::from_str(&env, "SUSD"),
        &7,
    );
    client.mint(&alice, &1_000_000_000);
    client.transfer(&alice, &bob, &250_000_000);

    assert_eq!(client.balance(&alice), 750_000_000);
    assert_eq!(client.balance(&bob), 250_000_000);
}
```

Wire it from `src/lib.rs`:

```rust
#[cfg(test)]
mod test;
```

Run:

```bash
cargo test
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `already initialized` | Use a new deployed contract ID or skip initialization for an existing deployment. |
| `insufficient balance` | Mint to the sender before transfer simulation. |
| Auth simulation fails | Confirm the selected IDE source identity matches the `admin` or `from` address. |
| Metadata calls panic | Initialize the contract before calling `name`, `symbol`, or `decimals`. |

## Final Verification

Before opening a pull request, include terminal output or screenshots showing:

- Successful `cargo test`.
- Successful IDE build.
- Deployment contract ID.
- Simulation output for `mint` and `transfer`.
