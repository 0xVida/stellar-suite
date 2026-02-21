# Escrow Contract Template

A Soroban escrow template designed for secure party-to-party transactions with configurable approvals and time-based release conditions.

**Category:** escrow  
**Version:** 0.1.0  
**Author:** Stellar Suite  
**License:** Apache-2.0

---

## Overview

This template provides a baseline escrow model that supports common settlement patterns:

- `deposit` to open an escrow case with payer, payee, arbiter, amount, and release time
- `release` to finalize a successful transaction after release time and approval threshold
- `refund` to return escrowed value after failed/disputed transactions with approval threshold
- Multi-party approval flows (payer/payee/arbiter) with configurable threshold (`1..=3`)

This template tracks escrow state and approvals directly in contract storage. If you need actual asset custody, integrate token transfer calls in `deposit`, `release`, and `refund`.

---

## Folder Structure

```text
escrow/
├── template.json       # Template metadata
├── Cargo.toml          # Rust project configuration
├── README.md           # Template documentation
├── src/
│   └── lib.rs          # Contract implementation
└── tests/
    └── test.rs         # Integration test suite
```

---

## Contract Functions

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `deposit` | `payer: Address`, `payee: Address`, `arbiter: Address`, `amount: u128`, `release_after: u64`, `required_approvals: u32` | `u64` | Creates escrow case and stores terms. Requires payer auth. |
| `release` | `escrow_id: u64`, `approver: Address` | - | Records a release approval and marks escrow `Released` when threshold is reached and release time passed. |
| `refund` | `escrow_id: u64`, `approver: Address` | - | Records a refund approval and marks escrow `Refunded` when threshold is reached. |
| `get_escrow` | `escrow_id: u64` | `EscrowCase` | Returns full escrow details including approvals and status. |
| `escrow_count` | - | `u64` | Returns number of escrow cases created. |

---

## Escrow Scenarios

### 1) Buyer/Seller with Arbiter (2-of-3)
- Buyer (`payer`) opens escrow with seller (`payee`) and mediator (`arbiter`)
- `required_approvals = 2`
- On successful delivery: buyer + seller approve `release`
- On dispute/failure: buyer + arbiter approve `refund`

### 2) Auto-Release with Single Approval (1-of-3)
- `required_approvals = 1`
- Release still cannot happen before `release_after`
- Useful for low-trust but low-friction interactions

### 3) Strong Dispute Controls (3-of-3)
- `required_approvals = 3`
- Requires unanimous party participation before release/refund
- Useful for high-value transactions needing strict consensus

---

## Build

```bash
cargo build --target wasm32-unknown-unknown --release
```

Output artifact:

```text
target/wasm32-unknown-unknown/release/escrow_contract.wasm
```

---

## Test

```bash
cargo test
```

Test coverage includes:
- Escrow creation and data persistence
- Time-gated release behavior
- Multi-party release and refund approval threshold logic
- Invalid operations (duplicate approval, outsider approval, invalid state transitions)

---

## Example Usage (CLI-style)

```bash
# Create escrow with release window and 2-of-3 approvals
stellar contract invoke --id <CONTRACT_ID> --source <PAYER_SECRET> --network testnet -- deposit \
  --payer <PAYER_ADDRESS> \
  --payee <PAYEE_ADDRESS> \
  --arbiter <ARBITER_ADDRESS> \
  --amount 1000000 \
  --release_after 1730000000 \
  --required_approvals 2

# Approve release (after release_after timestamp)
stellar contract invoke --id <CONTRACT_ID> --source <PAYER_SECRET> --network testnet -- release \
  --escrow_id 1 \
  --approver <PAYER_ADDRESS>

# Approve refund in failed flow
stellar contract invoke --id <CONTRACT_ID> --source <ARBITER_SECRET> --network testnet -- refund \
  --escrow_id 1 \
  --approver <ARBITER_ADDRESS>

# Query escrow details
stellar contract invoke --id <CONTRACT_ID> --network testnet -- get_escrow \
  --escrow_id 1
```

---

## Customization Ideas

- Integrate Soroban token transfers for real fund custody.
- Add milestone or partial release functionality.
- Add dispute reason codes and evidence hash fields.
- Add cancellation windows and expiry-based auto-refund.
- Add role-based permissions for external compliance/review agents.
