import { bench, describe, expect } from "vitest";

import { parseRustSymbols, groupSymbolsByParent } from "@/utils/rustSymbolParser";

// ─── Synthetic Rust source generators ────────────────────────────────────────

function generateRustStruct(index: number): string {
  return `
pub struct Token${index} {
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
    pub total_supply: i128,
    pub admin: Address,
}

impl Token${index} {
    pub fn new(name: String, symbol: String, decimals: u32) -> Self {
        Self {
            name,
            symbol,
            decimals,
            total_supply: 0,
            admin: Address::default(),
        }
    }

    pub fn mint(&mut self, amount: i128) {
        self.total_supply += amount;
    }

    pub fn burn(&mut self, amount: i128) {
        self.total_supply -= amount;
    }

    fn validate_amount(amount: i128) -> bool {
        amount > 0
    }
}
`.trim();
}

function generateRustEnum(index: number): string {
  return `
pub enum ContractError${index} {
    Unauthorized,
    InsufficientBalance,
    InvalidAmount,
    Overflow,
    AlreadyInitialized,
}

impl ContractError${index} {
    pub fn code(&self) -> u32 {
        match self {
            Self::Unauthorized => 1,
            Self::InsufficientBalance => 2,
            Self::InvalidAmount => 3,
            Self::Overflow => 4,
            Self::AlreadyInitialized => 5,
        }
    }
}
`.trim();
}

function generateRustTrait(index: number): string {
  return `
pub trait Fungible${index} {
    fn name(&self) -> String;
    fn symbol(&self) -> String;
    fn decimals(&self) -> u32;
    fn total_supply(&self) -> i128;
    fn balance(&self, addr: Address) -> i128;
    fn transfer(&mut self, from: Address, to: Address, amount: i128);
    fn approve(&mut self, owner: Address, spender: Address, amount: i128, expiry: u32);
    fn allowance(&self, owner: Address, spender: Address) -> i128;
}
`.trim();
}

function generateRustModule(index: number): string {
  return `
pub mod storage${index} {
    use super::*;

    pub const KEY_BALANCE: &str = "balance";
    pub const KEY_NONCE: &str = "nonce";
    pub const KEY_ADMIN: &str = "admin";

    pub fn read_balance(env: &Env, addr: &Address) -> i128 {
        env.storage().persistent().get(&(KEY_BALANCE, addr)).unwrap_or(0)
    }

    pub fn write_balance(env: &Env, addr: &Address, amount: i128) {
        env.storage().persistent().set(&(KEY_BALANCE, addr), &amount);
    }

    pub fn read_nonce(env: &Env, addr: &Address) -> u32 {
        env.storage().temporary().get(&(KEY_NONCE, addr)).unwrap_or(0)
    }

    pub fn write_nonce(env: &Env, addr: &Address, nonce: u32) {
        env.storage().temporary().set(&(KEY_NONCE, addr), &nonce);
    }

    macro_rules! require {
        ($cond:expr, $err:expr) => {
            if !$cond {
                panic!("{}", $err);
            }
        };
    }
}
`.trim();
}

/** Generate a synthetic Rust source file of approximately `targetLines` lines. */
function generateLargeRustFile(targetLines: number): string {
  const blocks: string[] = [
    "use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};",
    "",
  ];

  let lineCount = 2;
  let index = 0;

  while (lineCount < targetLines) {
    const mod = index % 4;
    let block: string;

    if (mod === 0) block = generateRustStruct(index);
    else if (mod === 1) block = generateRustEnum(index);
    else if (mod === 2) block = generateRustTrait(index);
    else block = generateRustModule(index);

    blocks.push(block, "");
    lineCount += block.split("\n").length + 1;
    index++;
  }

  return blocks.join("\n");
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SMALL_SOURCE = generateLargeRustFile(500);
const MEDIUM_SOURCE = generateLargeRustFile(2_000);
const LARGE_SOURCE = generateLargeRustFile(5_000);
const XLARGE_SOURCE = generateLargeRustFile(10_000);

// ─── Correctness check ───────────────────────────────────────────────────────

describe("analysis correctness", () => {
  bench("parseRustSymbols extracts symbols from small file (~500 lines)", () => {
    const symbols = parseRustSymbols(SMALL_SOURCE);
    expect(symbols.length).toBeGreaterThan(0);
  });

  bench("parseRustSymbols extracts symbols from medium file (~2k lines)", () => {
    const symbols = parseRustSymbols(MEDIUM_SOURCE);
    expect(symbols.length).toBeGreaterThan(0);
  });
});

// ─── Parse benchmarks ────────────────────────────────────────────────────────

describe("parseRustSymbols — scalability", () => {
  bench("500-line Rust file", () => {
    parseRustSymbols(SMALL_SOURCE);
  });

  bench("2 000-line Rust file", () => {
    parseRustSymbols(MEDIUM_SOURCE);
  });

  bench("5 000-line Rust file", () => {
    parseRustSymbols(LARGE_SOURCE);
  });

  bench("10 000-line Rust file", () => {
    parseRustSymbols(XLARGE_SOURCE);
  });
});

// ─── Grouping benchmarks ──────────────────────────────────────────────────────

describe("groupSymbolsByParent — scalability", () => {
  const smallSymbols = parseRustSymbols(SMALL_SOURCE);
  const mediumSymbols = parseRustSymbols(MEDIUM_SOURCE);
  const largeSymbols = parseRustSymbols(LARGE_SOURCE);

  bench("group symbols from 500-line file", () => {
    groupSymbolsByParent(smallSymbols);
  });

  bench("group symbols from 2 000-line file", () => {
    groupSymbolsByParent(mediumSymbols);
  });

  bench("group symbols from 5 000-line file", () => {
    groupSymbolsByParent(largeSymbols);
  });
});

// ─── Repeated analysis simulation ────────────────────────────────────────────

describe("repeated analysis (simulates editor re-parse on keystroke)", () => {
  bench(
    "10 consecutive parses of a 2 000-line file",
    () => {
      for (let i = 0; i < 10; i++) {
        parseRustSymbols(MEDIUM_SOURCE);
      }
    },
  );

  bench(
    "100 consecutive parses of a 500-line file",
    () => {
      for (let i = 0; i < 100; i++) {
        parseRustSymbols(SMALL_SOURCE);
      }
    },
  );
});

// ─── Threshold guard ─────────────────────────────────────────────────────────

describe("performance threshold guards", () => {
  bench(
    "5 000-line parse completes in reasonable time",
    () => {
      const start = performance.now();
      parseRustSymbols(LARGE_SOURCE);
      const elapsed = performance.now() - start;
      // Regression alert: single parse of a 5k-line file should be < 500 ms
      expect(elapsed).toBeLessThan(500);
    },
    { iterations: 5 },
  );

  bench(
    "10 000-line parse completes in reasonable time",
    () => {
      const start = performance.now();
      parseRustSymbols(XLARGE_SOURCE);
      const elapsed = performance.now() - start;
      // Regression alert: single parse of a 10k-line file should be < 1 000 ms
      expect(elapsed).toBeLessThan(1_000);
    },
    { iterations: 5 },
  );
});
