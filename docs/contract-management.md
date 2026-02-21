# Contract Management in Stellar Suite

## Overview

Stellar Suite provides comprehensive contract management capabilities for Soroban smart contracts. This guide covers all aspects of contract organization, detection, tracking, and workflow optimization.

## Table of Contents

- [Contract Detection](#contract-detection)
- [Version Tracking](#version-tracking)
- [Metadata Extraction](#metadata-extraction)
- [Workspace Organization](#workspace-organization)
- [Search and Filtering](#search-and-filtering)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Contract Detection

### Automatic Discovery

Stellar Suite automatically discovers Soroban contracts in your workspace by scanning for `Cargo.toml` files that define contract packages.

#### Detection Process

1. **Workspace Scanning**: The extension scans all workspace folders for `Cargo.toml` files
2. **Metadata Parsing**: Each discovered file is parsed to extract contract information
3. **Cache Management**: Results are cached for performance
4. **File Watching**: Changes to `Cargo.toml` files trigger automatic re-detection

#### Supported Patterns

The extension looks for:
- `**/Cargo.toml` - All Cargo manifest files in the workspace
- Excludes: `**/target/**` - Build artifacts are ignored

### Manual Contract Discovery

You can manually trigger contract discovery:

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: **Stellar Suite: Refresh Contract List**

### Contract Identification

A valid Soroban contract is identified by:

```toml
[package]
name = "my-contract"
version = "0.1.0"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "20.0.0"
```

**Key Indicators:**
- `crate-type = ["cdylib"]` in `[lib]` section
- `soroban-sdk` dependency
- Valid package name and version

### Contract Metadata

For each detected contract, the following metadata is extracted:

- **Contract Name**: From `[package].name`
- **Version**: From `[package].version`
- **Directory Path**: Location of the contract
- **Dependencies**: All Cargo dependencies
- **Contract-Specific Dependencies**: Filtered view of contract-related dependencies

## Version Tracking

Stellar Suite maintains comprehensive version tracking for your contracts, helping you avoid deployment mismatches and maintain version history.

### Local Version Detection

The extension automatically reads version information from your `Cargo.toml`:

```toml
[package]
name = "my-contract"
version = "1.2.3"
```

### Deployed Version Tracking

When you deploy a contract, Stellar Suite records:

- **Version Number**: Semantic version from Cargo.toml
- **Deployment Timestamp**: When the deployment occurred
- **Contract ID**: On-chain contract identifier
- **Network**: Target Stellar network (testnet, mainnet, etc.)
- **Source Account**: Account used for deployment
- **Optional Label**: Custom description (e.g., "Production release")

### Version History

Each contract maintains a complete version history:

```typescript
{
  contractPath: "/path/to/contract",
  contractName: "my-contract",
  localVersion: "1.2.3",
  deployedVersion: "1.2.2",
  history: [
    {
      id: "abc123",
      version: "1.0.0",
      recordedAt: "2024-01-15T10:30:00Z",
      isDeployed: true,
      contractId: "CA...",
      network: "testnet",
      label: "Initial release"
    },
    {
      id: "def456",
      version: "1.2.2",
      recordedAt: "2024-02-10T14:45:00Z",
      isDeployed: true,
      contractId: "CB...",
      network: "mainnet"
    }
  ]
}
```

### Version Mismatch Detection

The extension automatically detects version mismatches:

**Types of Mismatches:**
1. **Local Ahead**: Local version is newer than deployed (normal development flow)
2. **Deployed Ahead**: Deployed version is newer than local (warning - workspace may be outdated)
3. **Different Versions**: Versions differ but comparison is unclear

**Visual Indicators:**
- 🟢 Green: Versions match
- 🟡 Yellow: Local ahead (ready to deploy)
- 🔴 Red: Deployed ahead (workspace may be out of sync)

### Version Comparison

The extension provides semantic version comparison:

```typescript
compareVersions("1.2.3", "1.2.2")
// Returns: {
//   result: 1,  // 1 = first is newer, -1 = second is newer, 0 = equal
//   firstVersion: { major: 1, minor: 2, patch: 3 },
//   secondVersion: { major: 1, minor: 2, patch: 2 }
// }
```

### Managing Version History

**View Version History:**
1. Open contract in sidebar
2. Expand version history section
3. View all recorded versions with timestamps

**Clear Version History:**
```typescript
// Via command palette or programmatically
await versionTracker.clearVersionHistory(contractPath);
```

**Record Manual Version:**
```typescript
await versionTracker.recordLocalVersion(
  contractPath,
  contractName,
  "1.3.0",
  "Major feature release"
);
```

## Metadata Extraction

The `ContractMetadataService` provides rich metadata extraction from `Cargo.toml` files.

### Available Metadata

#### Package Information
```typescript
{
  package: {
    name: "my-contract",
    version: "1.2.3",
    authors: ["developer@example.com"],
    edition: "2021",
    description: "My Soroban contract",
    license: "MIT"
  }
}
```

#### Dependencies

**All Dependencies:**
```typescript
{
  dependencies: {
    "soroban-sdk": { version: "20.0.0" },
    "my-lib": { path: "../lib" }
  },
  devDependencies: {
    "soroban-sdk": { version: "20.0.0", features: ["testutils"] }
  },
  buildDependencies: {
    "stellar-xdr": { version: "1.0.0" }
  }
}
```

**Contract-Specific Dependencies:**

The extension filters out SDK and toolchain dependencies to show only contract-specific ones:

```typescript
{
  contractDependencies: [
    { name: "my-lib", version: "1.0.0", path: "../lib" },
    { name: "shared-types", version: "0.5.0" }
  ]
}
```

**Excluded from contract dependencies:**
- `soroban-sdk`
- `soroban-auth`
- `stellar-xdr`
- Other Stellar/Soroban toolchain crates

#### Workspace Information

For workspace-root manifests:

```typescript
{
  workspace: {
    members: ["contracts/token", "contracts/staking"],
    resolver: "2"
  },
  isWorkspaceRoot: true
}
```

### Metadata Caching

The service implements intelligent caching:

- **In-Memory Cache**: Fast access to frequently-used metadata
- **Automatic Invalidation**: Cache clears when `Cargo.toml` changes
- **File System Watching**: Real-time updates on file modifications

### Querying Metadata

**By Contract Name:**
```typescript
const metadata = metadataService.findByContractName("my-contract");
```

**By Dependency:**
```typescript
const contracts = metadataService.findContractsByDependency("my-lib");
// Returns all contracts that depend on "my-lib"
```

**All Cached Contracts:**
```typescript
const allContracts = metadataService.getCachedMetadata();
```

**Workspace Scan:**
```typescript
const { contracts, workspaceRoots, errors } = await metadataService.scanWorkspace();
console.log(`Found ${contracts.length} contracts`);
console.log(`Found ${workspaceRoots.length} workspace roots`);
```

## Workspace Organization

Stellar Suite provides powerful organization features to manage multiple contracts effectively.

### Contract Groups

Organize contracts into logical groups:

#### Creating Groups

**Via Command Palette:**
1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: **Stellar Suite: Create Contract Group**
3. Enter group name

**Programmatically:**
```typescript
const group = groupService.createGroup("Authentication Contracts");
```

#### Nested Groups

Create hierarchical organization:

```typescript
const backend = groupService.createGroup("Backend");
const auth = groupService.createGroup("Auth", backend.id);
const payments = groupService.createGroup("Payments", backend.id);
```

Resulting structure:
```
📁 Backend
  📁 Auth
  📁 Payments
```

#### Managing Groups

**Add Contract to Group:**
```typescript
groupService.addContractToGroup(contractId, groupId);
```

**Move Contract Between Groups:**
```typescript
groupService.moveContractBetweenGroups(contractId, fromGroupId, toGroupId);
```

**Rename Group:**
```typescript
groupService.renameGroup(groupId, "New Name");
```

**Delete Group:**
```typescript
groupService.deleteGroup(groupId);
// Contracts are moved to parent group
```

**Move Group:**
```typescript
groupService.moveGroupToParent(groupId, newParentId);
```

### Group Hierarchy

**Get Hierarchy:**
```typescript
const hierarchy = groupService.getGroupHierarchy();
// Returns tree structure with children
```

**Get Children:**
```typescript
const children = groupService.getGroupChildren(parentId);
```

**Get Path:**
```typescript
const path = groupService.getGroupPath(groupId);
// Returns: ["Root", "Backend", "Auth"]
```

### Group Statistics

Track organization metrics:

```typescript
const stats = groupService.getGroupStatistics();
console.log(stats);
// {
//   totalGroups: 15,
//   totalContracts: 42,
//   groupDepth: 3,
//   contractsPerGroup: 2.8
// }
```

### Persistence

Groups are automatically saved to workspace state and persist across sessions.

## Search and Filtering

### Contract Search

**By Name:**
```typescript
const metadata = metadataService.findByContractName("token");
```

**By Dependency:**
```typescript
const contracts = metadataService.findContractsByDependency("soroban-sdk");
```

**By Path:**
```typescript
const metadata = await metadataService.getMetadata("/path/to/Cargo.toml");
```

### Dependency Search

The dependency detection service provides advanced search:

**Find Contract Dependencies:**
```typescript
const graph = await dependencyService.buildDependencyGraph(contracts);
const { direct, transitive } = dependencyService.getContractDependencies(
  graph,
  "my-contract"
);

console.log("Direct dependencies:", direct);
console.log("Transitive dependencies:", transitive);
```

**Find Dependents:**
```typescript
const dependents = dependencyService.getContractDependents(graph, "shared-lib");
// Returns contracts that depend on "shared-lib"
```

### Filtering Contracts

**By Workspace Root:**
```typescript
const { workspaceRoots } = await metadataService.scanWorkspace();
```

**By Contract Dependencies:**
```typescript
const contracts = metadataService.getCachedMetadata();
const filtered = contracts.filter(c => 
  c.contractDependencies.length > 0
);
```

**By Version:**
```typescript
const states = versionTracker.getAllContractVersionStates();
const withMismatches = states.filter(s => s.hasMismatch);
```

### Advanced Filtering

Combine multiple criteria:

```typescript
const contracts = metadataService.getCachedMetadata();

// Find production-ready contracts
const production = contracts.filter(c => {
  const version = c.package?.version;
  return version && version.startsWith("1.");
});

// Find contracts with specific dependency
const withAuth = contracts.filter(c =>
  c.contractDependencies.some(d => d.name.includes("auth"))
);

// Find contracts in specific directory
const inModule = contracts.filter(c =>
  c.contractDir.includes("/contracts/core/")
);
```

## Best Practices

### Version Management

1. **Use Semantic Versioning**
   ```toml
   [package]
   version = "1.2.3"  # MAJOR.MINOR.PATCH
   ```

2. **Bump Versions Appropriately**
   - MAJOR: Breaking changes
   - MINOR: New features (backwards compatible)
   - PATCH: Bug fixes

3. **Label Important Deployments**
   ```typescript
   await versionTracker.recordDeployedVersion(
     contractPath,
     contractName,
     "2.0.0",
     { label: "Production release - new auth system" }
   );
   ```

4. **Monitor Version Mismatches**
   - Review red indicators in sidebar
   - Check mismatch notifications
   - Keep workspace in sync with deployments

### Workspace Organization

1. **Use Meaningful Group Names**
   - ✅ "Core Contracts", "Testing Utilities"
   - ❌ "Group 1", "Misc"

2. **Create Logical Hierarchies**
   ```
   📁 Production Contracts
     📁 Authentication
     📁 Asset Management
     📁 Governance
   📁 Development Contracts
     📁 Mocks
     📁 Test Helpers
   ```

3. **Keep Groups Shallow**
   - Aim for 2-3 levels of nesting maximum
   - Too deep makes navigation difficult

4. **Regular Cleanup**
   - Remove unused groups
   - Consolidate similar groups
   - Update names as project evolves

### Dependency Management

1. **Use Workspace Dependencies**
   ```toml
   [workspace.dependencies]
   soroban-sdk = "20.0.0"
   
   # In member contracts
   [dependencies]
   soroban-sdk = { workspace = true }
   ```

2. **Document Contract Dependencies**
   - Add descriptions for custom dependencies
   - Maintain README for dependency graph
   - Use dependency visualization

3. **Monitor Circular Dependencies**
   - Check for cycles in dependency graph
   - Refactor to remove circular references
   - Use dependency detection service

4. **Version Consistency**
   - Keep shared dependencies at same version
   - Use workspace-level dependency management
   - Review dependency updates regularly

### Metadata Maintenance

1. **Complete Package Information**
   ```toml
   [package]
   name = "my-contract"
   version = "1.0.0"
   authors = ["team@example.com"]
   description = "Clear description of contract purpose"
   license = "MIT"
   edition = "2021"
   ```

2. **Meaningful Contract Names**
   - Use descriptive, searchable names
   - Follow consistent naming convention
   - Avoid generic names like "contract1"

3. **Keep Cargo.toml Clean**
   - Remove unused dependencies
   - Organize dependencies logically
   - Add comments for complex configurations

### Performance Optimization

1. **Leverage Caching**
   - Let extension cache metadata
   - Don't manually clear cache unless needed
   - Trust file watching for updates

2. **Workspace Structure**
   - Use workspace for multiple contracts
   - Share dependencies at workspace level
   - Organize contracts in clear directories

3. **Limit Workspace Size**
   - Don't include excessive contracts in one workspace
   - Split large projects into sub-workspaces
   - Exclude unnecessary directories

## Troubleshooting

### Contract Not Detected

**Symptoms:**
- Contract doesn't appear in sidebar
- Extension doesn't recognize Cargo.toml

**Solutions:**

1. **Verify Contract Structure**
   ```toml
   [package]
   name = "my-contract"
   version = "0.1.0"
   
   [lib]
   crate-type = ["cdylib"]
   
   [dependencies]
   soroban-sdk = "20.0.0"
   ```

2. **Check File Location**
   - Ensure `Cargo.toml` is in workspace folder
   - Not in excluded directory (`target/`, `node_modules/`)

3. **Manually Refresh**
   - Command Palette → **Stellar Suite: Refresh Contract List**

4. **Check Output Channel**
   - View → Output → Select "Stellar Suite"
   - Look for parsing errors

### Version Mismatch Warnings

**Symptoms:**
- Red indicators in sidebar
- Mismatch notifications

**Solutions:**

1. **Verify Local Version**
   - Open `Cargo.toml`
   - Check `[package].version`

2. **Check Deployment History**
   - View version history in sidebar
   - Verify last deployment version

3. **Sync Workspace**
   - Pull latest changes from git
   - Ensure you have latest contract code

4. **Clear History if Incorrect**
   ```typescript
   await versionTracker.clearVersionHistory(contractPath);
   ```

### Metadata Not Updating

**Symptoms:**
- Changes to Cargo.toml not reflected
- Stale contract information

**Solutions:**

1. **Save the File**
   - Ensure Cargo.toml changes are saved
   - File watcher only triggers on save

2. **Manual Cache Invalidation**
   ```typescript
   metadataService.invalidate(cargoTomlPath);
   ```

3. **Restart File Watcher**
   - Reload VS Code window
   - Command Palette → **Developer: Reload Window**

4. **Check File Watcher Status**
   - Extension should show "watching" in output
   - May need extension reload if not watching

### Dependency Graph Issues

**Symptoms:**
- Incorrect deployment order
- Circular dependency errors
- Missing dependencies in graph

**Solutions:**

1. **Verify Cargo.toml Dependencies**
   ```toml
   [dependencies]
   my-lib = { path = "../lib" }  # Ensure path is correct
   ```

2. **Check for Typos**
   - Dependency names must match exactly
   - Case-sensitive matching

3. **Rebuild Graph**
   ```typescript
   const graph = await dependencyService.buildDependencyGraph(
     contracts,
     { detectImports: true }
   );
   ```

4. **Resolve Circular Dependencies**
   - Identify cycles: `service.getCircularDependencyDetails(graph)`
   - Refactor to break cycles
   - Consider interface segregation

### Group Management Issues

**Symptoms:**
- Groups not persisting
- Contracts in wrong groups
- Cannot delete groups

**Solutions:**

1. **Force Save**
   ```typescript
   await groupService.saveGroups();
   ```

2. **Reload Groups**
   ```typescript
   await groupService.loadGroups();
   ```

3. **Check Group Hierarchy**
   - Cannot delete group with children
   - Cannot move group to its descendant
   - Use `getGroupHierarchy()` to debug

4. **Reset Groups**
   - Last resort: clear workspace state
   - Groups will be recreated from defaults

### Performance Issues

**Symptoms:**
- Slow contract detection
- High CPU usage
- Extension lag

**Solutions:**

1. **Reduce Workspace Size**
   - Exclude unnecessary folders
   - Add to `.vscodeignore`

2. **Limit File Watching**
   - Extension watches `**/Cargo.toml`
   - Exclude build directories properly

3. **Clear Large Caches**
   ```typescript
   metadataService.invalidate(); // Clear all cached metadata
   ```

4. **Check for File System Issues**
   - Network drives may be slow
   - Use local workspace for better performance

### Error Messages

#### "Cannot read Cargo.toml"

**Cause:** File permissions or path issue

**Solution:**
- Verify file exists and is readable
- Check file permissions
- Use absolute paths

#### "Circular dependency detected"

**Cause:** Contracts depend on each other

**Solution:**
- View cycle details in output
- Refactor to remove cycle
- Use dependency injection patterns

#### "Version mismatch detected"

**Cause:** Deployed version differs from local

**Solution:**
- This is often informational
- Review version history
- Sync workspace if deployed is newer

#### "Failed to parse Cargo.toml"

**Cause:** Invalid TOML syntax

**Solution:**
- Validate TOML syntax
- Check for missing quotes, brackets
- Use TOML validator extension

## Additional Resources

### Related Documentation
- [Dependency Detection Guide](./dependency-detection.md)
- [Deployment Workflows](./deployment-workflow-integration-testing.md)
- [Status Badges](./status-badges.md)

### API References
- `ContractMetadataService`: Metadata extraction and caching
- `ContractVersionTracker`: Version tracking and comparison
- `ContractDependencyDetectionService`: Dependency graph building
- `ContractGroupService`: Workspace organization

### Example Projects
- See `examples/` directory for sample workspace setups
- Check test files for usage patterns

### Support
- File issues on GitHub repository
- Check extension output for detailed logs
- Join community discussions

---

**Last Updated:** February 21, 2026  
**Version:** 1.0.0
