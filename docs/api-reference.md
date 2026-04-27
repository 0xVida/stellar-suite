# API Reference

This document provides a detailed reference for the internal libraries and utilities used in Stellar Suite.

## Table of Contents
- [Internal Libraries (`lib`)](#internal-libraries-lib)
  - [Soroban RPC](#soroban-rpc)
  - [Contract ABI Parser](#contract-abi-parser)
- [Utilities (`utils`)](#utilities-utils)
  - [XDR Manipulation](#xdr-manipulation)
  - [WASM Loader](#wasm-loader)

---

## Internal Libraries (`lib`)

### Soroban RPC
The `sorobanRpc.ts` module provides high-level functions for interacting with Soroban RPC nodes with built-in caching.

#### `fetchLatestLedger(network: string): Promise<LatestLedger>`
Fetches the latest ledger information for the specified network.

**Sample:**
```javascript
import { fetchLatestLedger } from '@/lib/sorobanRpc';

const ledger = await fetchLatestLedger('testnet');
console.log(`Latest ledger sequence: ${ledger.sequence}`);
```

#### `fetchLedgerEntries(network: string, keys: string[]): Promise<{ entries: LedgerEntry[], latestLedger: number }>`
Fetches specific ledger entries by their keys.

**Sample:**
```javascript
import { fetchLedgerEntries } from '@/lib/sorobanRpc';

const keys = ['AAAAFA==', 'BBBBFB==']; // Base64 encoded keys
const { entries, latestLedger } = await fetchLedgerEntries('testnet', keys);
entries.forEach(entry => console.log(`Entry XDR: ${entry.xdr}`));
```

### Contract ABI Parser
The `contractAbiParser.ts` module handles the resolution and parsing of Soroban contract ABIs from various sources (Contract ID, local WASM, local JSON/XDR).

#### `resolveContractSchema(options: ResolveContractSchemaOptions): Promise<ParsedContractSchema>`
Resolves the contract schema by checking RPC and local workspace files.

**Sample:**
```javascript
import { resolveContractSchema } from '@/lib/contractAbiParser';

const schema = await resolveContractSchema({
  contractId: 'C...',
  files: workspaceFiles,
  activeTabPath: ['src', 'contract.rs'],
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015'
});

console.log(`Detected ${schema.functions.length} functions.`);
```

---

## Utilities (`utils`)

### XDR Manipulation
The `XdrUtils.ts` module provides helper functions for encoding and decoding XDR data, especially for `ScVal` types.

#### `encodeToXdr(value: unknown): XdrEncodeResult`
Encodes a native JavaScript value into an XDR base64 string.

**Sample:**
```javascript
import { encodeToXdr } from '@/utils/XdrUtils';

const result = encodeToXdr({ hello: "world" });
console.log(`XDR: ${result.xdrBase64}`);
console.log(`Type: ${result.scvType}`);
```

#### `decodeFromXdr(xdrBase64: string): XdrDecodeResult`
Decodes an XDR base64 string back into a native JavaScript value.

**Sample:**
```javascript
import { decodeFromXdr } from '@/utils/XdrUtils';

const result = decodeFromXdr('AAAAEAAAAAFoZWxsbwAAAAEAAAAFd29ybGQAAAAA');
console.log(`Value:`, result.value);
```

### WASM Loader
The `WasmLoader.ts` module provides secure fetching of WASM modules with Subresource Integrity (SRI) checks.

#### `fetchSecureWasm(url: string, options: WasmLoaderOptions): Promise<ArrayBuffer>`
Fetches a WASM file and verifies its integrity against a manifest.

**Sample:**
```javascript
import { fetchSecureWasm } from '@/utils/WasmLoader';

try {
  const buffer = await fetchSecureWasm('/contracts/my_contract.wasm');
  // Use the buffer to instantiate WASM
} catch (err) {
  if (err.name === 'SRIIntegrityError') {
    console.error('TAMPERING DETECTED!');
  }
}
```
