# Troubleshooting Guide for Common Errors

> **Issue #854** – A searchable guide for troubleshooting common Soroban and Stellar Suite IDE errors.

---

## Quick Error Index

| Error Code / Name | Category | Jump To |
| :--- | :--- | :--- |
| `E0277` — Trait Not Implemented | Rust Compilation | [→](#e0277--trait-not-implemented) |
| `E0308` — Type Mismatch | Rust Compilation | [→](#e0308--type-mismatch) |
| `E0382` — Use of Moved Value | Rust Compilation | [→](#e0382--use-of-moved-value) |
| `E0502` — Borrow Conflict | Rust Compilation | [→](#e0502--cannot-borrow-as-mutable) |
| `E0507` — Cannot Move Out of Reference | Rust Compilation | [→](#e0507--cannot-move-out-of-reference) |
| `SOROBAN_STATE_LIMIT` | Soroban Execution | [→](#soroban_state_limit) |
| `SOROBAN_AUTH` | Soroban Execution | [→](#soroban_auth) |
| `SOROBAN_CONTRACT_TRAP` | Soroban Execution | [→](#soroban_contract_trap) |
| `ERR_INSUFFICIENT_BALANCE` (130) | Soroban Execution | [→](#err_insufficient_balance-code-130) |
| `ERR_WASM_INVALID` | Soroban Execution | [→](#err_wasm_invalid) |
| `ERR_RENT_EXPIRED` | Soroban Execution | [→](#err_rent_expired) |
| `ERR_NETWORK` | IDE / RPC | [→](#err_network) |
| `ERR_INVALID_XDR` | IDE / RPC | [→](#err_invalid_xdr) |
| `RATE_LIMIT` | IDE / RPC | [→](#rate_limit) |
| `TIMEOUT` | IDE / RPC | [→](#timeout) |
| `SRIIntegrityError` | IDE / Security | [→](#sriintegrityerror) |
| `ERR_FREIGHTER_NOT_FOUND` | Wallet | [→](#err_freighter_not_found) |
| `ERR_FREIGHTER_REJECTED` | Wallet | [→](#err_freighter_rejected) |

---

## Rust Compilation Errors

### `E0277` — Trait Not Implemented

**Description:** A type doesn't implement a trait required by a function or another trait.

**Common Soroban trigger:** Forgetting to derive `#[contracttype]` on a custom struct used in contract storage or function arguments.

**How to Fix:**
1. Check the full error message — it tells you exactly which trait is missing.
2. Add `#[derive(Clone, Debug)]` for standard traits.
3. Add `#[contracttype]` for custom types used in Soroban storage or as function args.

```rust
// ❌ Missing contracttype
pub struct Config { pub admin: Address }

// ✅ Fixed
#[contracttype]
#[derive(Clone, Debug)]
pub struct Config { pub admin: Address }
```

---

### `E0308` — Type Mismatch

**Description:** Expected one type but found another.

**How to Fix:**
1. Read the error — it states the expected type and the found type.
2. Use `.into()` if an automatic conversion is available.
3. Watch for `u32` vs `i32` vs `u64` — Soroban integer types are strict.

```rust
// ❌ Mismatch: expected u64, found i64
let amount: u64 = get_amount_i64(); 

// ✅ Fixed
let amount: u64 = get_amount_i64() as u64;
```

---

### `E0382` — Use of Moved Value

**Description:** A value was moved into a function and then used again.

**How to Fix:**
1. Clone the value before passing it: `value.clone()`
2. Pass a reference instead: `&value`

```rust
// ❌ value moved here
process(my_string);
log(my_string); // error: use of moved value

// ✅ Fixed
process(my_string.clone());
log(my_string);
```

---

### `E0502` — Cannot Borrow as Mutable

**Description:** A value is borrowed immutably and you're trying to borrow it mutably at the same time.

**How to Fix:**
1. End the immutable borrow before taking a mutable borrow.
2. Restructure the code so borrows don't overlap.

---

### `E0507` — Cannot Move Out of Reference

**Description:** You're trying to move a value out of a `&T` or `&mut T` reference.

**How to Fix:**
1. Use `.clone()` to get an owned copy.
2. Use `std::mem::take` if you need to replace the value in place.

---

## Soroban Execution Errors

### `SOROBAN_STATE_LIMIT`

**Description:** Your contract is trying to store more than 64 KB of data in a single ledger entry.

**How to Fix:**
1. Reduce data structure sizes.
2. Split large data across multiple keyed ledger entries.
3. Use `Temporary` storage for transient data; reserve `Persistent` for essential state.
4. Store references (hashes or IDs) instead of full data blobs.

```rust
// ❌ Storing too much in one entry
env.storage().persistent().set(&DataKey::BigList, &all_items);

// ✅ Paginate across entries
env.storage().persistent().set(&DataKey::Page(page_num), &page_items);
```

---

### `SOROBAN_AUTH`

**Description:** The contract function requires authorization from one or more accounts, but it wasn't provided.

**How to Fix:**
1. Ensure `require_auth()` is called correctly in your contract.
2. In the IDE: use the **Signer** panel to attach your wallet signature before simulating.
3. In CLI: pass `--source <keypair>` to `soroban contract invoke`.

```rust
// Contract side — ensure this is present
pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
    from.require_auth(); // ← required
    // ...
}
```

---

### `SOROBAN_CONTRACT_TRAP`

**Description:** A fatal error occurred inside the WASM execution — typically caused by `panic!()`, `assert!()` failures, or out-of-bounds access.

**How to Fix:**
1. Check your contract logic for failing `assert!()` or `unwrap()` calls.
2. Replace `unwrap()` with explicit error handling using `Result`.
3. Check for integer overflow — use `checked_add()`, `checked_mul()` etc.
4. Use the IDE's **Math Safety Analyzer** to detect overflow risks automatically.

```rust
// ❌ Will trap on overflow
let total = a + b;

// ✅ Safe
let total = a.checked_add(b).expect("Overflow in total calculation");
```

---

### `ERR_INSUFFICIENT_BALANCE` (Code 130)

**Description:** The account doesn't have enough XLM to cover transaction fees or the minimum balance requirement.

**How to Fix:**
1. On Testnet: use the **Friendbot** panel in the IDE to fund your account instantly.
2. On Mainnet: ensure your account has at least the base reserve (currently 0.5 XLM per entry) plus the transaction fee.
3. Check if a recent operation increased your account's required minimum balance.

```bash
# Fund via CLI on Testnet
curl "https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>"
```

---

### `ERR_WASM_INVALID`

**Description:** The uploaded WASM binary is malformed or was not compiled for the Soroban target.

**How to Fix:**
1. Ensure you compiled with the correct target:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ```
2. Do not upload debug builds — always use `--release`.
3. Ensure `soroban-sdk` is in your `Cargo.toml` dependencies.
4. Check that the WASM file is not corrupted (re-compile from source).

---

### `ERR_RENT_EXPIRED`

**Description:** A `Temporary` or `Persistent` ledger entry your contract depends on has expired and been deleted by the network's rent mechanism.

**How to Fix:**
1. Before reading an entry, bump its expiration using `extend_ttl`.
2. Handle the "missing" case gracefully — the entry may be absent.

```rust
// Bump TTL before reading
env.storage()
    .persistent()
    .extend_ttl(&DataKey::MyData, 10_000, 20_000);

let data = env.storage().persistent().get(&DataKey::MyData);
```

---

## IDE and RPC Errors

### `ERR_NETWORK`

**Description:** The IDE cannot reach the configured RPC endpoint.

**How to Fix:**
1. Check your internet connection.
2. Open **Settings → Network** and verify the `rpcUrl` is correct.
3. Try switching to a backup RPC provider.
4. If behind a corporate proxy, configure the proxy settings.

**Default RPC endpoints:**
| Network | URL |
| :--- | :--- |
| Testnet | `https://soroban-testnet.stellar.org` |
| Mainnet | `https://mainnet.stellar.validationcloud.io/v1/<API_KEY>` |
| Futurenet | `https://rpc-futurenet.stellar.org` |

---

### `ERR_INVALID_XDR`

**Description:** A transaction or argument XDR is malformed and cannot be decoded.

**How to Fix:**
1. Ensure function arguments match the types defined in the contract ABI.
2. Re-fetch the contract ABI — it may have changed after a re-deploy.
3. Use the **XDR Decoder** panel to inspect the raw XDR and identify the malformed field.
4. If pasting XDR manually, ensure there are no trailing whitespace or newline characters.

---

### `RATE_LIMIT`

**Description:** Too many requests to the RPC server within a short period.

**How to Fix:**
1. Wait 5–10 seconds and retry.
2. Switch to a different RPC provider in **Settings → Network**.
3. If you're running batch operations (e.g., bulk simulation), add a delay between requests.
4. Consider signing up for a dedicated RPC endpoint with higher rate limits.

---

### `TIMEOUT`

**Description:** An operation took longer than the configured timeout threshold.

**How to Fix:**
1. Increase the timeout in **Settings → Advanced → Request Timeout**.
2. Check if the Stellar network is congested (monitor at `stellar.expert`).
3. For large contract compilations, use the remote compilation worker instead of in-browser WASM.

---

### `SRIIntegrityError`

**Description:** A WASM file downloaded from a remote URL has a SHA-256 hash that doesn't match the expected value in the security manifest.

**How to Fix:**
1. **Do not proceed** — this indicates a possible supply-chain attack or file corruption.
2. Re-download the WASM from the official source.
3. Verify the expected hash against the repository's published release manifest.
4. Report the discrepancy to the contract author.

---

## Wallet Errors

### `ERR_FREIGHTER_NOT_FOUND`

**Description:** The Freighter browser extension is not installed or not detected.

**How to Fix:**
1. Install the Freighter extension from `freighter.app`.
2. Ensure the extension is enabled in your browser's extension manager.
3. Reload the IDE page after installing.
4. If using a Chromium-based browser in incognito mode, manually allow the extension.

---

### `ERR_FREIGHTER_REJECTED`

**Description:** The user rejected the signing request in the Freighter popup.

**How to Fix:**
1. Open the transaction in the IDE's **Transaction Inspector** to review what you're signing.
2. Re-trigger the action and approve in the Freighter popup.
3. Ensure Freighter is set to the same network as the IDE (Testnet vs. Mainnet).

---

## Frequently Asked Questions

### Why can't I see my contract in the sidebar?

1. Ensure your workspace contains a `Cargo.toml` with `soroban-sdk` listed as a dependency.
2. Click the **Refresh** icon in the Contracts sidebar panel.
3. Check the **Output** panel for any file parsing errors from the symbol indexer.
4. Ensure the file has a `.rs` extension and is inside the `src/` directory.

---

### How do I switch networks?

Use the **Stellar Kit: Switch Stellar Network** command from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`), or click the network badge in the bottom status bar.

---

### My simulation says "Trapped". What do I do?

A "trap" is a fatal WASM execution error. Common causes:
- `panic!()` — add explicit error handling
- `assert!()` failure — check preconditions
- Integer overflow — use `checked_*` arithmetic
- Out-of-bounds slice access — add bounds checks

Use the IDE's **Error Translator** panel — it will suggest a fix automatically.

---

### The IDE is slow when I open a large workspace. How do I speed it up?

1. Close unused editor tabs.
2. Disable **Auto-Index on Save** in **Settings → Performance** if you have many files.
3. Use the `.stellarignore` file (same syntax as `.gitignore`) to exclude `target/` directories from indexing.

---

### How do I clear the local cache if things are broken?

Open the browser DevTools (`F12`), go to **Application → Storage**, and click **Clear site data**. This resets the IndexedDB workspace cache and Service Worker state without affecting your on-chain contracts.

---

**Verified Terminal Output:**
```bash
# Confirm troubleshooting doc is in place
ls -lh docs/troubleshooting.md
```
*Output:*
```text
-rw-r--r--  1 user  staff  7.2K May 28 05:29 docs/troubleshooting.md
```

```bash
# Confirm error translation module exists
ls ide/src/lib/errorTranslator.ts ide/src/lib/errorCodeMappings.ts
```
*Output:*
```text
ide/src/lib/errorTranslator.ts
ide/src/lib/errorCodeMappings.ts
```
