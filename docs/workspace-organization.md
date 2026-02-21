# Workspace Organization Guide

## Overview

Stellar Suite provides comprehensive workspace organization features to help you manage multiple Soroban contracts efficiently. This guide covers contract grouping, hierarchical organization, and workspace management strategies.

## Table of Contents

- [Contract Groups](#contract-groups)
- [Hierarchical Organization](#hierarchical-organization)
- [Group Management](#group-management)
- [Group Operations](#group-operations)
- [Persistence](#persistence)
- [API Reference](#api-reference)
- [Organization Patterns](#organization-patterns)
- [Best Practices](#best-practices)

## Contract Groups

### What are Contract Groups?

Contract groups are logical containers that help organize contracts in your workspace. They provide:

- **Logical Grouping**: Organize related contracts together
- **Hierarchical Structure**: Nest groups for complex organizations
- **Flexible Management**: Move contracts between groups easily
- **Visual Organization**: Clean sidebar representation

### Group Structure

```typescript
interface ContractGroup {
  id: string;                 // Unique identifier
  name: string;               // Display name
  parentId?: string;          // Parent group ID (undefined = root)
  contractIds: string[];      // Contracts in this group
  collapsed: boolean;         // UI state
  createdAt: number;          // Creation timestamp
  modifiedAt: number;         // Last modification timestamp
}
```

### Creating Groups

#### Via API

```typescript
import { ContractGroupService } from './services/contractGroupService';

const service = new ContractGroupService(context);

// Create a top-level group
const authGroup = service.createGroup('Authentication');

console.log(`Created group: ${authGroup.name} (${authGroup.id})`);
```

#### Via Command Palette

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: **Stellar Suite: Create Contract Group**
3. Enter group name
4. Select parent group (or none for top-level)

### Group Properties

```typescript
const group = service.createGroup('My Group');

console.log({
  id: group.id,              // "grp_abc123..."
  name: group.name,          // "My Group"
  parentId: group.parentId,  // undefined (top-level)
  contractIds: [],           // Empty initially
  collapsed: false,          // Expanded by default
  createdAt: group.createdAt,
  modifiedAt: group.modifiedAt
});
```

## Hierarchical Organization

### Creating Nested Groups

Build hierarchical structures:

```typescript
// Create parent group
const backend = service.createGroup('Backend Contracts');

// Create child groups
const auth = service.createGroup('Authentication', backend.id);
const payments = service.createGroup('Payments', backend.id);
const storage = service.createGroup('Storage', backend.id);

// Create nested child
const oauth = service.createGroup('OAuth Providers', auth.id);
```

Resulting structure:
```
📁 Backend Contracts
  📁 Authentication
    📁 OAuth Providers
  📁 Payments
  📁 Storage
```

### Multi-Level Hierarchies

```typescript
// Create complex hierarchy
const production = service.createGroup('Production');
const staging = service.createGroup('Staging');
const development = service.createGroup('Development');

// Production sub-groups
const prodCore = service.createGroup('Core', production.id);
const prodIntegrations = service.createGroup('Integrations', production.id);

// Staging sub-groups
const stagingCore = service.createGroup('Core', staging.id);
const stagingIntegrations = service.createGroup('Integrations', staging.id);
```

Structure:
```
📁 Production
  📁 Core
  📁 Integrations
📁 Staging
  📁 Core
  📁 Integrations
📁 Development
```

### Getting Hierarchy

Retrieve group hierarchy:

```typescript
const hierarchy = service.getGroupHierarchy();

// Returns tree structure with children
interface GroupHierarchy extends ContractGroup {
  children: GroupHierarchy[];
}

// Example output:
{
  id: 'root',
  name: 'Root',
  children: [
    {
      id: 'backend',
      name: 'Backend Contracts',
      children: [
        {
          id: 'auth',
          name: 'Authentication',
          children: []
        }
      ]
    }
  ]
}
```

### Getting Group Path

Get breadcrumb path to a group:

```typescript
const path = service.getGroupPath('oauth-group-id');
// Returns: ["Root", "Backend Contracts", "Authentication", "OAuth Providers"]

// Display as breadcrumb
console.log(path.join(' > '));
// Output: "Root > Backend Contracts > Authentication > OAuth Providers"
```

### Getting Children

```typescript
const children = service.getGroupChildren('backend-group-id');

console.log(`${children.length} child groups:`);
children.forEach(child => {
  console.log(`- ${child.name}`);
});
```

## Group Management

### Adding Contracts

```typescript
// Add contract to group
service.addContractToGroup('contract-123', 'auth-group-id');

// Add multiple contracts
const contractIds = ['contract-1', 'contract-2', 'contract-3'];
contractIds.forEach(id => {
  service.addContractToGroup(id, 'payments-group-id');
});
```

### Removing Contracts

```typescript
// Remove contract from group
service.removeContractFromGroup('contract-123', 'auth-group-id');
// Contract is not deleted, just removed from group
```

### Moving Contracts

```typescript
// Move contract between groups
service.moveContractBetweenGroups(
  'contract-123',
  'old-group-id',
  'new-group-id'
);

// Contract is removed from old group and added to new group
```

### Renaming Groups

```typescript
// Rename a group
service.renameGroup('group-id', 'New Name');

const group = service.getGroup('group-id');
console.log(group.name);  // "New Name"
```

### Deleting Groups

```typescript
// Delete a group
service.deleteGroup('group-id');
// Contracts are moved to parent group
// Cannot delete root group
```

**Behavior:**
- Contracts move to parent group
- Child groups are also deleted
- Cannot delete root group
- Updates modification timestamps

### Moving Groups

```typescript
// Move group to different parent
service.moveGroupToParent('auth-group-id', 'new-parent-id');

// Move to root level
service.moveGroupToParent('auth-group-id', undefined);
```

**Constraints:**
- Cannot move root group
- Cannot move group to its own descendant
- Updates modification timestamps

## Group Operations

### Listing All Groups

```typescript
const allGroups = service.getAllGroups();

console.log(`Total groups: ${allGroups.length}`);
allGroups.forEach(group => {
  console.log(`- ${group.name} (${group.contractIds.length} contracts)`);
});
```

### Getting Root Group

```typescript
const root = service.getRootGroup();

console.log(`Root group has ${root.contractIds.length} contracts`);
```

The root group:
- Always exists
- Cannot be deleted
- Cannot be renamed
- Cannot be moved
- Contains ungrouped contracts

### Finding Groups by Contract

```typescript
function findGroupsContainingContract(contractId: string): ContractGroup[] {
  const allGroups = service.getAllGroups();
  return allGroups.filter(group => 
    group.contractIds.includes(contractId)
  );
}

const groups = findGroupsContainingContract('contract-123');
console.log(`Contract is in ${groups.length} group(s)`);
```

### Group Statistics

```typescript
const stats = service.getGroupStatistics();

console.log({
  totalGroups: stats.totalGroups,              // Total number of groups
  totalContracts: stats.totalContracts,        // Total contracts in groups
  groupDepth: stats.groupDepth,                // Maximum nesting depth
  contractsPerGroup: stats.contractsPerGroup   // Average contracts per group
});
```

### Validating Groups

```typescript
function validateGroup(groupId: string): string[] {
  const issues: string[] = [];
  const group = service.getGroup(groupId);
  
  if (!group) {
    return ['Group not found'];
  }
  
  if (!group.name || group.name.trim().length === 0) {
    issues.push('Group name is empty');
  }
  
  if (group.contractIds.length === 0) {
    issues.push('Group contains no contracts');
  }
  
  if (group.parentId) {
    const parent = service.getGroup(group.parentId);
    if (!parent) {
      issues.push('Parent group not found');
    }
  }
  
  return issues;
}
```

## Persistence

### Automatic Saving

Groups are automatically saved to VS Code workspace state:

```typescript
// Groups are saved automatically after operations
service.createGroup('New Group');  // Auto-saved
service.addContractToGroup('c1', 'g1');  // Auto-saved
service.renameGroup('g1', 'Renamed');  // Auto-saved
```

### Manual Save

```typescript
// Force save (usually not needed)
await service.saveGroups();
```

### Loading Groups

```typescript
// Load groups from storage (called automatically)
await service.loadGroups();
```

### Storage Format

Groups are stored as JSON in workspace state:

```json
{
  "stellarSuite.contractGroups": {
    "group-1": {
      "id": "group-1",
      "name": "Authentication",
      "contractIds": ["c1", "c2"],
      "collapsed": false,
      "createdAt": 1708531200000,
      "modifiedAt": 1708531200000
    },
    "group-2": {
      "id": "group-2",
      "name": "Payments",
      "parentId": "group-1",
      "contractIds": ["c3"],
      "collapsed": false,
      "createdAt": 1708531200000,
      "modifiedAt": 1708531200000
    }
  }
}
```

### Export/Import

Export groups for backup or sharing:

```typescript
function exportGroups(): string {
  const allGroups = service.getAllGroups();
  return JSON.stringify(allGroups, null, 2);
}

// Save to file
import * as fs from 'fs';
const exported = exportGroups();
fs.writeFileSync('contract-groups.json', exported);
```

## API Reference

### ContractGroupService

#### Constructor

```typescript
constructor(context: vscode.ExtensionContext)
```

#### Methods

**createGroup(name: string, parentId?: string): ContractGroup**

Create a new group.

```typescript
const group = service.createGroup('My Group', 'parent-id');
```

**getGroup(id: string): ContractGroup | undefined**

Get group by ID.

```typescript
const group = service.getGroup('group-id');
```

**getAllGroups(): ContractGroup[]**

Get all groups.

```typescript
const groups = service.getAllGroups();
```

**getRootGroup(): ContractGroup**

Get the root group.

```typescript
const root = service.getRootGroup();
```

**deleteGroup(groupId: string): void**

Delete a group (moves contracts to parent).

```typescript
service.deleteGroup('group-id');
```

**renameGroup(groupId: string, newName: string): void**

Rename a group.

```typescript
service.renameGroup('group-id', 'New Name');
```

**addContractToGroup(contractId: string, groupId: string): void**

Add contract to group.

```typescript
service.addContractToGroup('contract-id', 'group-id');
```

**removeContractFromGroup(contractId: string, groupId: string): void**

Remove contract from group.

```typescript
service.removeContractFromGroup('contract-id', 'group-id');
```

**moveContractBetweenGroups(contractId: string, fromGroupId: string, toGroupId: string): void**

Move contract between groups.

```typescript
service.moveContractBetweenGroups('c1', 'old-group', 'new-group');
```

**moveGroupToParent(groupId: string, newParentId?: string): void**

Move group to different parent.

```typescript
service.moveGroupToParent('group-id', 'new-parent-id');
```

**getGroupHierarchy(): GroupHierarchy**

Get hierarchical tree structure.

```typescript
const hierarchy = service.getGroupHierarchy();
```

**getGroupChildren(groupId: string): ContractGroup[]**

Get direct children of a group.

```typescript
const children = service.getGroupChildren('parent-id');
```

**getGroupPath(groupId: string): string[]**

Get breadcrumb path to group.

```typescript
const path = service.getGroupPath('group-id');
```

**getGroupStatistics(): GroupStatistics**

Get organization statistics.

```typescript
const stats = service.getGroupStatistics();
```

**loadGroups(): Promise<void>**

Load groups from storage.

```typescript
await service.loadGroups();
```

**saveGroups(): Promise<void>**

Save groups to storage.

```typescript
await service.saveGroups();
```

## Organization Patterns

### By Feature

Organize contracts by application feature:

```typescript
const features = ['Authentication', 'Payments', 'Governance', 'Storage'];

features.forEach(feature => {
  service.createGroup(feature);
});
```

Structure:
```
📁 Authentication
📁 Payments
📁 Governance
📁 Storage
```

### By Environment

Organize by deployment environment:

```typescript
const envs = ['Production', 'Staging', 'Development', 'Testing'];

envs.forEach(env => {
  const group = service.createGroup(env);
  
  // Sub-groups for each environment
  service.createGroup('Core', group.id);
  service.createGroup('Integrations', group.id);
  service.createGroup('Utilities', group.id);
});
```

Structure:
```
📁 Production
  📁 Core
  📁 Integrations
  📁 Utilities
📁 Staging
  📁 Core
  📁 Integrations
  📁 Utilities
```

### By Layer

Organize by architectural layer:

```typescript
const presentation = service.createGroup('Presentation Layer');
const business = service.createGroup('Business Logic');
const data = service.createGroup('Data Access');
const infrastructure = service.createGroup('Infrastructure');
```

Structure:
```
📁 Presentation Layer
📁 Business Logic
📁 Data Access
📁 Infrastructure
```

### By Domain

Organize by business domain (DDD):

```typescript
const domains = [
  'User Management',
  'Asset Management',
  'Transaction Processing',
  'Reporting',
  'Integration'
];

domains.forEach(domain => {
  const group = service.createGroup(domain);
  
  // Sub-groups for bounded contexts
  service.createGroup('Commands', group.id);
  service.createGroup('Queries', group.id);
  service.createGroup('Events', group.id);
});
```

### Hybrid Approach

Combine multiple organizational strategies:

```typescript
// Top-level: Environment
const prod = service.createGroup('Production');

// Second-level: Feature
const prodAuth = service.createGroup('Authentication', prod.id);
const prodPayments = service.createGroup('Payments', prod.id);

// Third-level: Layer
service.createGroup('API', prodAuth.id);
service.createGroup('Business Logic', prodAuth.id);
service.createGroup('Data Access', prodAuth.id);
```

Structure:
```
📁 Production
  📁 Authentication
    📁 API
    📁 Business Logic
    📁 Data Access
  📁 Payments
    📁 API
    📁 Business Logic
    📁 Data Access
```

## Best Practices

### 1. Use Meaningful Names

✅ Good:
```typescript
service.createGroup('Core Authentication Contracts');
service.createGroup('Payment Processing');
service.createGroup('Governance & Voting');
```

❌ Bad:
```typescript
service.createGroup('Group 1');
service.createGroup('Misc');
service.createGroup('Temp');
```

### 2. Limit Nesting Depth

Aim for 2-3 levels maximum:

✅ Good:
```
📁 Backend
  📁 Authentication
    📁 OAuth
```

❌ Too Deep:
```
📁 Backend
  📁 Services
    📁 Authentication
      📁 OAuth
        📁 Providers
          📁 Google
```

### 3. Balance Group Sizes

Avoid groups that are too large or too small:

✅ Good: 3-10 contracts per group
❌ Too Many: 50+ contracts in one group
❌ Too Few: 1 contract per group (unless intentional)

### 4. Consistent Naming

Use consistent naming patterns:

```typescript
// Feature-based
service.createGroup('Auth Contracts');
service.createGroup('Payment Contracts');
service.createGroup('Storage Contracts');

// Or environment-based
service.createGroup('Production - Auth');
service.createGroup('Production - Payments');
service.createGroup('Production - Storage');
```

### 5. Regular Cleanup

Remove empty or unused groups:

```typescript
function cleanupEmptyGroups() {
  const groups = service.getAllGroups();
  
  groups.forEach(group => {
    if (group.id !== 'root' && group.contractIds.length === 0) {
      const children = service.getGroupChildren(group.id);
      if (children.length === 0) {
        console.log(`Removing empty group: ${group.name}`);
        service.deleteGroup(group.id);
      }
    }
  });
}
```

### 6. Document Group Purpose

Use group names that explain purpose:

```typescript
service.createGroup('Core Contracts - Required for all deployments');
service.createGroup('Experimental - Under active development');
service.createGroup('Deprecated - To be removed in v2.0');
```

### 7. Organize Before Scaling

Set up organization early:

```typescript
// Early in project
async function initializeWorkspace() {
  await service.loadGroups();
  
  if (service.getAllGroups().length === 1) {  // Only root
    // Set up initial structure
    service.createGroup('Core');
    service.createGroup('Utilities');
    service.createGroup('Testing');
  }
}
```

### 8. Use Groups for Batch Operations

Leverage groups for bulk actions:

```typescript
async function deployGroup(groupId: string) {
  const group = service.getGroup(groupId);
  if (!group) return;
  
  console.log(`Deploying ${group.contractIds.length} contracts from ${group.name}`);
  
  for (const contractId of group.contractIds) {
    await deployContract(contractId);
  }
}
```

### 9. Backup Group Configuration

```typescript
async function backupGroups() {
  const groups = service.getAllGroups();
  const backup = {
    timestamp: new Date().toISOString(),
    groups: groups
  };
  
  const json = JSON.stringify(backup, null, 2);
  await fs.promises.writeFile('group-backup.json', json);
  console.log(`Backed up ${groups.length} groups`);
}

// Run periodically or before major changes
```

### 10. Validate Structure

```typescript
function validateGroupStructure(): string[] {
  const issues: string[] = [];
  const groups = service.getAllGroups();
  
  // Check for orphaned groups
  groups.forEach(group => {
    if (group.parentId) {
      const parent = service.getGroup(group.parentId);
      if (!parent) {
        issues.push(`Group "${group.name}" has invalid parent`);
      }
    }
  });
  
  // Check for circular references
  function hasCircular(groupId: string, visited = new Set()): boolean {
    if (visited.has(groupId)) return true;
    visited.add(groupId);
    
    const group = service.getGroup(groupId);
    if (group?.parentId) {
      return hasCircular(group.parentId, visited);
    }
    return false;
  }
  
  groups.forEach(group => {
    if (hasCircular(group.id)) {
      issues.push(`Circular reference detected for "${group.name}"`);
    }
  });
  
  return issues;
}
```

## Advanced Scenarios

### Dynamic Group Creation

Create groups based on contract metadata:

```typescript
async function organizeByDependency() {
  const metadataService = new ContractMetadataService(workspace, output);
  const { contracts } = await metadataService.scanWorkspace();
  
  // Group by soroban-sdk version
  const versions = new Set(
    contracts
      .map(c => c.dependencies['soroban-sdk']?.version)
      .filter(v => v)
  );
  
  versions.forEach(version => {
    const group = service.createGroup(`SDK ${version}`);
    
    contracts.forEach(contract => {
      if (contract.dependencies['soroban-sdk']?.version === version) {
        service.addContractToGroup(contract.contractName, group.id);
      }
    });
  });
}
```

### Smart Group Suggestions

Suggest groups based on patterns:

```typescript
function suggestGroups(contracts: ContractMetadata[]): string[] {
  const suggestions: string[] = [];
  
  // Suggest by common prefixes
  const prefixes = new Map<string, number>();
  contracts.forEach(c => {
    const prefix = c.contractName.split('-')[0];
    prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
  });
  
  prefixes.forEach((count, prefix) => {
    if (count >= 3) {
      suggestions.push(`Create group for "${prefix}" contracts (${count} found)`);
    }
  });
  
  return suggestions;
}
```

### Group Templates

Pre-defined organization templates:

```typescript
function applyTemplate(template: 'microservices' | 'monorepo' | 'layered') {
  switch (template) {
    case 'microservices':
      ['Gateway', 'Services', 'Libraries', 'Utilities'].forEach(name => {
        service.createGroup(name);
      });
      break;
      
    case 'monorepo':
      const packages = service.createGroup('Packages');
      const apps = service.createGroup('Applications');
      service.createGroup('Core', packages.id);
      service.createGroup('Shared', packages.id);
      break;
      
    case 'layered':
      ['Presentation', 'Application', 'Domain', 'Infrastructure'].forEach(name => {
        service.createGroup(name);
      });
      break;
  }
}
```

---

**See Also:**
- [Contract Management](./contract-management.md)
- [Metadata Extraction](./contract-metadata-extraction.md)

**Last Updated:** February 21, 2026  
**Version:** 1.0.0
