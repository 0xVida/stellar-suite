# Simulation Features in Stellar Suite

## Overview

Stellar Suite provides powerful transaction simulation capabilities for Soroban smart contracts. Simulations allow you to invoke contract functions in a sandboxed environment to preview results, inspect resource usage, and debug issues **without** submitting real on-chain transactions. This guide covers every aspect of the simulation workflow, from entering parameters to interpreting results and leveraging advanced features like offline simulation, result export, resource profiling, and state-diff analysis.

## Table of Contents

- [Simulation Workflow](#simulation-workflow)
- [Parameter Input](#parameter-input)
- [Running a Simulation](#running-a-simulation)
- [Result Interpretation](#result-interpretation)
- [Advanced Simulation Options](#advanced-simulation-options)
- [Simulation Examples](#simulation-examples)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)

---

## Simulation Workflow

The simulation workflow has four stages:

```
1. Specify Contract ID
       │
       ▼
2. Select / Enter Function Name
       │
       ▼
3. Provide Function Parameters
       │
       ▼
4. Review Results in Simulation Panel
```

### Step-by-Step

1. **Trigger the command** via any of the following:
   - Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) → **Stellar Suite: Simulate Soroban Transaction**
   - Keyboard shortcut `Ctrl+Alt+S` (macOS: `Cmd+Alt+S`) when the Stellar Suite sidebar is focused
   - Click the **Simulate Transaction** (play icon) button in the sidebar

2. **Enter the Contract ID** – the extension auto-detects the last used contract ID from workspace state, or searches your workspace files (`.env`, `stellar.toml`, etc.) for a valid contract address. A valid Soroban contract ID starts with `C` and is 56 characters long (e.g., `CABC...XYZ`).

3. **Choose the function** – if the Stellar CLI is available, the extension introspects the contract and presents a quick-pick list of available functions with their parameter names. If introspection is not available, you can type the function name manually.

4. **Provide parameters** – the extension prompts for each parameter individually (with type hints and required/optional indicators) when introspection data is available. Otherwise, you enter a single JSON object of key-value pairs.

5. **View results** – a dedicated **Simulation Panel** opens showing success/failure status, return value, resource usage, and transaction details.

---

## Parameter Input

### Automatic Parameter Discovery

When `stellarSuite.useLocalCli` is `true` (the default) and the Stellar CLI is installed, the extension calls the CLI's built-in `--help` flag on the target contract to discover:

- Function names and descriptions
- Parameter names, types, and whether they are required or optional

```
┌──────────────────────────────────────────────────────┐
│  Select a function to invoke                          │
│                                                      │
│  hello        Greets the caller                      │
│               Parameters: to                         │
│                                                      │
│  increment    Increments the counter                 │
│               Parameters: amount                     │
│                                                      │
│  get_balance  Returns account balance                │
│               No parameters                          │
└──────────────────────────────────────────────────────┘
```

Each parameter is then prompted individually with its type hint:

```
Enter value for parameter: to (String)
```

### Manual JSON Input

When introspection is unavailable (e.g., CLI not installed or introspection fails), you enter parameters as a single JSON object:

```json
{
  "to": "GBCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRS",
  "amount": 100
}
```

**Supported value types:**

| JSON Type | Soroban Type | Example |
|---|---|---|
| `"string"` | `String`, `Symbol`, `Address` | `"hello"` |
| `123` | `i32`, `i64`, `i128`, `u32`, `u64`, `u128` | `42` |
| `true`/`false` | `Bool` | `true` |
| `[...]` | `Vec<T>` | `[1, 2, 3]` |
| `{...}` | `Map<K,V>`, Struct | `{"key": "val"}` |

### Input Validation

- **Contract ID** – must match the pattern `^C[A-Z0-9]{55}$` (56 characters, starts with `C`).
- **Function name** – must be a non-empty string.
- **Required parameters** – the extension validates that required parameters are provided; cancelling a required parameter aborts the simulation.
- **JSON parsing** – if you enter manual JSON that is malformed, the extension shows an error and does **not** proceed.

```typescript
// Example: The extension validates contract ID format before proceeding
// (src/commands/simulateTransaction.ts)
validateInput: (value: string) => {
    if (!value || value.trim().length === 0) {
        return 'Contract ID is required';
    }
    if (!value.match(/^C[A-Z0-9]{55}$/)) {
        return 'Invalid contract ID format (should start with C and be 56 characters)';
    }
    return null;
}
```

---

## Running a Simulation

### Via Local CLI (Default)

When `stellarSuite.useLocalCli` is `true`, the extension builds and executes a CLI command:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <SOURCE_IDENTITY> \
  --network <NETWORK> \
  -- <FUNCTION_NAME> --<PARAM_NAME> <PARAM_VALUE> ...
```

The CLI path is resolved in this order:
1. Value of `stellarSuite.cliPath` setting (default: `"stellar"`)
2. Auto-detection at common paths: `~/.cargo/bin/stellar`, `/usr/local/bin/stellar`, `/opt/homebrew/bin/stellar`

### Via RPC Endpoint

When `stellarSuite.useLocalCli` is `false`, the extension sends a JSON-RPC request to the configured RPC endpoint (`stellarSuite.rpcUrl`, default: `https://soroban-testnet.stellar.org:443`):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "simulateTransaction",
  "params": {
    "transaction": {
      "contractId": "<CONTRACT_ID>",
      "functionName": "<FUNCTION_NAME>",
      "args": [{ "value": { "to": "world" } }]
    }
  }
}
```

### Progress Reporting

A progress notification tracks each phase:

| Phase | Progress | Message |
|---|---|---|
| Start | 0% | Initializing... |
| Backend selection | 30% | Using Stellar CLI... / Connecting to RPC... |
| Execution | 50% | Executing simulation... |
| Completion | 100% | Complete |

---

## Result Interpretation

Simulation results are displayed in a dedicated **Simulation Panel** webview that opens automatically.

### Successful Simulation

```
┌────────────────────────────────────────────────────┐
│  [OK] Success                                       │
├────────────────────────────────────────────────────┤
│  Transaction Details                                │
│  ───────────────                                    │
│  Contract ID:  CABC...XYZ                           │
│  Function:     hello                                │
│  Arguments:    [{"to": "world"}]                    │
├────────────────────────────────────────────────────┤
│  Return Value                                       │
│  ────────────                                       │
│  ["Hello", "world"]                                 │
├────────────────────────────────────────────────────┤
│  Resource Usage                                     │
│  ──────────────                                     │
│  CPU Instructions:  1,234,567                       │
│  Memory:            45.67 KB                        │
└────────────────────────────────────────────────────┘
```

**Key result fields** (from `SimulationResult`):

```typescript
// Defined in src/services/sorobanCliService.ts and src/services/rpcService.ts
interface SimulationResult {
    success: boolean;        // Whether the invocation succeeded
    result?: any;            // Return value from the contract function
    error?: string;          // Error message if simulation failed
    resourceUsage?: {
        cpuInstructions?: number;  // CPU instruction count
        memoryBytes?: number;      // Memory usage in bytes
    };
}
```

- **`success`** – `true` when the contract function executed without error.
- **`result`** – the decoded return value of the contract function (may be a primitive, array, or object).
- **`resourceUsage.cpuInstructions`** – total CPU instructions consumed (lower is better).
- **`resourceUsage.memoryBytes`** – total memory allocated in bytes (displayed as KB in the panel).

### Failed Simulation

```
┌────────────────────────────────────────────────────┐
│  [FAIL] Failed                                      │
├────────────────────────────────────────────────────┤
│  Transaction Details                                │
│  ───────────────                                    │
│  Contract ID:  CABC...XYZ                           │
│  Function:     transfer                             │
│  Arguments:    [{"from": "GA...", "amount": 1000}]  │
├────────────────────────────────────────────────────┤
│  Error                                              │
│  ─────                                              │
│  HostError: contract execution failed:              │
│  insufficient balance for transfer                  │
└────────────────────────────────────────────────────┘
```

The error message typically comes from the contract's own error handling or from the Soroban runtime. Common failure categories include invalid arguments, insufficient permissions, and contract logic errors.

---

## Advanced Simulation Options

### Configuration Settings

All simulation-related settings are under the `stellarSuite.*` namespace. Open **Settings** (`Cmd+,` / `Ctrl+,`) and search for "stellarSuite":

| Setting | Type | Default | Description |
|---|---|---|---|
| `stellarSuite.useLocalCli` | `boolean` | `true` | Use local Stellar CLI instead of RPC endpoint |
| `stellarSuite.cliPath` | `string` | `"stellar"` | Path to Stellar CLI executable |
| `stellarSuite.source` | `string` | `"dev"` | Source identity for contract invocations |
| `stellarSuite.network` | `string` | `"testnet"` | Target network (`testnet`, `mainnet`, etc.) |
| `stellarSuite.rpcUrl` | `string` | `"https://soroban-testnet.stellar.org:443"` | Stellar RPC endpoint URL |
| `stellarSuite.simulationCacheEnabled` | `boolean` | `true` | Enable caching for simulation results |
| `stellarSuite.simulationCacheTtlSeconds` | `number` | `60` | Cache time-to-live in seconds |
| `stellarSuite.simulationCacheMaxEntries` | `number` | `200` | Maximum number of cached results |

### Simulation History

Stellar Suite records every simulation and provides commands to manage your history:

| Command | Description |
|---|---|
| `Stellar Suite: Show Simulation History` | View all past simulation results |
| `Stellar Suite: Search Simulation History` | Search history by contract ID, function name, or outcome |
| `Stellar Suite: Clear Simulation History` | Delete all recorded simulation history |
| `Stellar Suite: Export Simulation History` | Export history to JSON, CSV, or PDF |
| `Stellar Suite: Import Simulation History` | Import previously exported history |

### Simulation Replay

Re-run past simulations with or without modifications:

| Command | Description |
|---|---|
| `Stellar Suite: Replay Simulation` | Re-execute a previous simulation with identical parameters |
| `Stellar Suite: Replay Simulation with Modifications` | Re-execute with modified parameters |
| `Stellar Suite: Batch Replay Simulations` | Replay multiple simulations at once |
| `Stellar Suite: Export Replay Results` | Export replay output |

### Simulation Comparison

Compare two or more simulation results side-by-side:

| Command | Description |
|---|---|
| `Stellar Suite: Compare Simulations` | Compare any two simulations |
| `Stellar Suite: Compare With Previous Simulation` | Compare the latest run against the previous one |
| `Stellar Suite: Compare Simulations (Same Contract)` | Filter comparison to simulations on the same contract |
| `Stellar Suite: Compare Simulations (Same Function)` | Filter comparison to the same function |
| `Stellar Suite: Show Simulation Diff` | Show a detailed diff view |

### Resource Profiling
Detailed resource usage analysis per simulation:

```typescript
// Defined in src/types/resourceProfile.ts
interface ResourceProfile {
    id: string;
    simulationId?: string;
    contractId: string;
    functionName: string;
    network: string;
    usage: ResourceUsageSnapshot;       // CPU, memory, storage, time
    timeBreakdown: ExecutionTimeBreakdown; // setup, execution, storage, total
    warnings: ResourceWarning[];        // Threshold-based warnings
    createdAt: string;
    label?: string;
}
```

| Command | Description |
|---|---|
| `Stellar Suite: Show Resource Profile` | View resource profile for a simulation |
| `Stellar Suite: Compare Resource Profiles` | Compare resource usage across runs |
| `Stellar Suite: Show Resource Statistics` | View aggregate stats across all profiles |
| `Stellar Suite: Export Resource Profiles` | Export profiles for external analysis |
| `Stellar Suite: Clear Resource Profiles` | Delete all stored profiles |

**Resource warning thresholds** (configurable):

| Category | Warning Level | Critical Level |
|---|---|---|
| CPU Instructions | Configurable | Configurable |
| Memory (bytes) | Configurable | Configurable |
| Storage Ops | Configurable | Configurable |
| Execution Time (ms) | Configurable | Configurable |

### State Diff Analysis

Inspect how contract storage state changes after a simulation:

```typescript
// Defined in src/types/simulationState.ts
interface StateDiff {
    before: StateSnapshot;   // State before simulation
    after: StateSnapshot;    // State after simulation
    created: StateDiffChange[];   // Newly created entries
    modified: StateDiffChange[];  // Modified entries
    deleted: StateDiffChange[];   // Deleted entries
    unchangedKeys: string[];      // Keys that were not affected
    summary: StateDiffSummary;    // Counts of each change type
    hasChanges: boolean;          // Quick check if any state changed
}
```

Each `StateDiffChange` includes the key, contract ID, and both `beforeValue` and `afterValue` for easy comparison.

### Offline Simulation

Simulate transactions without an active network connection using cached contract data:

```typescript
// Defined in src/types/offlineSimulation.ts
interface OfflineSimulationOptions {
    allowStaleCache?: boolean;     // Use cached data even if expired
    maxCacheAgeMs?: number;        // Maximum acceptable cache age
    autoDetectOffline?: boolean;   // Detect offline mode automatically
    allowFuzzyMatching?: boolean;  // Fallback to similar cached contracts
}
```

Cached contracts store function signatures, WASM data, and ABI specs, so basic invocations can be simulated locally.

### Export Formats

Export simulation results in three formats:

```typescript
// Defined in src/types/simulationExport.ts
type ExportFormat = "json" | "csv" | "pdf";

interface ExportOptions {
    format: ExportFormat;
    outputPath: string;
    includeStateDiff?: boolean;       // default: true
    includeResourceUsage?: boolean;   // default: true
    prettify?: boolean;               // default: true (JSON only)
}
```

**JSON export** – full fidelity, round-trippable (import back into Stellar Suite)
**CSV export** – flat table format, ideal for spreadsheets and data analysis
**PDF export** – human-readable report with optional custom title

---

## Simulation Examples

### Example 1: Calling a "hello" Function

```
1. Command Palette → Stellar Suite: Simulate Soroban Transaction
2. Enter Contract ID:  CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
3. Select function:    hello
4. Enter parameter:    to = "world"
5. Result:             ["Hello", "world"]
```

**Equivalent CLI command:**

```bash
stellar contract invoke \
  --id CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --source dev \
  --network testnet \
  -- hello --to "world"
```

### Example 2: Token Transfer Simulation

```
1. Command Palette → Stellar Suite: Simulate Soroban Transaction
2. Enter Contract ID:  CCPGW3CJNDF5RBAKNQ5F2HF5LOSLLGZ73GKZPI4PR2FLGYU7FH2HZ5FI
3. Select function:    transfer
4. Enter parameters:
     from   = "GABC...XYZ"    (Address)
     to     = "GDEF...UVW"    (Address)
     amount = 1000             (i128)
5. Result (success):   null  (void return)
   Resource Usage:     CPU: 2,345,678 | Memory: 89.12 KB
```

**Manual JSON input (if introspection unavailable):**

```json
{
  "from": "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNO",
  "to": "GDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRS",
  "amount": 1000
}
```

### Example 3: Reading Contract State (No Parameters)

```
1. Command Palette → Stellar Suite: Simulate Soroban Transaction
2. Enter Contract ID:  CCPGW3CJNDF5RBAKNQ5F2HF5LOSLLGZ73GKZPI4PR2FLGYU7FH2HZ5FI
3. Select function:    get_balance
4. No parameters needed – leave default: {}
5. Result:             500000
```

### Example 4: Complex Struct Parameter

For functions that accept structs, provide nested JSON:

```json
{
  "config": {
    "admin": "GABC...XYZ",
    "threshold": 3,
    "signers": [
      "GABC...XYZ",
      "GDEF...UVW",
      "GHIJ...RST"
    ]
  }
}
```

### Example 5: Using RPC Mode Instead of CLI

```
1. Open Settings → stellarSuite.useLocalCli → false
2. Set stellarSuite.rpcUrl → "https://soroban-testnet.stellar.org:443"
3. Command Palette → Stellar Suite: Simulate Soroban Transaction
4. Enter Contract ID and function as usual
5. Results are returned via JSON-RPC instead of CLI
```

---

## Error Handling

### Error Categories

The extension classifies errors into the following categories and provides user-friendly messages via the `formatError` utility (`src/utils/errorFormatter.ts`):

| Error Category | Title | Common Causes |
|---|---|---|
| Command Not Found | `Command Not Found` | CLI not installed or not in PATH |
| Connection Error | `Connection Error` | Network issues, wrong RPC URL |
| Timeout | `Timeout` | Slow/unreachable RPC endpoint |
| Invalid Input | `Invalid Input` | Malformed contract ID, bad JSON |
| Contract Error | `Error (Simulation)` | Contract logic failure |

### CLI-Specific Errors

```typescript
// When the CLI binary cannot be found (src/services/sorobanCliService.ts)
{
    success: false,
    error: 'Stellar CLI not found at "stellar". Make sure it is installed and in your PATH, or configure the stellarSuite.cliPath setting.'
}
```

**Auto-detection fallback:** If the default `stellar` command fails, the extension searches common installation paths (`~/.cargo/bin/stellar`, `/usr/local/bin/stellar`, `/opt/homebrew/bin/stellar`) and suggests the found path in the error message.

### RPC-Specific Errors

```typescript
// Network error (src/services/rpcService.ts)
{
    success: false,
    error: 'Network error: Unable to reach RPC endpoint at https://soroban-testnet.stellar.org:443. Check your connection and rpcUrl setting.'
}

// Timeout error
{
    success: false,
    error: 'Request timed out. The RPC endpoint may be slow or unreachable.'
}

// HTTP error
{
    success: false,
    error: 'RPC request failed with status 503: Service Unavailable'
}
```

### Export Errors

Export operations return structured error objects:

```typescript
// Defined in src/types/simulationExport.ts
interface ExportError {
    code: ExportErrorCode;   // e.g., "SERIALIZATION_FAILED", "FILE_WRITE_FAILED"
    message: string;         // Human-readable description
    details?: Record<string, unknown>;
    suggestions?: string[];  // Actionable suggestions for the user
}
```

| Error Code | Description |
|---|---|
| `SERIALIZATION_FAILED` | Could not serialize data to the target format |
| `FILE_WRITE_FAILED` | Could not write file to disk |
| `VALIDATION_FAILED` | Data failed pre-export validation |
| `INVALID_PATH` | Output path is invalid or inaccessible |
| `MISSING_DATA` | Required data is missing from the simulation entry |
| `PDF_GENERATION_FAILED` | PDF rendering failed |
| `BATCH_PARTIAL_FAILURE` | Some entries in a batch export failed |

### Offline Simulation Errors

```typescript
// Defined in src/types/offlineSimulation.ts
interface OfflineSimulationError {
    code:
        | 'CONTRACT_NOT_CACHED'
        | 'FUNCTION_NOT_FOUND'
        | 'FUNCTION_MISMATCH'
        | 'INVALID_PARAMS'
        | 'OFFLINE_MODE_REQUIRED'
        | 'CACHE_VALIDATION_FAILED'
        | 'SIMULATION_FAILED'
        | 'UNKNOWN';
    message: string;
    details?: Record<string, unknown>;
}
```

---

## Troubleshooting

### Simulation Won't Start

**Symptoms:** Nothing happens after selecting "Simulate Soroban Transaction."

**Solutions:**

1. **Check that the extension is activated** – open the Stellar Suite sidebar in the Activity Bar. If you don't see it, reload VS Code.
2. **Verify the contract ID** – make sure it matches the pattern `C[A-Z0-9]{55}` (56 characters total). Copy it directly from the Stellar Laboratory or your deployment output.
3. **Ensure you did not cancel a prompt** – cancelling any input prompt (Contract ID, function name, or a required parameter) silently aborts the simulation by design.

### "Stellar CLI Not Found"

**Symptoms:** Error message says CLI is not found.

**Solutions:**

1. **Install the Stellar CLI:**
   ```bash
   cargo install stellar-cli
   ```
2. **Set the full path** in settings if the CLI is not in your system `PATH`:
   ```json
   {
     "stellarSuite.cliPath": "/Users/yourname/.cargo/bin/stellar"
   }
   ```
3. **Switch to RPC mode** as an alternative:
   ```json
   {
     "stellarSuite.useLocalCli": false
   }
   ```

### "Network Error" or "Connection Refused"

**Symptoms:** Simulation fails with a connection or network error.

**Solutions:**

1. **Check your internet connection** – ensure you can reach external endpoints.
2. **Verify the RPC URL** – default is `https://soroban-testnet.stellar.org:443`. Confirm this in settings.
3. **Switch to CLI mode** if the RPC endpoint is down:
   ```json
   {
     "stellarSuite.useLocalCli": true
   }
   ```
4. **Check for VPN or proxy interference** – some corporate networks block non-standard HTTPS ports.

### "Request Timed Out"

**Symptoms:** Simulation hangs for 30 seconds then reports a timeout.

**Solutions:**

1. **Try again later** – the Stellar testnet can experience high load.
2. **Use a different RPC endpoint** – configure `stellarSuite.rpcUrl` to a faster endpoint.
3. **Use CLI mode** – local CLI execution has a separate 30-second timeout and may be faster for simple invocations.

### "Invalid JSON" Error

**Symptoms:** Error appears when entering function arguments.

**Solutions:**

1. **Validate your JSON** – ensure it's a valid JSON object (not an array or primitive):
   ```json
   // Correct
   {"to": "world", "amount": 100}

   // Incorrect (missing quotes on keys)
   {to: "world", amount: 100}

   // Incorrect (trailing comma)
   {"to": "world", "amount": 100,}
   ```
2. **Use the parameter-by-parameter prompts** – if introspection is available, each parameter is entered individually, eliminating JSON syntax issues.

### Contract Function Not Listed

**Symptoms:** Quick-pick shows no functions or wrong functions.

**Solutions:**

1. **Verify the contract is deployed** on the selected network (`testnet` by default).
2. **Check the source identity** – `stellarSuite.source` must be a valid identity (default: `"dev"`).
3. **Enter the function name manually** – the extension falls back to a free-text input if introspection fails.
4. **Inspect CLI output** – open **View → Output → Stellar Suite** for detailed logs.

### Simulation Succeeds but Returns Unexpected Results

**Solutions:**

1. **Check parameter types** – numbers should not be quoted (`100`, not `"100"`) unless the contract expects a string.
2. **Verify the correct contract ID** – you may be invoking a different contract.
3. **Check the network** – ensure you're targeting the correct network where your contract is deployed.
4. **Review state** – use the State Diff feature to inspect what changed.

### Simulation Panel Not Displaying

**Symptoms:** Command runs but no panel appears.

**Solutions:**

1. **Check the editor layout** – the panel opens in the currently active editor column. Try closing split editors.
2. **Reload the window** – Command Palette → **Developer: Reload Window**.
3. **Check the Output channel** for errors.

---

## Best Practices

### 1. Always Simulate Before Deploying

Simulations are free and have no on-chain side effects. Use them to:
- Verify function arguments are correct
- Check resource usage before paying for a real transaction
- Catch contract logic errors early

### 2. Use the CLI Mode for Best Results

The local CLI provides richer introspection (function names, parameter types, descriptions) and works reliably without network dependency:

```json
{
  "stellarSuite.useLocalCli": true,
  "stellarSuite.cliPath": "stellar"
}
```

### 3. Keep Your CLI Updated

Run `stellar --version` periodically and update via:

```bash
cargo install stellar-cli --force
```

The extension checks CLI version compatibility automatically when `stellarSuite.cliVersionCheck.enabled` is `true`.

### 4. Leverage Simulation History

- **Replay** past simulations to quickly re-test after contract changes.
- **Compare** simulations to track how resource usage evolves over time.
- **Export** results for team reviews or CI integration.

### 5. Monitor Resource Usage

Use the **Resource Profiling** commands to track CPU, memory, and storage across simulation runs. Set custom warning thresholds to flag regressions early:

```typescript
// Resource warning example
{
    category: 'cpu',
    severity: 'warning',
    message: 'CPU instructions exceed warning threshold',
    actualValue: 5_000_000,
    threshold: 4_000_000
}
```

### 6. Use State Diffs for Debugging

When a contract function modifies storage, the State Diff feature shows exactly which keys were created, modified, or deleted:

```typescript
// StateDiffSummary example
{
    totalEntriesBefore: 10,
    totalEntriesAfter: 12,
    created: 2,
    modified: 1,
    deleted: 0,
    unchanged: 9,
    totalChanges: 3
}
```

### 7. Cache Simulation Results

Enable caching to avoid redundant RPC/CLI calls during iterative development:

```json
{
  "stellarSuite.simulationCacheEnabled": true,
  "stellarSuite.simulationCacheTtlSeconds": 60,
  "stellarSuite.simulationCacheMaxEntries": 200
}
```

Use **Stellar Suite: Clear Simulation Cache** when you need fresh results after a contract re-deployment.

### 8. Export for Team Collaboration

Export simulation results in JSON for programmatic consumption, CSV for spreadsheet analysis, or PDF for stakeholder reports:

```
Command Palette → Stellar Suite: Export Simulation History
→ Select format: JSON / CSV / PDF
→ Choose output path
→ Optionally include state diffs and resource usage
```

### 9. Use Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|---|---|---|
| Simulate Transaction | `Ctrl+Alt+S` | `Cmd+Alt+S` |
| Build Contract | `Ctrl+Alt+B` | `Cmd+Alt+B` |
| Deploy Contract | `Ctrl+Alt+D` | `Cmd+Alt+D` |
| Refresh Contracts | `Ctrl+Shift+R` | `Cmd+Shift+R` |

### 10. Keep Parameters in Version Control

For frequently-tested function calls, save your parameter sets in a file (e.g., `simulation-params.json`) and paste them when prompted:

```json
{
  "test_cases": {
    "hello_world": { "to": "world" },
    "transfer_100": { "from": "GA...", "to": "GB...", "amount": 100 },
    "initialize": { "admin": "GA...", "threshold": 2 }
  }
}
```


## Related Documentation

- [Contract Management](./contract-management.md) – Managing and organizing Soroban contracts
- [Getting Started](./getting-started.md) – Initial setup and configuration
- [Toast Notification System](./toast-notification-system.md) – Notification preferences and configuration
- [Performance Testing](./performance-testing.md) – Performance benchmarking and CI/CD integration
- [Sidebar Export Format](./sidebar-export-format.md) – Sidebar data export details

### API References

- `SorobanCliService` (`src/services/sorobanCliService.ts`) – CLI-based simulation execution
- `RpcService` (`src/services/rpcService.ts`) – RPC-based simulation execution
- `ContractInspector` (`src/services/contractInspector.ts`) – Contract function introspection
- `SimulationPanel` (`src/ui/simulationPanel.ts`) – Simulation result display
- `simulateTransaction` (`src/commands/simulateTransaction.ts`) – Main simulation command
- `SimulationResult` – Result interface (defined in both `sorobanCliService.ts` and `rpcService.ts`)
- `StateDiff` / `StateSnapshot` (`src/types/simulationState.ts`) – State diff types
- `ResourceProfile` / `ResourceWarning` (`src/types/resourceProfile.ts`) – Resource profiling types
- `ExportOptions` / `ExportResult` (`src/types/simulationExport.ts`) – Export types
- `OfflineSimulationOptions` (`src/types/offlineSimulation.ts`) – Offline simulation types

---

**Last Updated:** February 23, 2026
**Version:** 1.0.0