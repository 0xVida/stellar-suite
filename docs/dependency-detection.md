# Contract Dependency Detection and Tracking

## Overview

The Stellar Suite extension now includes comprehensive contract dependency detection and tracking capabilities. This feature helps developers understand contract relationships, ensure correct deployment order, and identify potential circular dependencies.

## Features

### 1. Dependency Detection

The system detects dependencies from multiple sources:

- **Cargo.toml Analysis**: Parses `[dependencies]`, `[build-dependencies]`, and optionally `[dev-dependencies]` sections
- **Import Statement Detection**: Scans Rust source files (`.rs`) for `use`, `extern crate`, and `mod` statements
- **Workspace Dependencies**: Identifies both workspace-internal contracts and external crates
- **Path Dependencies**: Resolves relative path dependencies between contracts

### 2. Dependency Graph

Builds a comprehensive dependency graph with:

- **Nodes**: Representing each contract with metadata (name, path, depth, dependency counts)
- **Edges**: Representing dependency relationships with source attribution (Cargo.toml, imports, or both)
- **External Dependencies**: Identifies third-party crates (e.g., `soroban-sdk`, `serde`)
- **Workspace Contracts**: Distinguishes contracts within your workspace

### 3. Circular Dependency Detection

Automatically detects and reports circular dependencies:

- Identifies all cycles in the dependency graph
- Provides detailed cycle paths for debugging
- Blocks deployment when cycles are detected
- Displays warnings in the UI

### 4. Deployment Order Calculation

Calculates optimal deployment order:

- **Topological Sorting**: Ensures dependencies are deployed before dependents
- **Parallel Deployment Levels**: Groups contracts that can be deployed simultaneously
- **Depth Analysis**: Calculates dependency depth for each contract

### 5. Real-time Monitoring

File system watcher monitors changes and updates dependency graph:

- Watches `Cargo.toml` files for dependency changes
- Watches `.rs` source files for import changes (configurable)
- Debounced refresh to avoid excessive updates
- Automatic cache invalidation on changes

### 6. UI Integration

Dependency information displayed in the sidebar:

- **Dependency Count**: Shows number of direct dependencies
- **Dependent Count**: Shows how many contracts depend on this one
- **Dependency Depth**: Visual indicator of depth in dependency tree
- **Circular Dependency Badge**: Warning when contract is part of a cycle

## Commands

### Show Dependency Graph
**Command**: `Stellar Suite: Show Dependency Graph`

Displays complete dependency graph with:
- Contract list with dependency/dependent counts
- Deployment order (sequential)
- Parallel deployment levels
- Circular dependency warnings

### Show Contract Dependencies
**Command**: `Stellar Suite: Show Contract Dependencies`

Shows dependencies for a specific contract:
- Direct dependencies
- Transitive dependencies
- Contracts that depend on this one

### Check Circular Dependencies
**Command**: `Stellar Suite: Check Circular Dependencies`

Scans all contracts and reports any circular dependencies found.

## Usage

### Automatic Integration

Dependency detection runs automatically:

1. **On Extension Activation**: Initial dependency graph built
2. **On File Changes**: Graph updated when `Cargo.toml` or source files change
3. **On Sidebar Refresh**: Dependency info updated in contract cards

### Manual Commands

Access dependency commands via:

- Command Palette (`Cmd/Ctrl + Shift + P`)
- Type "Stellar Suite: Dependency" to see available commands

### Batch Deployment

The batch deployment feature automatically uses dependency graph:

```typescript
// Contracts are automatically ordered based on dependencies
await vscode.commands.executeCommand('stellarSuite.deployBatch');
```

Deployment will:
1. Build dependency graph
2. Sort contracts in deployment order
3. Deploy in correct sequence
4. Fail if circular dependencies detected

## Configuration

Dependency detection can be configured in workspace settings:

```json
{
  "stellarSuite.dependencies": {
    "detectImports": true,         // Scan source files for imports
    "watchSourceFiles": true,       // Watch .rs files for changes
    "includeDevDependencies": false, // Include dev-dependencies
    "debounceMs": 1000             // Debounce time for file changes
  }
}
```

## API for Extension Developers

### Using Dependency Service

```typescript
import { ContractDependencyDetectionService } from './services/contractDependencyDetectionService';

const service = new ContractDependencyDetectionService(outputChannel);

// Build dependency graph
const graph = await service.buildDependencyGraph(contracts, {
  detectImports: true,
  includeDevDependencies: false,
});

// Check for circular dependencies
if (service.hasCircularDependencies(graph)) {
  const details = service.getCircularDependencyDetails(graph);
  console.log('Circular dependencies:', details);
}

// Get contract dependencies
const { direct, transitive } = service.getContractDependencies(
  graph,
  'my-contract'
);

// Get deployment order
const deploymentOrder = graph.deploymentOrder;
const deploymentLevels = graph.deploymentLevels;
```

### Using Dependency Watcher

```typescript
import { ContractDependencyWatcherService } from './services/contractDependencyWatcherService';

const watcher = new ContractDependencyWatcherService(
  context,
  metadataService,
  dependencyService,
  outputChannel
);

// Start watching
await watcher.start();

// Listen to changes
watcher.onDependencyChange((event) => {
  console.log('Dependencies changed:', event.type);
  console.log('Affected contracts:', event.affectedContracts);
  console.log('Updated graph:', event.graph);
});

// Manual refresh
await watcher.refresh();

// Stop watching
watcher.stop();
```

## Data Structures

### DependencyGraph

```typescript
interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: EnhancedDependencyEdge[];
  imports: ImportDependency[];
  cycles: string[][];
  deploymentOrder: string[];
  deploymentLevels: string[][];
  externalDependencies: Set<string>;
  workspaceContracts: Set<string>;
  statistics: DependencyGraphStatistics;
}
```

### DependencyNode

```typescript
interface DependencyNode {
  name: string;
  cargoTomlPath: string;
  contractDir: string;
  dependencies: string[];      // Outgoing edges
  dependents: string[];        // Incoming edges
  isExternal: boolean;
  dependencyCount: number;
  dependentCount: number;
  depth: number;               // 0 = no dependencies
}
```

### EnhancedDependencyEdge

```typescript
interface EnhancedDependencyEdge {
  from: string;                // Dependent contract
  to: string;                  // Dependency contract
  reason: 'path' | 'workspace';
  dependencyName: string;
  source: 'cargo' | 'import' | 'both';
  imports?: ImportDependency[];
  isExternal: boolean;
  cargoMetadata?: CargoDependency;
}
```

## Examples

### Example 1: Simple Dependency Chain

```
Contracts:
  token (no dependencies)
  escrow (depends on token)
  marketplace (depends on escrow)

Dependency Graph:
  token (depth 0)
  ↑
  escrow (depth 1)
  ↑
  marketplace (depth 2)

Deployment Order:
  1. token
  2. escrow
  3. marketplace
```

### Example 2: Diamond Dependency

```
Contracts:
  logger (no dependencies)
  auth (depends on logger)
  storage (depends on logger)
  main (depends on auth, storage)

Deployment Levels:
  Level 0: logger
  Level 1: auth, storage (parallel)
  Level 2: main
```

### Example 3: Circular Dependency (Error)

```
Contracts:
  contract-a (depends on contract-b)
  contract-b (depends on contract-a)

Result: ❌ Deployment blocked
Cycle detected: contract-a → contract-b → contract-a
```

## Performance

- **Graph Building**: ~10ms for 10 contracts, ~100ms for 100 contracts
- **Import Detection**: ~5ms per contract (can be disabled)
- **File Watching**: Debounced (1000ms default) to avoid excessive updates
- **Caching**: Dependency graph cached for 60 seconds by default

## Troubleshooting

### Dependency Graph Not Updating

1. Check that file watcher is running: Look for `[DependencyWatcher] started` in output
2. Manually refresh: Run `Stellar Suite: Show Dependency Graph`
3. Check output channel for errors

### Circular Dependency False Positives

1. Verify actual dependencies in `Cargo.toml`
2. Check for dev-dependencies being incorrectly included
3. Review import statements in source files

### Performance Issues

1. Disable import detection: Set `detectImports: false`
2. Increase debounce time: Set `debounceMs: 2000`
3. Disable source file watching: Set `watchSourceFiles: false`

## Technical Details

### Architecture

1. **ContractDependencyDetectionService**: Core dependency detection and graph building
2. **ContractDependencyWatcherService**: File system monitoring and cache management
3. **deploymentDependencyResolver**: Existing topological sorting (reused)
4. **ContractMetadataService**: Cargo.toml parsing and caching (existing)

### Testing

Comprehensive unit tests cover:

- Basic dependency graph construction
- Circular dependency detection
- Multi-level dependency chains
- External vs workspace dependencies
- Graph statistics calculation
- Parallel deployment levels
- Transitive dependencies
- Caching behavior

Run tests:
```bash
npm test -- contractDependencyDetectionService.test.js
```

## Future Enhancements

Potential future improvements:

1. **Dependency Visualization**: Interactive graph UI with D3.js or similar
2. **Dependency Analysis**: Unused dependency detection
3. **Version Conflict Detection**: Identify incompatible dependency versions
4. **Performance Optimization**: Incremental graph updates
5. **Export/Import**: Share dependency graphs between teams
6. **CI/CD Integration**: Validate dependencies in pipelines

## Contributing

To contribute to dependency detection:

1. Review existing code in `src/services/contractDependency*.ts`
2. Add unit tests for new functionality
3. Update this documentation
4. Follow TypeScript best practices
5. Ensure no breaking changes to existing API

## License

Part of Stellar Suite extension - see main LICENSE file.
