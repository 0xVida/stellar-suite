# Sidebar Export File Format Specification

**Version:** 1.0
**Last updated:** 2026-02-20

---

## Overview

The Stellar Suite sidebar export file captures the contract list and associated configurations from a workspace. It enables:

- **Sharing** contract setups across workspaces or team members.
- **Backing up** sidebar organization and deployment records.
- **Migrating** configurations between projects.

The file is a standard JSON document with the `.json` extension.

---

## JSON Schema

```json
{
  "version": "1.0",
  "exportedAt": "2026-02-20T10:00:00.000Z",
  "workspaceId": "my-stellar-project",
  "contracts": [
    {
      "id": "CABCDEF...",
      "name": "hello_world",
      "address": "CABCDEF...",
      "network": "testnet",
      "config": {
        "source": "dev",
        "isPinned": true,
        "localVersion": "0.1.0",
        "deployedVersion": "0.1.0"
      }
    }
  ]
}
```

---

## Field Reference

### Root Fields

| Field         | Type     | Required | Description                                         |
|-------------- |----------|----------|-----------------------------------------------------|
| `version`     | `string` | ✅       | Format version. Must be `"1.0"`.                    |
| `exportedAt`  | `string` | ✅       | ISO 8601 timestamp of when the export was created.  |
| `workspaceId` | `string` | ✅       | Human-readable identifier for the source workspace. |
| `contracts`   | `array`  | ✅       | Array of `ExportedContract` objects (see below).    |

### ExportedContract

| Field     | Type     | Required | Description                                              |
|-----------|----------|----------|----------------------------------------------------------|
| `id`      | `string` | ✅       | Unique identifier. Usually the on-chain contract ID.     |
| `name`    | `string` | ✅       | Human-readable contract name (from Cargo.toml).          |
| `address` | `string` | ✅       | On-chain address. Empty string if not yet deployed.      |
| `network` | `string` | ✅       | Target network (see **Valid Networks** below).            |
| `config`  | `object` | ❌       | Optional contract-level configuration (see below).       |

### ExportedContractConfig

| Field             | Type      | Required | Description                                   |
|-------------------|-----------|----------|-----------------------------------------------|
| `source`          | `string`  | ❌       | Source identity (e.g. `"dev"`).               |
| `isPinned`        | `boolean` | ❌       | Whether the contract is pinned in the sidebar.|
| `localVersion`    | `string`  | ❌       | Version declared in Cargo.toml.              |
| `deployedVersion` | `string`  | ❌       | Version at last deployment.                  |

Additional keys are allowed in `config` and will be preserved during import.

---

## Valid Networks

| Value          | Description                   |
|----------------|-------------------------------|
| `testnet`      | Stellar public testnet        |
| `mainnet`      | Stellar public mainnet        |
| `futurenet`    | Stellar Futurenet             |
| `localnet`     | Local development network     |
| `standalone`   | Standalone custom network     |

Unrecognized network values generate a **warning** (not an error) during import to allow forward compatibility.

---

## Versioning Strategy

- The `version` field uses **semver-style** strings: `"MAJOR.MINOR"`.
- **MAJOR** increments indicate breaking schema changes. Old importers **must reject** unsupported major versions.
- **MINOR** increments indicate additive, non-breaking changes (new optional fields). Old importers **should accept** files with the same major version.

### Current Supported Versions

| Version | Status   | Notes                        |
|---------|----------|------------------------------|
| `1.0`   | Current  | Initial release.             |

### Backward Compatibility

- An importer supporting version `1.x` **must** accept any `1.y` file where `y >= 0`.
- Unknown fields in `config` are preserved (not stripped).
- Unknown top-level fields are ignored during validation.

---

## Security Considerations

- The export file **must not** contain:
  - Secret keys or mnemonics.
  - Workspace-specific filesystem paths.
  - Authentication tokens.
- The `id` and `address` fields contain **public** on-chain identifiers only.
- The `workspaceId` contains a user-chosen label, not an internal path.

---

## Import Validation

During import, the following checks are performed:

1. **Structural validation** — root fields present, `contracts` is an array.
2. **Type validation** — each contract has correct field types.
3. **Network validation** — network values checked against known list (warning for unknown).
4. **Duplicate detection** — duplicate IDs and addresses flagged within the file and against existing sidebar state.
5. **Version check** — unsupported versions are rejected.

### Conflict Resolution

When an imported contract has the same ID or address as an existing contract, the user is offered:

| Action       | Behavior                                              |
|--------------|-------------------------------------------------------|
| `skip`       | Do not import the conflicting contract.               |
| `overwrite`  | Replace the existing contract with the imported one.  |
| `rename`     | Import with a new name (user-specified).              |

---

## Example Files

### Minimal valid export

```json
{
  "version": "1.0",
  "exportedAt": "2026-02-20T10:00:00.000Z",
  "workspaceId": "my-project",
  "contracts": []
}
```

### Single deployed contract

```json
{
  "version": "1.0",
  "exportedAt": "2026-02-20T10:00:00.000Z",
  "workspaceId": "stellar-dapp",
  "contracts": [
    {
      "id": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1",
      "name": "token_contract",
      "address": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1",
      "network": "testnet",
      "config": {
        "source": "alice",
        "isPinned": true,
        "localVersion": "1.2.0",
        "deployedVersion": "1.1.0"
      }
    }
  ]
}
```
