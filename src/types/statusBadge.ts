// ============================================================
// src/types/statusBadge.ts
// Type definitions for operation status badges.
// ============================================================

/**
 * Badge status enumeration
 */
export enum BadgeStatus {
  IDLE = "idle",
  RUNNING = "running",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
  CANCELLED = "cancelled",
  WARNING = "warning",
  INFO = "info",
}

/**
 * Badge severity level
 */
export enum BadgeSeverity {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  SUCCESS = "success",
}

/**
 * Badge animation types
 */
export enum BadgeAnimation {
  NONE = "none",
  PULSE = "pulse",
  SPIN = "spin",
  BLINK = "blink",
  FADE = "fade",
}

/**
 * Badge position in UI
 */
export enum BadgePosition {
  INLINE = "inline",
  CORNER = "corner",
  OVERLAY = "overlay",
}

/**
 * Individual badge configuration and state
 */
export interface Badge {
  id: string;
  operationId: string;
  status: BadgeStatus;
  severity: BadgeSeverity;
  label: string;
  tooltip?: string;
  animation?: BadgeAnimation;
  position?: BadgePosition;
  visible: boolean;
  timestamp: Date;
  errorMessage?: string;
  metadata?: {
    contractId?: string;
    functionName?: string;
    network?: string;
    deploymentId?: string;
    [key: string]: unknown;
  };
}

/**
 * Badge theme configuration
 */
export interface BadgeTheme {
  colors: {
    idle: string;
    running: string;
    succeeded: string;
    failed: string;
    cancelled: string;
    warning: string;
    info: string;
  };
  textColors: {
    [key: string]: string;
  };
  animations: {
    [key: string]: string;
  };
}

/**
 * Badge customization options
 */
export interface BadgeCustomization {
  enableAnimations: boolean;
  showTooltips: boolean;
  autoHideDuration?: number; // milliseconds
  maxBadges: number;
  position: BadgePosition;
  fontSize: "small" | "normal" | "large";
  theme: "dark" | "light" | "auto";
}

/**
 * Badge event payload
 */
export interface BadgeEvent {
  badgeId: string;
  operationId: string;
  status: BadgeStatus;
  severity: BadgeSeverity;
  timestamp: Date;
  action?: string;
  error?: Error;
}

/**
 * Badge display snapshot for UI rendering
 */
export interface BadgeSnapshot {
  id: string;
  operationId: string;
  status: BadgeStatus;
  severity: BadgeSeverity;
  label: string;
  tooltip?: string;
  animation?: BadgeAnimation;
  position?: BadgePosition;
  visible: boolean;
  errorMessage?: string;
  cssClass: string;
}

/**
 * Badge group configuration (for batch operations)
 */
export interface BadgeGroup {
  groupId: string;
  badges: Badge[];
  status: BadgeStatus;
  progressPercentage?: number;
  successCount: number;
  failureCount: number;
  cancelledCount: number;
}

/**
 * Badge styling configuration
 */
export interface BadgeStyle {
  baseStyles: string;
  statusStyles: Record<BadgeStatus, string>;
  severityStyles: Record<BadgeSeverity, string>;
  animationStyles: Record<BadgeAnimation, string>;
}

/**
 * Real-time badge update event
 */
export interface BadgeUpdateEvent {
  type: "created" | "updated" | "removed" | "shown" | "hidden";
  badge: Badge;
  previousStatus?: BadgeStatus;
  timestamp: Date;
}

/**
 * Badge error context
 */
export interface BadgeError {
  badgeId: string;
  operationId: string;
  errorCode: string;
  errorMessage: string;
  severity: BadgeSeverity;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/**
 * Badge service configuration
 */
export interface BadgeServiceConfig {
  maxConcurrentBadges: number;
  badgeLifetimeMs: number;
  enableLogging: boolean;
  enablePersistence: boolean;
  customization: BadgeCustomization;
  theme: BadgeTheme;
}
