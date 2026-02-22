# Contract Management Examples

## Overview

This guide provides practical, real-world examples of using Stellar Suite's contract management features. Each example includes complete code and explanations.

## Table of Contents

- [Basic Workflows](#basic-workflows)
- [Advanced Scenarios](#advanced-scenarios)
- [Integration Examples](#integration-examples)
- [Automation Examples](#automation-examples)
- [Real-World Use Cases](#real-world-use-cases)

## Basic Workflows

### Example 1: Set Up New Contract Project

Complete workflow for adding a new contract to your workspace:

```typescript
import * as vscode from 'vscode';
import { ContractMetadataService } from './services/contractMetadataService';
import { ContractVersionTracker } from './services/contractVersionTracker';
import { ContractGroupService } from './services/contractGroupService';

async function setupNewContract(contractPath: string, groupName: string) {
  // Initialize services
  const metadataService = new ContractMetadataService(
    vscode.workspace,
    outputChannel
  );
  const versionTracker = new ContractVersionTracker(context, outputChannel);
  const groupService = new ContractGroupService(context);
  
  // 1. Scan for the new contract
  const { contracts } = await metadataService.scanWorkspace();
  const newContract = contracts.find(c => c.contractDir === contractPath);
  
  if (!newContract) {
    throw new Error(`Contract not found at ${contractPath}`);
  }
  
  console.log(`Found contract: ${newContract.contractName}`);
  console.log(`Version: ${newContract.package?.version}`);
  
  // 2. Record initial version
  if (newContract.package?.version) {
    await versionTracker.recordLocalVersion(
      contractPath,
      newContract.contractName,
      newContract.package.version,
      'Initial version'
    );
  }
  
  // 3. Add to appropriate group
  let group = groupService.getAllGroups().find(g => g.name === groupName);
  if (!group) {
    group = groupService.createGroup(groupName);
  }
  
  groupService.addContractToGroup(newContract.contractName, group.id);
  await groupService.saveGroups();
  
  console.log(`Added ${newContract.contractName} to group: ${groupName}`);
  
  // 4. Validate contract structure
  const issues = validateContract(newContract);
  if (issues.length > 0) {
    console.warn('Contract has validation issues:');
    issues.forEach(issue => console.warn(`  - ${issue}`));
  }
  
  return newContract;
}

function validateContract(metadata: ContractMetadata): string[] {
  const issues: string[] = [];
  
  if (!metadata.package?.version) {
    issues.push('Missing version in Cargo.toml');
  }
  
  if (!metadata.dependencies['soroban-sdk']) {
    issues.push('Missing soroban-sdk dependency');
  }
  
  if (metadata.contractDependencies.length === 0) {
    issues.push('No contract dependencies (this may be intentional)');
  }
  
  return issues;
}
```

### Example 2: Deploy and Track Version

Complete deployment workflow with version tracking:

```typescript
async function deployAndTrack(
  contractPath: string,
  network: string,
  sourceAccount: string
) {
  const versionTracker = new ContractVersionTracker(context, outputChannel);
  const metadataService = new ContractMetadataService(
    vscode.workspace,
    outputChannel
  );
  
  // 1. Get contract metadata
  const cargoTomlPath = path.join(contractPath, 'Cargo.toml');
  const metadata = await metadataService.getMetadata(cargoTomlPath);
  
  // 2. Check current version state
  const state = versionTracker.getContractVersionState(
    contractPath,
    metadata.contractName
  );
  
  if (state.hasMismatch && state.mismatch) {
    const proceed = await vscode.window.showWarningMessage(
      `Version mismatch: ${state.mismatch.message}. Continue?`,
      'Yes',
      'No'
    );
    
    if (proceed !== 'Yes') {
      return;
    }
  }
  
  // 3. Get version to deploy
  const version = versionTracker.getLocalVersion(contractPath);
  if (!version) {
    throw new Error('No version found in Cargo.toml');
  }
  
  console.log(`Deploying ${metadata.contractName} v${version} to ${network}`);
  
  // 4. Build the contract
  await buildContract(contractPath);
  
  // 5. Deploy
  const contractId = await deployContract(contractPath, network, sourceAccount);
  
  console.log(`Deployed successfully: ${contractId}`);
  
  // 6. Record deployed version
  await versionTracker.recordDeployedVersion(
    contractPath,
    metadata.contractName,
    version,
    {
      contractId,
      network,
      source: sourceAccount,
      label: `Deployed to ${network}`
    }
  );
  
  // 7. Verify state updated
  const newState = versionTracker.getContractVersionState(
    contractPath,
    metadata.contractName
  );
  
  console.log(`Deployment complete. In sync: ${!newState.hasMismatch}`);
  
  return { contractId, version };
}

// Helper functions
async function buildContract(contractPath: string): Promise<void> {
  // Implementation depends on your build setup
  const terminal = vscode.window.createTerminal('Build Contract');
  terminal.sendText(`cd ${contractPath} && cargo build --target wasm32-unknown-unknown --release`);
  // Wait for build to complete...
}

async function deployContract(
  contractPath: string,
  network: string,
  source: string
): Promise<string> {
  // Implementation depends on your deployment setup
  // This is a simplified example
  const wasmPath = path.join(contractPath, 'target/wasm32-unknown-unknown/release/*.wasm');
  
  // Use stellar CLI or SDK to deploy
  // Return contract ID
  return 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
}
```

### Example 3: Organize Workspace by Feature

Automatically organize contracts based on their purpose:

```typescript
async function organizeByFeature() {
  const metadataService = new ContractMetadataService(
    vscode.workspace,
    outputChannel
  );
  const groupService = new ContractGroupService(context);
  
  // Scan workspace
  const { contracts } = await metadataService.scanWorkspace();
  
  // Define feature mappings based on contract names
  const featureMap = new Map<string, RegExp>([
    ['Authentication', /auth|login|session/i],
    ['Token Management', /token|erc20|asset/i],
    ['Governance', /gov|vote|proposal/i],
    ['DeFi', /swap|pool|liquidity|staking/i],
    ['Storage', /store|data|registry/i],
    ['Utilities', /util|helper|lib/i],
  ]);
  
  // Create groups if they don't exist
  const groups = new Map<string, string>();
  for (const [featureName] of featureMap) {
    let group = groupService.getAllGroups().find(g => g.name === featureName);
    if (!group) {
      group = groupService.createGroup(featureName);
    }
    groups.set(featureName, group.id);
  }
  
  // Create "Other" group for unmatched contracts
  let otherGroup = groupService.getAllGroups().find(g => g.name === 'Other');
  if (!otherGroup) {
    otherGroup = groupService.createGroup('Other');
  }
  
  // Categorize contracts
  const categorized = new Map<string, string[]>();
  
  contracts.forEach(contract => {
    let matched = false;
    
    for (const [featureName, pattern] of featureMap) {
      if (pattern.test(contract.contractName)) {
        const groupId = groups.get(featureName)!;
        groupService.addContractToGroup(contract.contractName, groupId);
        
        if (!categorized.has(featureName)) {
          categorized.set(featureName, []);
        }
        categorized.get(featureName)!.push(contract.contractName);
        
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      groupService.addContractToGroup(contract.contractName, otherGroup!.id);
      if (!categorized.has('Other')) {
        categorized.set('Other', []);
      }
      categorized.get('Other')!.push(contract.contractName);
    }
  });
  
  await groupService.saveGroups();
  
  // Print summary
  console.log('Workspace organized:');
  categorized.forEach((contracts, feature) => {
    console.log(`  ${feature}: ${contracts.length} contract(s)`);
    contracts.forEach(c => console.log(`    - ${c}`));
  });
}
```

## Advanced Scenarios

### Example 4: Dependency-Based Deployment

Deploy contracts in correct order based on dependencies:

```typescript
import { ContractDependencyDetectionService } from './services/contractDependencyDetectionService';

async function deployWithDependencies(
  contractName: string,
  network: string,
  sourceAccount: string
) {
  const metadataService = new ContractMetadataService(
    vscode.workspace,
    outputChannel
  );
  const dependencyService = new ContractDependencyDetectionService(outputChannel);
  const versionTracker = new ContractVersionTracker(context, outputChannel);
  
  // 1. Build dependency graph
  const { contracts } = await metadataService.scanWorkspace();
  const graph = await dependencyService.buildDependencyGraph(contracts, {
    detectImports: true,
    includeDevDependencies: false
  });
  
  // 2. Check for circular dependencies
  if (dependencyService.hasCircularDependencies(graph)) {
    const details = dependencyService.getCircularDependencyDetails(graph);
    console.error('Circular dependencies detected:');
    details.forEach(cycle => {
      console.error(`  ${cycle.cycle.join(' -> ')}`);
    });
    throw new Error('Cannot deploy with circular dependencies');
  }
  
  // 3. Get deployment order
  const order = graph.deploymentOrder;
  console.log('Deployment order:', order);
  
  // 4. Find contracts to deploy
  const targetIndex = order.indexOf(contractName);
  if (targetIndex === -1) {
    throw new Error(`Contract ${contractName} not found in graph`);
  }
  
  // 5. Deploy all dependencies first
  const toDeploy = order.slice(0, targetIndex + 1);
  
  console.log(`Deploying ${toDeploy.length} contracts...`);
  
  const deployedIds = new Map<string, string>();
  
  for (const name of toDeploy) {
    const contract = contracts.find(c => c.contractName === name);
    if (!contract) continue;
    
    // Check if already deployed and up to date
    const state = versionTracker.getContractVersionState(
      contract.contractDir,
      name
    );
    
    if (!state.hasMismatch && state.deployedVersion) {
      console.log(`${name}: Already deployed and up to date`);
      continue;
    }
    
    // Deploy
    console.log(`Deploying ${name}...`);
    const contractId = await deployContract(
      contract.contractDir,
      network,
      sourceAccount
    );
    
    deployedIds.set(name, contractId);
    
    // Track version
    const version = versionTracker.getLocalVersion(contract.contractDir);
    if (version) {
      await versionTracker.recordDeployedVersion(
        contract.contractDir,
        name,
        version,
        {
          contractId,
          network,
          source: sourceAccount,
          label: `Dependency deployment for ${contractName}`
        }
      );
    }
    
    console.log(`${name}: Deployed (${contractId})`);
  }
  
  return {
    deployed: toDeploy,
    contractIds: deployedIds
  };
}
```

### Example 5: Multi-Environment Management

Manage contracts across multiple environments:

```typescript
interface Environment {
  name: string;
  network: string;
  sourceAccount: string;
}

class MultiEnvironmentManager {
  private environments: Environment[] = [
    { name: 'Development', network: 'standalone', sourceAccount: 'dev-account' },
    { name: 'Testnet', network: 'testnet', sourceAccount: 'test-account' },
    { name: 'Production', network: 'mainnet', sourceAccount: 'prod-account' }
  ];
  
  constructor(
    private metadataService: ContractMetadataService,
    private versionTracker: ContractVersionTracker,
    private groupService: ContractGroupService
  ) {}
  
  async setupEnvironmentGroups() {
    // Create groups for each environment
    for (const env of this.environments) {
      let group = this.groupService.getAllGroups().find(g => g.name === env.name);
      if (!group) {
        group = this.groupService.createGroup(env.name);
      }
    }
    
    await this.groupService.saveGroups();
  }
  
  async getEnvironmentStatus(contractName: string) {
    const contract = this.metadataService.findByContractName(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }
    
    const status = new Map<string, any>();
    
    for (const env of this.environments) {
      const state = this.versionTracker.getContractVersionState(
        contract.contractDir,
        contractName
      );
      
      // Filter history by network
      const envHistory = state.history.filter(h => h.network === env.network);
      const latest = envHistory[envHistory.length - 1];
      
      status.set(env.name, {
        deployed: !!latest,
        version: latest?.version,
        contractId: latest?.contractId,
        deployedAt: latest?.recordedAt,
        inSync: latest?.version === state.localVersion
      });
    }
    
    return status;
  }
  
  async promoteToEnvironment(
    contractName: string,
    fromEnv: string,
    toEnv: string
  ) {
    const from = this.environments.find(e => e.name === fromEnv);
    const to = this.environments.find(e => e.name === toEnv);
    
    if (!from || !to) {
      throw new Error('Invalid environment');
    }
    
    const contract = this.metadataService.findByContractName(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }
    
    // Get deployed version from source environment
    const history = this.versionTracker.getVersionHistory(contract.contractDir);
    const fromDeployment = history
      .filter(h => h.network === from.network)
      .pop();
    
    if (!fromDeployment) {
      throw new Error(`No deployment found in ${fromEnv}`);
    }
    
    console.log(`Promoting ${contractName} v${fromDeployment.version}`);
    console.log(`From: ${fromEnv} (${from.network})`);
    console.log(`To: ${toEnv} (${to.network})`);
    
    // Deploy to target environment
    const contractId = await deployContract(
      contract.contractDir,
      to.network,
      to.sourceAccount
    );
    
    // Record deployment
    await this.versionTracker.recordDeployedVersion(
      contract.contractDir,
      contractName,
      fromDeployment.version,
      {
        contractId,
        network: to.network,
        source: to.sourceAccount,
        label: `Promoted from ${fromEnv}`
      }
    );
    
    console.log(`Successfully promoted to ${toEnv}: ${contractId}`);
    
    return contractId;
  }
  
  async getEnvironmentDashboard() {
    const { contracts } = await this.metadataService.scanWorkspace();
    
    const dashboard: any = {
      environments: {},
      summary: {
        total: contracts.length,
        byEnvironment: {}
      }
    };
    
    for (const env of this.environments) {
      dashboard.environments[env.name] = [];
      dashboard.summary.byEnvironment[env.name] = 0;
      
      for (const contract of contracts) {
        const status = await this.getEnvironmentStatus(contract.contractName);
        const envStatus = status.get(env.name);
        
        if (envStatus.deployed) {
          dashboard.environments[env.name].push({
            name: contract.contractName,
            version: envStatus.version,
            contractId: envStatus.contractId,
            inSync: envStatus.inSync
          });
          dashboard.summary.byEnvironment[env.name]++;
        }
      }
    }
    
    return dashboard;
  }
}

// Usage
async function example() {
  const manager = new MultiEnvironmentManager(
    metadataService,
    versionTracker,
    groupService
  );
  
  // Setup
  await manager.setupEnvironmentGroups();
  
  // Check status
  const status = await manager.getEnvironmentStatus('my-contract');
  console.log('Environment status:', status);
  
  // Promote from testnet to production
  await manager.promoteToEnvironment('my-contract', 'Testnet', 'Production');
  
  // View dashboard
  const dashboard = await manager.getEnvironmentDashboard();
  console.log('Dashboard:', JSON.stringify(dashboard, null, 2));
}
```

### Example 6: Automated Version Bumping

Automatically bump versions based on changes:

```typescript
interface VersionBumpType {
  type: 'major' | 'minor' | 'patch';
  reason: string;
}

async function analyzeChangesAndBump(contractPath: string): Promise<VersionBumpType> {
  const versionTracker = new ContractVersionTracker(context, outputChannel);
  const metadataService = new ContractMetadataService(
    vscode.workspace,
    outputChannel
  );
  
  // Get current version
  const currentVersion = versionTracker.getLocalVersion(contractPath);
  if (!currentVersion) {
    throw new Error('No current version found');
  }
  
  // Analyze git changes (simplified)
  const changes = await analyzeGitChanges(contractPath);
  
  // Determine bump type
  let bumpType: VersionBumpType;
  
  if (changes.hasBreakingChanges) {
    bumpType = { type: 'major', reason: 'Breaking changes detected' };
  } else if (changes.hasNewFeatures) {
    bumpType = { type: 'minor', reason: 'New features added' };
  } else {
    bumpType = { type: 'patch', reason: 'Bug fixes only' };
  }
  
  // Calculate new version
  const newVersion = bumpVersion(currentVersion, bumpType.type);
  
  console.log(`Version bump: ${currentVersion} → ${newVersion}`);
  console.log(`Reason: ${bumpType.reason}`);
  
  // Update Cargo.toml
  await updateCargoVersion(contractPath, newVersion);
  
  // Record version change
  const metadata = await metadataService.getMetadata(
    path.join(contractPath, 'Cargo.toml')
  );
  
  await versionTracker.recordLocalVersion(
    contractPath,
    metadata.contractName,
    newVersion,
    bumpType.reason
  );
  
  return bumpType;
}

function bumpVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
  const parts = version.split('.').map(Number);
  
  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

async function analyzeGitChanges(contractPath: string) {
  // Simplified - in reality, parse git log, commits, etc.
  return {
    hasBreakingChanges: false,
    hasNewFeatures: true,
    commits: []
  };
}

async function updateCargoVersion(contractPath: string, version: string) {
  const cargoPath = path.join(contractPath, 'Cargo.toml');
  let content = await fs.promises.readFile(cargoPath, 'utf-8');
  
  content = content.replace(
    /version\s*=\s*"[^"]+"/,
    `version = "${version}"`
  );
  
  await fs.promises.writeFile(cargoPath, content);
}
```

## Integration Examples

### Example 7: CI/CD Integration

Integrate contract management into CI/CD pipeline:

```typescript
// ci-deploy.ts - Run in CI/CD pipeline

import { ContractMetadataService } from './services/contractMetadataService';
import { ContractVersionTracker } from './services/contractVersionTracker';
import { ContractDependencyDetectionService } from './services/contractDependencyDetectionService';

class CIDeployment {
  constructor(
    private network: string,
    private sourceAccount: string,
    private buildNumber: string
  ) {}
  
  async run() {
    console.log('=== CI/CD Contract Deployment ===');
    console.log(`Network: ${this.network}`);
    console.log(`Build: ${this.buildNumber}`);
    
    // Initialize services (without VS Code dependencies)
    const metadataService = new ContractMetadataService(
      createWorkspaceAdapter(),
      createOutputAdapter()
    );
    
    const versionTracker = new ContractVersionTracker(
      createContextAdapter(),
      createOutputAdapter()
    );
    
    // 1. Scan workspace
    const { contracts, errors } = await metadataService.scanWorkspace();
    
    if (errors.length > 0) {
      console.error(`Found ${errors.length} parsing errors`);
      errors.forEach(({ path, error }) => {
        console.error(`  ${path}: ${error}`);
      });
      throw new Error('Cannot proceed with parsing errors');
    }
    
    console.log(`Found ${contracts.length} contracts`);
    
    // 2. Build dependency graph
    const depService = new ContractDependencyDetectionService();
    const graph = await depService.buildDependencyGraph(contracts);
    
    // 3. Check for circular dependencies
    if (depService.hasCircularDependencies(graph)) {
      const cycles = depService.getCircularDependencyDetails(graph);
      console.error('Circular dependencies detected:');
      cycles.forEach(cycle => {
        console.error(`  ${cycle.cycle.join(' -> ')}`);
      });
      throw new Error('Fix circular dependencies before deployment');
    }
    
    // 4. Deploy in order
    const deploymentOrder = graph.deploymentOrder;
    console.log(`Deployment order: ${deploymentOrder.join(', ')}`);
    
    const results: any[] = [];
    
    for (const contractName of deploymentOrder) {
      try {
        const result = await this.deployContract(
          contractName,
          contracts,
          versionTracker
        );
        results.push(result);
      } catch (error) {
        console.error(`Failed to deploy ${contractName}:`, error);
        throw error;
      }
    }
    
    // 5. Generate deployment report
    this.generateReport(results);
    
    return results;
  }
  
  private async deployContract(
    contractName: string,
    contracts: any[],
    versionTracker: ContractVersionTracker
  ) {
    const contract = contracts.find(c => c.contractName === contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }
    
    console.log(`\nDeploying ${contractName}...`);
    
    // Get version
    const version = versionTracker.getLocalVersion(contract.contractDir);
    if (!version) {
      throw new Error(`No version found for ${contractName}`);
    }
    
    // Build
    console.log(`  Building...`);
    await this.buildContract(contract.contractDir);
    
    // Deploy
    console.log(`  Deploying to ${this.network}...`);
    const contractId = await this.deploy(contract.contractDir);
    
    // Record
    await versionTracker.recordDeployedVersion(
      contract.contractDir,
      contractName,
      version,
      {
        contractId,
        network: this.network,
        source: this.sourceAccount,
        label: `CI Build ${this.buildNumber}`
      }
    );
    
    console.log(`  ✓ Deployed: ${contractId}`);
    
    return {
      contractName,
      version,
      contractId,
      success: true
    };
  }
  
  private async buildContract(contractPath: string) {
    // Execute cargo build
    // Implementation depends on CI environment
  }
  
  private async deploy(contractPath: string): Promise<string> {
    // Execute deployment
    // Return contract ID
    return 'CONTRACT_ID';
  }
  
  private generateReport(results: any[]) {
    console.log('\n=== Deployment Report ===');
    console.log(`Total: ${results.length} contracts`);
    console.log(`Successful: ${results.filter(r => r.success).length}`);
    console.log('\nDetails:');
    
    results.forEach(r => {
      console.log(`  ${r.contractName} v${r.version}`);
      console.log(`    Contract ID: ${r.contractId}`);
    });
    
    // Write to file for CI artifacts
    fs.writeFileSync(
      'deployment-report.json',
      JSON.stringify(results, null, 2)
    );
  }
}

// Adapter functions for non-VS Code environments
function createWorkspaceAdapter() {
  return {
    findFiles: async (pattern: string) => {
      // Use glob or similar
      return [];
    },
    createFileSystemWatcher: (pattern: string) => {
      return {
        onDidChange: () => ({ dispose: () => {} }),
        onDidCreate: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {}
      };
    }
  };
}

function createOutputAdapter() {
  return {
    appendLine: (msg: string) => console.log(msg)
  };
}

function createContextAdapter() {
  return {
    workspaceState: {
      get: () => ({}),
      update: async () => {}
    }
  };
}

// Run in CI
const deployment = new CIDeployment(
  process.env.STELLAR_NETWORK || 'testnet',
  process.env.STELLAR_SOURCE || '',
  process.env.BUILD_NUMBER || '0'
);

deployment.run().catch(error => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
```

## Automation Examples

### Example 8: Automated Contract Health Checks

Regularly check contract health:

```typescript
class ContractHealthMonitor {
  constructor(
    private metadataService: ContractMetadataService,
    private versionTracker: ContractVersionTracker,
    private dependencyService: ContractDependencyDetectionService
  ) {}
  
  async runHealthCheck(): Promise<HealthReport> {
    const report: HealthReport = {
      timestamp: new Date().toISOString(),
      contracts: [],
      issues: [],
      summary: {
        total: 0,
        healthy: 0,
        warnings: 0,
        errors: 0
      }
    };
    
    // Scan workspace
    const { contracts, errors } = await this.metadataService.scanWorkspace();
    report.summary.total = contracts.length;
    
    // Check parsing errors
    errors.forEach(({ path, error }) => {
      report.issues.push({
        severity: 'error',
        contract: path,
        message: `Parse error: ${error}`
      });
      report.summary.errors++;
    });
    
    // Check each contract
    for (const contract of contracts) {
      const contractHealth = await this.checkContract(contract);
      report.contracts.push(contractHealth);
      
      if (contractHealth.status === 'healthy') {
        report.summary.healthy++;
      } else if (contractHealth.status === 'warning') {
        report.summary.warnings++;
      } else {
        report.summary.errors++;
      }
      
      contractHealth.issues.forEach(issue => {
        report.issues.push({
          severity: contractHealth.status,
          contract: contract.contractName,
          message: issue
        });
      });
    }
    
    return report;
  }
  
  private async checkContract(contract: any): Promise<ContractHealth> {
    const health: ContractHealth = {
      name: contract.contractName,
      status: 'healthy',
      issues: []
    };
    
    // Check version
    if (!contract.package?.version) {
      health.status = 'error';
      health.issues.push('Missing version');
    } else if (!/^\d+\.\d+\.\d+/.test(contract.package.version)) {
      health.status = 'warning';
      health.issues.push(`Invalid version format: ${contract.package.version}`);
    }
    
    // Check dependencies
    if (!contract.dependencies['soroban-sdk']) {
      health.status = 'error';
      health.issues.push('Missing soroban-sdk dependency');
    }
    
    // Check version mismatch
    const state = this.versionTracker.getContractVersionState(
      contract.contractDir,
      contract.contractName
    );
    
    if (state.hasMismatch && state.mismatch) {
      health.status = 'warning';
      health.issues.push(`Version mismatch: ${state.mismatch.message}`);
    }
    
    // Check for outdated dependencies
    const outdated = this.checkOutdatedDependencies(contract);
    if (outdated.length > 0) {
      health.status = 'warning';
      health.issues.push(`Outdated dependencies: ${outdated.join(', ')}`);
    }
    
    return health;
  }
  
  private checkOutdatedDependencies(contract: any): string[] {
    // Simplified - would need to check against registry
    const outdated: string[] = [];
    
    const sdk = contract.dependencies['soroban-sdk'];
    if (sdk && sdk.version && sdk.version < '20.0.0') {
      outdated.push('soroban-sdk');
    }
    
    return outdated;
  }
  
  async generateHTMLReport(report: HealthReport): Promise<string> {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Contract Health Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .summary { background: #f0f0f0; padding: 15px; margin-bottom: 20px; }
          .healthy { color: green; }
          .warning { color: orange; }
          .error { color: red; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4CAF50; color: white; }
        </style>
      </head>
      <body>
        <h1>Contract Health Report</h1>
        <div class="summary">
          <h2>Summary</h2>
          <p>Generated: ${report.timestamp}</p>
          <p>Total Contracts: ${report.summary.total}</p>
          <p class="healthy">Healthy: ${report.summary.healthy}</p>
          <p class="warning">Warnings: ${report.summary.warnings}</p>
          <p class="error">Errors: ${report.summary.errors}</p>
        </div>
        
        <h2>Contract Status</h2>
        <table>
          <tr>
            <th>Contract</th>
            <th>Status</th>
            <th>Issues</th>
          </tr>
          ${report.contracts.map(c => `
            <tr>
              <td>${c.name}</td>
              <td class="${c.status}">${c.status.toUpperCase()}</td>
              <td>${c.issues.join('; ') || 'None'}</td>
            </tr>
          `).join('')}
        </table>
        
        ${report.issues.length > 0 ? `
          <h2>All Issues</h2>
          <ul>
            ${report.issues.map(i => `
              <li class="${i.severity}">
                <strong>${i.contract}</strong>: ${i.message}
              </li>
            `).join('')}
          </ul>
        ` : ''}
      </body>
      </html>
    `;
    
    return html;
  }
}

interface HealthReport {
  timestamp: string;
  contracts: ContractHealth[];
  issues: Issue[];
  summary: {
    total: number;
    healthy: number;
    warnings: number;
    errors: number;
  };
}

interface ContractHealth {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  issues: string[];
}

interface Issue {
  severity: string;
  contract: string;
  message: string;
}

// Usage
async function runDailyHealthCheck() {
  const monitor = new ContractHealthMonitor(
    metadataService,
    versionTracker,
    dependencyService
  );
  
  const report = await monitor.runHealthCheck();
  
  // Generate HTML report
  const html = await monitor.generateHTMLReport(report);
  await fs.promises.writeFile('health-report.html', html);
  
  // Send notification if issues found
  if (report.summary.warnings > 0 || report.summary.errors > 0) {
    console.warn(`Health check found ${report.summary.warnings} warnings and ${report.summary.errors} errors`);
    // Send email/slack notification
  }
}
```

## Real-World Use Cases

### Example 9: Multi-Contract DApp Management

Managing a complete DApp with multiple contracts:

```typescript
class DAppManager {
  private contracts = {
    token: 'token-contract',
    staking: 'staking-contract',
    governance: 'governance-contract',
    treasury: 'treasury-contract'
  };
  
  constructor(
    private metadataService: ContractMetadataService,
    private versionTracker: ContractVersionTracker,
    private groupService: ContractGroupService
  ) {}
  
  async initialize() {
    // Create DApp structure
    const dappGroup = this.groupService.createGroup('My DApp');
    
    const coreGroup = this.groupService.createGroup('Core Contracts', dappGroup.id);
    const utilGroup = this.groupService.createGroup('Utilities', dappGroup.id);
    
    // Organize contracts
    this.groupService.addContractToGroup(this.contracts.token, coreGroup.id);
    this.groupService.addContractToGroup(this.contracts.staking, coreGroup.id);
    this.groupService.addContractToGroup(this.contracts.governance, coreGroup.id);
    this.groupService.addContractToGroup(this.contracts.treasury, utilGroup.id);
    
    await this.groupService.saveGroups();
  }
  
  async deployDApp(network: string) {
    console.log(`Deploying DApp to ${network}...`);
    
    // Deploy in specific order
    const deploymentOrder = [
      'token',
      'treasury',
      'staking',
      'governance'
    ];
    
    const deployedContracts: Record<string, string> = {};
    
    for (const key of deploymentOrder) {
      const contractName = this.contracts[key as keyof typeof this.contracts];
      const contract = this.metadataService.findByContractName(contractName);
      
      if (!contract) {
        throw new Error(`Contract ${contractName} not found`);
      }
      
      console.log(`Deploying ${key}...`);
      
      // Deploy with references to already-deployed contracts
      const contractId = await this.deployWithReferences(
        contract,
        deployedContracts,
        network
      );
      
      deployedContracts[key] = contractId;
      
      // Record version
      const version = this.versionTracker.getLocalVersion(contract.contractDir);
      if (version) {
        await this.versionTracker.recordDeployedVersion(
          contract.contractDir,
          contractName,
          version,
          {
            contractId,
            network,
            label: `DApp deployment - ${key}`
          }
        );
      }
    }
    
    console.log('DApp deployed successfully');
    console.log(JSON.stringify(deployedContracts, null, 2));
    
    // Save contract IDs
    await this.saveContractIds(deployedContracts, network);
    
    return deployedContracts;
  }
  
  private async deployWithReferences(
    contract: any,
    references: Record<string, string>,
    network: string
  ): Promise<string> {
    // Deploy contract with initialization parameters
    // that reference other contracts
    // Implementation depends on your deployment setup
    return 'CONTRACT_ID';
  }
  
  private async saveContractIds(
    ids: Record<string, string>,
    network: string
  ) {
    const filename = `contract-ids-${network}.json`;
    await fs.promises.writeFile(
      filename,
      JSON.stringify(ids, null, 2)
    );
  }
  
  async verifyDApp(network: string) {
    const ids = await this.loadContractIds(network);
    
    console.log(`Verifying DApp on ${network}...`);
    
    for (const [key, contractId] of Object.entries(ids)) {
      console.log(`Checking ${key} (${contractId})...`);
      // Verify contract is accessible and functional
      // Check version matches
      const contractName = this.contracts[key as keyof typeof this.contracts];
      const contract = this.metadataService.findByContractName(contractName);
      
      if (contract) {
        const state = this.versionTracker.getContractVersionState(
          contract.contractDir,
          contractName
        );
        
        if (state.hasMismatch) {
          console.warn(`  Warning: Version mismatch for ${key}`);
        } else {
          console.log(`  ✓ ${key} is up to date`);
        }
      }
    }
  }
  
  private async loadContractIds(network: string): Promise<Record<string, string>> {
    const filename = `contract-ids-${network}.json`;
    const content = await fs.promises.readFile(filename, 'utf-8');
    return JSON.parse(content);
  }
}
```

---

**See Also:**
- [Contract Management](./contract-management.md)
- [Version Tracking](./contract-version-tracking.md)
- [Dependency Detection](./dependency-detection.md)

**Last Updated:** February 21, 2026  
**Version:** 1.0.0
