// ============================================================
// src/utils/badgeIntegration.ts
// Utilities for integrating status badges with operations.
// ============================================================

import * as vscode from "vscode";
import { StatusBadgeService } from "../services/statusBadgeService";
import {
  BadgeStatus,
  BadgeSeverity,
  BadgeAnimation,
} from "../types/statusBadge";

/**
 * Wrapper for operations that automatically creates and manages badges
 */
export class BadgedOperation {
  private service: StatusBadgeService;
  private badgeId: string | null = null;
  private operationId: string;

  constructor(service: StatusBadgeService, operationId: string) {
    this.service = service;
    this.operationId = operationId;
  }

  /**
   * Start operation with badge
   */
  public start(
    label: string,
    options?: {
      tooltip?: string;
      animation?: BadgeAnimation;
    },
  ): void {
    const badge = this.service.createBadge(this.operationId, label, {
      tooltip: options?.tooltip,
      animation: options?.animation ?? BadgeAnimation.SPIN,
      severity: BadgeSeverity.INFO,
    });

    this.badgeId = badge.id;
    this.service.markRunning(badge.id);
  }

  /**
   * Update operation status to running
   */
  public updateRunning(label?: string): void {
    if (this.badgeId) {
      this.service.markRunning(this.badgeId, label);
    }
  }

  /**
   * Mark operation as succeeded
   */
  public succeed(label?: string): void {
    if (this.badgeId) {
      this.service.markSucceeded(this.badgeId, label);
    }
  }

  /**
   * Mark operation as failed
   */
  public fail(errorMessage: string, label?: string): void {
    if (this.badgeId) {
      this.service.markFailed(this.badgeId, errorMessage, label);
    }
  }

  /**
   * Mark operation as cancelled
   */
  public cancel(label?: string): void {
    if (this.badgeId) {
      this.service.markCancelled(this.badgeId, label);
    }
  }

  /**
   * Mark operation as warning
   */
  public warn(message: string, label?: string): void {
    if (this.badgeId) {
      this.service.markWarning(this.badgeId, message, label);
    }
  }

  /**
   * Update badge label
   */
  public setLabel(label: string): void {
    if (this.badgeId) {
      this.service.updateBadge(this.badgeId, { label });
    }
  }

  /**
   * Get the badge ID
   */
  public getBadgeId(): string | null {
    return this.badgeId;
  }

  /**
   * Get the operation ID
   */
  public getOperationId(): string {
    return this.operationId;
  }
}

/**
 * Wrapper for batch operations with group badges
 */
export class BadgedBatchOperation {
  private service: StatusBadgeService;
  private groupId: string;
  private operationBadges: Map<string, string> = new Map(); // operationId -> badgeId
  private operationCount: number;
  private completedCount: number = 0;
  private successCount: number = 0;
  private failureCount: number = 0;

  constructor(
    service: StatusBadgeService,
    groupId: string,
    operationCount: number,
  ) {
    this.service = service;
    this.groupId = groupId;
    this.operationCount = operationCount;
    this.service.createBadgeGroup(groupId);
  }

  /**
   * Start an operation in the batch
   */
  public startOperation(
    operationId: string,
    label: string,
    tooltip?: string,
  ): BadgedOperation {
    const badge = this.service.createBadge(operationId, label, {
      tooltip,
      animation: BadgeAnimation.SPIN,
      severity: BadgeSeverity.INFO,
    });

    this.operationBadges.set(operationId, badge.id);
    this.service.addBadgeToGroup(this.groupId, badge);
    this.service.markRunning(badge.id);

    this.updateGroupStatus();

    return new BadgedOperation(this.service, operationId);
  }

  /**
   * Mark operation as succeeded
   */
  public succeedOperation(operationId: string): void {
    const badgeId = this.operationBadges.get(operationId);
    if (badgeId) {
      this.service.markSucceeded(badgeId, "Succeeded");
      this.completedCount++;
      this.successCount++;
      this.updateGroupStatus();
    }
  }

  /**
   * Mark operation as failed
   */
  public failOperation(operationId: string, errorMessage: string): void {
    const badgeId = this.operationBadges.get(operationId);
    if (badgeId) {
      this.service.markFailed(badgeId, errorMessage, "Failed");
      this.completedCount++;
      this.failureCount++;
      this.updateGroupStatus();
    }
  }

  /**
   * Mark operation as cancelled
   */
  public cancelOperation(operationId: string): void {
    const badgeId = this.operationBadges.get(operationId);
    if (badgeId) {
      this.service.markCancelled(badgeId, "Cancelled");
      this.completedCount++;
      this.updateGroupStatus();
    }
  }

  /**
   * Get progress percentage
   */
  public getProgress(): number {
    return (this.completedCount / this.operationCount) * 100;
  }

  /**
   * Get statistics
   */
  public getStats(): {
    total: number;
    completed: number;
    succeeded: number;
    failed: number;
    progress: number;
  } {
    return {
      total: this.operationCount,
      completed: this.completedCount,
      succeeded: this.successCount,
      failed: this.failureCount,
      progress: this.getProgress(),
    };
  }

  /**
   * Finish the batch
   */
  public finish(): void {
    if (this.failureCount > 0) {
      this.service.updateGroupStatus(this.groupId, BadgeStatus.FAILED, 100);
    } else {
      this.service.updateGroupStatus(this.groupId, BadgeStatus.SUCCEEDED, 100);
    }
  }

  /**
   * Cancel the batch
   */
  public cancel(): void {
    // Cancel remaining operations
    for (const [operationId, badgeId] of this.operationBadges) {
      if (this.operationBadges.has(operationId)) {
        const badge = this.service.getBadgeSnapshot(badgeId);
        if (badge && badge.status === BadgeStatus.RUNNING) {
          this.service.markCancelled(badgeId, "Cancelled");
        }
      }
    }

    this.service.updateGroupStatus(
      this.groupId,
      BadgeStatus.CANCELLED,
      this.getProgress(),
    );
  }

  /**
   * Get group ID
   */
  public getGroupId(): string {
    return this.groupId;
  }

  /**
   * Dispose of batch
   */
  public dispose(): void {
    this.service.removeBadgeGroup(this.groupId);
    this.operationBadges.clear();
  }

  /**
   * Update group status
   */
  private updateGroupStatus(): void {
    const progress = this.getProgress();
    const status =
      this.completedCount === 0
        ? BadgeStatus.RUNNING
        : this.failureCount > 0
          ? BadgeStatus.WARNING
          : BadgeStatus.RUNNING;

    this.service.updateGroupStatus(this.groupId, status, progress);
  }
}

/**
 * Helper to integrate badges with VS Code commands
 */
export class CommandBadgeHelper {
  /**
   * Wrap a command function to add badge support
   */
  static async executeWithBadge<T>(
    service: StatusBadgeService,
    operationId: string,
    label: string,
    fn: (badgedOp: BadgedOperation) => Promise<T>,
    options?: {
      tooltip?: string;
      animation?: BadgeAnimation;
    },
  ): Promise<T> {
    const badgedOp = new BadgedOperation(service, operationId);
    badgedOp.start(label, options);

    try {
      const result = await fn(badgedOp);
      badgedOp.succeed("Success");
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      badgedOp.fail(errorMessage, "Failed");
      throw error;
    }
  }

  /**
   * Wrap a batch command to add badge group support
   */
  static async executeBatchWithBadges<T>(
    service: StatusBadgeService,
    groupId: string,
    operations: Array<{
      id: string;
      label: string;
      tooltip?: string;
      fn: (badgedOp: BadgedOperation) => Promise<void>;
    }>,
    options?: {
      continueOnError?: boolean;
    },
  ): Promise<{ successful: string[]; failed: Map<string, Error> }> {
    const batchOp = new BadgedBatchOperation(
      service,
      groupId,
      operations.length,
    );
    const successful: string[] = [];
    const failed = new Map<string, Error>();

    for (const operation of operations) {
      const badgedOp = batchOp.startOperation(
        operation.id,
        operation.label,
        operation.tooltip,
      );

      try {
        await operation.fn(badgedOp);
        batchOp.succeedOperation(operation.id);
        successful.push(operation.id);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        batchOp.failOperation(operation.id, err.message);
        failed.set(operation.id, err);

        if (!options?.continueOnError) {
          batchOp.cancel();
          batchOp.dispose();
          throw error;
        }
      }
    }

    batchOp.finish();
    batchOp.dispose();

    return { successful, failed };
  }
}

/**
 * Quick notification helpers that use badges
 */
export class BadgeNotification {
  /**
   * Show success notification
   */
  static success(
    service: StatusBadgeService,
    operationId: string,
    message: string,
  ): void {
    const badge = service.createBadge(operationId, message, {
      severity: BadgeSeverity.SUCCESS,
    });
    service.markSucceeded(badge.id);
  }

  /**
   * Show error notification
   */
  static error(
    service: StatusBadgeService,
    operationId: string,
    message: string,
    errorDetails?: string,
  ): void {
    const badge = service.createBadge(operationId, message, {
      severity: BadgeSeverity.ERROR,
      tooltip: errorDetails,
    });
    service.markFailed(badge.id, errorDetails ?? "");
  }

  /**
   * Show warning notification
   */
  static warning(
    service: StatusBadgeService,
    operationId: string,
    message: string,
    details?: string,
  ): void {
    const badge = service.createBadge(operationId, message, {
      severity: BadgeSeverity.WARNING,
      tooltip: details,
    });
    service.markWarning(badge.id, details ?? "");
  }

  /**
   * Show info notification
   */
  static info(
    service: StatusBadgeService,
    operationId: string,
    message: string,
  ): void {
    const badge = service.createBadge(operationId, message, {
      severity: BadgeSeverity.INFO,
    });
  }
}
