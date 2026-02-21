# Toast Notification System

The toast notification system provides a centralized way to display temporary messages to users in the Stellar Suite extension.

## Features

- **Multiple notification types**: Success, Error, Warning, and Info
- **Auto-dismiss**: Configurable automatic dismissal after a duration
- **Manual dismissal**: Users can dismiss notifications manually
- **Queue management**: Automatically queues excess notifications
- **Priority ordering**: Higher priority notifications shown first
- **Action buttons**: Support for custom action buttons
- **Group management**: Organize and dismiss related notifications
- **Progress indicators**: Show progress for long-running operations
- **Statistics tracking**: Monitor notification history and patterns
- **Status bar integration**: Shows notification count in status bar
- **Output channel logging**: All notifications logged for reference

## Usage

### Basic Notifications

```typescript
// Import the service from the extension context
import { toastNotificationService } from './extension';

// Success notification
await toastNotificationService.success('Contract deployed successfully!');

// Error notification (doesn't auto-dismiss by default)
await toastNotificationService.error('Deployment failed: Invalid contract');

// Warning notification
await toastNotificationService.warning('This operation may take a while');

// Info notification
await toastNotificationService.info('Contract build started');
```

### Notifications with Actions

```typescript
await toastNotificationService.error('Deployment failed', {
    actions: [
        {
            label: 'View Logs',
            callback: () => {
                vscode.commands.executeCommand('stellarSuite.showLogs');
            }
        },
        {
            label: 'Retry',
            callback: async () => {
                await retryDeployment();
            }
        }
    ]
});
```

### Custom Duration

```typescript
// Show for 10 seconds
await toastNotificationService.info('Processing...', {
    duration: 10000
});

// Never auto-dismiss
await toastNotificationService.info('Important message', {
    duration: 0
});
```

### Progress Notifications

```typescript
// Create progress notification
const id = await toastNotificationService.info('Uploading contract...', {
    progress: 0,
    duration: 0 // Don't auto-dismiss
});

// Update progress
toastNotificationService.update(id, { progress: 50 });
toastNotificationService.update(id, { progress: 100 });

// Dismiss when complete
toastNotificationService.dismiss(id);
```

### Grouped Notifications

```typescript
// Create related notifications with group ID
await toastNotificationService.info('Deploying contract 1...', {
    group: 'batch-deployment'
});

await toastNotificationService.info('Deploying contract 2...', {
    group: 'batch-deployment'
});

// Dismiss entire group at once
toastNotificationService.dismissGroup('batch-deployment');
```

### Priority Notifications

```typescript
// High priority notification (shown first)
await toastNotificationService.error('Critical error!', {
    priority: 10
});

// Normal priority
await toastNotificationService.info('Regular info', {
    priority: 5
});

// Low priority
await toastNotificationService.info('Background task complete', {
    priority: 1
});
```

## Commands

### Show Notification History

Command: `stellarSuite.showNotificationHistory`

Opens a quick pick menu showing:
- Notification statistics (total shown, currently visible, queued)
- Breakdown by notification type
- Options to clear statistics or dismiss all notifications
- Link to notification output channel

## Configuration

Settings can be configured in VS Code settings under `stellarSuite.notifications`:

```json
{
    "stellarSuite.notifications.maxVisible": 3,
    "stellarSuite.notifications.maxQueued": 10,
    "stellarSuite.notifications.defaultDuration": 5000,
    "stellarSuite.notifications.position": "bottom-right",
    "stellarSuite.notifications.enableAnimations": true
}
```

## Integration Example

Here's how to integrate the toast notification system in a command:

```typescript
import { toastNotificationService } from './extension';

export async function deployContract(context: vscode.ExtensionContext) {
    try {
        // Show starting notification
        const notificationId = await toastNotificationService.info(
            'Deploying contract...',
            { 
                duration: 0,
                progress: 0
            }
        );

        // Perform deployment
        await performDeployment((progress) => {
            // Update progress
            toastNotificationService.update(notificationId, {
                progress: Math.round(progress * 100)
            });
        });

        // Show success
        toastNotificationService.dismiss(notificationId);
        await toastNotificationService.success('Contract deployed successfully!', {
            actions: [{
                label: 'View Contract',
                callback: () => {
                    vscode.commands.executeCommand('stellarSuite.viewContract');
                }
            }]
        });

    } catch (error) {
        // Show error with retry option
        await toastNotificationService.error(
            `Deployment failed: ${error.message}`,
            {
                actions: [{
                    label: 'Retry',
                    callback: () => deployContract(context)
                }]
            }
        );
    }
}
```

## API Reference

### ToastNotificationService

#### Methods

- `success(message: string, options?: Partial<ToastOptions>): Promise<string>`
- `error(message: string, options?: Partial<ToastOptions>): Promise<string>`
- `warning(message: string, options?: Partial<ToastOptions>): Promise<string>`
- `info(message: string, options?: Partial<ToastOptions>): Promise<string>`
- `show(options: ToastOptions): Promise<string>`
- `dismiss(id: string): void`
- `dismissAll(): void`
- `dismissGroup(group: string): void`
- `update(id: string, options: Partial<ToastOptions>): void`
- `getStatistics(): ToastStatistics`
- `onToastEvent(listener: (event: ToastEvent) => void): vscode.Disposable`
- `clear(): void`
- `dispose(): void`

### ToastOptions

```typescript
interface ToastOptions {
    message: string;
    type: ToastType;
    duration?: number;          // Auto-dismiss duration in ms (0 = never)
    actions?: ToastAction[];    // Action buttons
    dismissible?: boolean;      // Show close button
    id?: string;                // Custom ID
    priority?: number;          // Queue priority
    group?: string;             // Group identifier
    progress?: number;          // Progress (0-100)
    icon?: string;              // Custom icon
}
```

## Testing

Run the unit tests:

```bash
npm run test:toast-notification
```

The test suite includes 24 comprehensive tests covering:
- Basic toast creation (success, error, warning, info)
- Toast dismissal (single, all, by group)
- Queue management (max visible, priority ordering)
- Toast updates (message, progress)
- Statistics tracking
- Event handling
- Configuration
- Edge cases and error handling
- Auto-dismiss behavior

## Architecture

The toast notification system consists of three main components:

1. **ToastNotificationService** (`src/services/toastNotificationService.ts`):
   - Core service managing toast lifecycle
   - Queue management and priority ordering
   - Event emission and statistics tracking
   - Platform-agnostic implementation

2. **ToastNotificationPanel** (`src/ui/toastNotificationPanel.ts`):
   - UI integration with VS Code
   - Status bar integration
   - Output channel logging
   - Statistics display

3. **Type Definitions** (`src/types/toastNotification.ts`):
   - TypeScript interfaces and enums
   - Complete type safety

## Future Enhancements

Potential future improvements:
- Custom webview for richer notification UI
- Notification templates
- Persistent notification history
- User preference for notification position
- Sound notifications
- Desktop notifications integration
