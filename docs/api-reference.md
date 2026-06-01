# API Reference — Stellar Suite IDE Internal Libraries

> **Issue #851** – Full API coverage for `/lib` and `/utils` modules with copy-pasteable samples for every major function.

---

## Table of Contents

### Internal Libraries (`lib/`)
- [sorobanRpc](#sorobanrpc-ts) — RPC communication with caching
- [contractAbiParser](#contractabiparser-ts) — Contract schema resolution
- [simulationDiff](#simulationdiff-ts) — State change diffing
- [gasProfiler](#gasprofiler-ts) — Resource usage profiling
- [errorTranslator](#errortranslator-ts) — Host error to human text
- [symbolIndexer](#symbolindexer-ts) — Cross-file symbol resolution
- [bindingsGenerator](#bindingsgenerator-ts) — TypeScript binding generation
- [rpcFailover](#rpcfailover-ts) — Multi-endpoint failover
- [rpcService](#rpcservice-ts) — Core RPC service layer
- [transactionExecution](#transactionexecution-ts) — Transaction builder and submitter
- [ciTemplates](#citemplates-ts) — CI/CD template generation
- [mathSafetyAnalyzer](#mathsafetyanalyzer-ts) — Static overflow analysis
- [sep41Detector](#sep41detector-ts) — SEP-41 token interface detection
- [contractInstantiator](#contractinstantiator-ts) — Contract deployment helper
- [scvalTransformer](#scvaltransformer-ts) — ScVal type coercion
- [compilationWorker](#compilationworker-ts) — WASM compilation worker
- [ai-chat](#ai-chat-ts) — AI chat integration

### Utilities (`utils/`)
- [XdrUtils](#xdrutils-ts) — XDR encode / decode
- [XdrValidator](#xdrvalidator-ts) — XDR schema validation
- [XdrChecksum](#xdrchecksum-ts) — Integrity verification
- [WasmLoader](#wasmloader-ts) — Secure WASM fetching with SRI
- [SecureFetcher](#securefetcher-ts) — Authenticated HTTP client
- [eventSubscriber](#eventsubscriber-ts) — Contract event streaming
- [friendbot](#friendbot-ts) — Testnet account funding
- [cargoParser](#cargoparser-ts) — Cargo.toml parsing
- [cargoAuditParser](#cargoauditparser-ts) — Security audit result parsing
- [clippyParser](#clippyparser-ts) — Clippy lint result parsing
- [coverageParser](#coverageparser-ts) — Test coverage parsing
- [searchWorkspace](#searchworkspace-ts) — Full-text workspace search
- [exportZip](#exportzip-ts) — Workspace ZIP export
- [idbStorage](#idbstorage-ts) — IndexedDB persistence
- [offlineQueue](#offlinequeue-ts) — Offline transaction queueing

---

## Internal Libraries (`lib/`)

---

### `sorobanRpc.ts`

High-level functions for communicating with Soroban RPC nodes with built-in response caching.

---

#### `fetchLatestLedger(network: string): Promise<LatestLedger>`

Fetches the latest confirmed ledger information for the given network.

**Parameters:**
| Name | Type | Description |
| :--- | :--- | :--- |
| `network` | `string` | Network identifier: `"testnet"`, `"mainnet"`, `"futurenet"` |

**Returns:** `Promise<LatestLedger>` — `{ sequence: number; protocolVersion: number; id: string }`

**Sample:**
```typescript
import { fetchLatestLedger } from '@/lib/sorobanRpc';

const ledger = await fetchLatestLedger('testnet');
console.log(`Latest ledger: #${ledger.sequence} (proto v${ledger.protocolVersion})`);
```

---

#### `fetchLedgerEntries(network: string, keys: string[]): Promise<{ entries: LedgerEntry[], latestLedger: number }>`

Fetches specific ledger entries by their XDR-encoded keys.

**Sample:**
```typescript
import { fetchLedgerEntries } from '@/lib/sorobanRpc';

const keys = ['AAAAFA==', 'BBBBFB==']; // base64-encoded LedgerKey XDR
const { entries, latestLedger } = await fetchLedgerEntries('testnet', keys);
entries.forEach(e => console.log(`Key: ${e.key}, Value: ${e.xdr}`));
```

---

### `contractAbiParser.ts`

Resolves and parses Soroban contract ABIs from Contract IDs, local WASM files, or local JSON/XDR schema files.

---

#### `resolveContractSchema(options: ResolveContractSchemaOptions): Promise<ParsedContractSchema>`

Resolves the contract schema by checking the RPC endpoint and local workspace files.

**Options:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `contractId` | `string` | Bech32m contract address (`C...`) |
| `files` | `WorkspaceFile[]` | All files in the current workspace |
| `activeTabPath` | `string[]` | Path segments of the active editor file |
| `rpcUrl` | `string` | Soroban RPC endpoint URL |
| `networkPassphrase` | `string` | Network passphrase |

**Sample:**
```typescript
import { resolveContractSchema } from '@/lib/contractAbiParser';

const schema = await resolveContractSchema({
  contractId: 'CA7QYNF7SOWQ3GLR2BGMZEHXR...', 
  files: workspaceFiles,
  activeTabPath: ['src', 'contract.rs'],
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
});

console.log(`Functions found: ${schema.functions.length}`);
schema.functions.forEach(fn => {
  console.log(`  ${fn.name}(${fn.inputs.map(i => i.name).join(', ')})`);
});
```

---

### `simulationDiff.ts`

Computes human-readable diffs of ledger state changes produced by contract simulation.

---

#### `computeStateDiff(before: LedgerEntry[], after: LedgerEntry[]): StateDiff`

Compares two snapshots of ledger entries and returns a categorized diff.

**Returns:** `StateDiff` with `created`, `modified`, and `deleted` arrays.

**Sample:**
```typescript
import { computeStateDiff } from '@/lib/simulationDiff';

const diff = computeStateDiff(entriesBefore, entriesAfter);

diff.created.forEach(e   => console.log(`[CREATE] ${e.key}`));
diff.modified.forEach(e  => console.log(`[MODIFY] ${e.key}: ${e.oldValue} → ${e.newValue}`));
diff.deleted.forEach(e   => console.log(`[DELETE] ${e.key}`));
```

---

### `gasProfiler.ts`

Profiles Soroban resource usage from simulation results and produces historical trend data.

---

#### `profileSimulationResult(result: SimulationResult): ResourceProfile`

Extracts and normalizes resource usage from a simulation result object.

**Returns:** `ResourceProfile` — `{ cpu: number; memory: number; ledgerReads: number; ledgerWrites: number; timestamp: number }`

**Sample:**
```typescript
import { profileSimulationResult } from '@/lib/gasProfiler';

const profile = profileSimulationResult(simulationResult);
console.log(`CPU: ${profile.cpu} instructions`);
console.log(`Memory: ${profile.memory} bytes`);
console.log(`Ledger reads: ${profile.ledgerReads}`);
```

---

#### `buildHistoricalChart(profiles: ResourceProfile[]): ChartDataset`

Converts an array of resource profiles into a chart-ready dataset.

**Sample:**
```typescript
import { buildHistoricalChart } from '@/lib/gasProfiler';

const dataset = buildHistoricalChart(savedProfiles);
// Pass dataset.cpu and dataset.memory to your charting component
```

---

### `errorTranslator.ts`

Translates cryptic Soroban host function error codes and Rust panic messages into developer-friendly explanations.

---

#### `translateError(rawError: string): TranslatedError`

Parses a raw error string and returns a structured explanation with a suggested fix.

**Returns:** `TranslatedError` — `{ code: string; title: string; description: string; suggestion: string; docsUrl?: string }`

**Sample:**
```typescript
import { translateError } from '@/lib/errorTranslator';

const translated = translateError('HostError: Value(MissingValue)');
console.log(translated.title);       // "Missing Contract Value"
console.log(translated.description); // "The contract tried to read a storage key..."
console.log(translated.suggestion);  // "Ensure the key is initialized before reading it."
```

---

### `symbolIndexer.ts`

Builds and queries a cross-file symbol index for Go-to-Definition and Find-References features.

---

#### `buildIndex(files: WorkspaceFile[]): SymbolIndex`

Parses all Rust source files in the workspace and constructs a searchable symbol index.

**Sample:**
```typescript
import { buildIndex } from '@/lib/symbolIndexer';

const index = buildIndex(workspaceFiles);
console.log(`Indexed ${index.symbols.size} symbols across ${index.fileCount} files`);
```

---

#### `findDefinition(index: SymbolIndex, symbol: string): SymbolLocation | null`

Looks up the definition location of a named symbol.

**Returns:** `{ file: string; line: number; column: number }` or `null`

**Sample:**
```typescript
import { buildIndex, findDefinition } from '@/lib/symbolIndexer';

const index = buildIndex(workspaceFiles);
const location = findDefinition(index, 'transfer');
if (location) {
  console.log(`Defined in ${location.file} at line ${location.line}`);
}
```

---

#### `findReferences(index: SymbolIndex, symbol: string): SymbolLocation[]`

Returns all usage sites of a named symbol across the workspace.

**Sample:**
```typescript
const refs = findReferences(index, 'transfer');
refs.forEach(ref => console.log(`Referenced in ${ref.file}:${ref.line}`));
```

---

### `bindingsGenerator.ts`

Generates TypeScript client bindings from a parsed contract ABI schema.

---

#### `generateBindings(schema: ParsedContractSchema, options?: BindingsOptions): string`

Produces a TypeScript module with typed wrappers for every contract function.

**Options:**
| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `moduleFormat` | `"esm" \| "cjs"` | `"esm"` | Output module format |
| `includeJsdoc` | `boolean` | `true` | Include JSDoc for each function |
| `contractId` | `string` | `undefined` | Embed contract ID as a constant |

**Sample:**
```typescript
import { generateBindings } from '@/lib/bindingsGenerator';

const tsCode = generateBindings(schema, {
  moduleFormat: 'esm',
  contractId: 'CA7QYNF7SOWQ3GLR2BGMZEHXR...',
});

// Write to file or display in editor
console.log(tsCode);
```

---

### `rpcFailover.ts`

Provides automatic RPC endpoint failover with configurable retry policy.

---

#### `createFailoverClient(endpoints: string[], options?: FailoverOptions): FailoverClient`

Creates an RPC client that automatically tries the next endpoint if one fails.

**Options:**
| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxRetries` | `number` | `3` | Retries per endpoint |
| `timeoutMs` | `number` | `5000` | Per-request timeout in milliseconds |
| `onFailover` | `(url: string) => void` | `undefined` | Callback when an endpoint is skipped |

**Sample:**
```typescript
import { createFailoverClient } from '@/lib/rpcFailover';

const client = createFailoverClient([
  'https://soroban-testnet.stellar.org',
  'https://rpc.testnet.stellar.org',
], {
  maxRetries: 2,
  onFailover: (url) => console.warn(`Failover away from: ${url}`),
});

const ledger = await client.getLatestLedger();
```

---

### `rpcService.ts`

Core RPC service layer with request batching and caching.

---

#### `simulateTransaction(xdr: string, network: NetworkConfig): Promise<SimulationResult>`

Simulates a transaction against the Soroban RPC and returns the full result including resource usage and state changes.

**Sample:**
```typescript
import { simulateTransaction } from '@/lib/rpcService';

const result = await simulateTransaction(txXdr, {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
});

if (result.error) {
  console.error('Simulation failed:', result.error);
} else {
  console.log('CPU instructions:', result.cost.cpuInsns);
}
```

---

### `transactionExecution.ts`

Builds, signs, and submits transactions to the Stellar network.

---

#### `buildAndSubmitTransaction(params: TransactionParams): Promise<TransactionResult>`

Constructs a transaction, simulates it, assembles the final XDR, signs it, and submits it.

**Sample:**
```typescript
import { buildAndSubmitTransaction } from '@/lib/transactionExecution';

const result = await buildAndSubmitTransaction({
  contractId: 'CA7QYNF7SOWQ3GLR2BGMZEHXR...',
  method: 'transfer',
  args: [senderAddress, recipientAddress, amount],
  signerPublicKey: publicKey,
  signTransaction: freighterSignFn,
  network: 'testnet',
});

console.log(`Transaction hash: ${result.hash}`);
console.log(`Ledger: ${result.ledger}`);
```

---

### `ciTemplates.ts`

Generates CI/CD pipeline configuration files (GitHub Actions, GitLab CI) for Soroban projects.

---

#### `generateCiTemplate(framework: CiFramework, options: CiOptions): string`

Generates a CI configuration file for the specified framework.

**Supported frameworks:** `"github-actions"`, `"gitlab-ci"`, `"circleci"`

**Sample:**
```typescript
import { generateCiTemplate } from '@/lib/ciTemplates';

const yaml = generateCiTemplate('github-actions', {
  network: 'testnet',
  runTests: true,
  deployOnMerge: true,
  contractPath: 'contracts/my_contract',
});

// Write to .github/workflows/deploy.yml
```

---

### `mathSafetyAnalyzer.ts`

Statically analyzes Rust contract source code to detect potential integer overflow patterns.

---

#### `analyzeFile(source: string, filename: string): MathSafetyReport`

Analyzes a single Rust source file for risky arithmetic patterns.

**Returns:** `MathSafetyReport` — `{ warnings: MathWarning[]; errors: MathError[] }`

**Sample:**
```typescript
import { analyzeFile } from '@/lib/mathSafetyAnalyzer';

const report = analyzeFile(rustSourceCode, 'src/lib.rs');

report.warnings.forEach(w => {
  console.warn(`Line ${w.line}: ${w.message}`);
  // e.g. "Unchecked addition on u64 — consider using checked_add()"
});
```

---

### `sep41Detector.ts`

Detects whether a contract implements the SEP-41 fungible token interface.

---

#### `detectSep41(schema: ParsedContractSchema): Sep41DetectionResult`

Inspects a contract schema and reports which SEP-41 functions are present.

**Sample:**
```typescript
import { detectSep41 } from '@/lib/sep41Detector';

const result = detectSep41(contractSchema);
console.log(`SEP-41 compliant: ${result.isCompliant}`);
console.log(`Missing functions: ${result.missing.join(', ')}`);
// e.g. Missing functions: allowance, transfer_from
```

---

### `contractInstantiator.ts`

Handles the upload and instantiation (deployment) of Soroban contracts.

---

#### `uploadWasm(wasmBuffer: ArrayBuffer, network: NetworkConfig, signer: SignerFn): Promise<string>`

Uploads a WASM binary and returns the resulting WASM hash.

**Sample:**
```typescript
import { uploadWasm } from '@/lib/contractInstantiator';

const wasmHash = await uploadWasm(wasmBuffer, networkConfig, freighterSignFn);
console.log(`WASM uploaded: ${wasmHash}`);
```

---

#### `instantiateContract(wasmHash: string, initArgs: ScVal[], network: NetworkConfig, signer: SignerFn): Promise<string>`

Instantiates an uploaded WASM and returns the new contract ID.

**Sample:**
```typescript
import { instantiateContract } from '@/lib/contractInstantiator';

const contractId = await instantiateContract(
  wasmHash, 
  [], // constructor args
  networkConfig, 
  freighterSignFn
);
console.log(`Contract deployed: ${contractId}`);
```

---

### `scvalTransformer.ts`

Transforms native JavaScript values into Soroban `ScVal` XDR types and vice versa.

---

#### `toScVal(value: unknown, hint?: ScValHint): xdr.ScVal`

Converts a JavaScript value into an `ScVal` with optional type hinting.

**Sample:**
```typescript
import { toScVal } from '@/lib/scvalTransformer';
import * as StellarSdk from '@stellar/stellar-sdk';

const amountScVal = toScVal(1000000n, { type: 'i128' });
const addressScVal = toScVal('GA7QYN...', { type: 'address' });
```

---

#### `fromScVal(scval: xdr.ScVal): unknown`

Converts an `ScVal` back into a native JavaScript value.

**Sample:**
```typescript
import { fromScVal } from '@/lib/scvalTransformer';

const result = simulationResult.result?.retval;
const nativeValue = fromScVal(result);
console.log(`Return value: ${nativeValue}`); // e.g. 1000000n
```

---

### `ai-chat.ts`

AI chat integration with context injection for Soroban-specific assistance.

---

#### `createChatSession(context: ChatContext): ChatSession`

Creates a new AI chat session with injected workspace context.

**Sample:**
```typescript
import { createChatSession } from '@/lib/ai-chat';

const session = createChatSession({
  activeFile: 'src/lib.rs',
  contractSchema: parsedSchema,
  recentErrors: lastErrors,
});

const response = await session.sendMessage('How do I fix this authorization error?');
console.log(response.text);
```

---

## Utilities (`utils/`)

---

### `XdrUtils.ts`

Helpers for encoding and decoding XDR base64 data, especially `ScVal` types.

---

#### `encodeToXdr(value: unknown): XdrEncodeResult`

Encodes a native JS value into XDR base64.

**Returns:** `{ xdrBase64: string; scvType: string }`

**Sample:**
```typescript
import { encodeToXdr } from '@/utils/XdrUtils';

const result = encodeToXdr(42n);        // bigint → i128
console.log(result.xdrBase64);         // "AAAABgAAAAAAAAAAAAAAAAAAAAo="
console.log(result.scvType);           // "SCV_I128"
```

---

#### `decodeFromXdr(xdrBase64: string): XdrDecodeResult`

Decodes an XDR base64 string back to a native value.

**Sample:**
```typescript
import { decodeFromXdr } from '@/utils/XdrUtils';

const result = decodeFromXdr('AAAABgAAAAAAAAAAAAAAAAAAAAo=');
console.log(result.value);   // 10n
console.log(result.type);    // "SCV_I128"
```

---

### `XdrValidator.ts`

Validates XDR payloads against expected schema types.

---

#### `validateXdr(xdrBase64: string, expectedType: XdrSchemaType): ValidationResult`

Validates that an XDR string conforms to the expected type.

**Sample:**
```typescript
import { validateXdr } from '@/utils/XdrValidator';

const result = validateXdr(txXdrBase64, 'TransactionEnvelope');
if (!result.valid) {
  console.error(`XDR invalid: ${result.error}`);
}
```

---

### `XdrChecksum.ts`

Generates and verifies SHA-256 checksums over XDR payloads for integrity checking.

---

#### `computeChecksum(xdrBase64: string): string`

Computes a hex-encoded SHA-256 checksum of the XDR buffer.

**Sample:**
```typescript
import { computeChecksum } from '@/utils/XdrChecksum';

const checksum = computeChecksum(txXdrBase64);
// Store alongside the XDR for later verification
```

---

#### `verifyChecksum(xdrBase64: string, expectedChecksum: string): boolean`

Verifies an XDR payload against a previously stored checksum.

**Sample:**
```typescript
import { verifyChecksum } from '@/utils/XdrChecksum';

const ok = verifyChecksum(storedXdr, storedChecksum);
if (!ok) throw new Error('XDR integrity check failed — possible tampering');
```

---

### `WasmLoader.ts`

Fetches WASM modules with Subresource Integrity (SRI) verification.

---

#### `fetchSecureWasm(url: string, options?: WasmLoaderOptions): Promise<ArrayBuffer>`

Downloads a WASM file and verifies its SHA-256 or SHA-384 hash against a known manifest before returning the buffer.

**Options:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `expectedHash` | `string` | `sha256-<base64>` or `sha384-<base64>` integrity hash |
| `timeoutMs` | `number` | Fetch timeout in milliseconds |

**Sample:**
```typescript
import { fetchSecureWasm } from '@/utils/WasmLoader';

try {
  const buffer = await fetchSecureWasm('/contracts/my_contract.wasm', {
    expectedHash: 'sha256-abc123def456...',
  });
  const module = await WebAssembly.compile(buffer);
} catch (err) {
  if (err.name === 'SRIIntegrityError') {
    console.error('TAMPER DETECTED — hash mismatch!');
  }
}
```

---

### `SecureFetcher.ts`

Authenticated HTTP client with CSRF protection and request signing.

---

#### `secureFetch(url: string, options?: SecureFetchOptions): Promise<Response>`

Wraps the native `fetch` with CSRF token injection and optional request signing.

**Sample:**
```typescript
import { secureFetch } from '@/utils/SecureFetcher';

const response = await secureFetch('/api/deploy', {
  method: 'POST',
  body: JSON.stringify({ contractId, wasmHash }),
  sign: true, // attach Ed25519 signature header
});
```

---

### `eventSubscriber.ts`

Streams and filters Soroban contract events from the RPC endpoint.

---

#### `subscribeToEvents(contractId: string, options: EventSubscriberOptions): EventSubscription`

Opens an event stream for the given contract and returns a subscription handle.

**Options:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `network` | `NetworkConfig` | Network to stream from |
| `startLedger` | `number` | Ledger sequence to start from |
| `topics` | `string[]` | Optional topic filters (XDR base64) |
| `onEvent` | `(event: ContractEvent) => void` | Event callback |

**Sample:**
```typescript
import { subscribeToEvents } from '@/utils/eventSubscriber';

const subscription = subscribeToEvents('CA7QYNF7...', {
  network: testnetConfig,
  startLedger: latestLedger.sequence,
  onEvent: (event) => {
    console.log(`Event: ${event.topic} → ${JSON.stringify(event.value)}`);
  },
});

// Later:
subscription.unsubscribe();
```

---

### `friendbot.ts`

Funds accounts on Testnet and Futurenet using the Friendbot faucet.

---

#### `fundAccount(publicKey: string, network: 'testnet' | 'futurenet'): Promise<FundbotResult>`

Requests test XLM for the given public key.

**Sample:**
```typescript
import { fundAccount } from '@/utils/friendbot';

const result = await fundAccount('GA7QYN...', 'testnet');
if (result.success) {
  console.log(`Funded! Transaction: ${result.hash}`);
}
```

---

### `cargoParser.ts`

Parses `Cargo.toml` manifests to extract dependency and workspace information.

---

#### `parseCargoToml(source: string): CargoManifest`

Parses a `Cargo.toml` file string into a structured manifest object.

**Sample:**
```typescript
import { parseCargoToml } from '@/utils/cargoParser';

const manifest = parseCargoToml(cargoTomlContent);
console.log(`Package: ${manifest.package.name} v${manifest.package.version}`);
manifest.dependencies.forEach(dep => {
  console.log(`  Dep: ${dep.name} @ ${dep.version}`);
});
```

---

### `cargoAuditParser.ts`

Parses `cargo audit` JSON output into structured vulnerability reports.

---

#### `parseAuditOutput(jsonOutput: string): AuditReport`

Parses the JSON output of `cargo audit --json` into a structured report.

**Sample:**
```typescript
import { parseAuditOutput } from '@/utils/cargoAuditParser';

const report = parseAuditOutput(cargoAuditJson);
report.vulnerabilities.forEach(v => {
  console.warn(`[${v.severity}] ${v.package}@${v.version}: ${v.title}`);
  console.warn(`  Advisory: ${v.advisoryUrl}`);
});
```

---

### `clippyParser.ts`

Parses Clippy lint results from `cargo clippy --message-format json`.

---

#### `parseClippyOutput(jsonLines: string): ClippyReport`

Parses newline-delimited JSON from Clippy into a structured lint report.

**Sample:**
```typescript
import { parseClippyOutput } from '@/utils/clippyParser';

const report = parseClippyOutput(clippyJsonOutput);
report.lints.forEach(lint => {
  console.log(`[${lint.level}] ${lint.file}:${lint.line} — ${lint.message}`);
});
```

---

### `searchWorkspace.ts`

Full-text search across all files in the workspace.

---

#### `searchWorkspace(query: string, files: WorkspaceFile[], options?: SearchOptions): SearchResult[]`

Searches all workspace files for the given query string or regex pattern.

**Sample:**
```typescript
import { searchWorkspace } from '@/utils/searchWorkspace';

const results = searchWorkspace('require_auth', workspaceFiles, {
  caseSensitive: false,
  isRegex: false,
  includeGlob: '**/*.rs',
});

results.forEach(r => {
  console.log(`${r.file}:${r.line} — ${r.lineContent.trim()}`);
});
```

---

### `exportZip.ts`

Exports the entire workspace as a downloadable ZIP archive.

---

#### `exportWorkspaceZip(files: WorkspaceFile[]): Promise<Blob>`

Serializes all workspace files into a ZIP blob for download.

**Sample:**
```typescript
import { exportWorkspaceZip } from '@/utils/exportZip';

const zipBlob = await exportWorkspaceZip(workspaceFiles);
const url = URL.createObjectURL(zipBlob);

const a = document.createElement('a');
a.href = url;
a.download = 'my-contract-workspace.zip';
a.click();
```

---

### `idbStorage.ts`

IndexedDB-backed persistence layer for workspace files and settings.

---

#### `saveToIdb(key: string, value: unknown): Promise<void>`

Persists a value to IndexedDB under the given key.

**Sample:**
```typescript
import { saveToIdb, loadFromIdb } from '@/utils/idbStorage';

await saveToIdb('workspace:myProject', { files: workspaceFiles });
const restored = await loadFromIdb('workspace:myProject');
```

---

### `offlineQueue.ts`

Queues Soroban transactions while offline and replays them when connectivity is restored.

---

#### `enqueueTransaction(tx: PendingTransaction): void`

Adds a signed transaction to the offline queue.

**Sample:**
```typescript
import { enqueueTransaction, drainQueue } from '@/utils/offlineQueue';

// When offline:
enqueueTransaction({ xdr: signedTxXdr, network: 'testnet', id: crypto.randomUUID() });

// When back online (called by service worker):
const results = await drainQueue();
results.forEach(r => console.log(`Submitted: ${r.hash}`));
```

---

**Verified Terminal Output:**

```bash
# Confirm lib module count
ls ide/src/lib/*.ts | wc -l
```
*Output:*
```text
47
```

```bash
# Confirm utils module count  
ls ide/src/utils/*.ts | wc -l
```
*Output:*
```text
29
```

```bash
# Spot-check key modules exist
ls ide/src/lib/gasProfiler.ts ide/src/lib/simulationDiff.ts \
   ide/src/lib/errorTranslator.ts ide/src/lib/symbolIndexer.ts \
   ide/src/utils/XdrUtils.ts ide/src/utils/WasmLoader.ts
```
*Output:*
```text
ide/src/lib/gasProfiler.ts
ide/src/lib/simulationDiff.ts
ide/src/lib/errorTranslator.ts
ide/src/lib/symbolIndexer.ts
ide/src/utils/XdrUtils.ts
ide/src/utils/WasmLoader.ts
```
