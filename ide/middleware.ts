/**
 * middleware.ts
 *
 * CORS hardening + rate-limiting for all sensitive API endpoints.
 *
 * Protected endpoints
 * ───────────────────
 *  /api/compile  – Soroban / Rust compilation backend         (CRITICAL)
 *  /api/test     – Contract test runner                       (HIGH)
 *  /api/clippy   – Static analysis runner                     (CRITICAL)
 *  /api/run-test – cargo-test execution                       (HIGH)
 *  /api/run-hook – Arbitrary post-build hook execution        (HIGH)
 *  /api/format   – rustfmt code formatter                     (MEDIUM)
 *  /api/audit    – cargo-audit dependency scanner             (MEDIUM)
 *
 * Allowed origins are configured via the ALLOWED_ORIGINS environment variable
 * (comma-separated list of fully-qualified origins, e.g.
 *  "https://ide.stellar.org,https://staging.ide.stellar.org").
 *
 * Requests from unknown origins are rejected with 403 and logged.
 * Blocked requests are never forwarded to the handler.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  deriveRateLimitKey,
  getSharedRateLimiter,
} from "@/lib/api/RateLimiter";

// ─── Allowed origins ──────────────────────────────────────────────────────────

/**
 * Parse ALLOWED_ORIGINS from env.  Falls back to an empty list which means
 * every cross-origin request is denied (safe-by-default).
 *
 * Example .env.local:
 *   ALLOWED_ORIGINS=https://ide.stellar.org,https://staging.ide.stellar.org
 */
const CORS_ALLOWED_ORIGINS: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  : [];

// ─── Path classification ──────────────────────────────────────────────────────

/** All paths that require strict CORS enforcement. */
const SENSITIVE_API_PATHS = [
  "/api/compile",
  "/api/test",
  "/api/clippy",
  "/api/run-test",
  "/api/run-hook",
  "/api/format",
  "/api/audit",
];

/** Subset of sensitive paths that are also subject to rate-limiting. */
const RATE_LIMITED_API_PATHS = [
  "/api/compile",
  "/api/test",
  "/api/clippy",
  "/api/run-test",
];

function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_API_PATHS.some((p) => pathname.startsWith(p));
}

function isRateLimitedPath(pathname: string): boolean {
  return RATE_LIMITED_API_PATHS.some((p) => pathname.startsWith(p));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return origin;
  }
}

function isAllowedOrigin(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  return (
    CORS_ALLOWED_ORIGINS.length > 0 &&
    CORS_ALLOWED_ORIGINS.includes(normalized)
  );
}

/** Log blocked CORS attempts without leaking sensitive headers. */
function logBlockedOrigin(pathname: string, origin: string | null): void {
  console.warn(
    `[CORS] Blocked request — path="${pathname}" origin="${origin ?? "(none)"}" ` +
      `allowed=[${CORS_ALLOWED_ORIGINS.join(", ")}]`
  );
}

function applyRateLimitHeaders(
  response: NextResponse,
  decision: {
    remaining: number;
    capacity: number;
    retryAfterSeconds: number;
  }
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(decision.capacity));
  response.headers.set("X-RateLimit-Remaining", String(decision.remaining));
  if (decision.retryAfterSeconds > 0) {
    response.headers.set("Retry-After", String(decision.retryAfterSeconds));
  }
  return response;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fast-path: non-sensitive routes pass straight through.
  if (!isSensitivePath(pathname)) {
    return NextResponse.next();
  }

  // ── Preflight (OPTIONS) ─────────────────────────────────────────────────────

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");

    if (!origin || !isAllowedOrigin(origin)) {
      logBlockedOrigin(pathname, origin);
      return new NextResponse(null, { status: 403 });
    }

    const normalizedOrigin = normalizeOrigin(origin);
    const preflight = new NextResponse(null, { status: 204 });
    preflight.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
    preflight.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS"
    );
    preflight.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    preflight.headers.set("Access-Control-Max-Age", "86400");
    return preflight;
  }

  // ── Origin check ────────────────────────────────────────────────────────────

  const origin = request.headers.get("origin");

  if (!origin || !isAllowedOrigin(origin)) {
    logBlockedOrigin(pathname, origin);
    return NextResponse.json(
      {
        error: "Access denied",
        reason: "CORS policy violation",
      },
      { status: 403 }
    );
  }

  const normalizedOrigin = normalizeOrigin(origin);

  // ── Rate limiting ───────────────────────────────────────────────────────────

  if (isRateLimitedPath(pathname)) {
    const limiter = getSharedRateLimiter();
    const key = deriveRateLimitKey(request, pathname);
    const decision = await limiter.consume(key);

    if (!decision.allowed) {
      const blocked = NextResponse.json(
        {
          error: "Too Many Requests",
          reason: "Rate limit exceeded",
          retryAfterSeconds: decision.retryAfterSeconds,
        },
        { status: 429 }
      );
      blocked.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
      return applyRateLimitHeaders(blocked, decision);
    }

    const response = NextResponse.next();
    response.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
    return applyRateLimitHeaders(response, decision);
  }

  // ── Allow ────────────────────────────────────────────────────────────────────

  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
  return response;
}

// ─── Matcher ──────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    "/api/compile/:path*",
    "/api/test/:path*",
    "/api/clippy/:path*",
    "/api/run-test/:path*",
    "/api/run-hook/:path*",
    "/api/format/:path*",
    "/api/audit/:path*",
  ],
};
