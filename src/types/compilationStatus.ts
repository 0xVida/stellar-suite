// ============================================================
// src/types/compilationStatus.ts
// Type definitions for contract compilation status monitoring.
// ============================================================

/**
 * Represents the current state of a contract compilation
 */
export enum CompilationStatus {
    IDLE = 'idle',
    IN_PROGRESS = 'in_progress',
    SUCCESS = 'success',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    WARNING = 'warning'
}

/**
 * Severity levels for compilation diagnostics
 */
export enum CompilationDiagnosticSeverity {
    ERROR = 'error',
    WARNING = 'warning',
    INFO = 'info',
    HINT = 'hint'
}

/**
 * Individual compilation diagnostic (error, warning, etc.)
 */
export interface CompilationDiagnostic {
    severity: CompilationDiagnosticSeverity;
    message: string;
    code?: string;
    file?: string;
    line?: number;
    column?: number;
    help?: string;
}

/**
 * Compilation event details for real-time updates
 */
export interface CompilationEvent {
    contractPath: string;
    contractName: string;
    status: CompilationStatus;
    progress?: number;
    message?: string;
    timestamp: number;
    diagnostics?: CompilationDiagnostic[];
    wasmPath?: string;
    duration?: number;
}

/**
 * Record of a completed compilation
 */
export interface CompilationRecord {
    contractPath: string;
    contractName: string;
    status: CompilationStatus;
    startedAt: number;
    completedAt: number;
    duration: number;
    wasmPath?: string;
    diagnostics: CompilationDiagnostic[];
    errorCount: number;
    warningCount: number;
    output?: string;
}

/**
 * Compilation history for a specific contract
 */
export interface ContractCompilationHistory {
    contractPath: string;
    contractName: string;
    records: CompilationRecord[];
    lastCompiledAt?: number;
    lastStatus?: CompilationStatus;
    successCount: number;
    failureCount: number;
}

/**
 * Configuration for the compilation status monitor
 */
export interface CompilationMonitorConfig {
    maxHistoryPerContract: number;
    enableRealTimeUpdates: boolean;
    enableLogging: boolean;
    showProgressNotifications: boolean;
}

/**
 * Summary of all compilation statuses in the workspace
 */
export interface CompilationWorkspaceSummary {
    totalContracts: number;
    inProgress: number;
    successful: number;
    failed: number;
    warnings: number;
    idle: number;
}

/**
 * Payload for status change events
 */
export interface StatusChangeEvent {
    contractPath: string;
    previousStatus: CompilationStatus;
    currentStatus: CompilationStatus;
    timestamp: number;
}

/**
 * Types of compilation events that can be monitored
 */
export enum CompilationEventType {
    STARTED = 'started',
    PROGRESS = 'progress',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    DIAGNOSTIC = 'diagnostic'
}
