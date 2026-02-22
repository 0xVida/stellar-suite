# Multi-Signature Wallet Contract

A Soroban smart contract implementing a multi-signature wallet with threshold-based approvals, proposal workflows, and secure execution patterns.

**Category:** `multisig`
**Version:** 0.1.0
**License:** Apache-2.0

---

## Overview

This contract allows a group of signers to collectively manage assets and configuration changes. Any action requires a minimum number of approvals (threshold) before it can be executed. This prevents any single signer from unilaterally moving funds or changing settings.

**Use cases:** treasury management, team wallets, DAO fund custody, escrow with multiple parties.

---

## Prerequisites

- Rust toolchain: `rustup`
- WASM target: `rustup target add wasm32-unknown-unknown`
- Stellar CLI (`soroban-cli`) installed
- Soroban SDK `21.0.0`

---

## Folder Structure

```
multisig/
├── template.json       # Template metadata
├── Cargo.toml          # Rust project configuration
├── README.md           # This file
├── src/
│   └── lib.rs          # Contract implementation
└── tests/
    └── test.rs         # Integration tests
```

---

## Contract Functions

| Function             | Parameters                                                          | Returns        | Description                                       |
| -------------------- | ------------------------------------------------------------------- | -------------- | ------------------------------------------------- |
| `initialize`         | `signers: Vec<Address>, threshold: u32`                             | `()`           | Set up wallet with signers and approval threshold |
| `create_proposal`    | `proposer: Address, action: ProposalAction, expiration_ledger: u64` | `u32`          | Create a new proposal, returns proposal ID        |
| `approve`            | `signer: Address, proposal_id: u32`                                 | `()`           | Approve a proposal                                |
| `revoke_approval`    | `signer: Address, proposal_id: u32`                                 | `()`           | Revoke a previous approval                        |
| `execute`            | `signer: Address, proposal_id: u32`                                 | `()`           | Execute a proposal after threshold is met         |
| `set_token`          | `signer: Address, token: Address`                                   | `()`           | Set token contract for transfers                  |
| `get_proposal`       | `proposal_id: u32`                                                  | `Proposal`     | Get proposal details                              |
| `get_signers`        | —                                                                   | `Vec<Address>` | Get current signer list                           |
| `get_threshold`      | —                                                                   | `u32`          | Get current approval threshold                    |
| `get_proposal_count` | —                                                                   | `u32`          | Get total proposals created                       |

### Proposal Actions

- **Transfer(to, amount)** — transfer tokens from the contract to a recipient
- **UpdateSigners(new_signers, new_threshold)** — change the signer set and threshold

---

## Building

```bash
cd templates/multisig
cargo build --target wasm32-unknown-unknown --release
```

Output: `target/wasm32-unknown-unknown/release/multisig_wallet.wasm`

---

## Testing

```bash
cd templates/multisig
cargo test
```

### Test Coverage

- Initialization (2-of-3, 1-of-1, edge cases)
- Duplicate/empty signer rejection
- Threshold validation (zero, exceeds signer count)
- Proposal creation and counting
- Approval and double-approval prevention
- Approval revocation
- Execution with threshold enforcement
- Signer updates via proposal
- Access control (non-signers rejected)
- Re-execution prevention

---

## Security Best Practices

1. **Authentication** — every state-changing function calls `require_auth()` on the signer
2. **Replay protection** — proposals have unique incrementing IDs and can only execute once
3. **Expiration** — proposals expire at a specified ledger sequence to prevent stale execution
4. **Threshold validation** — threshold must be ≥ 1 and ≤ number of signers
5. **Duplicate signer prevention** — initialization rejects duplicate addresses
6. **Double-approval prevention** — each signer can only approve once per proposal
7. **Self-governance** — signer/threshold changes require the same approval flow as transfers
8. **No single point of failure** — threshold ensures no single signer can act alone (when threshold > 1)

---

## Usage Example

```rust
// 1. Deploy the contract
// soroban contract deploy --wasm target/.../multisig_wallet.wasm

// 2. Initialize with 3 signers, requiring 2 approvals
client.initialize(&vec![alice, bob, carol], &2);

// 3. Set the token contract address
client.set_token(&alice, &token_address);

// 4. Create a transfer proposal
let action = ProposalAction::Transfer(recipient, 1000);
let proposal_id = client.create_proposal(&alice, &action, &expiration);

// 5. Collect approvals
client.approve(&alice, &proposal_id);
client.approve(&bob, &proposal_id);

// 6. Execute once threshold is met
client.execute(&alice, &proposal_id);
```

---

## Usage with Stellar Suite

Add to `stellar-suite.templates.json`:

```json
{
  "id": "multisig",
  "displayName": "Multi-Signature Wallet",
  "category": "multisig",
  "description": "Multi-signature wallet with threshold-based approvals.",
  "keywords": ["initialize", "create_proposal", "approve", "execute"],
  "dependencies": ["soroban-sdk"],
  "actions": [
    { "id": "multisig.propose", "label": "Create Proposal" },
    { "id": "multisig.approve", "label": "Approve Proposal" },
    { "id": "multisig.execute", "label": "Execute Proposal" }
  ]
}
```
