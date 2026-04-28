# Troubleshooting Guide

This guide helps you resolve common errors encountered while developing with Soroban and the Stellar Suite IDE.

## Table of Contents
- [Rust Compilation Errors](#rust-compilation-errors)
- [Soroban Execution Errors](#soroban-execution-errors)
- [IDE and RPC Errors](#ide-and-rpc-errors)
- [FAQ](#faq)

---

## Rust Compilation Errors

### `E0277`: Trait Not Implemented
**Description:** This error occurs when a type doesn't implement a trait required by a function or another trait.

**How to Fix:**
1. Check the error message to see which trait is missing.
2. Implement the trait for your type using `impl TraitName for YourType { ... }`.
3. If it's a standard trait like `Clone` or `Debug`, you can often use `#[derive(Clone, Debug)]`.

### `E0308`: Type Mismatch
**Description:** Expected one type but found another.

**How to Fix:**
1. Verify the function signature or variable declaration.
2. Ensure you are passing the correct type. Use `.into()` if a conversion is available.
3. Check for implicit vs. explicit types (e.g., `u32` vs `i32`).

---

## Soroban Execution Errors

### `SOROBAN_STATE_LIMIT`: State Size Limit Exceeded
**Description:** Your contract is trying to store more than 64KB of data in a single ledger entry.

**How to Fix:**
1. Reduce the size of your data structures.
2. Split large data into multiple ledger entries.
3. Use `Persistent` storage only for essential data; use `Temporary` for transient data.

### `SOROBAN_AUTH`: Authorization Required
**Description:** The contract function requires authorization from one or more accounts, but it was not provided.

**How to Fix:**
1. Ensure you are calling `require_auth()` or `require_auth_for_args()` in your contract.
2. In the IDE/CLI, specify the `--source` or use the `Signer` to provide the required signatures.

### `ERR_INSUFFICIENT_BALANCE` (Code 130)
**Description:** The account does not have enough XLM (or the required asset) to cover the transaction fees or the minimum balance.

**How to Fix:**
1. Fund your account using Friendbot (on Testnet).
2. Check if you have enough balance to cover the `fee` and the `rent` for ledger entries.

---

## IDE and RPC Errors

| Error Code | Description | Solution |
|------------|-------------|----------|
| `ERR_NETWORK` | Unable to reach the RPC endpoint. | Check your internet connection and verify the `rpcUrl` in settings. |
| `ERR_INVALID_XDR` | The transaction XDR is malformed. | Ensure your contract arguments match the expected types in the ABI. |
| `RATE_LIMIT` | Too many requests to the RPC server. | Wait a few seconds or switch to a different RPC provider. |
| `TIMEOUT` | The operation took too long. | Increase the timeout in settings or check if the network is congested. |

---

## FAQ

### Why can't I see my contract in the sidebar?
1. Ensure your workspace contains a `Cargo.toml` with `soroban-sdk`.
2. Click the **Refresh** icon in the Contracts sidebar.
3. Check the **Output** panel for any file parsing errors.

### How do I switch networks?
Use the **Stellar Kit: Switch Stellar Network** command from the Command Palette (`Cmd+Shift+P`) or use the network selector in the sidebar.

### My simulation is failing with "Trapped". What does it mean?
A "trap" is a fatal error in the WASM execution, often caused by `panic!()`, `assert!()` failures, or out-of-bounds access. Check your contract logic and ensure all preconditions are met.
