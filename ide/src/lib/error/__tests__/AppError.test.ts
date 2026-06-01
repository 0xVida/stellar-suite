/**
 * src/lib/error/__tests__/AppError.test.ts
 * ============================================================
 * Unit tests for the Standardized Error Handling Framework
 * ============================================================
 */

import { describe, it, expect } from "vitest";
import {
  AppError,
  UIError,
  CompilerError,
  NetworkError,
  ContractError,
  AuthError,
  ErrorCodes,
  isAppError,
  isUIError,
  isCompilerError,
  isNetworkError,
  isContractError,
  isAuthError,
} from "../AppError";

// ---------------------------------------------------------------------------
// AppError base class
// ---------------------------------------------------------------------------

describe("AppError — base class", () => {
  it("creates an instance with all required fields", () => {
    const err = new AppError("TEST_CODE", "Something went wrong", "ui", "error");

    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("Something went wrong");
    expect(err.domain).toBe("ui");
    expect(err.severity).toBe("error");
    expect(err.name).toBe("AppError");
    expect(err.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("derives a human-readable title from the code", () => {
    const err = new AppError("RPC_TIMEOUT", "msg", "network");
    expect(err.title).toBe("Rpc Timeout");
  });

  it("serialises to plain JSON without circular refs", () => {
    const err = new AppError("TEST", "msg", "network", "warning", {
      statusCode: 503,
      suggestions: ["Try again"],
    });
    const json = err.toJSON();

    expect(json.code).toBe("TEST");
    expect(json.severity).toBe("warning");
    expect(json.statusCode).toBe(503);
    expect(json.suggestions).toContain("Try again");
  });

  it("preserves the cause stack when given an Error cause", () => {
    const cause = new Error("original problem");
    const err = new AppError("WRAPPED", "wrapped message", "network", "error", { cause });

    expect(err.stack).toContain("Caused by:");
    expect(err.meta.cause).toBe(cause);
  });

  it("instanceof AppError is true for all subclasses", () => {
    expect(new UIError("X", "m") instanceof AppError).toBe(true);
    expect(new CompilerError("X", "m") instanceof AppError).toBe(true);
    expect(new NetworkError("X", "m") instanceof AppError).toBe(true);
    expect(new ContractError("X", "m") instanceof AppError).toBe(true);
    expect(new AuthError("X", "m") instanceof AppError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UIError
// ---------------------------------------------------------------------------

describe("UIError", () => {
  it("has domain = ui", () => {
    const err = new UIError("INVALID_INPUT", "Field is required");
    expect(err.domain).toBe("ui");
    expect(err.name).toBe("UIError");
  });

  it("type-guard isUIError works", () => {
    expect(isUIError(new UIError("X", "y"))).toBe(true);
    expect(isUIError(new NetworkError("X", "y"))).toBe(false);
    expect(isUIError(new Error("plain"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CompilerError
// ---------------------------------------------------------------------------

describe("CompilerError", () => {
  it("stores rawOutput", () => {
    const err = new CompilerError(
      ErrorCodes.WASM_BUILD_FAILED,
      "cargo build failed",
      "error[E0308]: mismatched types"
    );
    expect(err.rawOutput).toBe("error[E0308]: mismatched types");
    expect(err.domain).toBe("compiler");
  });

  it("type-guard isCompilerError works", () => {
    expect(isCompilerError(new CompilerError("X", "y"))).toBe(true);
    expect(isCompilerError(new UIError("X", "y"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NetworkError
// ---------------------------------------------------------------------------

describe("NetworkError", () => {
  it("severity is warning for RPC_TIMEOUT", () => {
    const err = new NetworkError(ErrorCodes.RPC_TIMEOUT, "timed out");
    expect(err.severity).toBe("warning");
  });

  it("severity is error for FETCH_FAILED", () => {
    const err = new NetworkError(ErrorCodes.FETCH_FAILED, "network failure");
    expect(err.severity).toBe("error");
  });

  it("type-guard isNetworkError works", () => {
    expect(isNetworkError(new NetworkError("X", "y"))).toBe(true);
    expect(isNetworkError(new CompilerError("X", "y"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ContractError
// ---------------------------------------------------------------------------

describe("ContractError", () => {
  it("stores hostCode and reflects it in statusCode", () => {
    const err = new ContractError(ErrorCodes.CONTRACT_HOST_ERROR, "trapped", 113);
    expect(err.hostCode).toBe(113);
    expect(err.meta.statusCode).toBe(113);
    expect(err.domain).toBe("contract");
  });

  it("type-guard isContractError works", () => {
    expect(isContractError(new ContractError("X", "y"))).toBe(true);
    expect(isContractError(new AuthError("X", "y"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AuthError
// ---------------------------------------------------------------------------

describe("AuthError", () => {
  it("has domain = auth and severity = error", () => {
    const err = new AuthError(ErrorCodes.SESSION_EXPIRED, "session expired");
    expect(err.domain).toBe("auth");
    expect(err.severity).toBe("error");
  });

  it("type-guard isAuthError works", () => {
    expect(isAuthError(new AuthError("X", "y"))).toBe(true);
    expect(isAuthError(new UIError("X", "y"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAppError generic guard
// ---------------------------------------------------------------------------

describe("isAppError", () => {
  it("returns true for any AppError subclass", () => {
    expect(isAppError(new AppError("X", "y", "ui"))).toBe(true);
    expect(isAppError(new CompilerError("X", "y"))).toBe(true);
    expect(isAppError(new NetworkError("X", "y"))).toBe(true);
  });

  it("returns false for plain Error and primitives", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("string error")).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ErrorCodes — ensure constants are string literals
// ---------------------------------------------------------------------------

describe("ErrorCodes", () => {
  it("all values are non-empty strings", () => {
    for (const val of Object.values(ErrorCodes)) {
      expect(typeof val).toBe("string");
      expect(val.length).toBeGreaterThan(0);
    }
  });

  it("codes are SCREAMING_SNAKE_CASE", () => {
    for (const val of Object.values(ErrorCodes)) {
      expect(val).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
});
