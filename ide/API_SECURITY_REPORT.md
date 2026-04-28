# API Security Report: CORS Hardening

**Issue:** [#615 - Cross-Origin Resource Sharing (CORS) Hardening](https://github.com/0xVida/stellar-suite/issues/615)

**Date Implemented:** 2026-04-23

**Branch:** `security/cors-hardening-615`

---

## Executive Summary

This report documents the CORS security hardening implemented to restrict API endpoints from unauthorized cross-origin requests.

## Threat Model

The following endpoints execute arbitrary code and require strict CORS protection:

| Endpoint | Risk Level | Reason |
|----------|------------|--------|
| `/api/clippy` | **CRITICAL** | Executes `cargo clippy` on arbitrary Rust code |
| `/api/run-test` | **HIGH** | Runs `cargo test` with user-supplied test names |
| `/api/run-hook` | **HIGH** | Executes arbitrary shell commands |
| `/api/format` | **MEDIUM** | Runs `rustfmt` on user-provided code |
| `/api/audit` | **MEDIUM** | Runs `cargo audit` on workspace |

## Implementation

### 1. Environment Configuration

Added to `ide/.env.example`:

```env
# CORS Hardening (Issue #615)
ALLOWED_ORIGINS=http://localhost:3000
DEBUG_CORS=false
```

**Configuration Details:**
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins (e.g., `http://localhost:3000,https://stellar-suite.vercel.app`)
- `DEBUG_CORS`: Set to `true` to log blocked requests

### 2. Edge Middleware (`ide/middleware.ts`)

Created root middleware to enforce CORS at the edge for all sensitive API routes.

**Features:**
- Blocks all cross-origin requests except from whitelisted origins
- Handles OPTIONS preflight requests
- Uses `normalizeOrigin()` for consistent origin comparison
- Configurable via environment variables

**Protected Routes:**
- `/api/clippy/:path*`
- `/api/run-test/:path*`
- `/api/run-hook/:path*`
- `/api/format/:path*`
- `/api/audit/:path*`

### 3. Route-Level CORS (`ide/app/api/_lib/corsMiddleware.ts`)

Created reusable CORS middleware for route-level enforcement.

**Features:**
- Origin validation against `ALLOWED_ORIGINS`
- Preflight (OPTIONS) request handling
- CORS header injection on responses
- Debug logging for blocked requests

## Security Properties

| Property | Status |
|----------|--------|
| Restrictive by default | ✅ Blocks requests when `ALLOWED_ORIGINS` is empty |
| Origin whitelisting | ✅ Validates against exact origin match |
| Preflight handling | ✅ Returns proper CORS headers for OPTIONS |
| Debug logging | ✅ Blocked attempts logged when `DEBUG_CORS=true` |
| No hardcoded domains | ✅ All origins from environment variables |

## Testing Checklist

- [ ] Requests from whitelisted origin succeed with CORS headers
- [ ] Requests from non-whitelisted origin receive 403
- [ ] OPTIONS preflight from whitelisted origin returns 204 with CORS headers
- [ ] OPTIONS preflight from non-whitelisted origin returns 403
- [ ] Missing Origin header returns 403
- [ ] Debug logs appear when `DEBUG_CORS=true`

## Files Changed

| File | Change |
|------|--------|
| `ide/middleware.ts` | **NEW** - Edge CORS enforcement |
| `ide/app/api/_lib/corsMiddleware.ts` | **NEW** - Route-level CORS wrapper |
| `ide/.env.example` | Added `ALLOWED_ORIGINS`, `DEBUG_CORS` |
| `ide/app/api/clippy/route.ts` | Applied CORS middleware |
| `ide/app/api/run-test/route.ts` | Applied CORS middleware |
| `ide/app/api/run-hook/route.ts` | Applied CORS middleware |
| `ide/app/api/format/route.ts` | Applied CORS middleware |
| `ide/app/api/audit/route.ts` | CORS handled by middleware.ts |

## Deployment Notes

1. Set `ALLOWED_ORIGINS` environment variable with production and staging URLs
2. Example production config: `ALLOWED_ORIGINS=https://stellar-suite.vercel.app,https://stellar-suite-git-staging.vercel.app`
3. Monitor logs for blocked attempts with `DEBUG_CORS=true`
4. Ensure frontend URL is in the whitelist for IDE functionality

## Remaining Work

- `/api/compile` endpoint referenced in frontend but not yet implemented (separate issue)
- Rate limiting recommended for additional protection (future enhancement)