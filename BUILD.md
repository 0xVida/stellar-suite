# Building and Running Stellar Suite Extension

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- TypeScript compiler
- VS Code extension API types
- Node.js types

### 2. Compile the Extension

```bash
npm run compile
```

This compiles TypeScript files from `src/` to `out/`.

### 3. Run in VS Code Extension Development Host

Optional parser tests:

```bash
npm test
```

**Option A: Using VS Code UI**
1. Open this folder in VS Code
2. Press `F5` (or go to Run > Start Debugging)
3. A new VS Code window will open with "Extension Development Host" in the title
4. In that window, you can:
   - Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run commands like:
     - "Stellar Suite: Build Contract"
     - "Stellar Suite: Deploy Contract"
     - "Stellar Suite: Simulate Soroban Transaction"
     - "Stellar Suite: Configure CLI"
   - Or use the Stellar Suite sidebar (icon in the Activity Bar)

**Option B: Using Launch Configuration**
- The `.vscode/launch.json` is already configured
- Just press `F5` to start debugging

### 4. Watch Mode (Auto-compile on changes)

While developing, use watch mode to automatically recompile:

```bash
npm run watch
```

Then press `F5` in VS Code. The extension will reload when you make changes.

## Packaging the Extension

To create a `.vsix` file for distribution:

### 1. Install vsce (VS Code Extension Manager)

```bash
npm install -g @vscode/vsce
```

### 2. Package the Extension

```bash
vsce package
```

This creates `stellar-suite-0.1.0.vsix` in the current directory.

### 3. Install the .vsix File

**Option A: From VS Code UI**
1. Open VS Code
2. Go to Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Click the `...` menu at the top
4. Select "Install from VSIX..."
5. Choose the `.vsix` file

**Option B: From Command Line**

```bash
code --install-extension stellar-suite-0.1.0.vsix
```

## Troubleshooting

### Extension doesn't appear in Command Palette

- Make sure you compiled: `npm run compile`
- Check that `out/extension.js` exists
- Reload the Extension Development Host window (`Cmd+R` / `Ctrl+R`)

### TypeScript errors

- Run `npm install` to ensure all dependencies are installed
- Check `tsconfig.json` is correct
- Make sure VS Code is using the workspace TypeScript version

### CLI not found errors

- Make sure Stellar CLI is installed: `stellar --version`
- Configure `stellarSuite.cliPath` in VS Code settings if CLI is not in PATH
- Configure `stellarSuite.source` if you use a different identity name

## Development Workflow

1. Make changes to TypeScript files in `src/`
2. Run `npm run watch` in a terminal (or it auto-compiles on save if configured)
3. Press `F5` to launch Extension Development Host
4. Test your changes
5. Press `Shift+F5` to stop debugging
6. Repeat

## Project Structure

```
stellar-vscode/
├── src/              # TypeScript source files
├── out/              # Compiled JavaScript (generated)
├── package.json      # Extension manifest
├── tsconfig.json     # TypeScript configuration
└── .vscode/          # VS Code launch configuration
```
## State Validation & Integrity Checks

### Overview

The State Validation system provides runtime validation of workspace state, detecting corruption, preventing data loss, and supporting safe auto-repair of recoverable issues.

**Modules:**
- `src/services/stateValidationService.ts` - Main validation engine
- `src/utils/stateIntegrity.ts` - Reusable validation utilities

### Features

1. **Structure Validation**
   - Validates top-level workspace state structure
   - Checks required fields exist and have correct types
   - Validates nested object and array shapes

2. **Data Type Consistency**
   - Runtime type checking (not compile-time)
   - Validates strings, numbers, booleans, objects, arrays
   - Validates enum values against allowed sets

3. **Relationship Verification**
   - Checks for orphaned references
   - Detects duplicate IDs
   - Validates reference integrity

4. **Corruption Detection**
   - Detects invalid timestamps (negative, out of range)
   - Identifies impossible state combinations
   - Detects data truncation patterns
   - Marks issues by severity: INFO, WARNING, ERROR, CRITICAL

5. **Auto-Repair**
   - Safe, deterministic repairs only (logged)
   - Examples: remove duplicates (keep first), reset invalid enums to defaults
   - Never auto-repairs data loss scenarios or relationship rewiring
   - Skips auto-repair if CRITICAL corruption found

### Usage

#### Programmatic API

```typescript
import { getStateValidationService } from './services/stateValidationService';

const service = getStateValidationService();

const result = service.validate(workspaceState, {
    autoRepair: true,
    checkRelationships: true,
    detectCorruption: true,
    logVerbose: false
});

// result.valid boolean
// result.severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
// result.issues: ValidationIssue[]
// result.repairs: RepairAction[]
// result.summary: {...}
```

#### Validation Result Structure

```typescript
interface ValidationResult {
    valid: boolean;
    severity: ValidationSeverity;
    issues: ValidationIssue[];      // Detailed issue list
    repairs: RepairAction[];         // Repairs applied
    summary: {
        totalIssues: number;
        infoCount: number;
        warningCount: number;
        errorCount: number;
        criticalCount: number;
        repaired: number;            // Successfully repaired
        unrepaired: number;          // Could not repair
    };
    timestamp: number;
}
```

### Validation Rules

#### State Structure Requirements

Required top-level fields:
- `deployments` - Map<string, DeploymentRecord> or Record<string, DeploymentRecord>
- `configurations` - Record<string, any>
- `lastSync` - number (timestamp)
- `syncVersion` - number (current: 1)

#### Deployment Record Fields

Required:
- `contractId` - string (valid contract ID format)
- `deployedAt` - ISO 8601 date string
- `network` - string (one of: 'public', 'testnet', 'futurenet', 'local')

Optional:
- `contractName` - string
- `source` - string
- `transactionHash` - string
- `metadata` - Record<string, any>

### Utility Functions

`src/utils/stateIntegrity.ts` provides reusable, pure validation functions:

#### Type Guards
```typescript
isString(value): boolean
isNumber(value): boolean
isBoolean(value): boolean
isObject(value): boolean
isArray(value): boolean
isDefined(value): boolean
```

#### ID Validation
```typescript
isValidUUID(value): boolean
isValidId(value): boolean
isValidContractId(value): boolean
```

#### Collection Utilities
```typescript
checkUniqueIds<T>(items: T[]): boolean
findDuplicateIds<T>(items: T[]): { duplicateIds, counts }
deduplicateById<T>(items: T[]): T[]
```

### Testing

Comprehensive test suite: `src/test/stateValidationService.test.ts`

**Run tests:**
```bash
npm test
```

**Coverage areas:**
- Type guards, ID validation, duplicate detection
- Timestamp validation, structure validation
- Service validation with 15+ specific test cases
- Circular reference detection
- Integration tests

**Target: 90%+ coverage of validation logic**

### Severity Levels

- **INFO** - Non-critical observations
- **WARNING** - Minor issues (e.g., invalid enum)
- **ERROR** - Significant issues preventing normal operation
- **CRITICAL** - Unrecoverable corruption

Auto-repair only applies if max severity < CRITICAL.
├── .vscode/          # VS Code launch configuration
```