# Status Badge Integration Examples

## Table of Contents
1. [Basic Single Operation](#basic-single-operation)
2. [Batch Deployment](#batch-deployment)
3. [Transaction Simulation](#transaction-simulation)
4. [Long-Running Operation](#long-running-operation)
5. [Real-Time Progress Updates](#real-time-progress-updates)
6. [Error Handling](#error-handling)

## Basic Single Operation

### Example: Deploy a Single Contract

```typescript
import { StatusBadgeService } from '../services/statusBadgeService';
import { BadgedOperation } from '../utils/badgeIntegration';

export async function deployContractWithBadge(
    context: vscode.ExtensionContext,
    contractPath: string,
    network: string
) {
    const badgeService = new StatusBadgeService(context);
    const badgedOp = new BadgedOperation(badgeService, `deploy-${Date.now()}`);

    badgedOp.start('Deploying contract...', {
        tooltip: `Deploying ${path.basename(contractPath)} to ${network}`,
        animation: BadgeAnimation.SPIN
    });

    try {
        // Build contract
        badgedOp.updateRunning('Building contract...');
        await buildContract(contractPath);

        // Deploy contract
        badgedOp.updateRunning('Deploying to network...');
        const contractId = await deployToNetwork(contractPath, network);

        // Success
        badgedOp.succeed(`Deployed: ${contractId}`);
        vscode.window.showInformationMessage(`Contract deployed: ${contractId}`);

        return contractId;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        badgedOp.fail(errorMsg, 'Deployment Failed');
        vscode.window.showErrorMessage(`Deployment failed: ${errorMsg}`);
        throw error;
    } finally {
        badgeService.dispose();
    }
}
```

## Batch Deployment

### Example: Deploy Multiple Contracts

```typescript
import { StatusBadgeService } from '../services/statusBadgeService';
import { BadgedBatchOperation } from '../utils/badgeIntegration';
import { CommandBadgeHelper } from '../utils/badgeIntegration';

export async function deployMultipleContracts(
    context: vscode.ExtensionContext,
    contracts: Array<{ path: string; network: string }>,
    options?: { stopOnFailure?: boolean }
) {
    const badgeService = new StatusBadgeService(context);
    const groupId = `batch-deploy-${Date.now()}`;

    const result = await CommandBadgeHelper.executeBatchWithBadges(
        badgeService,
        groupId,
        contracts.map((contract, index) => ({
            id: `contract-${index}`,
            label: `Deploying ${path.basename(contract.path)}...`,
            tooltip: `Deploying to ${contract.network}`,
            fn: async (badgedOp) => {
                badgedOp.updateRunning('Building...');
                await buildContract(contract.path);

                badgedOp.updateRunning('Uploading...');
                const contractId = await deployToNetwork(contract.path, contract.network);

                badgedOp.succeed(`Deployed: ${contractId}`);
                return contractId;
            }
        })),
        { continueOnError: !options?.stopOnFailure }
    );

    badgeService.dispose();

    // Report results
    vscode.window.showInformationMessage(
        `Batch deployment complete: ${result.successful.length} succeeded, ${result.failed.size} failed`
    );

    return result;
}
```

### Use with Group Badge in Sidebar

```typescript
// In sidebar webview
function renderBatchDeploymentStatus(batchOp: BadgedBatchOperation) {
    const stats = batchOp.getStats();
    const groupId = batchOp.getGroupId();

    const html = BadgeRenderer.renderGroupProgressHtml(
        groupId,
        stats.succeeded,
        stats.failed,
        0,
        stats.progress
    );

    return html;
}
```

## Transaction Simulation

### Example: Simulate a Contract Invocation

```typescript
import { StatusBadgeService } from '../services/statusBadgeService';
import { BadgedOperation, CommandBadgeHelper } from '../utils/badgeIntegration';

export async function simulateTransactionWithBadge(
    context: vscode.ExtensionContext,
    contractId: string,
    functionName: string,
    args: any[],
    network: string
) {
    const badgeService = new StatusBadgeService(context);

    try {
        const result = await CommandBadgeHelper.executeWithBadge(
            badgeService,
            `sim-${contractId}`,
            `Simulating ${functionName}...`,
            async (badgedOp) => {
                // Prepare simulation
                badgedOp.updateRunning('Preparing simulation...');
                const preparedTx = await prepareTransaction(
                    contractId,
                    functionName,
                    args
                );

                // Execute simulation
                badgedOp.updateRunning('Executing on blockchain...');
                const simResult = await simulateTransaction(preparedTx, network);

                // Update final label
                if (simResult.success) {
                    badgedOp.setLabel(`Simulation successful`);
                } else {
                    badgedOp.setLabel(`Simulation completed with errors`);
                }

                return simResult;
            },
            { tooltip: `${functionName} on ${contractId}` }
        );

        // Display detailed results
        displaySimulationResults(result);
        return result;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Simulation failed: ${errorMsg}`);
        throw error;
    } finally {
        badgeService.dispose();
    }
}
```

## Long-Running Operation

### Example: Build with Streaming Output

```typescript
import { StatusBadgeService } from '../services/statusBadgeService';
import { BadgedOperation } from '../utils/badgeIntegration';

export async function buildContractWithBadge(
    context: vscode.ExtensionContext,
    contractPath: string
) {
    const badgeService = new StatusBadgeService(context);
    const badgedOp = new BadgedOperation(badgeService, `build-${contractPath}`);

    badgedOp.start('Building contract...', {
        animation: BadgeAnimation.SPIN,
        tooltip: `Building ${path.basename(contractPath)}`
    });

    const outputChannel = vscode.window.createOutputChannel('Build Output');

    try {
        // Start build process
        const buildProcess = buildContractProcess(contractPath);

        // Monitor build progress
        buildProcess.on('data', (data: string) => {
            outputChannel.append(data);

            // Update badge based on output
            if (data.includes('Compiling')) {
                badgedOp.setLabel('Building: Compiling...');
            } else if (data.includes('Linking')) {
                badgedOp.setLabel('Building: Linking...');
            } else if (data.includes('Optimizing')) {
                badgedOp.setLabel('Building: Optimizing...');
            }
        });

        // Wait for completion
        await new Promise((resolve, reject) => {
            buildProcess.on('exit', (code: number) => {
                if (code === 0) resolve(undefined);
                else reject(new Error(`Build failed with exit code ${code}`));
            });
            buildProcess.on('error', reject);
        });

        badgedOp.succeed('Build complete');
        vscode.window.showInformationMessage('Contract built successfully');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        badgedOp.fail(errorMsg, 'Build Failed');
        outputChannel.show();
        vscode.window.showErrorMessage(`Build failed: ${errorMsg}`);
        throw error;
    } finally {
        badgeService.dispose();
    }
}
```

## Real-Time Progress Updates

### Example: Download and Install Dependencies

```typescript
import { StatusBadgeService } from '../services/statusBadgeService';
import { BadgedBatchOperation } from '../utils/badgeIntegration';

export async function installDependenciesWithBadge(
    context: vscode.ExtensionContext,
    dependencies: string[]
) {
    const badgeService = new StatusBadgeService(context);
    const groupId = `install-${Date.now()}`;
    const batchOp = new BadgedBatchOperation(badgeService, groupId, dependencies.length);

    try {
        for (const dependency of dependencies) {
            const badgedOp = batchOp.startOperation(
                `install-${dependency}`,
                `Installing ${dependency}...`,
                `Downloading and installing ${dependency}`
            );

            try {
                // Download
                badgedOp.setLabel(`Installing ${dependency}... (downloading)`);
                await downloadDependency(dependency);

                // Extract
                badgedOp.setLabel(`Installing ${dependency}... (extracting)`);
                await extractDependency(dependency);

                // Verify
                badgedOp.setLabel(`Installing ${dependency}... (verifying)`);
                await verifyDependency(dependency);

                batchOp.succeedOperation(`install-${dependency}`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                batchOp.failOperation(`install-${dependency}`, errorMsg);
            }
        }

        batchOp.finish();
        vscode.window.showInformationMessage('All dependencies installed');
    } finally {
        batchOp.dispose();
        badgeService.dispose();
    }
}
```

## Error Handling

### Example: Comprehensive Error Handling

```typescript
import { StatusBadgeService } from '../services/statusBadgeService';
import { BadgedOperation, BadgeNotification } from '../utils/badgeIntegration';

export async function operationWithErrorHandling(
    context: vscode.ExtensionContext,
    operationId: string
) {
    const badgeService = new StatusBadgeService(context);

    // Subscribe to error events
    const subscriptions = [
        badgeService.onBadgeError((error) => {
            console.error(`Badge error: ${error.errorMessage}`);
            logToAnalytics({
                event: 'operation_failed',
                operationId: error.operationId,
                error: error.errorMessage,
                context: error.context
            });
        }),

        badgeService.onBadgeUpdated((event) => {
            if (event.badge.status === BadgeStatus.FAILED) {
                console.warn(`Operation failed: ${event.badge.label}`);
            }
        })
    ];

    const badgedOp = new BadgedOperation(badgeService, operationId);

    try {
        badgedOp.start('Processing...');

        // Simulate operations with various error scenarios
        try {
            badgedOp.updateRunning('Step 1: Validating...');
            await validateOperation();
        } catch (validationError) {
            badgedOp.warn(
                'Validation warning: ' + (validationError as Error).message,
                'Warning'
            );
            // Continue after warning
        }

        try {
            badgedOp.updateRunning('Step 2: Processing...');
            await processOperation();
        } catch (processError) {
            const msg = (processError as Error).message;
            badgedOp.fail(msg, 'Processing failed');

            // Show detailed error to user
            const details = await getUserErrorDetails(processError);
            vscode.window.showErrorMessage(
                `Operation failed: ${msg}`,
                'Show Details',
                'Report Issue'
            ).then(selection => {
                if (selection === 'Show Details') {
                    vscode.window.showInformationMessage(details);
                } else if (selection === 'Report Issue') {
                    reportIssue(msg, details);
                }
            });

            throw processError;
        }

        badgedOp.succeed('Operation completed');
        vscode.window.showInformationMessage('Operation successful');
    } catch (error) {
        // Already handled above
    } finally {
        // Clean up subscriptions
        subscriptions.forEach(s => s.dispose());
        badgeService.dispose();
    }
}
```

### Integration with Command Handler

```typescript
export function registerDeployCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        'stellarSuite.deployContract',
        async () => {
            try {
                const contractPath = await selectContractPath();
                const network = await selectNetwork();

                const contractId = await deployContractWithBadge(
                    context,
                    contractPath,
                    network
                );

                return { contractId, success: true };
            } catch (error) {
                console.error('Deploy command error:', error);
                return { success: false, error };
            }
        }
    );

    context.subscriptions.push(disposable);
}
```

## Testing Badge Integration

```typescript
import * as assert from 'assert';
import { StatusBadgeService } from '../services/statusBadgeService';
import { BadgedOperation } from '../utils/badgeIntegration';

async function testBadgeIntegration() {
    const context = new MockExtensionContext() as any;
    const service = new StatusBadgeService(context);

    let successFired = false;
    let failFired = false;

    // Subscribe to events
    service.onBadgeUpdated((event) => {
        if (event.badge.status === BadgeStatus.SUCCEEDED) {
            successFired = true;
        }
        if (event.badge.status === BadgeStatus.FAILED) {
            failFired = true;
        }
    });

    // Test success flow
    const badgedOp = new BadgedOperation(service, 'test-op');
    badgedOp.start('Test operation');
    badgedOp.succeed('Test completed');

    assert.strictEqual(successFired, true);

    service.dispose();
    console.log('[ok] badge integration test passed');
}
```

## Tips and Tricks

### Tip 1: Dynamic Label Updates
```typescript
const badge = service.createBadge('op', 'Processing...');
for (let i = 0; i < 100; i++) {
    service.updateBadge(badge.id, {
        label: `Processing: ${i}%`
    });
}
```

### Tip 2: Contextual Metadata
```typescript
const badge = service.createBadge('deploy', 'Deploying...', {
    metadata: {
        contractId: 'CAB3D...',
        functionName: 'transfer',
        network: 'testnet',
        source: 'user@example.com'
    }
});
```

### Tip 3: Conditional Badge Display
```typescript
if (settings.showBadges) {
    badgedOp.start('Processing...');
} else {
    // Just do the operation without badge
    await doOperation();
}
```

### Tip 4: Badge Cleanup
```typescript
// Auto-cleanup after success
service.updateCustomization({
    autoHideDuration: 3000  // 3 seconds
});
```

### Tip 5: Theme Switching
```typescript
// Dark theme
service.updateTheme({
    colors: { running: '#4CAF50', ... }
});

// Light theme
service.updateTheme({
    colors: { running: '#2E7D32', ... }
});
```
