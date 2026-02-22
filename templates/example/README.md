# Example Contract Template

> CONTRACT DETAILS: Replace this title and the description below with your contract's name and purpose.

## Overview

CONTRACT DETAILS: Add a paragraph describing what this contract does, what problem it solves, and when a developer would use it.

**Category:** example (replace with: `token` | `escrow` | `voting` | `nft` | `multisig` | `staking` | `auction` | `oracle`)
**Version:** 0.1.0
**Author:** CONTRACT AUTHOR
**License:** Apache-2.0

---

## Prerequisites

CONTRACT DETAILS: List the prerequisites for using this template.

- Rust toolchain installed (`rustup`)
- WASM target: `rustup target add wasm32-unknown-unknown`
- Stellar CLI installed
- Soroban SDK `20.0.0` or compatible

---

## Folder Structure

```
example/
├── template.json       # Template metadata
├── Cargo.toml          # Rust project configuration
├── README.md           # This file
├── src/
│   └── lib.rs          # CONTRACT DETAILS: Add description of contract source
└── tests/
    └── test.rs         # CONTRACT DETAILS: Add description of test coverage
```

---

## Contract Functions

CONTRACT DETAILS: Document each public function. Use the table format below.

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `CONTRACT FUNCTION 1` | CONTRACT PARAMS | CONTRACT RETURN TYPE | CONTRACT DETAILS: Describe what this function does. |
| `CONTRACT FUNCTION 2` | CONTRACT PARAMS | CONTRACT RETURN TYPE | CONTRACT DETAILS: Describe what this function does. |

---

## Building

```bash
cargo build --target wasm32-unknown-unknown --release
```

The compiled `.wasm` file will be output to `target/wasm32-unknown-unknown/release/example_contract.wasm`.

CONTRACT DETAILS: Replace `example_contract` with your crate's lib name from `Cargo.toml`.

---

## Testing

```bash
cargo test
```

CONTRACT DETAILS: Describe what the tests cover and any test-specific setup required.

---

## Usage with Stellar Suite

To register this template for automatic detection in the Stellar Suite sidebar, add the following entry to your workspace's `stellar-suite.templates.json`:

```json
{
  "version": "1",
  "templates": [
    {
      "id": "CONTRACT DETAILS: your-template-id",
      "displayName": "CONTRACT DETAILS: Your Template Display Name",
      "category": "CONTRACT DETAILS: category",
      "description": "CONTRACT DETAILS: short description",
      "keywords": ["CONTRACT FUNCTION 1", "CONTRACT FUNCTION 2"],
      "dependencies": ["soroban-sdk"],
      "actions": [
        {
          "id": "CONTRACT DETAILS: action-id",
          "label": "CONTRACT DETAILS: Action Label"
        }
      ]
    }
  ]
}
```

The `keywords` field should match the public function names in your `src/lib.rs` — this is how `contractTemplateService.ts` detects which template a contract belongs to.

---

## Troubleshooting

CONTRACT DETAILS: Add template-specific troubleshooting steps here.

| Issue | Cause | Fix |
|---|---|---|
| CONTRACT DETAILS: describe a common issue | CONTRACT DETAILS: describe the cause | CONTRACT DETAILS: describe the fix |

For general template issues, see the [templates/README.md](../README.md#troubleshooting) troubleshooting section.

---

## License

Apache-2.0 — CONTRACT DETAILS: Update if using a different license.
