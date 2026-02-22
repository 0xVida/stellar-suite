import * as vscode from 'vscode';
import { RpcRetryService } from '../services/rpcRetryService';
import { CircuitState } from '../services/circuitBreaker';

/**
 * Register retry and circuit breaker commands
 */
export function registerRetryCommands(
    context: vscode.ExtensionContext,
    retryService: RpcRetryService
): void {
    // Command: View circuit breaker status
    const viewCircuitStatusCommand = vscode.commands.registerCommand(
        'stellarSuite.viewCircuitBreakerStatus',
        async () => {
            const cbStats = retryService.getCircuitStats();
            const statusText = `
🔌 Circuit Breaker Status
${'='.repeat(50)}

**Current State**
- State: ${cbStats.state.toUpperCase()}
- Opened At: ${cbStats.openedAt ? new Date(cbStats.openedAt).toLocaleTimeString() : 'N/A'}
- Last Failure: ${cbStats.lastFailureTime ? new Date(cbStats.lastFailureTime).toLocaleTimeString() : 'Never'}
- Last Success: ${cbStats.lastSuccessTime ? new Date(cbStats.lastSuccessTime).toLocaleTimeString() : 'Never'}

**Statistics**
- Total Requests: ${cbStats.totalRequests}
- Successful: ${cbStats.successCount}
- Failed: ${cbStats.failureCount}
- Consecutive Failures: ${cbStats.consecutiveFailures}

**State Explanation**
${getCircuitStateExplanation(cbStats.state)}
`;
            await vscode.window.showInformationMessage(statusText, { modal: true });
        }
    );

    // Command: View retry statistics
    const viewRetryStatsCommand = vscode.commands.registerCommand(
        'stellarSuite.viewRetryStatistics',
        async () => {
            const allStats = retryService.getAllRetryStats();

            if (allStats.size === 0) {
                vscode.window.showInformationMessage('No retry statistics available yet');
                return;
            }

            const statsText = `
📊 RPC Retry Statistics
${'='.repeat(50)}

${Array.from(allStats.entries())
    .map(([operationName, stats]) => {
        const successRate =
            stats.totalAttempts > 0 ? ((stats.successfulAttempts / stats.totalAttempts) * 100).toFixed(2) : '0.00';
        return `
**${operationName}**
- Total Attempts: ${stats.totalAttempts}
- Successful: ${stats.successfulAttempts}
- Failed: ${stats.failedAttempts}
- Success Rate: ${successRate}%
- Avg Response Time: ${stats.averageResponseTimeMs.toFixed(2)}ms
- Total Delay: ${stats.totalDelayMs}ms
`;
    })
    .join('\n')}
`;
            await vscode.window.showInformationMessage(statsText, { modal: true });
        }
    );

    // Command: View retry history
    const viewRetryHistoryCommand = vscode.commands.registerCommand(
        'stellarSuite.viewRetryHistory',
        async () => {
            const history = retryService.getRetryHistory(20);

            if (history.length === 0) {
                vscode.window.showInformationMessage('No retry history available');
                return;
            }

            const historyText = history
                .map(
                    (attempt, index) => `
${index + 1}. Attempt ${attempt.attempt}
   - Status: ${attempt.success ? '✓ Success' : '✗ Failed'}
   - Response Time: ${attempt.responseTime}ms
   - Next Retry: ${attempt.nextRetryDelayMs ? `${attempt.nextRetryDelayMs}ms` : 'N/A'}
   - Error: ${attempt.error?.message || 'None'}
`
                )
                .join('\n');

            const doc = await vscode.workspace.openTextDocument({
                language: 'text',
                content: `Retry History (Last 20)\n${'='.repeat(50)}\n\n${historyText}`
            });

            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        }
    );

    // Command: Reset circuit breaker
    const resetCircuitCommand = vscode.commands.registerCommand(
        'stellarSuite.resetCircuitBreaker',
        async () => {
            const currentState = retryService.getCircuitStats().state;

            if (currentState === CircuitState.CLOSED) {
                vscode.window.showInformationMessage('Circuit breaker is already CLOSED');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Circuit breaker is ${currentState.toUpperCase()}. Reset and allow requests?`,
                'Reset',
                'Cancel'
            );

            if (confirm === 'Reset') {
                retryService.resetCircuit();
                vscode.window.showInformationMessage('✓ Circuit breaker reset to CLOSED');
            }
        }
    );

    // Command: Clear retry statistics
    const clearStatsCommand = vscode.commands.registerCommand(
        'stellarSuite.clearRetryStatistics',
        async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Clear all retry statistics?',
                'Clear',
                'Cancel'
            );

            if (confirm === 'Clear') {
                retryService.clearStats();
                vscode.window.showInformationMessage('✓ Retry statistics cleared');
            }
        }
    );

    // Command: Export circuit and retry data
    const exportDataCommand = vscode.commands.registerCommand(
        'stellarSuite.exportRetryData',
        async () => {
            const cbStats = retryService.getCircuitStats();
            const retryStats = retryService.getAllRetryStats();
            const history = retryService.getRetryHistory();

            const exportData = {
                exportedAt: new Date().toISOString(),
                circuitBreaker: cbStats,
                retryStatistics: Array.from(retryStats.entries()).map(([name, stats]) => ({
                    operationName: name,
                    ...stats
                })),
                recentHistory: history.slice(-50)
            };

            const doc = await vscode.workspace.openTextDocument({
                language: 'json',
                content: JSON.stringify(exportData, null, 2)
            });

            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            vscode.window.showInformationMessage('Retry and circuit breaker data exported');
        }
    );

    // Register all commands
    context.subscriptions.push(
        viewCircuitStatusCommand,
        viewRetryStatsCommand,
        viewRetryHistoryCommand,
        resetCircuitCommand,
        clearStatsCommand,
        exportDataCommand
    );
}

/**
 * Get explanation for circuit breaker state
 */
function getCircuitStateExplanation(state: CircuitState): string {
    const explanations: Record<CircuitState, string> = {
        [CircuitState.CLOSED]: `
- Normal operation
- All requests are attempted
- Service is healthy`,
        [CircuitState.OPEN]: `
- Service is unavailable
- Requests are blocked and fail fast
- Automatic recovery will be attempted after timeout`,
        [CircuitState.HALF_OPEN]: `
- Testing if service recovered
- Limited requests are allowed
- Circuit will close if requests succeed`
    };

    return explanations[state] || 'Unknown state';
}
