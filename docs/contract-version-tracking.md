# Contract Version Tracking Guide

## Overview

The Contract Version Tracking system in Stellar Suite provides comprehensive version management for Soroban smart contracts, helping you maintain version history, detect mismatches, and avoid deployment conflicts.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Version Detection](#version-detection)
- [Recording Versions](#recording-versions)
- [Version History](#version-history)
- [Mismatch Detection](#mismatch-detection)
- [Version Comparison](#version-comparison)
- [API Reference](#api-reference)
- [Workflows](#workflows)
- [Advanced Usage](#advanced-usage)

## Core Concepts

### Version Types

The system tracks two types of versions:

1. **Local Version**: Version in your workspace `Cargo.toml`
2. **Deployed Version**: Version last deployed to a network

### Version States

Each contract can be in one of several states:

- **In Sync**: Local and deployed versions match
- **Ahead**: Local version is newer (ready to deploy)
- **Behind**: Deployed version is newer (workspace may be outdated)
- **Unknown**: No deployed version recorded yet

### Version Metadata

Each version record includes:

```typescript
interface VersionMetadata {
  version: string;           // Semantic version (e.g., "1.2.3")
  recordedAt: string;        // ISO-8601 timestamp
  label?: string;            // Optional description
  contractId?: string;       // On-chain contract ID
  network?: string;          // Stellar network
  source?: string;           // Source account
}
```

## Version Detection

### Automatic Detection

The extension automatically reads versions from `Cargo.toml`:

```toml
[package]
name = "my-contract"
version = "1.2.3"
```

### Manual Detection

Programmatically get the local version:

```typescript
import { ContractVersionTracker } from './services/contractVersionTracker';

const tracker = new ContractVersionTracker(context, outputChannel);
const localVersion = tracker.getLocalVersion(contractDir);
console.log(`Local version: ${localVersion}`);
```

### Version Validation

The system validates semantic versioning:

```typescript
// Valid versions
"1.0.0" ✅
"2.1.3" ✅
"0.5.0-alpha" ✅
"1.0.0-rc.1" ✅

// Invalid versions
"1.0" ❌
"v1.0.0" ❌
"latest" ❌
```

## Recording Versions

### Recording Deployed Versions

Record a version immediately after deployment:

```typescript
const entry = await tracker.recordDeployedVersion(
  contractPath,
  contractName,
  "1.2.3",
  {
    contractId: "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE",
    network: "testnet",
    source: "GDAT5HWTGIU4TSSZ4752OUC4SABDLTLZFRPZUJ3D6LKBNEPA7V2CIG54",
    label: "Initial deployment to testnet"
  }
);

console.log(`Recorded version ${entry.version} with ID ${entry.id}`);
```

### Recording Local Versions

Track version changes without deployment:

```typescript
const entry = await tracker.recordLocalVersion(
  contractPath,
  contractName,
  "1.3.0",
  "Bumped version for new features"
);

console.log(`Recorded local version: ${entry.version}`);
```

This is useful for:
- Tracking version bumps before deployment
- Maintaining complete version history
- Planning future deployments

## Version History

### Viewing History

Get the complete version history for a contract:

```typescript
const history = tracker.getVersionHistory(contractPath);

history.forEach(entry => {
  console.log(`Version ${entry.version}`);
  console.log(`  Recorded: ${entry.recordedAt}`);
  console.log(`  Deployed: ${entry.isDeployed ? 'Yes' : 'No'}`);
  if (entry.label) {
    console.log(`  Label: ${entry.label}`);
  }
  if (entry.contractId) {
    console.log(`  Contract ID: ${entry.contractId}`);
  }
});
```

### History Entry Structure

```typescript
interface VersionHistoryEntry {
  id: string;                // Unique entry ID
  version: string;           // Semantic version
  recordedAt: string;        // ISO-8601 timestamp
  isDeployed: boolean;       // Whether this was a deployment
  contractId?: string;       // On-chain ID
  network?: string;          // Network name
  source?: string;           // Source account
  label?: string;            // Description
}
```

### History Timeline Example

```
v1.0.0 (2024-01-15) - Initial release [DEPLOYED to testnet]
v1.0.1 (2024-01-20) - Bug fix [DEPLOYED to testnet]
v1.1.0 (2024-02-01) - New features [LOCAL only]
v1.1.1 (2024-02-05) - Bug fix [DEPLOYED to mainnet]
v1.2.0 (2024-02-15) - Major update [LOCAL only]
```

### Clearing History

Remove version history when needed:

```typescript
await tracker.clearVersionHistory(contractPath);
console.log('Version history cleared');
```

**Warning:** This cannot be undone. Consider exporting history first.

## Mismatch Detection

### Understanding Mismatches

A mismatch occurs when local and deployed versions differ significantly.

### Types of Mismatches

1. **Deployed Ahead of Local** ⚠️
   ```
   Local:    1.0.0
   Deployed: 1.2.0
   Status:   MISMATCH - Workspace may be outdated
   ```

2. **Local Ahead of Deployed** ℹ️
   ```
   Local:    1.2.0
   Deployed: 1.0.0
   Status:   Normal - Ready to deploy
   ```

3. **Same Version** ✅
   ```
   Local:    1.2.0
   Deployed: 1.2.0
   Status:   In sync
   ```

### Getting Mismatch Information

Get version state with mismatch detection:

```typescript
const state = tracker.getContractVersionState(contractPath, contractName);

if (state.hasMismatch && state.mismatch) {
  console.log('Version Mismatch Detected!');
  console.log(`Local: ${state.mismatch.localVersion}`);
  console.log(`Deployed: ${state.mismatch.deployedVersion}`);
  console.log(`Message: ${state.mismatch.message}`);
  console.log(`Comparison: ${state.mismatch.comparison.result}`);
}
```

### Getting All Mismatches

Find all contracts with version mismatches:

```typescript
const mismatches = tracker.getMismatches();

mismatches.forEach(mismatch => {
  console.log(`${mismatch.contractName}:`);
  console.log(`  Local: ${mismatch.localVersion}`);
  console.log(`  Deployed: ${mismatch.deployedVersion}`);
  console.log(`  ${mismatch.message}`);
});
```

### Mismatch Notifications

The system can show VS Code notifications:

```typescript
await tracker.notifyMismatches();
// Shows information messages for each mismatch
```

### Handling Mismatches

**When Deployed is Ahead:**

1. Pull latest code from repository
2. Verify local workspace is up to date
3. Check if you're on the correct branch
4. Consider if this is intentional (e.g., hotfix deployed)

**When Local is Ahead:**

1. This is normal development flow
2. Deploy when ready
3. Version will sync after deployment

## Version Comparison

### Semantic Version Comparison

Compare any two versions:

```typescript
const comparison = tracker.compareVersions("1.2.3", "1.2.2");

console.log(comparison);
// {
//   result: 1,  // 1 = first newer, -1 = second newer, 0 = equal
//   firstVersion: { major: 1, minor: 2, patch: 3 },
//   secondVersion: { major: 1, minor: 2, patch: 2 }
// }
```

### Comparison Results

```typescript
result === 1   // First version is newer
result === -1  // Second version is newer
result === 0   // Versions are equal
```

### Version Components

```typescript
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}
```

### Comparison Examples

```typescript
compareVersions("2.0.0", "1.9.9")  // result: 1  (major bump)
compareVersions("1.5.0", "1.4.9")  // result: 1  (minor bump)
compareVersions("1.0.1", "1.0.0")  // result: 1  (patch bump)
compareVersions("1.0.0", "1.0.0")  // result: 0  (equal)
compareVersions("1.0.0", "2.0.0")  // result: -1 (first older)
```

### Pre-release Versions

```typescript
compareVersions("1.0.0-alpha", "1.0.0-beta")
compareVersions("1.0.0-rc.1", "1.0.0-rc.2")
compareVersions("1.0.0-alpha", "1.0.0")  // alpha < release
```

## API Reference

### ContractVersionTracker Class

#### Constructor

```typescript
constructor(
  context: vscode.ExtensionContext,
  outputChannel?: vscode.OutputChannel
)
```

#### Methods

**getLocalVersion(contractDir: string): string | undefined**

Read version from Cargo.toml.

```typescript
const version = tracker.getLocalVersion("/path/to/contract");
```

**recordDeployedVersion(...): Promise<VersionHistoryEntry>**

Record a deployed version with metadata.

```typescript
await tracker.recordDeployedVersion(
  contractPath,
  contractName,
  version,
  { contractId, network, source, label }
);
```

**recordLocalVersion(...): Promise<VersionHistoryEntry>**

Record a local version change.

```typescript
await tracker.recordLocalVersion(
  contractPath,
  contractName,
  version,
  label
);
```

**getContractVersionState(...): ContractVersionState**

Get complete version state including mismatch detection.

```typescript
const state = tracker.getContractVersionState(contractPath, contractName);
```

**getAllContractVersionStates(): ContractVersionState[]**

Get version states for all tracked contracts.

```typescript
const allStates = tracker.getAllContractVersionStates();
```

**getMismatches(): VersionMismatch[]**

Get all version mismatches.

```typescript
const mismatches = tracker.getMismatches();
```

**getVersionHistory(contractPath: string): VersionHistoryEntry[]**

Get ordered version history (oldest to newest).

```typescript
const history = tracker.getVersionHistory(contractPath);
```

**clearVersionHistory(contractPath: string): Promise<void>**

Clear all version history for a contract.

```typescript
await tracker.clearVersionHistory(contractPath);
```

**compareVersions(versionA: string, versionB: string): VersionComparisonDetail**

Compare two semantic versions.

```typescript
const comparison = tracker.compareVersions("1.2.3", "1.2.2");
```

**notifyMismatches(): Promise<void>**

Show VS Code notifications for all mismatches.

```typescript
await tracker.notifyMismatches();
```

## Workflows

### Standard Deployment Workflow

```typescript
// 1. Check current state
const state = tracker.getContractVersionState(contractPath, contractName);
console.log(`Local: ${state.localVersion}, Deployed: ${state.deployedVersion}`);

// 2. Verify no mismatches
if (state.hasMismatch && state.mismatch) {
  console.warn(`Warning: ${state.mismatch.message}`);
}

// 3. Deploy contract
const contractId = await deployContract(contractPath);

// 4. Record deployed version
await tracker.recordDeployedVersion(
  contractPath,
  contractName,
  state.localVersion!,
  {
    contractId,
    network: "testnet",
    source: sourceAccount,
    label: "Production deployment"
  }
);

// 5. Verify state updated
const newState = tracker.getContractVersionState(contractPath, contractName);
console.log(`Versions now in sync: ${!newState.hasMismatch}`);
```

### Version Bump Workflow

```typescript
// 1. Get current version
const currentVersion = tracker.getLocalVersion(contractPath);
console.log(`Current version: ${currentVersion}`);

// 2. Bump version in Cargo.toml (manually or via script)
// Edit [package].version = "1.3.0"

// 3. Record the version bump
await tracker.recordLocalVersion(
  contractPath,
  contractName,
  "1.3.0",
  "Bumped for new feature: user authentication"
);

// 4. Commit to git
// git commit -am "Bump version to 1.3.0"
```

### Multi-Environment Deployment

Track deployments across different networks:

```typescript
// Deploy to testnet
const testnetId = await deployToTestnet(contractPath);
await tracker.recordDeployedVersion(
  contractPath,
  contractName,
  "1.2.0",
  {
    contractId: testnetId,
    network: "testnet",
    label: "Testnet validation"
  }
);

// After testing, deploy to mainnet
const mainnetId = await deployToMainnet(contractPath);
await tracker.recordDeployedVersion(
  contractPath,
  contractName,
  "1.2.0",
  {
    contractId: mainnetId,
    network: "mainnet",
    label: "Production release"
  }
);

// View history
const history = tracker.getVersionHistory(contractPath);
// Will show both testnet and mainnet deployments
```

### Rollback Workflow

```typescript
// 1. Check current state
const state = tracker.getContractVersionState(contractPath, contractName);
console.log(`Current: ${state.deployedVersion}`);

// 2. Review history
const history = tracker.getVersionHistory(contractPath);
const previousVersion = history[history.length - 2]; // Get previous version

// 3. Revert Cargo.toml to previous version
// Edit [package].version = previousVersion.version

// 4. Redeploy
const contractId = await deployContract(contractPath);

// 5. Record rollback
await tracker.recordDeployedVersion(
  contractPath,
  contractName,
  previousVersion.version,
  {
    contractId,
    network: "mainnet",
    label: `Rollback from ${state.deployedVersion} due to critical bug`
  }
);
```

## Advanced Usage

### Custom Version Storage

The tracker stores data in VS Code workspace state:

```typescript
// Storage key pattern
const STORAGE_KEY = 'stellar.contractVersionData';

// Access stored data (advanced)
const stored = context.workspaceState.get(STORAGE_KEY);
```

### Batch Operations

Process multiple contracts:

```typescript
const contracts = await getAllContracts();

for (const contract of contracts) {
  const state = tracker.getContractVersionState(
    contract.path,
    contract.name
  );
  
  if (state.hasMismatch) {
    console.log(`${contract.name}: MISMATCH`);
  }
}
```

### Integration with CI/CD

```typescript
// In deployment script
async function deployAndTrack(contractPath: string, contractName: string) {
  try {
    // Get version
    const version = tracker.getLocalVersion(contractPath);
    if (!version) {
      throw new Error('No version found in Cargo.toml');
    }
    
    // Check for mismatches
    const state = tracker.getContractVersionState(contractPath, contractName);
    if (state.hasMismatch && state.mismatch) {
      console.warn(`Warning: ${state.mismatch.message}`);
      // Decide whether to proceed
    }
    
    // Deploy
    const contractId = await deploy(contractPath);
    
    // Track
    await tracker.recordDeployedVersion(
      contractPath,
      contractName,
      version,
      {
        contractId,
        network: process.env.STELLAR_NETWORK || 'testnet',
        source: process.env.STELLAR_SOURCE_ACCOUNT,
        label: `CI deployment - Build ${process.env.BUILD_NUMBER}`
      }
    );
    
    return { success: true, contractId, version };
  } catch (error) {
    console.error('Deployment failed:', error);
    return { success: false, error };
  }
}
```

### Export/Import History

```typescript
// Export history for backup or sharing
function exportHistory(contractPath: string): string {
  const history = tracker.getVersionHistory(contractPath);
  return JSON.stringify(history, null, 2);
}

// Save to file
import * as fs from 'fs';
const exported = exportHistory(contractPath);
fs.writeFileSync('version-history.json', exported);
```

### Version Analytics

```typescript
function analyzeVersionHistory(contractPath: string) {
  const history = tracker.getVersionHistory(contractPath);
  
  const deployments = history.filter(h => h.isDeployed);
  const totalVersions = history.length;
  const deploymentRate = deployments.length / totalVersions;
  
  // Calculate average time between deployments
  const deploymentTimes = deployments.map(d => new Date(d.recordedAt).getTime());
  const intervals = deploymentTimes.slice(1).map((time, i) => 
    time - deploymentTimes[i]
  );
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const avgDays = avgInterval / (1000 * 60 * 60 * 24);
  
  return {
    totalVersions,
    totalDeployments: deployments.length,
    deploymentRate,
    averageDaysBetweenDeployments: avgDays,
    latestVersion: history[history.length - 1]?.version,
    latestDeployment: deployments[deployments.length - 1]?.version
  };
}
```

### Custom Notifications

```typescript
async function notifyVersionState(contractPath: string, contractName: string) {
  const state = tracker.getContractVersionState(contractPath, contractName);
  
  if (state.hasMismatch && state.mismatch) {
    const choice = await vscode.window.showWarningMessage(
      `${contractName}: ${state.mismatch.message}`,
      'View History',
      'Ignore'
    );
    
    if (choice === 'View History') {
      const history = tracker.getVersionHistory(contractPath);
      // Display history in webview or output channel
    }
  } else if (state.localVersion && state.deployedVersion) {
    vscode.window.showInformationMessage(
      `${contractName}: Versions in sync (${state.localVersion})`
    );
  }
}
```

## Best Practices

### 1. Always Record Deployments

Record every deployment immediately after it completes:

```typescript
await tracker.recordDeployedVersion(/* ... */);
```

This ensures accurate mismatch detection.

### 2. Use Meaningful Labels

Add descriptive labels to help with history review:

```typescript
{
  label: "Production release - new auth system"
}
```

Instead of generic labels like "deployment" or leaving it empty.

### 3. Monitor Mismatches Regularly

Check for mismatches before deploying:

```typescript
const mismatches = tracker.getMismatches();
if (mismatches.length > 0) {
  // Review before proceeding
}
```

### 4. Maintain Version History

Don't clear history unless absolutely necessary. It provides valuable audit trail.

### 5. Version Bump Strategy

Follow semantic versioning:
- Breaking changes → Major version
- New features → Minor version
- Bug fixes → Patch version

### 6. Document Version Changes

Use labels to document what changed:

```typescript
{
  label: "v1.2.0 - Added multi-sig support, fixed token transfer bug"
}
```

### 7. Test Before Deployment

Always test on testnet first, record that deployment, then deploy to mainnet:

```typescript
// Testnet
await tracker.recordDeployedVersion(path, name, version, {
  network: "testnet",
  label: "Testnet validation"
});

// After testing passes...
// Mainnet
await tracker.recordDeployedVersion(path, name, version, {
  network: "mainnet",
  label: "Production release"
});
```

## Troubleshooting

### Version Not Detected

**Problem:** `getLocalVersion()` returns `undefined`

**Solutions:**
1. Verify `Cargo.toml` exists in contract directory
2. Check `[package].version` is present and valid
3. Ensure file is readable (check permissions)
4. Use absolute path to contract directory

### Incorrect Mismatch Warnings

**Problem:** False positive mismatch warnings

**Solutions:**
1. Clear and re-record deployed version
2. Verify Cargo.toml has correct version
3. Check workspace state hasn't been corrupted
4. Clear history and start fresh if needed

### History Not Persisting

**Problem:** Version history lost after reload

**Solutions:**
1. Ensure workspace is saved
2. Check workspace state quota isn't exceeded
3. Verify `context.workspaceState.update()` completes
4. Check for errors in output channel

### Performance with Large History

**Problem:** Slow operations with many history entries

**Solutions:**
1. Periodically archive old history
2. Clear history for inactive contracts
3. Use batch operations instead of individual queries

---

**See Also:**
- [Contract Management](./contract-management.md)
- [Dependency Detection](./dependency-detection.md)

**Last Updated:** February 21, 2026  
**Version:** 1.0.0
