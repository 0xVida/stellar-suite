import { describe, it, expect } from "vitest";
import { parseRustSymbols, groupSymbolsByParent } from "../rustSymbolParser";

describe("rustSymbolParser", () => {
  describe("parseRustSymbols", () => {
    it("should parse struct declarations", () => {
      const code = `
pub struct PublicStruct;
struct PrivateStruct {
    field: u32,
}
`;
      const symbols = parseRustSymbols(code);
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "PublicStruct",
        kind: "struct",
        visibility: "pub",
      });
      expect(symbols[1]).toMatchObject({
        name: "PrivateStruct",
        kind: "struct",
        visibility: "private",
      });
    });

    it("should parse enum declarations", () => {
      const code = `
pub enum DataKey {
    Admin,
    Counter,
}
enum PrivateEnum {
    A, B,
}
`;
      const symbols = parseRustSymbols(code);
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "DataKey",
        kind: "enum",
        visibility: "pub",
      });
      expect(symbols[1]).toMatchObject({
        name: "PrivateEnum",
        kind: "enum",
        visibility: "private",
      });
    });

    it("should parse function declarations", () => {
      const code = `
pub fn public_function() {}
fn private_function() {}
pub async fn async_function() {}
`;
      const symbols = parseRustSymbols(code);
      expect(symbols).toHaveLength(3);
      expect(symbols[0]).toMatchObject({
        name: "public_function",
        kind: "function",
        visibility: "pub",
      });
      expect(symbols[1]).toMatchObject({
        name: "private_function",
        kind: "function",
        visibility: "private",
      });
      expect(symbols[2]).toMatchObject({
        name: "async_function",
        kind: "function",
        visibility: "pub",
      });
    });

    it("should parse impl blocks and methods", () => {
      const code = `
impl MyContract {
    pub fn init(env: Env) {}
    fn helper() {}
}
`;
      const symbols = parseRustSymbols(code);
      expect(symbols).toHaveLength(3);
      expect(symbols[0]).toMatchObject({
        name: "MyContract",
        kind: "impl",
      });
      expect(symbols[1]).toMatchObject({
        name: "init",
        kind: "function",
        visibility: "pub",
        parent: "MyContract",
      });
      expect(symbols[2]).toMatchObject({
        name: "helper",
        kind: "function",
        visibility: "private",
        parent: "MyContract",
      });
    });

    it("should parse trait declarations", () => {
      const code = `
pub trait MyTrait {
    fn method(&self);
}
`;
      const symbols = parseRustSymbols(code);
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "MyTrait",
        kind: "trait",
        visibility: "pub",
      });
    });

    it("should parse const declarations", () => {
      const code = `
pub const MAX_VALUE: u32 = 100;
const PRIVATE_CONST: u32 = 50;
`;
      const symbols = parseRustSymbols(code);
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "MAX_VALUE",
        kind: "const",
        visibility: "pub",
      });
      expect(symbols[1]).toMatchObject({
        name: "PRIVATE_CONST",
        kind: "const",
        visibility: "private",
      });
    });

    it("should parse type aliases", () => {
      const code = `
pub type Result<T> = std::result::Result<T, Error>;
type PrivateType = u32;
`;
      const symbols = parseRustSymbols(code);
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "Result",
        kind: "type",
        visibility: "pub",
      });
    });

    it("should parse module declarations", () => {
      const code = `
pub mod tests;
mod private_mod;
`;
      const symbols = parseRustSymbols(code);
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "tests",
        kind: "mod",
        visibility: "pub",
      });
    });

    it("should parse macro definitions", () => {
      const code = `
macro_rules! my_macro {
    () => {};
}
`;
      const symbols = parseRustSymbols(code);
      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({
        name: "my_macro",
        kind: "macro",
        visibility: "private",
      });
    });

    it("should track correct line numbers", () => {
      const code = `// Comment line 1
// Comment line 2

pub struct MyStruct;

impl MyStruct {
    pub fn method() {}
}
`;
      const symbols = parseRustSymbols(code);
      expect(symbols[0].line).toBe(4); // MyStruct
      expect(symbols[1].line).toBe(6); // impl
      expect(symbols[2].line).toBe(7); // method
    });

    it("should handle complex Soroban contract", () => {
      const code = `
#![no_std]
use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env) -> String {
        String::from_str(&env, "Hello")
    }
    
    fn private_helper() {}
}

mod test;
`;
      const symbols = parseRustSymbols(code);
      
      const structSymbol = symbols.find(s => s.name === "HelloContract" && s.kind === "struct");
      expect(structSymbol).toBeDefined();
      expect(structSymbol?.visibility).toBe("pub");

      const implSymbol = symbols.find(s => s.name === "HelloContract" && s.kind === "impl");
      expect(implSymbol).toBeDefined();

      const helloMethod = symbols.find(s => s.name === "hello");
      expect(helloMethod).toMatchObject({
        kind: "function",
        visibility: "pub",
        parent: "HelloContract",
      });

      const helperMethod = symbols.find(s => s.name === "private_helper");
      expect(helperMethod).toMatchObject({
        kind: "function",
        visibility: "private",
        parent: "HelloContract",
      });

      const modSymbol = symbols.find(s => s.name === "test" && s.kind === "mod");
      expect(modSymbol).toBeDefined();
    });
  });

  describe("groupSymbolsByParent", () => {
    it("should group symbols by parent", () => {
      const symbols = parseRustSymbols(`
impl MyContract {
    pub fn method1() {}
    pub fn method2() {}
}
pub fn standalone() {}
`);

      const grouped = groupSymbolsByParent(symbols);
      
      expect(grouped.has("MyContract")).toBe(true);
      expect(grouped.get("MyContract")).toHaveLength(2);
      
      // Top-level includes impl block itself + standalone function
      expect(grouped.has(null)).toBe(true);
      expect(grouped.get(null)).toHaveLength(2);
    });

    it("should handle symbols without parents", () => {
      const symbols = parseRustSymbols(`
pub struct MyStruct;
pub fn my_function() {}
`);

      const grouped = groupSymbolsByParent(symbols);
      
      expect(grouped.has(null)).toBe(true);
      expect(grouped.get(null)).toHaveLength(2);
    });
  });
});
