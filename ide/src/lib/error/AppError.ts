/**
 * src/lib/error/AppError.ts
 * ============================================================
 * Standardized Error Handling Framework — Domain-Specific Error Classes
 *
 * Provides a hierarchy of typed `AppError` subclasses that carry:
 *  - A machine-readable `code` for programmatic handling
 *  - A `domain` tag (ui | compiler | network | contract | auth)
 *  - An optional `severity` for toast routing
 *  - Optional metadata for logging / display enrichment
 *
 * Usage:
 *   throw new CompilerError("WASM_BUILD_FAILED", "cargo build exited with code 1");
 *   throw new NetworkError("RPC_TIMEOUT", "Soroban RPC did not respond in 30 s");
 * ============================================================
 */

// ---------------------------------------------------------------------------
// Domain literals
// ---------------------------------------------------------------------------

export type ErrorDomain = "ui" | "compiler" | "network" | "contract" | "auth";
export type ErrorSeverity = "error" | "warning" | "info";

// ---------------------------------------------------------------------------
// Shared metadata bag
// ---------------------------------------------------------------------------

export interface AppErrorMeta {
  /** Raw cause — original Error or response payload */
  cause?: unknown;
  /** Additional key/value context for logging */
  context?: Record<string, unknown>;
  /** HTTP status, Soroban host code, etc. */
  statusCode?: number;
  /** Actionable suggestions shown alongside the toast */
  suggestions?: string[];
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

/**
 * Base class for all application-level errors.
 *
 * All subclasses extend this so consumers can distinguish app errors from
 * unexpected built-in errors with a simple `instanceof AppError` check.
 */
export class AppError extends Error {
  /** Machine-readable code (SCREAMING_SNAKE_CASE) */
  readonly code: string;
  /** Domain that originated the error */
  readonly domain: ErrorDomain;
  /** How serious the error is */
  readonly severity: ErrorSeverity;
  /** Optional enrichment metadata */
  readonly meta: AppErrorMeta;
  /** ISO timestamp when the error was created */
  readonly timestamp: string;

  constructor(
    code: string,
    message: string,
    domain: ErrorDomain,
    severity: ErrorSeverity = "error",
    meta: AppErrorMeta = {}
  ) {
    super(message);

    // Restore prototype chain (required when extending built-ins in TypeScript)
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = new.target.name;
    this.code = code;
    this.domain = domain;
    this.severity = severity;
    this.meta = meta;
    this.timestamp = new Date().toISOString();

    // Preserve original stack when a cause is provided
    if (meta.cause instanceof Error && meta.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${meta.cause.stack}`;
    }
  }

  /** Serialise to a plain object, suitable for JSON logging. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      domain: this.domain,
      severity: this.severity,
      message: this.message,
      timestamp: this.timestamp,
      statusCode: this.meta.statusCode,
      context: this.meta.context,
      suggestions: this.meta.suggestions,
    };
  }

  /** User-facing title derived from the code (e.g. "RPC_TIMEOUT" → "Rpc Timeout") */
  get title(): string {
    return this.code
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
}

// ---------------------------------------------------------------------------
// Domain sub-classes
// ---------------------------------------------------------------------------

/**
 * Errors originating from the UI layer:
 *   - invalid user input
 *   - form validation failures
 *   - unsupported browser features
 */
export class UIError extends AppError {
  constructor(code: string, message: string, meta: AppErrorMeta = {}) {
    super(code, message, "ui", meta.cause instanceof Error ? "warning" : "error", meta);
  }
}

/**
 * Errors originating from the Rust/WASM compilation pipeline:
 *   - cargo build failures
 *   - clippy / rustfmt errors
 *   - WASM upload failures
 */
export class CompilerError extends AppError {
  /** Raw compiler stderr/stdout output */
  readonly rawOutput?: string;

  constructor(
    code: string,
    message: string,
    rawOutput?: string,
    meta: AppErrorMeta = {}
  ) {
    super(code, message, "compiler", "error", {
      ...meta,
      context: { ...meta.context, rawOutput },
    });
    this.rawOutput = rawOutput;
  }
}

/**
 * Errors originating from network communication:
 *   - Soroban RPC failures
 *   - Horizon fetch errors
 *   - WebSocket disconnections
 *   - General fetch / CORS issues
 */
export class NetworkError extends AppError {
  constructor(code: string, message: string, meta: AppErrorMeta = {}) {
    // Derive severity: timeouts / rate-limits are warnings; everything else is errors
    const severity: ErrorSeverity =
      code === "RPC_TIMEOUT" || code === "RATE_LIMIT_EXCEEDED"
        ? "warning"
        : "error";
    super(code, message, "network", severity, meta);
  }
}

/**
 * Errors originating from Soroban smart-contract interactions:
 *   - host-function errors
 *   - simulation / invocation failures
 *   - XDR parsing issues
 *   - contract instantiation failures
 */
export class ContractError extends AppError {
  /** Soroban host error code (numeric), if available */
  readonly hostCode?: number;

  constructor(
    code: string,
    message: string,
    hostCode?: number,
    meta: AppErrorMeta = {}
  ) {
    super(code, message, "contract", "error", {
      ...meta,
      statusCode: hostCode ?? meta.statusCode,
      context: { ...meta.context, hostCode },
    });
    this.hostCode = hostCode;
  }
}

/**
 * Errors originating from authentication / identity management:
 *   - wallet connection failures
 *   - missing / expired sessions
 *   - key-pair permission denials
 */
export class AuthError extends AppError {
  constructor(code: string, message: string, meta: AppErrorMeta = {}) {
    super(code, message, "auth", "error", meta);
  }
}

// ---------------------------------------------------------------------------
// Well-known code constants (prevents magic strings in call-sites)
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  // UI
  INVALID_INPUT: "INVALID_INPUT",
  UNSUPPORTED_BROWSER: "UNSUPPORTED_BROWSER",
  FORM_VALIDATION_FAILED: "FORM_VALIDATION_FAILED",

  // Compiler
  WASM_BUILD_FAILED: "WASM_BUILD_FAILED",
  WASM_UPLOAD_FAILED: "WASM_UPLOAD_FAILED",
  CLIPPY_FAILED: "CLIPPY_FAILED",
  RUSTFMT_FAILED: "RUSTFMT_FAILED",
  TEST_RUN_FAILED: "TEST_RUN_FAILED",
  CARGO_AUDIT_FAILED: "CARGO_AUDIT_FAILED",
  FUZZ_FAILED: "FUZZ_FAILED",

  // Network
  RPC_TIMEOUT: "RPC_TIMEOUT",
  RPC_UNREACHABLE: "RPC_UNREACHABLE",
  RPC_INVALID_RESPONSE: "RPC_INVALID_RESPONSE",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  HTTP_ERROR: "HTTP_ERROR",
  FETCH_FAILED: "FETCH_FAILED",

  // Contract
  CONTRACT_SIMULATION_FAILED: "CONTRACT_SIMULATION_FAILED",
  CONTRACT_INVOCATION_FAILED: "CONTRACT_INVOCATION_FAILED",
  CONTRACT_INSTANTIATION_FAILED: "CONTRACT_INSTANTIATION_FAILED",
  CONTRACT_NOT_FOUND: "CONTRACT_NOT_FOUND",
  CONTRACT_HOST_ERROR: "CONTRACT_HOST_ERROR",
  XDR_PARSE_FAILED: "XDR_PARSE_FAILED",

  // Auth
  WALLET_CONNECTION_FAILED: "WALLET_CONNECTION_FAILED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  UNAUTHORIZED: "UNAUTHORIZED",
  IDENTITY_NOT_FOUND: "IDENTITY_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ---------------------------------------------------------------------------
// Type-guard helpers
// ---------------------------------------------------------------------------

export const isAppError = (err: unknown): err is AppError =>
  err instanceof AppError;

export const isUIError = (err: unknown): err is UIError =>
  err instanceof UIError;

export const isCompilerError = (err: unknown): err is CompilerError =>
  err instanceof CompilerError;

export const isNetworkError = (err: unknown): err is NetworkError =>
  err instanceof NetworkError;

export const isContractError = (err: unknown): err is ContractError =>
  err instanceof ContractError;

export const isAuthError = (err: unknown): err is AuthError =>
  err instanceof AuthError;
