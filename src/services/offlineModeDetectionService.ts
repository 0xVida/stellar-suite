// ============================================================
// src/services/offlineModeDetectionService.ts
// Detects and manages offline mode state.
// Monitors network connectivity and provides offline indicators.
// ============================================================

import { OfflineState } from '../types/offlineSimulation';

// ── Minimal VS Code-compatible interfaces ──────────────────────

interface SimpleOutputChannel {
    appendLine(value: string): void;
}

interface SimpleWorkspaceState {
    get<T>(key: string, defaultValue?: T): T | undefined;
    update(key: string, value: unknown): Thenable<void>;
}

interface SimpleExtensionContext {
    workspaceState: SimpleWorkspaceState;
}

// ── Internal constants ────────────────────────────────────────

const OFFLINE_STATE_KEY = 'stellarSuite.offlineState';
const NETWORK_CHECK_TIMEOUT_MS = 5000;

// ── Service class ─────────────────────────────────────────────

/**
 * OfflineModeDetectionService detects and tracks offline mode status.
 *
 * Responsibilities:
 * - Detecting network connectivity
 * - Managing offline state
 * - Providing offline mode indicators
 * - Tracking last successful online check
 */
export class OfflineModeDetectionService {
    private offlineState: OfflineState = {
        isOffline: false,
        lastOnlineCheck: new Date().toISOString(),
        networkStatus: 'online',
    };
    private outputChannel: SimpleOutputChannel;
    private checkIntervalId: NodeJS.Timeout | null = null;

    constructor(
        private readonly context: SimpleExtensionContext,
        outputChannel?: SimpleOutputChannel
    ) {
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg: string) => { /* no-op */ },
        };
        this.loadStateFromStorage();
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Get current offline state.
     */
    public getOfflineState(): OfflineState {
        return { ...this.offlineState };
    }

    /**
     * Check if currently in offline mode.
     */
    public isOffline(): boolean {
        return this.offlineState.isOffline;
    }

    /**
     * Get network status.
     */
    public getNetworkStatus(): 'online' | 'offline' | 'degraded' {
        return this.offlineState.networkStatus ?? 'online';
    }

    /**
     * Manually set offline mode.
     */
    public async setOfflineMode(isOffline: boolean, reason?: string): Promise<void> {
        this.offlineState.isOffline = isOffline;
        this.offlineState.networkStatus = isOffline ? 'offline' : 'online';
        if (reason) {
            this.offlineState.failureReason = reason;
        }
        if (!isOffline) {
            this.offlineState.lastOnlineCheck = new Date().toISOString();
        }

        await this.saveStateToStorage();
        this.outputChannel.appendLine(
            `[OfflineMode] Offline mode ${isOffline ? 'enabled' : 'disabled'}${
                reason ? `: ${reason}` : ''
            }`
        );
    }

    /**
     * Attempt to establish online connection.
     */
    public async checkNetworkConnectivity(): Promise<boolean> {
        try {
            // Try to reach a public DNS or fallback endpoint
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), NETWORK_CHECK_TIMEOUT_MS);

            try {
                // Use HEAD request to minimize server load and data transfer
                const response = await fetch('https://www.google.com', {
                    method: 'HEAD',
                    signal: controller.signal,
                    // Disable caching to force actual network check
                    cache: 'no-cache',
                });

                clearTimeout(timeoutId);

                const isOnline = response.ok || response.status === 405; // 405 is acceptable for HEAD
                await this.setOfflineMode(!isOnline);

                return isOnline;
            } catch (fetchError) {
                clearTimeout(timeoutId);
                await this.setOfflineMode(true, 'Network connectivity check failed');
                return false;
            }
        } catch (error) {
            this.outputChannel.appendLine(
                `[OfflineMode] Error checking connectivity: ${error instanceof Error ? error.message : String(error)}`
            );
            return false;
        }
    }

    /**
     * Start periodic connectivity checks.
     */
    public startConnectivityMonitoring(intervalMs: number = 30000): void {
        if (this.checkIntervalId) {
            return; // Already monitoring
        }

        this.checkIntervalId = setInterval(() => {
            this.checkNetworkConnectivity().catch((error) => {
                this.outputChannel.appendLine(
                    `[OfflineMode] Monitoring error: ${error instanceof Error ? error.message : String(error)}`
                );
            });
        }, intervalMs);

        this.outputChannel.appendLine(
            `[OfflineMode] Started connectivity monitoring (interval: ${intervalMs}ms)`
        );
    }

    /**
     * Stop periodic connectivity checks.
     */
    public stopConnectivityMonitoring(): void {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
            this.outputChannel.appendLine('[OfflineMode] Stopped connectivity monitoring');
        }
    }

    /**
     * Get time since last successful online check.
     */
    public getTimeSinceLastOnlineCheck(): number {
        const lastCheck = new Date(this.offlineState.lastOnlineCheck).getTime();
        return Date.now() - lastCheck;
    }

    /**
     * Reset offline state.
     */
    public async reset(): Promise<void> {
        this.offlineState = {
            isOffline: false,
            lastOnlineCheck: new Date().toISOString(),
            networkStatus: 'online',
        };
        await this.saveStateToStorage();
        this.outputChannel.appendLine('[OfflineMode] State reset');
    }

    /**
     * Cleanup resources.
     */
    public dispose(): void {
        this.stopConnectivityMonitoring();
    }

    // ── Internal helpers ──────────────────────────────────────

    private async loadStateFromStorage(): Promise<void> {
        try {
            const stored = this.context.workspaceState.get<OfflineState>(OFFLINE_STATE_KEY);
            if (stored) {
                this.offlineState = stored;
            }
        } catch (error) {
            this.outputChannel.appendLine(
                `[OfflineMode] Error loading state: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async saveStateToStorage(): Promise<void> {
        try {
            await this.context.workspaceState.update(OFFLINE_STATE_KEY, this.offlineState);
        } catch (error) {
            this.outputChannel.appendLine(
                `[OfflineMode] Error saving state: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}
