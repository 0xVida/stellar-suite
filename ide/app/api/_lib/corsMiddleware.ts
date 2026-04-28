import { NextRequest, NextResponse } from "next/server";

const CORS_ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

const DEBUG_BLOCKED_REQUESTS = process.env.DEBUG_CORS === "true";

interface CorsValidationResult {
  valid: boolean;
  reason?: string;
  origin?: string;
}

function validateCorsOrigin(request: NextRequest): CorsValidationResult {
  const origin = request.headers.get("origin");

  if (!origin) {
    return {
      valid: false,
      reason: "Missing Origin header",
    };
  }

  if (CORS_ALLOWED_ORIGINS.length === 0) {
    if (DEBUG_BLOCKED_REQUESTS) {
      console.warn(`[CORS] Blocked request to ${request.url} - no allowed origins configured. Origin: ${origin}`);
    }
    return {
      valid: false,
      reason: "CORS not configured - no allowed origins",
      origin,
    };
  }

  const normalizedOrigin = normalizeOrigin(origin);

  if (!CORS_ALLOWED_ORIGINS.includes(normalizedOrigin)) {
    if (DEBUG_BLOCKED_REQUESTS) {
      console.warn(
        `[CORS] Blocked request to ${request.url} - origin "${normalizedOrigin}" not in whitelist. Allowed: ${CORS_ALLOWED_ORIGINS.join(", ")}`
      );
    }
    return {
      valid: false,
      reason: `Origin "${normalizedOrigin}" not allowed`,
      origin: normalizedOrigin,
    };
  }

  return {
    valid: true,
    origin: normalizedOrigin,
  };
}

function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return origin;
  }
}

export function withCorsProtection(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    if (req.method === "OPTIONS") {
      return handlePreflightRequest(req);
    }

    const validation = validateCorsOrigin(req);

    if (!validation.valid) {
      if (DEBUG_BLOCKED_REQUESTS) {
        console.warn(
          `[CORS] Blocked ${req.method} ${req.url} - ${validation.reason}`
        );
      }
      return NextResponse.json(
        {
          error: "Access denied",
          reason: "CORS policy violation",
        },
        {
          status: 403,
        }
      );
    }

    const response = await handler(req);

    const corsHeaders = {
      "Access-Control-Allow-Origin": validation.origin!,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (response.headers) {
      corsHeaders["Access-Control-Allow-Origin"] = validation.origin!;
    }

    return addCorsHeaders(response, corsHeaders);
  };
}

function handlePreflightRequest(req: NextRequest): NextResponse {
  const validation = validateCorsOrigin(req);

  if (!validation.valid) {
    return NextResponse.json(
      { error: "CORS policy violation" },
      { status: 403 }
    );
  }

  const response = new NextResponse(null, { status: 204 });

  response.headers.set("Access-Control-Allow-Origin", validation.origin!);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}

function addCorsHeaders(
  response: NextResponse,
  headers: Record<string, string>
): NextResponse {
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export function getAllowedOrigins(): string[] {
  return [...CORS_ALLOWED_ORIGINS];
}

export function isCorsConfigured(): boolean {
  return CORS_ALLOWED_ORIGINS.length > 0;
}