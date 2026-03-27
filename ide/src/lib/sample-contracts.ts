export interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
  language?: string;
}

export const sampleContracts: FileNode[] = [
  {
    name: "hello_world",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, vec, Env, Symbol, Vec};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    /// Say hello to someone.
    pub fn hello(env: Env, to: Symbol) -> Vec<Symbol> {
        vec![&env, symbol_short!("Hello"), to]
    }

    /// Example with potentially unsafe math operations
    pub fn unsafe_math(env: Env, a: u64, b: u64) -> u64 {
        // These operations could overflow on ledger
        let sum = a + b;  // MATH001: Potentially unsafe addition
        let product = a * b;  // MATH001: Potentially unsafe multiplication
        let difference = a - b;  // MATH001: Potentially unsafe subtraction

        // Large number operations
        let big_amount: u128 = 1000000;
        let result = big_amount * a;  // MATH001: Potentially unsafe multiplication

        sum + product
    }
}

mod test;`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::{symbol_short, vec, Env};

#[test]
fn test_hello() {
    let env = Env::default();
    let contract_id = env.register_contract(None, HelloContract);
    let client = HelloContractClient::new(&env, &contract_id);

    let words = client.hello(&symbol_short!("Dev"));
    assert_eq!(
        words,
        vec![&env, symbol_short!("Hello"), symbol_short!("Dev")]
    );
}`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "hello-world"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }`,
      },
    ],
  },
  {
    name: "token",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, String,
};

#[contracttype]
pub enum DataKey {
    Admin,
    Name,
    Symbol,
    Decimals,
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        decimal: u32,
        name: String,
        symbol: String,
    ) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimal);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
    }

    pub fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap()
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Decimals)
            .unwrap()
    }
}`,
      },
    ],
  },
  {
    name: "increment",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, log, Env};

#[contracttype]
pub enum DataKey {
    Counter,
}

#[contract]
pub struct IncrementContract;

#[contractimpl]
impl IncrementContract {
    /// Increment an internal counter and return the value.
    pub fn increment(env: Env) -> u32 {
        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0);

        count += 1;

        log!(&env, "count: {}", count);

        env.storage()
            .instance()
            .set(&DataKey::Counter, &count);

        env.storage().instance().extend_ttl(100, 100);

        count
    }

    /// Return the current value of the counter.
    pub fn get_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0)
    }
}`,
      },
    ],
  },
];

export function findFile(nodes: FileNode[], path: string[]): FileNode | null {
  for (const node of nodes) {
    if (node.name === path[0]) {
      if (path.length === 1) return node;
      if (node.children) return findFile(node.children, path.slice(1));
    }
  }
  return null;
}
