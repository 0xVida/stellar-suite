# NFT Contract Template

This template implements a standard Non-Fungible Token (NFT) contract for the Soroban smart contract platform. It provides the core functionality required to mint, transfer, and manage NFTs with embedded royalty capabilities.

## Features

- **Minting**: Authorized minting of new tokens with unique IDs.
- **Transfers**: Transfer of token ownership between addresses.
- **Metadata Management**: On-chain storage of token metadata (Name, Symbol, URI) adhering to standard formats.
- **Royalties**: Support for both global and per-token royalty percentages to facilitate secondary market sales.
- **Ownership Tracking**: Immutable ledger mapping for token owners.

## NFT Metadata Standard (Example)

When creating NFTs, your off-chain `uri` should resolve to a JSON file following standards similar to existing NFT platforms. Here is an example of what that off-chain data might look like:

```json
{
  "name": "Stellar Suite NFT #1",
  "description": "The first official NFT minted during the Stellar Suite showcase.",
  "image": "ipfs://QmYourImageHashHere",
  "attributes": [
    {
      "trait_type": "Background",
      "value": "Cosmic Purple"
    },
    {
      "trait_type": "Eyes",
      "value": "Laser"
    }
  ]
}
```

The on-chain `TokenMetadata` stores a `name`, `symbol`, and the above `uri` pointer.

## Contract Interface Overview

### Administrative Functions

- `initialize(env, admin, name, symbol, base_uri)`: Initializes the global details of the NFT collection. Asserts that the contract hasn't been initialized before.
- `mint(env, to, uri)`: Mints a new NFT by assigning an ID to an owner and storing their metadata pointer. Can only be invoked by the setup admin.
- `set_royalty(env, receiver, amount)`: Sets the global secondary sales royalty. `amount` is in basis points (e.g., 500 = 5%).
- `set_token_royalty(env, token_id, receiver, amount)`: Sets a token-specific royalty value overriding the global setup. Called by the token's respective owner.

### Public Read / Interact Functions

- `transfer(env, from, to, token_id)`: Move a specific NFT ID from one user to another. Validates ownership.
- `get_owner(env, token_id)`: Fetches the current owner address of a specific Token ID.
- `get_metadata(env, token_id)`: Retrieves the `TokenMetadata` structure containing names, symbols, and token-specific URIs.
- `get_royalty(env, token_id, sale_price)`: Calculates the royalty slice needed. Returns `(Receiver, royalty_amount)` corresponding to `sale_price`.

## Build and Test

To build the contract, run:
```bash
cargo build --target wasm32-unknown-unknown --release
```

To run the full test suite:
```bash
cargo test
```

## Security Patterns

- **Initialization Check**: Checks for `DataKey::Admin` ensuring `initialize()` is only ran once.
- **Access Control via Require Auth**: Prevents unauthorized addresses from minting NFTs or modifying metadata/royalty configurations via `.require_auth()`.
- **Token Existence**: Fetches on-chain token mapping aggressively defaulting to `panic!("Token does not exist")` to trap improper access.
