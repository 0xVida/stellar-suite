/**
 * src/lib/error/apiInterceptor.ts
 * ============================================================
 * Global API Interceptor
 *
 * Drop-in replacement for `fetch` that:
 *  1. Classifies HTTP and network failures into typed AppError subclasses
 *  2. Fires a unified sonner toast for every failure
 *  3. Logs categorised error objects to the console (never swallows them)
 *  4. Re-throws so callers can add their own recovery logic
 *
 * Usage — replace bare `fetch(...)` calls:
 *   import { apiFetch } from "@/lib/error/apiInterceptor";
 *
 *   const res = await apiFetch("/api/compile", { method: "POST", body: ... });
 *   // On HTTP error → toast fires automatically, CompilerError / NetworkError thrown
 *   // On success   → returns the raw Response (unchanged)
 *
 * Silent mode (no toast, error still thrown):
 *   await apiFetch("/api/health", {}, { silent: true });
 * ============================================================
 */

import { toast } from "sonner";
import {
  AppError,
  CompilerError,
  NetworkError,
  ContractError,
  AuthError,
  UIError,
  ErrorCodes,
  type AppErrorMeta,
} from "./AppError";

// ---------------------------------------------------------------------------
// Interceptor options
// ---------------------------------------------------------------------------

export interface InterceptorOptions {
  /**
   * When true, suppresses the automatic toast notification.
   * The error is still thrown so callers can handle it.
   */
  silent?: boolean;
  /**
   * A short label describing what the request does,
   * used to enrich the toast title (e.g. "contract compilation").
   */
  operation?: string;
}

// ---------------------------------------------------------------------------
// Route → domain mapping
// ---------------------------------------------------------------------------

/**
 * Maps URL path prefixes to error domains so the interceptor can create
 * the correct AppError subclass for each API route.
 */
const ROUTE_DOMAIN_MAP: Array<{ prefix: string; domain: "compiler" | "contract" | "auth" | "ui" | "network" }> = [
  { prefix: "/api/compile",    domain: "compiler"  },
  { prefix: "/api/clippy",     domain: "compiler"  },
  { prefix: "/api/audit",      domain: "compiler"  },
  { prefix: "/api/format",     domain: "compiler"  },
  { prefix: "/api/bench",      domain: "compiler"  },
  { prefix: "/api/fuzz",       domain: "compiler"  },
  { prefix: "/api/run-test",   domain: "compiler"  },
  { prefix: "/api/auth",       domain: "auth"      },
  { prefix: "/api/projects",   domain: "ui"        },
  { prefix: "/api/chat",       domain: "ui"        },
  { prefix: "/api/error-help", domain: "ui"        },
];

function resolveDomain(url: string): "compiler" | "contract" | "auth" | "ui" | "network" {
  try {
    const pathname = new URL(url, "http://localhost").pathname;
    for (const { prefix, domain } of ROUTE_DOMAIN_MAP) {
      if (pathname.startsWith(prefix)) return domain;
    }
  } catch {
    // URL parsing failed — treat as network error
  }
  return "network";
}

// ---------------------------------------------------------------------------
// Error factory helpers
// ---------------------------------------------------------------------------

function buildErrorFromResponse(
  res: Response,
  body: string,
  domain: ReturnType<typeof resolveDomain>,
  operation: string,
  meta: AppErrorMeta
): AppError {
  const status = res.status;

  if (status === 401 || status === 403) {
    return new AuthError(ErrorCodes.UNAUTHORIZED, `${operation} — access denied (HTTP ${status}).`, {
      ...meta,
      statusCode: status,
      suggestions: [
        "Re-authenticate and try again.",
        "Check that your session has not expired.",
      ],
    });
  }

  if (domain === "compiler") {
    const code =
      status === 500 ? ErrorCodes.WASM_BUILD_FAILED : ErrorCodes.HTTP_ERROR;
    return new CompilerError(
      code,
      `${operation} failed (HTTP ${status}).`,
      body,
      { ...meta, statusCode: status }
    );
  }

  if (domain === "contract") {
    return new ContractError(
      ErrorCodes.CONTRACT_INVOCATION_FAILED,
      `${operation} failed (HTTP ${status}).`,
      undefined,
      { ...meta, statusCode: status }
    );
  }

  if (domain === "auth") {
    return new AuthError(
      ErrorCodes.UNAUTHORIZED,
      `${operation} failed (HTTP ${status}).`,
      { ...meta, statusCode: status }
    );
  }

  if (domain === "ui") {
    return new UIError(ErrorCodes.HTTP_ERROR, `${operation} failed (HTTP ${status}).`, {
      ...meta,
      statusCode: status,
    });
  }

  // network / unknown
  return new NetworkError(
    ErrorCodes.HTTP_ERROR,
    `${operation} failed (HTTP ${status}).`,
    { ...meta, statusCode: status }
  );
}

function buildNetworkError(err: unknown, operation: string): NetworkError {
  const message =
    err instanceof Error ? err.message : "Failed to reach the server.";

  const isTimeout =
    message.toLowerCase().includes("timeout") ||
    (err instanceof DOMException && err.name === "TimeoutError");

  return new NetworkError(
    isTimeout ? ErrorCodes.RPC_TIMEOUT : ErrorCodes.FETCH_FAILED,
    isTimeout
      ? `${operation} timed out. The server did not respond in time.`
      : `${operation} — network error: ${message}`,
    {
      cause: err,
      suggestions: isTimeout
        ? ["Try again in a moment.", "Check the RPC endpoint URL."]
        : [
            "Check your internet connection.",
            "Verify the API server is running.",
            "Try again in a moment.",
          ],
    }
  );
}

// ---------------------------------------------------------------------------
// Toast helper
// ---------------------------------------------------------------------------

function showErrorToast(error: AppError, operation: string): void {
  const suggestions = error.meta.suggestions ?? [];
  const description =
    suggestions.length > 0
      ? `${error.message}\n\n${suggestions.map((s) => `• ${s}`).join("\n")}`
      : error.message;

  const toastFn =
    error.severity === "warning"
      ? toast.warning
      : error.severity === "info"
        ? toast.info
        : toast.error;

  toastFn(error.title, {
    description,
    duration: error.severity === "error" ? 7000 : 5000,
    id: `api-error-${error.code}`, // de-duplicate identical errors
  });
}

// ---------------------------------------------------------------------------
// Console logger
// ---------------------------------------------------------------------------

function logError(error: AppError, url: string): void {
  const prefix = `[${error.domain.toUpperCase()}][${error.code}]`;
  console.error(`${prefix} ${error.message}`, {
    url,
    ...error.toJSON(),
  });
}

// ---------------------------------------------------------------------------
// Core interceptor
// ---------------------------------------------------------------------------

/**
 * Instrumented fetch wrapper.
 *
 * Returns the raw `Response` on success (2xx).
 * On any failure, fires a toast (unless `silent`), logs to console, and
 * throws a domain-specific `AppError` subclass.
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
  options: InterceptorOptions = {}
): Promise<Response> {
  const { silent = false, operation = "API request" } = options;
  const domain = resolveDomain(url);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (networkErr) {
    const error = buildNetworkError(networkErr, operation);
    logError(error, url);
    if (!silent) showErrorToast(error, operation);
    throw error;
  }

  if (!res.ok) {
    // Read body for richer error info (best-effort)
    let body = "";
    try {
      body = await res.clone().text();
    } catch {
      // Ignore body-read failures
    }

    const meta: AppErrorMeta = {
      cause: new Error(`HTTP ${res.status} from ${url}`),
      context: { url, status: res.status, body: body.slice(0, 500) },
      statusCode: res.status,
    };

    const error = buildErrorFromResponse(res, body, domain, operation, meta);
    logError(error, url);
    if (!silent) showErrorToast(error, operation);
    throw error;
  }

  return res;
}

// ---------------------------------------------------------------------------
// Convenience wrappers for common patterns
// ---------------------------------------------------------------------------

/** POST JSON and return the parsed response body, with full error interception. */
export async function apiPost<T = unknown>(
  url: string,
  body: unknown,
  options: InterceptorOptions = {}
): Promise<T> {
  const res = await apiFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options
  );
  return res.json() as Promise<T>;
}

/** GET and return the parsed response body, with full error interception. */
export async function apiGet<T = unknown>(
  url: string,
  options: InterceptorOptions = {}
): Promise<T> {
  const res = await apiFetch(url, { method: "GET" }, options);
  return res.json() as Promise<T>;
}
