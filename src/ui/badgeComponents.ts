// ============================================================
// src/ui/badgeComponents.ts
// UI components for rendering status badges.
// ============================================================

import { BadgeSnapshot, BadgeStatus, BadgeSeverity, BadgeAnimation } from '../types/statusBadge';
import { StatusBadgeService } from '../services/statusBadgeService';

// ============================================================
// Badge Style Generator
// ============================================================

export class BadgeStyleGenerator {
    /**
     * Generate inline styles for a badge
     */
    static generateInlineStyles(snapshot: BadgeSnapshot, service: StatusBadgeService): string {
        const theme = service.getTheme();
        const colors = theme.colors;

        let baseColor = colors[snapshot.status];
        switch (snapshot.status) {
            case BadgeStatus.RUNNING:
                baseColor = colors.running;
                break;
            case BadgeStatus.SUCCEEDED:
                baseColor = colors.succeeded;
                break;
            case BadgeStatus.FAILED:
                baseColor = colors.failed;
                break;
            case BadgeStatus.CANCELLED:
                baseColor = colors.cancelled;
                break;
            case BadgeStatus.WARNING:
                baseColor = colors.warning;
                break;
            case BadgeStatus.INFO:
                baseColor = colors.info;
                break;
            default:
                baseColor = colors.idle;
        }

        return `
            background-color: ${baseColor};
            color: ${theme.textColors.light};
            padding: 2px 6px;
            border-radius: 2px;
            font-size: 10px;
            font-weight: 600;
            display: inline-block;
            margin-left: 8px;
            white-space: nowrap;
            vertical-align: middle;
            ${snapshot.animation && snapshot.animation !== BadgeAnimation.NONE ? `animation: ${theme.animations[snapshot.animation]};` : ''}
        `;
    }

    /**
     * Generate CSS classes for badge
     */
    static generateClasses(snapshot: BadgeSnapshot): string {
        const classes = [
            'stellar-badge',
            `badge-${snapshot.status.toLowerCase()}`,
            `severity-${snapshot.severity.toLowerCase()}`,
            `position-${snapshot.position?.toLowerCase() ?? 'inline'}`,
            snapshot.animation && snapshot.animation !== BadgeAnimation.NONE ? `animate-${snapshot.animation.toLowerCase()}` : ''
        ];

        return classes.filter(Boolean).join(' ');
    }

    /**
     * Get icon for badge status
     */
    static getStatusIcon(snapshot: BadgeSnapshot): string {
        switch (snapshot.status) {
            case BadgeStatus.RUNNING:
                return '⟳';
            case BadgeStatus.SUCCEEDED:
                return '✓';
            case BadgeStatus.FAILED:
                return '✕';
            case BadgeStatus.CANCELLED:
                return '⊗';
            case BadgeStatus.WARNING:
                return '⚠';
            case BadgeStatus.INFO:
                return 'ⓘ';
            case BadgeStatus.IDLE:
            default:
                return '●';
        }
    }

    /**
     * Get aria label for accessibility
     */
    static getAriaLabel(snapshot: BadgeSnapshot): string {
        return `Badge: ${snapshot.label}, Status: ${snapshot.status}, Severity: ${snapshot.severity}${snapshot.errorMessage ? `, Error: ${snapshot.errorMessage}` : ''}`;
    }
}

// ============================================================
// Badge Renderer
// ============================================================

export class BadgeRenderer {
    /**
     * Render a badge as HTML
     */
    static renderBadgeHtml(snapshot: BadgeSnapshot, service: StatusBadgeService): string {
        const customization = service.getCustomization();
        const icon = BadgeStyleGenerator.getStatusIcon(snapshot);
        const ariaLabel = BadgeStyleGenerator.getAriaLabel(snapshot);
        const style = BadgeStyleGenerator.generateInlineStyles(snapshot, service);
        const classes = BadgeStyleGenerator.generateClasses(snapshot);

        const tooltipHtml = customization.showTooltips && snapshot.tooltip
            ? `title="${this.escapeHtml(snapshot.tooltip)}"`
            : '';

        const errorHtml = snapshot.errorMessage && snapshot.status === BadgeStatus.FAILED
            ? `<div class="badge-error-message">${this.escapeHtml(snapshot.errorMessage)}</div>`
            : '';

        return `
            <span
                class="${classes}"
                style="${style}"
                data-badge-id="${snapshot.id}"
                data-operation-id="${snapshot.operationId}"
                aria-label="${ariaLabel}"
                role="status"
                ${tooltipHtml}
            >
                <span class="badge-icon">${icon}</span>
                <span class="badge-label">${this.escapeHtml(snapshot.label)}</span>
            </span>
            ${errorHtml}
        `;
    }

    /**
     * Render multiple badges as HTML
     */
    static renderBadgesHtml(snapshots: BadgeSnapshot[], service: StatusBadgeService): string {
        return snapshots
            .filter(s => s.visible)
            .map(snapshot => this.renderBadgeHtml(snapshot, service))
            .join('');
    }

    /**
     * Render a badge group progress indicator
     */
    static renderGroupProgressHtml(
        groupId: string,
        successCount: number,
        failureCount: number,
        cancelledCount: number,
        progressPercentage?: number,
        service?: StatusBadgeService
    ): string {
        const total = successCount + failureCount + cancelledCount;
        const progressStyle = progressPercentage !== undefined ? `width: ${progressPercentage}%;` : '';

        return `
            <div class="badge-group" data-group-id="${groupId}">
                <div class="badge-group-stats">
                    <span class="badge-group-success">✓ ${successCount}</span>
                    <span class="badge-group-failed">✕ ${failureCount}</span>
                    <span class="badge-group-cancelled">⊗ ${cancelledCount}</span>
                    <span class="badge-group-total">/ ${total}</span>
                </div>
                ${progressPercentage !== undefined ? `
                    <div class="badge-group-progress">
                        <div class="badge-group-progress-bar" style="${progressStyle}"></div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Escape HTML special characters
     */
    private static escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================================
// Badge Container Component
// ============================================================

export class BadgeContainer {
    private container: HTMLElement;
    private service: StatusBadgeService;
    private badgeSnapshots: Map<string, BadgeSnapshot> = new Map();
    private disposables: Array<() => void> = [];

    constructor(containerId: string, service: StatusBadgeService) {
        const element = document.getElementById(containerId);
        if (!element) {
            throw new Error(`Container element with id ${containerId} not found`);
        }

        this.container = element;
        this.service = service;
        this.setupEventListeners();
        this.render();
    }

    /**
     * Add a badge to container
     */
    public addBadge(snapshot: BadgeSnapshot): void {
        this.badgeSnapshots.set(snapshot.id, snapshot);
        this.render();
    }

    /**
     * Update a badge
     */
    public updateBadge(snapshot: BadgeSnapshot): void {
        this.badgeSnapshots.set(snapshot.id, snapshot);
        this.render();
    }

    /**
     * Remove a badge
     */
    public removeBadge(badgeId: string): void {
        this.badgeSnapshots.delete(badgeId);
        this.render();
    }

    /**
     * Clear all badges
     */
    public clear(): void {
        this.badgeSnapshots.clear();
        this.render();
    }

    /**
     * Render all badges
     */
    public render(): void {
        const snapshots = Array.from(this.badgeSnapshots.values()).filter(s => s.visible);
        this.container.innerHTML = BadgeRenderer.renderBadgesHtml(snapshots, this.service);
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        const onBadgeCreated = this.service.onBadgeCreated((badge) => {
            const snapshot = this.service.getBadgeSnapshot(badge.id);
            if (snapshot) {
                this.addBadge(snapshot);
            }
        });

        const onBadgeUpdated = this.service.onBadgeUpdated((event) => {
            const snapshot = this.service.getBadgeSnapshot(event.badge.id);
            if (snapshot) {
                this.updateBadge(snapshot);
            }
        });

        const onBadgeRemoved = this.service.onBadgeRemoved((badgeId) => {
            this.removeBadge(badgeId);
        });

        this.disposables.push(
            () => onBadgeCreated.dispose?.(),
            () => onBadgeUpdated.dispose?.(),
            () => onBadgeRemoved.dispose?.()
        );
    }

    /**
     * Dispose of component
     */
    public dispose(): void {
        this.disposables.forEach(d => d());
        this.clear();
    }
}

// ============================================================
// Badge Toast Notification
// ============================================================

export class BadgeToastNotification {
    static show(
        message: string,
        status: BadgeStatus = BadgeStatus.INFO,
        durationMs: number = 3000
    ): void {
        const toast = document.createElement('div');
        toast.className = `badge-toast badge-toast-${status}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            animation: slideInUp 0.3s ease-out;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOutDown 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, durationMs);
    }

    static success(message: string, durationMs?: number): void {
        this.show(message, BadgeStatus.SUCCEEDED, durationMs);
    }

    static error(message: string, durationMs?: number): void {
        this.show(message, BadgeStatus.FAILED, durationMs);
    }

    static warning(message: string, durationMs?: number): void {
        this.show(message, BadgeStatus.WARNING, durationMs);
    }

    static info(message: string, durationMs?: number): void {
        this.show(message, BadgeStatus.INFO, durationMs);
    }
}

// ============================================================
// Badge CSS Stylesheet Generator
// ============================================================

export class BadgeCssGenerator {
    /**
     * Generate complete CSS stylesheet for badges
     */
    static generateStylesheet(service: StatusBadgeService): string {
        const customization = service.getCustomization();
        const theme = service.getTheme();
        const fontSizeMap = {
            small: '9px',
            normal: '10px',
            large: '12px'
        };

        return `
            /* Stellar Suite Badge Styles */

            .stellar-badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 2px;
                font-size: ${fontSizeMap[customization.fontSize]};
                font-weight: 600;
                white-space: nowrap;
                vertical-align: middle;
                transition: all 0.2s ease;
                user-select: none;
            }

            /* Status-based styling */
            .badge-idle {
                background-color: ${theme.colors.idle};
                color: ${theme.textColors.light};
            }

            .badge-running {
                background-color: ${theme.colors.running};
                color: ${theme.textColors.light};
            }

            .badge-succeeded {
                background-color: ${theme.colors.succeeded};
                color: ${theme.textColors.light};
            }

            .badge-failed {
                background-color: ${theme.colors.failed};
                color: ${theme.textColors.light};
            }

            .badge-cancelled {
                background-color: ${theme.colors.cancelled};
                color: ${theme.textColors.light};
            }

            .badge-warning {
                background-color: ${theme.colors.warning};
                color: ${theme.textColors.light};
            }

            .badge-info {
                background-color: ${theme.colors.info};
                color: ${theme.textColors.light};
            }

            /* Severity-based styling */
            .severity-error {
                border-left: 2px solid ${theme.colors.failed};
            }

            .severity-warning {
                border-left: 2px solid ${theme.colors.warning};
            }

            .severity-success {
                border-left: 2px solid ${theme.colors.succeeded};
            }

            .severity-info {
                border-left: 2px solid ${theme.colors.info};
            }

            /* Position-based styling */
            .position-inline {
                display: inline-block;
                margin-left: 8px;
            }

            .position-corner {
                position: absolute;
                top: -6px;
                right: -6px;
            }

            .position-overlay {
                position: absolute;
                top: 4px;
                right: 4px;
            }

            /* Animations */
            ${customization.enableAnimations ? `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }

                @keyframes fadeInOut {
                    0%, 100% { opacity: 0.5; }
                    50% { opacity: 1; }
                }

                @keyframes slideInUp {
                    from {
                        transform: translateY(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                @keyframes slideOutDown {
                    from {
                        transform: translateY(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateY(100%);
                        opacity: 0;
                    }
                }

                .animate-pulse {
                    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }

                .animate-spin {
                    animation: spin 1s linear infinite;
                    display: inline-block;
                }

                .animate-blink {
                    animation: blink 0.7s infinite;
                }

                .animate-fade {
                    animation: fadeInOut 2s ease-in-out infinite;
                }
            ` : ''}

            /* Badge icon and label */
            .badge-icon {
                margin-right: 4px;
            }

            .badge-label {
                font-size: inherit;
            }

            /* Error message styling */
            .badge-error-message {
                font-size: 9px;
                margin-top: 2px;
                padding: 2px 4px;
                background: rgba(0, 0, 0, 0.1);
                border-radius: 2px;
                word-wrap: break-word;
            }

            /* Badge group styling */
            .badge-group {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
                border: 1px solid var(--vscode-sideBar-border);
                border-radius: 4px;
                background: var(--vscode-list-inactiveSelectionBackground);
            }

            .badge-group-stats {
                display: flex;
                gap: 8px;
                font-size: 10px;
                font-weight: 600;
            }

            .badge-group-success {
                color: ${theme.colors.succeeded};
            }

            .badge-group-failed {
                color: ${theme.colors.failed};
            }

            .badge-group-cancelled {
                color: ${theme.colors.cancelled};
            }

            .badge-group-total {
                color: var(--vscode-descriptionForeground);
            }

            .badge-group-progress {
                width: 100px;
                height: 4px;
                background: var(--vscode-list-inactiveSelectionBackground);
                border-radius: 2px;
                overflow: hidden;
            }

            .badge-group-progress-bar {
                height: 100%;
                background: var(--vscode-progressBar-background);
                transition: width 0.3s ease;
            }

            /* Toast notification styling */
            .badge-toast {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 16px;
                border-radius: 4px;
                color: white;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                z-index: 10000;
            }

            .badge-toast-idle {
                background-color: ${theme.colors.idle};
            }

            .badge-toast-running {
                background-color: ${theme.colors.running};
            }

            .badge-toast-succeeded {
                background-color: ${theme.colors.succeeded};
            }

            .badge-toast-failed {
                background-color: ${theme.colors.failed};
            }

            .badge-toast-cancelled {
                background-color: ${theme.colors.cancelled};
            }

            .badge-toast-warning {
                background-color: ${theme.colors.warning};
            }

            .badge-toast-info {
                background-color: ${theme.colors.info};
            }

            /* Hover effects */
            .stellar-badge:hover {
                opacity: 0.9;
                transform: scale(1.05);
            }

            /* Focus styles for accessibility */
            .stellar-badge:focus {
                outline: 2px solid var(--vscode-focusBorder);
                outline-offset: 2px;
            }
        `;
    }
}
