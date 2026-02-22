// ============================================================
// src/services/statusBadgeService.ts
// Service for managing operation status badges.
// ============================================================

import * as vscode from "vscode";
import {
  Badge,
  BadgeStatus,
  BadgeSeverity,
  BadgeAnimation,
  BadgePosition,
  BadgeEvent,
  BadgeSnapshot,
  BadgeCustomization,
  BadgeTheme,
  BadgeUpdateEvent,
  BadgeError,
  BadgeServiceConfig,
  BadgeGroup,
} from "../types/statusBadge";

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_THEME: BadgeTheme = {
  colors: {
    idle: "#6B7280",
    running: "#3B82F6",
    succeeded: "#10B981",
    failed: "#EF4444",
    cancelled: "#F59E0B",
    warning: "#F59E0B",
    info: "#3B82F6",
  },
  textColors: {
    dark: "#FFFFFF",
    light: "#000000",
  },
  animations: {
    pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
    spin: "spin 1s linear infinite",
    blink: "blink 0.7s infinite",
    fade: "fadeInOut 2s ease-in-out infinite",
  },
};

const DEFAULT_CUSTOMIZATION: BadgeCustomization = {
  enableAnimations: true,
  showTooltips: true,
  autoHideDuration: 5000,
  maxBadges: 10,
  position: BadgePosition.INLINE,
  fontSize: "normal",
  theme: "auto",
};

const DEFAULT_CONFIG: BadgeServiceConfig = {
  maxConcurrentBadges: 10,
  badgeLifetimeMs: 5000,
  enableLogging: true,
  enablePersistence: true,
  customization: DEFAULT_CUSTOMIZATION,
  theme: DEFAULT_THEME,
};

// Storage keys
const STORAGE_KEYS = {
  BADGES: "stellarSuite.badges",
  CUSTOMIZATION: "stellarSuite.badgeCustomization",
  THEME: "stellarSuite.badgeTheme",
};

// ============================================================
// Status Badge Service
// ============================================================

export class StatusBadgeService {
  private context: vscode.ExtensionContext;
  private config: BadgeServiceConfig;
  private outputChannel: vscode.OutputChannel;
  private badges: Map<string, Badge> = new Map();
  private badgeGroups: Map<string, BadgeGroup> = new Map();
  private autoHideTimers: Map<string, NodeJS.Timeout> = new Map();
  private disposables: vscode.Disposable[] = [];

  // Event emitters
  private badgeCreatedEmitter = new vscode.EventEmitter<Badge>();
  private badgeUpdatedEmitter = new vscode.EventEmitter<BadgeUpdateEvent>();
  private badgeRemovedEmitter = new vscode.EventEmitter<string>();
  private badgeEventEmitter = new vscode.EventEmitter<BadgeEvent>();
  private badgeErrorEmitter = new vscode.EventEmitter<BadgeError>();

  // Public event subscriptions
  readonly onBadgeCreated = this.badgeCreatedEmitter.event;
  readonly onBadgeUpdated = this.badgeUpdatedEmitter.event;
  readonly onBadgeRemoved = this.badgeRemovedEmitter.event;
  readonly onBadgeEvent = this.badgeEventEmitter.event;
  readonly onBadgeError = this.badgeErrorEmitter.event;

  constructor(
    context: vscode.ExtensionContext,
    config: Partial<BadgeServiceConfig> = {},
  ) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.outputChannel = vscode.window.createOutputChannel(
      "Stellar Suite - Status Badges",
    );

    this.loadState();
  }

  /**
   * Create a new badge for an operation
   */
  public createBadge(
    operationId: string,
    label: string,
    options?: {
      tooltip?: string;
      severity?: BadgeSeverity;
      animation?: BadgeAnimation;
      position?: BadgePosition;
      metadata?: Badge["metadata"];
    },
  ): Badge {
    const badgeId = `badge-${operationId}-${Date.now()}`;

    const badge: Badge = {
      id: badgeId,
      operationId,
      status: BadgeStatus.IDLE,
      severity: options?.severity ?? BadgeSeverity.INFO,
      label,
      tooltip: options?.tooltip,
      animation: options?.animation ?? BadgeAnimation.NONE,
      position: options?.position ?? this.config.customization.position,
      visible: true,
      timestamp: new Date(),
      metadata: options?.metadata,
    };

    // Check if we've reached max concurrent badges
    if (this.badges.size >= this.config.maxConcurrentBadges) {
      const oldestBadge = Array.from(this.badges.values()).sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      )[0];

      if (oldestBadge) {
        this.removeBadge(oldestBadge.id);
      }
    }

    this.badges.set(badgeId, badge);
    this.log(`Badge created: ${badgeId} (${label})`);
    this.badgeCreatedEmitter.fire(badge);

    return badge;
  }

  /**
   * Update badge status
   */
  public updateBadge(
    badgeId: string,
    updates: {
      status?: BadgeStatus;
      severity?: BadgeSeverity;
      label?: string;
      tooltip?: string;
      animation?: BadgeAnimation;
      errorMessage?: string;
    },
  ): Badge | undefined {
    const badge = this.badges.get(badgeId);
    if (!badge) {
      this.logError(`Badge not found: ${badgeId}`);
      return undefined;
    }

    const previousStatus = badge.status;
    const updateEvent: BadgeUpdateEvent = {
      type: "updated",
      badge: { ...badge },
      previousStatus,
      timestamp: new Date(),
    };

    // Apply updates
    if (updates.status !== undefined) {
      badge.status = updates.status;
    }
    if (updates.severity !== undefined) {
      badge.severity = updates.severity;
    }
    if (updates.label !== undefined) {
      badge.label = updates.label;
    }
    if (updates.tooltip !== undefined) {
      badge.tooltip = updates.tooltip;
    }
    if (updates.animation !== undefined) {
      badge.animation = updates.animation;
    }
    if (updates.errorMessage !== undefined) {
      badge.errorMessage = updates.errorMessage;
    }

    updateEvent.badge = badge;

    // Set auto-hide timer if status is terminal
    if (this.isTerminalStatus(updates.status ?? badge.status)) {
      this.setAutoHideTimer(badgeId);
    } else {
      this.clearAutoHideTimer(badgeId);
    }

    this.log(`Badge updated: ${badgeId}, new status: ${badge.status}`);
    this.badgeUpdatedEmitter.fire(updateEvent);

    return badge;
  }

  /**
   * Mark badge as running
   */
  public markRunning(badgeId: string, label?: string): Badge | undefined {
    return this.updateBadge(badgeId, {
      status: BadgeStatus.RUNNING,
      severity: BadgeSeverity.INFO,
      animation: BadgeAnimation.SPIN,
      label: label ?? "Running...",
    });
  }

  /**
   * Mark badge as succeeded
   */
  public markSucceeded(badgeId: string, label?: string): Badge | undefined {
    return this.updateBadge(badgeId, {
      status: BadgeStatus.SUCCEEDED,
      severity: BadgeSeverity.SUCCESS,
      animation: BadgeAnimation.PULSE,
      label: label ?? "Succeeded",
    });
  }

  /**
   * Mark badge as failed
   */
  public markFailed(
    badgeId: string,
    errorMessage: string,
    label?: string,
  ): Badge | undefined {
    const badge = this.updateBadge(badgeId, {
      status: BadgeStatus.FAILED,
      severity: BadgeSeverity.ERROR,
      animation: BadgeAnimation.NONE,
      errorMessage,
      label: label ?? "Failed",
    });

    if (badge) {
      const error: BadgeError = {
        badgeId: badge.id,
        operationId: badge.operationId,
        errorCode: "OPERATION_FAILED",
        errorMessage,
        severity: BadgeSeverity.ERROR,
        timestamp: new Date(),
        context: badge.metadata,
      };
      this.badgeErrorEmitter.fire(error);
    }

    return badge;
  }

  /**
   * Mark badge as cancelled
   */
  public markCancelled(badgeId: string, label?: string): Badge | undefined {
    return this.updateBadge(badgeId, {
      status: BadgeStatus.CANCELLED,
      severity: BadgeSeverity.WARNING,
      animation: BadgeAnimation.FADE,
      label: label ?? "Cancelled",
    });
  }

  /**
   * Mark badge as warning
   */
  public markWarning(
    badgeId: string,
    message: string,
    label?: string,
  ): Badge | undefined {
    return this.updateBadge(badgeId, {
      status: BadgeStatus.WARNING,
      severity: BadgeSeverity.WARNING,
      animation: BadgeAnimation.PULSE,
      label: label ?? "Warning",
      tooltip: message,
    });
  }

  /**
   * Get badge snapshot for rendering
   */
  public getBadgeSnapshot(badgeId: string): BadgeSnapshot | undefined {
    const badge = this.badges.get(badgeId);
    if (!badge) {
      return undefined;
    }

    return {
      id: badge.id,
      operationId: badge.operationId,
      status: badge.status,
      severity: badge.severity,
      label: badge.label,
      tooltip: badge.tooltip,
      animation: badge.animation,
      position: badge.position,
      visible: badge.visible,
      errorMessage: badge.errorMessage,
      cssClass: this.generateCssClass(badge),
    };
  }

  /**
   * Get all badges
   */
  public getAllBadges(): Badge[] {
    return Array.from(this.badges.values());
  }

  /**
   * Get badges for a specific operation
   */
  public getBadgesForOperation(operationId: string): Badge[] {
    return Array.from(this.badges.values()).filter(
      (b) => b.operationId === operationId,
    );
  }

  /**
   * Remove a badge
   */
  public removeBadge(badgeId: string): void {
    const badge = this.badges.get(badgeId);
    if (!badge) {
      return;
    }

    this.clearAutoHideTimer(badgeId);
    this.badges.delete(badgeId);
    this.log(`Badge removed: ${badgeId}`);
    this.badgeRemovedEmitter.fire(badgeId);
  }

  /**
   * Remove all badges for an operation
   */
  public removeBadgesForOperation(operationId: string): void {
    const badgesToRemove = this.getBadgesForOperation(operationId);
    badgesToRemove.forEach((badge) => this.removeBadge(badge.id));
  }

  /**
   * Create a badge group for batch operations
   */
  public createBadgeGroup(groupId: string): BadgeGroup {
    const group: BadgeGroup = {
      groupId,
      badges: [],
      status: BadgeStatus.IDLE,
      successCount: 0,
      failureCount: 0,
      cancelledCount: 0,
    };

    this.badgeGroups.set(groupId, group);
    return group;
  }

  /**
   * Add badge to group
   */
  public addBadgeToGroup(groupId: string, badge: Badge): void {
    const group = this.badgeGroups.get(groupId);
    if (!group) {
      return;
    }

    if (!group.badges.find((b) => b.id === badge.id)) {
      group.badges.push(badge);
    }
  }

  /**
   * Update group status
   */
  public updateGroupStatus(
    groupId: string,
    status: BadgeStatus,
    progressPercentage?: number,
  ): void {
    const group = this.badgeGroups.get(groupId);
    if (!group) {
      return;
    }

    group.status = status;
    if (progressPercentage !== undefined) {
      group.progressPercentage = progressPercentage;
    }

    // Update badge counts
    group.successCount = group.badges.filter(
      (b) => b.status === BadgeStatus.SUCCEEDED,
    ).length;
    group.failureCount = group.badges.filter(
      (b) => b.status === BadgeStatus.FAILED,
    ).length;
    group.cancelledCount = group.badges.filter(
      (b) => b.status === BadgeStatus.CANCELLED,
    ).length;
  }

  /**
   * Get badge group
   */
  public getBadgeGroup(groupId: string): BadgeGroup | undefined {
    return this.badgeGroups.get(groupId);
  }

  /**
   * Remove badge group
   */
  public removeBadgeGroup(groupId: string): void {
    const group = this.badgeGroups.get(groupId);
    if (!group) {
      return;
    }

    group.badges.forEach((badge) => this.removeBadge(badge.id));
    this.badgeGroups.delete(groupId);
  }

  /**
   * Update customization settings
   */
  public updateCustomization(customization: Partial<BadgeCustomization>): void {
    this.config.customization = {
      ...this.config.customization,
      ...customization,
    };
    this.saveState();
  }

  /**
   * Update theme
   */
  public updateTheme(theme: Partial<BadgeTheme>): void {
    this.config.theme = {
      ...this.config.theme,
      ...theme,
    };
    this.saveState();
  }

  /**
   * Get current customization
   */
  public getCustomization(): BadgeCustomization {
    return this.config.customization;
  }

  /**
   * Get current theme
   */
  public getTheme(): BadgeTheme {
    return this.config.theme;
  }

  /**
   * Clear all badges
   */
  public clearAll(): void {
    this.badges.forEach((badge) => {
      this.clearAutoHideTimer(badge.id);
    });
    this.badges.clear();
    this.badgeGroups.clear();
    this.log("All badges cleared");
  }

  /**
   * Get badge statistics
   */
  public getStatistics(): {
    totalBadges: number;
    byStatus: Record<BadgeStatus, number>;
    bySeverity: Record<BadgeSeverity, number>;
  } {
    const badges = Array.from(this.badges.values());
    const byStatus: Record<BadgeStatus, number> = {
      [BadgeStatus.IDLE]: 0,
      [BadgeStatus.RUNNING]: 0,
      [BadgeStatus.SUCCEEDED]: 0,
      [BadgeStatus.FAILED]: 0,
      [BadgeStatus.CANCELLED]: 0,
      [BadgeStatus.WARNING]: 0,
      [BadgeStatus.INFO]: 0,
    };

    const bySeverity: Record<BadgeSeverity, number> = {
      [BadgeSeverity.INFO]: 0,
      [BadgeSeverity.WARNING]: 0,
      [BadgeSeverity.ERROR]: 0,
      [BadgeSeverity.SUCCESS]: 0,
    };

    badges.forEach((badge) => {
      byStatus[badge.status]++;
      bySeverity[badge.severity]++;
    });

    return {
      totalBadges: badges.length,
      byStatus,
      bySeverity,
    };
  }

  /**
   * Dispose of service
   */
  public dispose(): void {
    this.clearAll();
    this.disposables.forEach((d) => d.dispose());
    this.badgeCreatedEmitter.dispose();
    this.badgeUpdatedEmitter.dispose();
    this.badgeRemovedEmitter.dispose();
    this.badgeEventEmitter.dispose();
    this.badgeErrorEmitter.dispose();
    this.outputChannel.dispose();
  }

  // ============================================================
  // Private Methods
  // ============================================================

  /**
   * Check if a status is terminal (no longer changing)
   */
  private isTerminalStatus(status: BadgeStatus): boolean {
    return [
      BadgeStatus.SUCCEEDED,
      BadgeStatus.FAILED,
      BadgeStatus.CANCELLED,
    ].includes(status);
  }

  /**
   * Set auto-hide timer for badge
   */
  private setAutoHideTimer(badgeId: string): void {
    if (!this.config.customization.autoHideDuration) {
      return;
    }

    this.clearAutoHideTimer(badgeId);

    const timer = setTimeout(() => {
      this.removeBadge(badgeId);
    }, this.config.customization.autoHideDuration);

    this.autoHideTimers.set(badgeId, timer);
  }

  /**
   * Clear auto-hide timer
   */
  private clearAutoHideTimer(badgeId: string): void {
    const timer = this.autoHideTimers.get(badgeId);
    if (timer) {
      clearTimeout(timer);
      this.autoHideTimers.delete(badgeId);
    }
  }

  /**
   * Generate CSS class string for badge
   */
  private generateCssClass(badge: Badge): string {
    const classes = [
      `badge-${badge.status.toLowerCase()}`,
      `severity-${badge.severity.toLowerCase()}`,
      `position-${badge.position?.toLowerCase() ?? "inline"}`,
      badge.animation && badge.animation !== BadgeAnimation.NONE
        ? `animation-${badge.animation.toLowerCase()}`
        : "",
    ];

    return classes.filter(Boolean).join(" ");
  }

  /**
   * Load state from context storage
   */
  private loadState(): void {
    try {
      const customization = this.context.workspaceState.get<BadgeCustomization>(
        STORAGE_KEYS.CUSTOMIZATION,
      );
      const theme = this.context.workspaceState.get<BadgeTheme>(
        STORAGE_KEYS.THEME,
      );

      if (customization) {
        this.config.customization = customization;
      }
      if (theme) {
        this.config.theme = theme;
      }

      this.log("State loaded successfully");
    } catch (error) {
      this.logError(`Failed to load state: ${error}`);
    }
  }

  /**
   * Save state to context storage
   */
  private saveState(): void {
    try {
      this.context.workspaceState.update(
        STORAGE_KEYS.CUSTOMIZATION,
        this.config.customization,
      );
      this.context.workspaceState.update(STORAGE_KEYS.THEME, this.config.theme);
      this.log("State saved successfully");
    } catch (error) {
      this.logError(`Failed to save state: ${error}`);
    }
  }

  /**
   * Log message
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      this.outputChannel.appendLine(`[StatusBadgeService] ${message}`);
    }
  }

  /**
   * Log error
   */
  private logError(message: string): void {
    if (this.config.enableLogging) {
      this.outputChannel.appendLine(`[StatusBadgeService] ERROR: ${message}`);
    }
  }
}
