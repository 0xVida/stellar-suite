# Stellar Suite Contract Templates

## Overview

This folder contains Soroban smart contract templates for the Stellar Suite VS Code extension. Each template is a standalone Rust project scaffold that developers can use as a starting point when building new Stellar smart contracts.

### How Templates Work

Templates are source-code scaffolds — not consumed directly by the extension at runtime. The extension's `contractTemplateService.ts` detects contract types by pattern-matching on your Rust source code and `Cargo.toml`. To register a template for sidebar detection in your workspace, you also need to add an entry to `stellar-suite.templates.json` (see [Usage Examples](#usage-examples)).

### Relationship to the Extension

| Component | Purpose |
|---|---|
| `templates/` (this folder) | Source scaffolds for starting new contracts |
| `stellar-suite.templates.json` | Runtime config that tells the extension how to detect and act on templates |
| `contractTemplateService.ts` | Extension service that reads detection config and classifies contracts |

Future template folders (`token/`, `escrow/`, `voting/`, etc.) will be added in separate issues (4-11). This folder currently contains one `example/` template with placeholder content to demonstrate the structure.

---

## Folder Structure

```
templates/
├── README.md                  # This file — documentation hub
├── .gitignore                 # Rust artifact exclusions
└── example/                   # Example template with placeholder content
    ├── template.json          # Template metadata (schema reference)
    ├── Cargo.toml             # Rust project configuration
    ├── README.md              # Template-specific documentation
    ├── src/
    │   └── lib.rs             # Contract implementation
    └── tests/
        └── test.rs            # Contract tests
```

When real templates are added they follow the same layout:

```
templates/
├── README.md
├── .gitignore
├── example/                   # Scaffold/reference template
└── token-contract/            # Real template (added in issue #4)
    ├── template.json
    ├── Cargo.toml
    ├── README.md
    ├── src/
    │   └── lib.rs
    └── tests/
        └── test.rs
```

### File Descriptions

| File | Description |
|---|---|
| `template.json` | Metadata describing the template: name, category, version, functions, dependencies |
| `Cargo.toml` | Rust project manifest. Must include `crate-type = ["cdylib"]` for WASM output |
| `src/lib.rs` | Main contract implementation using the Soroban SDK |
| `tests/test.rs` | Integration tests using `soroban-sdk` test utilities |
| `README.md` | Template-specific documentation: functions, build steps, usage |

---

## Template Metadata (`template.json` Schema)

Every template folder must contain a `template.json` file. Below is the complete field specification.

### Required Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Template identifier. Must be lowercase with hyphens and match the folder name exactly (e.g., `"token-contract"` for `templates/token-contract/`) |
| `displayName` | string | Human-readable name shown in documentation (e.g., `"Token Contract"`) |
| `description` | string | One-to-two sentence explanation of what the template implements |
| `version` | string | Semantic version in `MAJOR.MINOR.PATCH` format (e.g., `"0.1.0"`) |
| `category` | string | Template category. Must be one of: `token`, `escrow`, `voting`, `nft`, `multisig`, `staking`, `auction`, `oracle` |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `author` | string | Author or team name |
| `tags` | array of strings | Searchable tags for discoverability (e.g., `["fungible", "transfer", "mint"]`) |
| `dependencies` | object | Key-value map of Rust crate names to version strings (e.g., `{ "soroban-sdk": "20.0.0" }`) |
| `functions` | array of strings | Names of primary public contract functions (e.g., `["transfer", "mint", "burn"]`) |
| `examples` | array of strings | Short usage description strings or reference links |
| `license` | string | SPDX license identifier (e.g., `"Apache-2.0"`) |

### Annotated Example

```json
{
  "name": "token-contract",
  "displayName": "Token Contract",
  "description": "Fungible token contract following the Soroban token interface.",
  "version": "0.1.0",
  "category": "token",
  "author": "Stellar Suite Contributors",
  "tags": ["fungible", "transfer", "mint", "burn"],
  "dependencies": {
    "soroban-sdk": "20.0.0",
    "soroban-token-sdk": "20.0.0"
  },
  "functions": ["mint", "transfer", "burn", "balance", "approve", "allowance"],
  "examples": ["Transfer 100 tokens from Alice to Bob"],
  "license": "Apache-2.0"
}
```

### Validation Rules

- `name` must exactly match the folder name (case-sensitive, lowercase with hyphens)
- `version` must be a valid semver string (`x.y.z`)
- `category` must be one of the eight supported values listed above
- `dependencies` values must be valid semver strings or semver ranges

---

## Adding New Templates

Follow these steps to add a new contract template:

1. **Create the folder.** Use lowercase with hyphens matching your intended `name` value:
   ```bash
   mkdir templates/my-contract
   mkdir templates/my-contract/src
   mkdir templates/my-contract/tests
   ```

2. **Copy the example structure** as a starting point:
   ```bash
   cp templates/example/template.json templates/my-contract/template.json
   cp templates/example/Cargo.toml    templates/my-contract/Cargo.toml
   cp templates/example/README.md     templates/my-contract/README.md
   cp templates/example/src/lib.rs    templates/my-contract/src/lib.rs
   cp templates/example/tests/test.rs templates/my-contract/tests/test.rs
   ```

3. **Edit `template.json`.** Replace all placeholder values:
   - Set `name` to match your directory name exactly
   - Set `category` to one of the eight valid categories
   - Update `displayName`, `description`, `author`, `tags`, `functions`

4. **Edit `Cargo.toml`.** Set the crate `name` and lib `name`. Add all required Soroban SDK dependencies under `[dependencies]`.

5. **Implement the contract** in `src/lib.rs`. Replace the placeholder struct and function with your contract logic.

6. **Write tests** in `tests/test.rs`. See [Testing Requirements](#testing-requirements) for minimum coverage expectations.

7. **Update `README.md`** with real descriptions, function signatures, parameters, return types, and usage examples.

8. **Build locally** to verify compilation:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ```

9. **Run tests** to verify correctness:
   ```bash
   cargo test
   ```

10. **Register the template** with the extension (optional, for sidebar detection). Add an entry to `stellar-suite.templates.json` at the project root — see [Usage Examples](#usage-examples).

11. **Submit a pull request.** Follow the PR title format: `feat: add <category> contract template (<name>)`.

---

## Versioning

Templates use [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

### Version Increment Rules

| Version Part | When to Increment | Examples |
|---|---|---|
| **MAJOR** | Breaking changes to the public contract interface (function signatures removed or changed, storage layout changes) | `0.x.x` → `1.0.0` |
| **MINOR** | New non-breaking functions or features added to the contract | `0.1.0` → `0.2.0` |
| **PATCH** | Bug fixes, documentation improvements, refactoring with no interface change | `0.1.0` → `0.1.1` |

### Versioning Guidelines

- All new templates start at `0.1.0`, signalling pre-stable status
- Increment the version in both `template.json` and `Cargo.toml` together
- Major version `0` indicates the template interface may still change; `1.0.0` signals a stable public API
- Document breaking changes in the template's `README.md` under a **Changelog** section

### Breaking Change Guidelines

A change is **breaking** if it:
- Removes a public function
- Changes a function's parameter types or order
- Changes a function's return type
- Modifies persistent storage keys or layout in a way that invalidates existing on-chain state

---

## Template Categories

All templates must belong to one of the following categories. The `category` field in `template.json` must exactly match one of these values.

| Category | Description | Example Use Cases |
|---|---|---|
| `token` | Fungible token contracts | ERC-20 equivalents, stablecoins, reward tokens, utility tokens |
| `escrow` | Conditional fund release contracts | Freelance payment, atomic swap, time-locked funds, milestone-based release |
| `voting` | Governance and proposal contracts | DAO voting, simple ballot, proposal lifecycle, on-chain referenda |
| `nft` | Non-fungible token contracts | Digital art, collectibles, in-game assets, certificates |
| `multisig` | Multi-signature authorisation contracts | Team treasury, multi-party approval workflows, threshold signatures |
| `staking` | Token staking and reward distribution | Liquidity mining, validator delegation, yield farming |
| `auction` | Bidding and auction mechanisms | English auction, sealed-bid, Dutch auction, reserve-price auctions |
| `oracle` | Off-chain data feed contracts | Price feeds, randomness, real-world event data, sports scores |

The `contractTemplateService.ts` uses the `category` string for grouping and sidebar display. Any value outside this list will cause the template to appear uncategorised in the extension.

---

## Testing Requirements

All templates must include tests in `tests/test.rs` before a PR is merged.

### Minimum Coverage

- One **happy-path** test per public function (verifies correct output given valid inputs)
- One **error-path** test per public function that can return an error (verifies correct error given invalid inputs or edge cases)

### Test Structure

Tests must use `soroban-sdk` test utilities. Enable them in `[dev-dependencies]`:

```toml
[dev-dependencies]
soroban-sdk = { version = "20.0.0", features = ["testutils"] }
```

Basic test pattern:

```rust
#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Env as _, Env};
    use crate::{MyContract, MyContractClient};

    #[test]
    fn test_my_function_happy_path() {
        let env = Env::default();
        let contract_id = env.register_contract(None, MyContract);
        let client = MyContractClient::new(&env, &contract_id);

        let result = client.my_function(&arg1, &arg2);
        assert_eq!(result, expected_value);
    }
}
```

### Test Rules

- Tests must pass with `cargo test` before a PR is merged
- Tests must not require network access or depend on deployed contract state
- Tests must not use hard-coded addresses or keys that could conflict across environments
- Use `Env::default()` for isolated test environments

---

## Contribution Guidelines

### Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Template folder | Lowercase with hyphens | `token-contract`, `simple-escrow` |
| `name` in `template.json` | Matches folder name exactly | `"token-contract"` |
| Rust struct names | `CamelCase` | `TokenContract` |
| Rust function names | `snake_case` | `fn transfer(...)` |
| Rust file names | `snake_case` | `lib.rs`, `test.rs` |

### Template Self-Containment

Each template must be **fully self-contained**:
- No references to files outside the template's own folder
- No shared code between templates (copy-and-own is preferred over cross-template imports)
- All required dependencies declared in the template's own `Cargo.toml`

### What to Avoid

- Do not check in compiled artifacts (`target/`, `*.wasm`) — these are excluded by `templates/.gitignore`
- Do not commit `Cargo.lock` for library crates (excluded by default in `.gitignore`)
- Do not add templates that duplicate existing template categories without a clearly different use case

### PR Requirements

- PR title format: `feat: add <category> contract template (<name>)`
  - Example: `feat: add token contract template (token-contract)`
- Include the `displayName` and `category` from `template.json` in the PR description
- Link to the relevant issue in the PR description
- Ensure all tests pass locally before opening a PR

---

## Usage Examples

### How the Extension Detects Templates

The Stellar Suite sidebar automatically classifies contracts using `contractTemplateService.ts`. It works by:

1. Scanning your contract's `src/lib.rs` for public function names
2. Scanning your `Cargo.toml` for dependency names
3. Comparing against keyword lists defined in `stellar-suite.templates.json`
4. Assigning the best-matching template with a confidence score

### Registering a Template with the Extension

To enable automatic detection for your template, add an entry to `stellar-suite.templates.json` in the project root. The `keywords` field should match the public function names in your `src/lib.rs`:

```json
{
  "version": "1",
  "templates": [
    {
      "id": "token-contract",
      "displayName": "Token Contract",
      "category": "token",
      "description": "Fungible token contract following the Soroban token interface.",
      "keywords": ["transfer", "mint", "burn", "balance", "approve", "allowance"],
      "dependencies": ["soroban-sdk", "soroban-token-sdk"],
      "actions": [
        { "id": "token-contract.transfer", "label": "Transfer Tokens" },
        { "id": "token-contract.mint", "label": "Mint Tokens" },
        { "id": "token-contract.burn", "label": "Burn Tokens" }
      ]
    }
  ]
}
```

### Fetching and Using a Template

1. Navigate to the `templates/<template-name>/` folder
2. Copy the folder into your Soroban workspace
3. Replace placeholder content with your implementation (search for `CONTRACT DETAILS:` and `TEST DETAILS:`)
4. Build and test as described in the template's `README.md`
5. Optionally add a detection entry to `stellar-suite.templates.json` for sidebar integration

### End-to-End Example

```bash
# 1. Copy the example template as a starting point
cp -r templates/example my-workspace/contracts/my-contract

# 2. Edit template.json, Cargo.toml, src/lib.rs, tests/test.rs
cd my-workspace/contracts/my-contract

# 3. Build the contract
cargo build --target wasm32-unknown-unknown --release

# 4. Run tests
cargo test

# 5. Deploy using Stellar Suite (from VS Code sidebar or Cmd+Alt+D)
```

---

## Troubleshooting

### Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| Template not detected by extension | `keywords` in `stellar-suite.templates.json` do not match function names in `src/lib.rs` | Add the exact `fn` name string (without `fn ` prefix) as a keyword entry |
| `cargo build` fails: WASM target missing | Rust WASM target not installed | Run `rustup target add wasm32-unknown-unknown` |
| Category shows as `Unknown` in sidebar | `minScore` threshold not reached — too few matching keywords | Add more matching function names to the `keywords` array in `stellar-suite.templates.json` |
| `.wasm` file committed to git | `templates/.gitignore` not applied to subfolder | Verify `templates/.gitignore` exists; run `git rm --cached <file>.wasm` if already committed |
| `cargo build` fails: `soroban-sdk` not found | Dependency version mismatch or network issue | Run `cargo update` or pin to a specific version in `Cargo.toml` |
| Tests fail to compile | Missing `testutils` feature in `[dev-dependencies]` | Ensure `soroban-sdk = { version = "...", features = ["testutils"] }` is in `[dev-dependencies]` |
| Extension shows wrong template category | Multiple keyword matches causing wrong classification | Use more specific `requiredKeywords` in `stellar-suite.templates.json`, or adjust function names to be category-specific |

### Getting Help

- Review [contractTemplateService.ts](../src/services/contractTemplateService.ts) to understand the detection algorithm
- Check the extension output panel (View → Output → Stellar Suite) for detection logs
- Open an issue at the project repository if the problem persists
