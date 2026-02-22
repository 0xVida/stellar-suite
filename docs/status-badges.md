# Status Badge System Documentation

## Overview

The Status Badge System provides real-time visual feedback for operations throughout the Stellar Suite UI. Badges display operation states (running, succeeded, failed, cancelled, warning) with customizable styling, animations, and tooltips.

## Architecture

### Core Components

#### 1. **StatusBadgeService** (`src/services/statusBadgeService.ts`)
Central service managing badge lifecycle and state.

**Key Features:**
- Create and manage badges for operations
- Real-time status updates with event emitters
- Badge groups for batch operations
- Auto-hide functionality for terminal states
- Customization and theming support
- Statistics and monitoring

**Usage:**
```typescript
import { StatusBadgeService } from '../services/statusBadgeService';

// Initialize service
const service = new StatusBadgeService(context);

// Create a badge
const badge = service.createBadge('operation-1', 'Deploying contract...');

// Update status
service.markRunning(badge.id);
service.markSucceeded(badge.id, 'Deployment successful');
```

#### 2. **Badge UI Components** (`src/ui/badgeComponents.ts`)
Rendering and styling components for badges.

**Key Classes:**
- `BadgeStyleGenerator`: Generates inline styles and CSS classes
- `BadgeRenderer`: Renders badges as HTML
- `BadgeContainer`: DOM container for managing badges
- `BadgeCssGenerator`: Generates complete stylesheets

**Usage:**
```typescript
import { BadgeRenderer, BadgeContainer } from '../ui/badgeComponents';

// Render single badge
const html = BadgeRenderer.renderBadgeHtml(snapshot, service);

// Render multiple badges
const htmlMultiple = BadgeRenderer.renderBadgesHtml(snapshots, service);

// Create container
const container = new BadgeContainer('badge-container', service);
```

#### 3. **Badge Integration Utilities** (`src/utils/badgeIntegration.ts`)
High-level helpers for integrating badges with commands and operations.

**Key Classes:**
- `BadgedOperation`: Wrapper for single operations
- `BadgedBatchOperation`: Wrapper for batch operations
- `CommandBadgeHelper`: Command execution with badges
- `BadgeNotification`: Quick notification helpers

**Usage:**
```typescript
// Single operation
const badgedOp = new BadgedOperation(service, 'deploy-1');
badgedOp.start('Deploying...');
try {
    // do work
    badgedOp.succeed();
} catch (error) {
    badgedOp.fail(error.message);
}

// Batch operation
const result = await CommandBadgeHelper.executeBatchWithBadges(
    service,
    'batch-1',
    [
        { id: 'op-1', label: 'Deploy 1', fn: deployOp1 },
        { id: 'op-2', label: 'Deploy 2', fn: deployOp2 }
    ]
);
```

## Badge Status Types

```typescript
enum BadgeStatus {
    IDLE = 'idle',           // Not started
    RUNNING = 'running',     // In progress
    SUCCEEDED = 'succeeded', // Completed successfully
    FAILED = 'failed',       // Failed
    CANCELLED = 'cancelled', // Cancelled by user
    WARNING = 'warning',     // Warning state
    INFO = 'info'            // Information
}
```

## Badge Severity Levels

```typescript
enum BadgeSeverity {
    INFO = 'info',       // Informational
    WARNING = 'warning', // Warning
    ERROR = 'error',     // Error
    SUCCESS = 'success'  // Success
}
```

## Badge Animations

```typescript
enum BadgeAnimation {
    NONE = 'none',     // No animation
    PULSE = 'pulse',   // Pulsing opacity
    SPIN = 'spin',     // Spinning rotation
    BLINK = 'blink',   // Blinking
    FADE = 'fade'      // Fade in/out
}
```

## Badge Positions

```typescript
enum BadgePosition {
    INLINE = 'inline',   // Display inline with text
    CORNER = 'corner',   // Display at corner
    OVERLAY = 'overlay'  // Display as overlay
}
```

## API Reference

### StatusBadgeService

#### Methods

**`createBadge(operationId, label, options?): Badge`**
Creates a new badge for an operation.

```typescript
const badge = service.createBadge('deploy-1', 'Deploying...', {
    tooltip: 'Deployment in progress',
    severity: BadgeSeverity.INFO,
    animation: BadgeAnimation.SPIN,
    metadata: { contractId: '...', network: 'testnet' }
});
```

**`updateBadge(badgeId, updates): Badge | undefined`**
Updates badge properties.

```typescript
service.updateBadge(badge.id, {
    status: BadgeStatus.RUNNING,
    label: 'Processing...',
    animation: BadgeAnimation.SPIN
});
```

**`markRunning(badgeId, label?): Badge | undefined`**
Marks badge as running with spin animation.

**`markSucceeded(badgeId, label?): Badge | undefined`**
Marks badge as succeeded with pulse animation.

**`markFailed(badgeId, errorMessage, label?): Badge | undefined`**
Marks badge as failed and emits error event.

**`markCancelled(badgeId, label?): Badge | undefined`**
Marks badge as cancelled.

**`markWarning(badgeId, message, label?): Badge | undefined`**
Marks badge as warning.

**`removeBadge(badgeId): void`**
Removes a badge and clears its timer.

**`removeBadgesForOperation(operationId): void`**
Removes all badges for an operation.

**`createBadgeGroup(groupId): BadgeGroup`**
Creates a badge group for batch operations.

**`addBadgeToGroup(groupId, badge): void`**
Adds badge to a group.

**`updateGroupStatus(groupId, status, progressPercentage?): void`**
Updates group status and progress.

**`getAllBadges(): Badge[]`**
Returns all active badges.

**`getBadgesForOperation(operationId): Badge[]`**
Returns badges for a specific operation.

**`getBadgeSnapshot(badgeId): BadgeSnapshot | undefined`**
Returns a snapshot suitable for rendering.

**`updateCustomization(customization): void`**
Updates customization settings.

**`updateTheme(theme): void`**
Updates theme colors.

**`getStatistics(): Object`**
Returns badge statistics.

**`clearAll(): void`**
Removes all badges.

**`dispose(): void`**
Cleans up service resources.

#### Events

**`onBadgeCreated: Event<Badge>`**
Emitted when a badge is created.

**`onBadgeUpdated: Event<BadgeUpdateEvent>`**
Emitted when a badge is updated.

**`onBadgeRemoved: Event<string>`**
Emitted when a badge is removed.

**`onBadgeError: Event<BadgeError>`**
Emitted when a badge enters error state.

## Integration Patterns

### Pattern 1: Command with Badge

```typescript
async function deployContractCommand(context: vscode.ExtensionContext) {
    const service = new StatusBadgeService(context);
    
    const badge = service.createBadge('deploy-cmd', 'Deploying contract...');
    service.markRunning(badge.id);
    
    try {
        // Deployment logic
        const contractId = await deployContract();
        service.markSucceeded(badge.id, `Deployed: ${contractId}`);
    } catch (error) {
        service.markFailed(badge.id, error.message);
        vscode.window.showErrorMessage(`Deployment failed: ${error.message}`);
    }
}
```

### Pattern 2: Batch Operation with Group

```typescript
async function deployMultipleContracts(context: vscode.ExtensionContext) {
    const service = new StatusBadgeService(context);
    const contracts = ['contract1', 'contract2', 'contract3'];
    
    const result = await CommandBadgeHelper.executeBatchWithBadges(
        service,
        'batch-deploy',
        contracts.map(contract => ({
            id: `deploy-${contract}`,
            label: `Deploying ${contract}...`,
            fn: async (badgedOp) => {
                await deployContract(contract);
                badgedOp.succeed(`${contract} deployed`);
            }
        })),
        { continueOnError: true }
    );
    
    console.log(`Deployed: ${result.successful.length}`);
    console.log(`Failed: ${result.failed.size}`);
}
```

### Pattern 3: Long-Running Operation

```typescript
async function simulateTransactionWithBadge(context: vscode.ExtensionContext) {
    const service = new StatusBadgeService(context);
    
    await CommandBadgeHelper.executeWithBadge(
        service,
        'sim-1',
        'Simulating transaction...',
        async (badgedOp) => {
            badgedOp.updateRunning('Preparing simulation...');
            await delay(500);
            
            badgedOp.updateRunning('Executing on chain...');
            const result = await simulateTransaction();
            
            badgedOp.setLabel(`Simulation: ${result.status}`);
            return result;
        }
    );
}
```

### Pattern 4: Real-Time Updates

```typescript
async function buildContractWithProgress(context: vscode.ExtensionContext) {
    const service = new StatusBadgeService(context);
    const badge = service.createBadge('build-1', 'Building...');
    
    // Subscribe to build events
    const subscription = buildService.onProgress((progress) => {
        service.updateBadge(badge.id, {
            label: `Building: ${progress.percentage}%`
        });
    });
    
    try {
        await buildContract();
        service.markSucceeded(badge.id);
    } catch (error) {
        service.markFailed(badge.id, error.message);
    } finally {
        subscription.dispose();
    }
}
```

## Customization

### Theme Configuration

```typescript
const service = new StatusBadgeService(context, {
    theme: {
        colors: {
            idle: '#6B7280',
            running: '#3B82F6',
            succeeded: '#10B981',
            failed: '#EF4444',
            cancelled: '#F59E0B',
            warning: '#F59E0B',
            info: '#3B82F6'
        },
        textColors: {
            dark: '#FFFFFF',
            light: '#000000'
        },
        animations: {
            pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            spin: 'spin 1s linear infinite',
            blink: 'blink 0.7s infinite',
            fade: 'fadeInOut 2s ease-in-out infinite'
        }
    }
});
```

### Customization Settings

```typescript
const service = new StatusBadgeService(context, {
    customization: {
        enableAnimations: true,
        showTooltips: true,
        autoHideDuration: 5000,    // milliseconds
        maxBadges: 10,
        position: BadgePosition.INLINE,
        fontSize: 'normal',         // 'small' | 'normal' | 'large'
        theme: 'auto'               // 'dark' | 'light' | 'auto'
    }
});
```

## Testing

### Unit Tests Location
- `src/test/statusBadgeService.test.ts` - Service tests
- `src/test/badgeComponents.test.ts` - Component tests

### Running Tests
```bash
npm test -- statusBadgeService.test.ts
npm test -- badgeComponents.test.ts
```

### Test Coverage
- Badge creation and lifecycle
- Status updates and transitions
- Badge groups and batch operations
- Event emitters
- Customization and theming
- HTML rendering and security
- CSS generation
- Auto-hide functionality

## Best Practices

1. **Lifecycle Management**
   - Always dispose badges in finally blocks
   - Use badge groups for correlating multiple operations
   - Leverage auto-hide for non-persistent badges

2. **Error Handling**
   - Always provide meaningful error messages
   - Include error context in metadata
   - Listen to badge error events for logging

3. **Performance**
   - Use badge groups for batch operations
   - Limit max concurrent badges (default: 10)
   - Dispose unused badges immediately

4. **UI/UX**
   - Use consistent labels across similar operations
   - Provide helpful tooltips for complex operations
   - Use appropriate severity levels
   - Disable animations for accessibility-conscious users

5. **Accessibility**
   - Always provide aria-labels
   - Use semantic HTML
   - Ensure sufficient color contrast
   - Support keyboard navigation

## Troubleshooting

### Badges not appearing
- Check that the badge container element exists
- Verify the service is initialized
- Ensure badges are not hidden by CSS

### Memory leaks
- Always call `dispose()` on service
- Verify auto-hide timers are cleared
- Monitor badge count with `getStatistics()`

### Performance issues
- Reduce `maxConcurrentBadges`
- Disable animations if not needed
- Use badge groups instead of individual badges for bulk operations

### Styling issues
- Verify theme colors are valid CSS colors
- Check that CSS is injected into webview
- Ensure no conflicting CSS rules

## Examples

### Example 1: Contract Deployment
See [INTEGRATION_EXAMPLES.md](./INTEGRATION_EXAMPLES.md)

### Example 2: Batch Deployment
See [INTEGRATION_EXAMPLES.md](./INTEGRATION_EXAMPLES.md)

### Example 3: Transaction Simulation
See [INTEGRATION_EXAMPLES.md](./INTEGRATION_EXAMPLES.md)

## API Stability

The badge system API is considered stable. Future versions will maintain backward compatibility.

## Contributing

When adding new badge functionality:
1. Add type definitions to `src/types/statusBadge.ts`
2. Implement service methods in `src/services/statusBadgeService.ts`
3. Add UI components to `src/ui/badgeComponents.ts`
4. Add unit tests to `src/test/`
5. Update this documentation

## License

Same as Stellar Suite project license.
