import { NextRequest, NextResponse } from "next/server";
import {
  deriveRateLimitKey,
  getSharedRateLimiter,
} from "@/lib/api/RateLimiter";

const CORS_ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

const SENSITIVE_API_PATHS = ["/api/clippy", "/api/run-test", "/api/run-hook", "/api/format", "/api/audit"];

const RATE_LIMITED_API_PATHS = ["/api/clippy", "/api/run-test"];

function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_API_PATHS.some((p) => pathname.startsWith(p));
}

function isRateLimitedPath(pathname: string): boolean {
  return RATE_LIMITED_API_PATHS.some((p) => pathname.startsWith(p));
}

function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return origin;
  }
}

function applyRateLimitHeaders(
  response: NextResponse,
  decision: { remaining: number; capacity: number; retryAfterSeconds: number },
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(decision.capacity));
  response.headers.set("X-RateLimit-Remaining", String(decision.remaining));
  if (decision.retryAfterSeconds > 0) {
    response.headers.set("Retry-After", String(decision.retryAfterSeconds));
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!isSensitivePath(pathname)) {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");

    if (!origin) {
      return new NextResponse(null, { status: 403 });
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (CORS_ALLOWED_ORIGINS.length === 0 || !CORS_ALLOWED_ORIGINS.includes(normalizedOrigin)) {
      return new NextResponse(null, { status: 403 });
    }

    const response = new NextResponse(null, { status: 204 });

    response.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");

    return response;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return NextResponse.json(
      { error: "Access denied", reason: "CORS policy violation" },
      { status: 403 }
    );
  }

  const normalizedOrigin = normalizeOrigin(origin);

  if (CORS_ALLOWED_ORIGINS.length === 0 || !CORS_ALLOWED_ORIGINS.includes(normalizedOrigin)) {
    return NextResponse.json(
      { error: "Access denied", reason: "CORS policy violation" },
      { status: 403 }
    );
  }

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
        { status: 429 },
      );
      blocked.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
      return applyRateLimitHeaders(blocked, decision);
    }

    const response = NextResponse.next();
    response.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
    return applyRateLimitHeaders(response, decision);
  }

  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", normalizedOrigin);

  return response;
}

export const config = {
  matcher: ["/api/clippy/:path*", "/api/run-test/:path*", "/api/run-hook/:path*", "/api/format/:path*", "/api/audit/:path*"],
};
