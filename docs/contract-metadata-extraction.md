# Contract Metadata Extraction Guide

## Overview

The Contract Metadata Service provides comprehensive metadata extraction from Cargo.toml files, enabling rich contract discovery, dependency analysis, and workspace organization features.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Metadata Structure](#metadata-structure)
- [Scanning Workspace](#scanning-workspace)
- [Querying Metadata](#querying-metadata)
- [Dependency Information](#dependency-information)
- [Caching Strategy](#caching-strategy)
- [File Watching](#file-watching)
- [API Reference](#api-reference)
- [Advanced Usage](#advanced-usage)
- [Performance Optimization](#performance-optimization)

## Core Concepts

### What is Contract Metadata?

Contract metadata is all the information extracted from a contract's `Cargo.toml` file, including:

- Package information (name, version, authors, etc.)
- Dependencies (runtime, development, build)
- Workspace configuration
- Contract-specific dependencies (filtered from SDK/toolchain)

### Why Extract Metadata?

Metadata extraction enables:

- **Automatic Contract Discovery**: Find all contracts in workspace
- **Dependency Analysis**: Build dependency graphs
- **Version Tracking**: Monitor contract versions
- **Workspace Organization**: Group and filter contracts
- **Build Optimization**: Understand build requirements

## Metadata Structure

### ContractMetadata Interface

```typescript
interface ContractMetadata {
  // File paths
  cargoTomlPath: string;          // Absolute path to Cargo.toml
  contractDir: string;             // Directory containing Cargo.toml
  
  // Package info
  contractName: string;            // Display name
  package?: CargoPackage;          // Full package section
  
  // Dependencies
  dependencies: Record<string, CargoDependency>;
  devDependencies: Record<string, CargoDependency>;
  buildDependencies: Record<string, CargoDependency>;
  contractDependencies: CargoDependency[];  // Filtered view
  
  // Workspace info
  workspace?: CargoWorkspace;
  isWorkspaceRoot: boolean;
  workspaceMembers: string[];
}
```

### CargoPackage Structure

```typescript
interface CargoPackage {
  name: string;
  version: string;
  authors?: string[];
  edition?: string;
  description?: string;
  license?: string;
  repository?: string;
  homepage?: string;
  keywords?: string[];
  categories?: string[];
}
```

### CargoDependency Structure

```typescript
interface CargoDependency {
  name: string;
  version?: string;           // "1.0.0" or "*"
  path?: string;              // "../lib"
  git?: string;               // Git repository URL
  branch?: string;            // Git branch
  tag?: string;               // Git tag
  rev?: string;               // Git revision
  features?: string[];        // ["feature1", "feature2"]
  optional?: boolean;
  defaultFeatures?: boolean;
}
```

### CargoWorkspace Structure

```typescript
interface CargoWorkspace {
  members?: string[];         // ["contracts/*", "lib"]
  exclude?: string[];         // ["examples/*"]
  resolver?: string;          // "2"
  dependencies?: Record<string, CargoDependency>;
}
```

## Scanning Workspace

### Full Workspace Scan

Scan entire workspace for all contracts:

```typescript
import { ContractMetadataService } from './services/contractMetadataService';

const service = new ContractMetadataService(vscode.workspace, outputChannel);
const result = await service.scanWorkspace();

console.log(`Found ${result.contracts.length} contracts`);
console.log(`Found ${result.workspaceRoots.length} workspace roots`);
console.log(`Encountered ${result.errors.length} errors`);
```

### Scan Result Structure

```typescript
interface WorkspaceScanResult {
  contracts: ContractMetadata[];              // All contracts found
  workspaceRoots: ContractMetadata[];         // Workspace-root manifests
  errors: Array<{ path: string; error: string }>;  // Parse errors
  scannedAt: string;                          // ISO-8601 timestamp
}
```

### Processing Scan Results

```typescript
const { contracts, workspaceRoots, errors, scannedAt } = await service.scanWorkspace();

// Process contracts
contracts.forEach(contract => {
  console.log(`Contract: ${contract.contractName}`);
  console.log(`  Version: ${contract.package?.version}`);
  console.log(`  Path: ${contract.contractDir}`);
  console.log(`  Dependencies: ${contract.contractDependencies.length}`);
});

// Check for workspace roots
if (workspaceRoots.length > 0) {
  console.log('Workspace configuration detected:');
  workspaceRoots.forEach(root => {
    console.log(`  Members: ${root.workspaceMembers.join(', ')}`);
  });
}

// Handle errors
if (errors.length > 0) {
  console.error('Parsing errors:');
  errors.forEach(({ path, error }) => {
    console.error(`  ${path}: ${error}`);
  });
}
```

### Scan Performance

The scan operation:
- Searches for `**/Cargo.toml` files
- Excludes `**/target/**` directories
- Limits to 500 files (configurable)
- Uses parallel processing
- Caches results automatically

## Querying Metadata

### Get Single Contract

```typescript
// By Cargo.toml path
const metadata = await service.getMetadata('/path/to/contract/Cargo.toml');

console.log(`Contract: ${metadata.contractName}`);
console.log(`Version: ${metadata.package?.version}`);
```

### Find by Contract Name

```typescript
// Case-insensitive search
const metadata = service.findByContractName('my-contract');

if (metadata) {
  console.log(`Found: ${metadata.contractDir}`);
} else {
  console.log('Contract not found');
}
```

### Get All Cached Metadata

```typescript
const allContracts = service.getCachedMetadata();

console.log(`${allContracts.length} contracts in cache`);

allContracts.forEach(contract => {
  console.log(`- ${contract.contractName} (${contract.package?.version})`);
});
```

### Find by Dependency

```typescript
// Find all contracts that depend on a crate
const contracts = service.findContractsByDependency('soroban-sdk');

console.log(`${contracts.length} contracts use soroban-sdk:`);
contracts.forEach(contract => {
  console.log(`- ${contract.contractName}`);
});
```

## Dependency Information

### All Dependencies

Access all three types of dependencies:

```typescript
const metadata = await service.getMetadata(cargoTomlPath);

// Runtime dependencies
Object.entries(metadata.dependencies).forEach(([name, dep]) => {
  console.log(`${name}: ${dep.version || dep.path || dep.git}`);
});

// Dev dependencies (tests, examples)
Object.entries(metadata.devDependencies).forEach(([name, dep]) => {
  console.log(`${name} (dev): ${dep.version}`);
});

// Build dependencies (build.rs)
Object.entries(metadata.buildDependencies).forEach(([name, dep]) => {
  console.log(`${name} (build): ${dep.version}`);
});
```

### Contract-Specific Dependencies

Get filtered view excluding SDK/toolchain dependencies:

```typescript
const metadata = await service.getMetadata(cargoTomlPath);

// Only contract-to-contract dependencies
console.log('Contract dependencies:');
metadata.contractDependencies.forEach(dep => {
  console.log(`- ${dep.name}`);
  if (dep.path) {
    console.log(`  Path: ${dep.path}`);
  }
  if (dep.version) {
    console.log(`  Version: ${dep.version}`);
  }
  if (dep.features) {
    console.log(`  Features: ${dep.features.join(', ')}`);
  }
});
```

**Excluded Dependencies** (not in contractDependencies):
- `soroban-sdk`
- `soroban-auth`
- `stellar-xdr`
- `stellar-strkey`
- Other Stellar/Soroban toolchain crates

### Dependency Types

#### Version Dependency

```toml
[dependencies]
my-lib = "1.0.0"
```

```typescript
{
  name: "my-lib",
  version: "1.0.0"
}
```

#### Path Dependency

```toml
[dependencies]
shared-types = { path = "../shared" }
```

```typescript
{
  name: "shared-types",
  path: "../shared"
}
```

#### Git Dependency

```toml
[dependencies]
my-lib = { git = "https://github.com/user/repo", tag = "v1.0.0" }
```

```typescript
{
  name: "my-lib",
  git: "https://github.com/user/repo",
  tag: "v1.0.0"
}
```

#### Complex Dependency

```toml
[dependencies]
advanced-lib = { 
  version = "2.0", 
  features = ["async", "serde"],
  optional = true,
  default-features = false
}
```

```typescript
{
  name: "advanced-lib",
  version: "2.0",
  features: ["async", "serde"],
  optional: true,
  defaultFeatures: false
}
```

## Caching Strategy

### How Caching Works

1. **First Request**: Parse Cargo.toml and store in memory
2. **Subsequent Requests**: Return cached data
3. **File Change**: Invalidate cache entry
4. **Next Request**: Re-parse file

### Cache Benefits

- **Performance**: Avoid repeated file I/O and parsing
- **Consistency**: Same data across multiple queries
- **Efficiency**: Workspace scans use cached data

### Cache Management

#### Check Cache Status

```typescript
const cached = service.getCachedMetadata();
console.log(`Cache contains ${cached.length} entries`);
```

#### Invalidate Single Entry

```typescript
service.invalidate('/path/to/contract/Cargo.toml');
// Next getMetadata() will re-parse the file
```

#### Clear Entire Cache

```typescript
service.invalidate();
// Clears all cached metadata
```

#### Force Re-parse

```typescript
// Invalidate and re-read
service.invalidate(cargoTomlPath);
const fresh = await service.getMetadata(cargoTomlPath);
```

### Cache Invalidation Triggers

Cache is automatically invalidated when:
- File is created
- File is modified
- File is deleted
- Manual invalidation is called

## File Watching

### Automatic Watching

Start file system watching:

```typescript
const service = new ContractMetadataService(vscode.workspace, outputChannel);
service.startWatching();

// Now file changes trigger automatic cache invalidation
```

### What Gets Watched

- Pattern: `**/Cargo.toml`
- Exclusions: `**/target/**`
- Events: create, change, delete

### Watch Events

The watcher automatically:

1. **On Create**: Parse new file and add to cache
2. **On Change**: Invalidate cache entry
3. **On Delete**: Remove from cache

### Stop Watching

```typescript
service.dispose();
// Stops file watching and cleans up resources
```

### Custom Watch Handling

Handle watch events manually:

```typescript
import * as vscode from 'vscode';

const watcher = vscode.workspace.createFileSystemWatcher('**/Cargo.toml');

watcher.onDidChange(async (uri) => {
  console.log(`Cargo.toml changed: ${uri.fsPath}`);
  service.invalidate(uri.fsPath);
  const updated = await service.getMetadata(uri.fsPath);
  console.log(`Updated: ${updated.contractName}`);
});

watcher.onDidCreate(async (uri) => {
  console.log(`New Cargo.toml: ${uri.fsPath}`);
  const metadata = await service.getMetadata(uri.fsPath);
  console.log(`New contract: ${metadata.contractName}`);
});

watcher.onDidDelete((uri) => {
  console.log(`Cargo.toml deleted: ${uri.fsPath}`);
  service.invalidate(uri.fsPath);
});
```

## API Reference

### ContractMetadataService

#### Constructor

```typescript
constructor(
  workspace: vscode.Workspace,
  outputChannel?: vscode.OutputChannel
)
```

**Parameters:**
- `workspace`: VS Code workspace API
- `outputChannel`: Optional channel for logging

#### Methods

**scanWorkspace(): Promise<WorkspaceScanResult>**

Scan entire workspace for contracts.

```typescript
const result = await service.scanWorkspace();
```

**getMetadata(cargoTomlPath: string): Promise<ContractMetadata>**

Get metadata for a specific Cargo.toml file.

```typescript
const metadata = await service.getMetadata('/path/to/Cargo.toml');
```

**getCachedMetadata(): ContractMetadata[]**

Get all cached metadata without scanning.

```typescript
const cached = service.getCachedMetadata();
```

**findByContractName(contractName: string): ContractMetadata | undefined**

Find contract by name (case-insensitive).

```typescript
const metadata = service.findByContractName('my-contract');
```

**findContractsByDependency(crateName: string): ContractMetadata[]**

Find all contracts depending on a crate.

```typescript
const contracts = service.findContractsByDependency('shared-lib');
```

**invalidate(cargoTomlPath?: string): void**

Invalidate cache (all or specific file).

```typescript
service.invalidate('/path/to/Cargo.toml');  // Single file
service.invalidate();                        // All files
```

**startWatching(): void**

Start file system watching.

```typescript
service.startWatching();
```

**dispose(): void**

Clean up resources and stop watching.

```typescript
service.dispose();
```

## Advanced Usage

### Workspace Detection

Identify workspace roots and members:

```typescript
const { contracts, workspaceRoots } = await service.scanWorkspace();

workspaceRoots.forEach(root => {
  console.log(`Workspace: ${root.contractDir}`);
  console.log(`Members: ${root.workspaceMembers.join(', ')}`);
  
  // Find member contracts
  root.workspaceMembers.forEach(memberPattern => {
    const members = contracts.filter(c => 
      c.contractDir.includes(memberPattern.replace('/*', ''))
    );
    console.log(`  Found ${members.length} members matching ${memberPattern}`);
  });
});
```

### Dependency Graph Building

Use metadata for dependency analysis:

```typescript
const allContracts = service.getCachedMetadata();
const graph = new Map<string, string[]>();

allContracts.forEach(contract => {
  const deps = contract.contractDependencies
    .filter(d => d.path)  // Local path dependencies
    .map(d => d.name);
  
  graph.set(contract.contractName, deps);
});

// Print graph
graph.forEach((deps, contract) => {
  console.log(`${contract} depends on:`);
  deps.forEach(dep => console.log(`  - ${dep}`));
});
```

### Filtering and Grouping

Group contracts by various criteria:

```typescript
const contracts = service.getCachedMetadata();

// Group by directory
const byDir = new Map<string, ContractMetadata[]>();
contracts.forEach(c => {
  const dir = c.contractDir.split('/').slice(-2, -1)[0];
  if (!byDir.has(dir)) {
    byDir.set(dir, []);
  }
  byDir.get(dir)!.push(c);
});

// Group by version pattern
const byVersion = {
  stable: contracts.filter(c => c.package?.version?.match(/^[1-9]/)),
  prerelease: contracts.filter(c => c.package?.version?.match(/^0\./)),
};

// Group by dependency count
const byDeps = {
  standalone: contracts.filter(c => c.contractDependencies.length === 0),
  dependent: contracts.filter(c => c.contractDependencies.length > 0),
};
```

### Metadata Comparison

Compare contracts:

```typescript
function compareContracts(
  c1: ContractMetadata,
  c2: ContractMetadata
): string[] {
  const differences: string[] = [];
  
  if (c1.package?.version !== c2.package?.version) {
    differences.push(`Version: ${c1.package?.version} vs ${c2.package?.version}`);
  }
  
  if (c1.contractDependencies.length !== c2.contractDependencies.length) {
    differences.push(
      `Dependencies: ${c1.contractDependencies.length} vs ${c2.contractDependencies.length}`
    );
  }
  
  const deps1 = new Set(c1.contractDependencies.map(d => d.name));
  const deps2 = new Set(c2.contractDependencies.map(d => d.name));
  
  const unique1 = [...deps1].filter(d => !deps2.has(d));
  const unique2 = [...deps2].filter(d => !deps1.has(d));
  
  if (unique1.length > 0) {
    differences.push(`Only in ${c1.contractName}: ${unique1.join(', ')}`);
  }
  if (unique2.length > 0) {
    differences.push(`Only in ${c2.contractName}: ${unique2.join(', ')}`);
  }
  
  return differences;
}
```

### Export Metadata

Export for external tools:

```typescript
async function exportMetadata(outputPath: string) {
  const contracts = service.getCachedMetadata();
  
  const exported = contracts.map(c => ({
    name: c.contractName,
    version: c.package?.version,
    path: c.contractDir,
    dependencies: c.contractDependencies.map(d => ({
      name: d.name,
      version: d.version,
      path: d.path,
    })),
  }));
  
  const json = JSON.stringify(exported, null, 2);
  await fs.promises.writeFile(outputPath, json);
  console.log(`Exported ${contracts.length} contracts to ${outputPath}`);
}
```

### Metadata Validation

Validate contract metadata:

```typescript
function validateMetadata(metadata: ContractMetadata): string[] {
  const issues: string[] = [];
  
  if (!metadata.package) {
    issues.push('Missing [package] section');
  }
  
  if (!metadata.package?.version) {
    issues.push('Missing version');
  } else if (!/^\d+\.\d+\.\d+/.test(metadata.package.version)) {
    issues.push(`Invalid version format: ${metadata.package.version}`);
  }
  
  if (!metadata.dependencies['soroban-sdk']) {
    issues.push('Missing soroban-sdk dependency');
  }
  
  if (Object.keys(metadata.dependencies).length === 0) {
    issues.push('No dependencies declared');
  }
  
  return issues;
}

// Validate all contracts
const contracts = service.getCachedMetadata();
contracts.forEach(contract => {
  const issues = validateMetadata(contract);
  if (issues.length > 0) {
    console.log(`${contract.contractName} has issues:`);
    issues.forEach(issue => console.log(`  - ${issue}`));
  }
});
```

## Performance Optimization

### Batch Operations

Process multiple contracts efficiently:

```typescript
// Efficient: Single scan
const { contracts } = await service.scanWorkspace();
contracts.forEach(contract => {
  // Process each contract
});

// Inefficient: Multiple individual queries
// for (const path of paths) {
//   const metadata = await service.getMetadata(path);
// }
```

### Minimize Cache Invalidation

```typescript
// Good: Invalidate only what changed
service.invalidate(specificCargoTomlPath);

// Avoid: Clearing entire cache unnecessarily
// service.invalidate();
```

### Use Cached Data

```typescript
// Fast: Use cached data
const cached = service.getCachedMetadata();

// Slower: Re-scan when not needed
// const { contracts } = await service.scanWorkspace();
```

### Lazy Loading

Load metadata only when needed:

```typescript
class ContractManager {
  private service: ContractMetadataService;
  private loaded = false;
  
  async ensureLoaded() {
    if (!this.loaded) {
      await this.service.scanWorkspace();
      this.loaded = true;
    }
  }
  
  async getContract(name: string) {
    await this.ensureLoaded();
    return this.service.findByContractName(name);
  }
}
```

### Incremental Updates

Handle file changes incrementally:

```typescript
const watcher = vscode.workspace.createFileSystemWatcher('**/Cargo.toml');

watcher.onDidChange(async (uri) => {
  // Only re-parse changed file
  service.invalidate(uri.fsPath);
  await service.getMetadata(uri.fsPath);
  // Cache is updated incrementally
});
```

## Best Practices

### 1. Initialize Once

Create service instance once and reuse:

```typescript
// Good
const service = new ContractMetadataService(vscode.workspace, outputChannel);
service.startWatching();
// Use service throughout extension lifetime

// Bad
// function getMetadata() {
//   const service = new ContractMetadataService(...);  // Don't recreate
// }
```

### 2. Use File Watching

Always enable file watching for automatic updates:

```typescript
service.startWatching();
```

### 3. Handle Errors Gracefully

```typescript
const { contracts, errors } = await service.scanWorkspace();

if (errors.length > 0) {
  console.warn(`${errors.length} contracts could not be parsed`);
  errors.forEach(({ path, error }) => {
    console.warn(`  ${path}: ${error}`);
  });
}

// Continue with successfully parsed contracts
console.log(`Processing ${contracts.length} valid contracts`);
```

### 4. Dispose Resources

```typescript
context.subscriptions.push(service);  // Auto-dispose on deactivation
```

### 5. Use Type Guards

```typescript
if (metadata.workspace) {
  // TypeScript knows workspace is defined
  console.log(`Workspace members: ${metadata.workspace.members?.join(', ')}`);
}

if (metadata.package) {
  // Safe to access package properties
  console.log(`Version: ${metadata.package.version}`);
}
```

## Troubleshooting

### Contract Not Found

```typescript
const metadata = service.findByContractName('my-contract');

if (!metadata) {
  // Check if workspace has been scanned
  await service.scanWorkspace();
  
  // Try again
  const retry = service.findByContractName('my-contract');
  
  if (!retry) {
    console.error('Contract not found after scan');
    // Check Cargo.toml exists and is valid
  }
}
```

### Parse Errors

```typescript
const { errors } = await service.scanWorkspace();

errors.forEach(({ path, error }) => {
  if (error.includes('TOML')) {
    console.error(`Invalid TOML syntax in ${path}`);
    // Check file for syntax errors
  }
});
```

### Stale Cache

```typescript
// Force refresh
service.invalidate();
const { contracts } = await service.scanWorkspace();
```

### Missing Dependencies

```typescript
const metadata = await service.getMetadata(path);

if (Object.keys(metadata.dependencies).length === 0) {
  console.warn(`No dependencies found in ${metadata.contractName}`);
  // Verify Cargo.toml has [dependencies] section
}
```

---

**See Also:**
- [Contract Management](./contract-management.md)
- [Dependency Detection](./dependency-detection.md)

**Last Updated:** February 21, 2026  
**Version:** 1.0.0
