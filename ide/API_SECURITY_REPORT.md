# API Security Report: CORS Hardening

**Issues:** [#792 - CORS Hardening](https://github.com/0xVida/stellar-suite/issues/792)  
**Date Implemented:** 2026-05-27  
**Branch:** `feat/cloud-project-persistence`

---

## Executive Summary

This report documents the CORS security hardening implemented to restrict
the compilation backend (`/api/compile`, `/api/test`) and all other sensitive
API routes from unauthorized cross-origin requests.

---

## Threat Model

The following endpoints execute code or perform privileged operations and require
strict CORS protection:

| Endpoint        | Risk Level   | Reason                                           |
|-----------------|--------------|--------------------------------------------------|
| `/api/compile`  | **CRITICAL** | Invokes the Soroban/Rust compilation toolchain   |
| `/api/test`     | **CRITICAL** | Executes contract test suites                    |
| `/api/clippy`   | **CRITICAL** | Executes `cargo clippy` on arbitrary Rust code   |
| `/api/run-test` | **HIGH**     | Runs `cargo test` with user-supplied test names  |
| `/api/run-hook` | **HIGH**     | Executes arbitrary shell commands                |
| `/api/format`   | **MEDIUM**   | Runs `rustfmt` on user-provided code             |
| `/api/audit`    | **MEDIUM**   | Runs `cargo audit` on the workspace              |

---

## Implementation

### 1. Environment Configuration

Allowed origins are set via the `ALLOWED_ORIGINS` environment variable.

```env
# .env.local (not committed)
ALLOWED_ORIGINS=https://ide.stellar.org,https://staging.ide.stellar.org
```

The list is parsed at startup in `middleware.ts`.  An **empty list means
every cross-origin request is denied** (safe-by-default posture).

### 2. CORS Middleware (`middleware.ts`)

* **Path classification** — every sensitive path is matched before
  forwarding to the route handler.
* **Preflight (OPTIONS)** — returns `204` with `Access-Control-Allow-*`
  headers only for approved origins; all others get `403`.
* **Actual requests** — the `origin` header is checked against the
  allow-list; unknown origins receive a JSON `403` error body.
* **Logging** — every blocked attempt is logged via `console.warn` with
  the path and offending origin for audit purposes (no sensitive headers
  included).

### 3. Rate Limiting

`/api/compile` and `/api/test` are additionally covered by the shared
token-bucket rate limiter (`RateLimiter.ts`).  The client receives standard
`X-RateLimit-*` response headers and a `429` when the limit is exceeded.

---

## Security Properties

| Property                     | Status |
|------------------------------|--------|
| Restrictive by default       | ✅ Empty allow-list → deny all |
| Production domains whitelisted | ✅ Via `ALLOWED_ORIGINS` env var |
| Staging domains whitelisted  | ✅ Same env var |
| Compile endpoint protected   | ✅ `/api/compile` added |
| Test endpoint protected      | ✅ `/api/test` added |
| Blocked attempts logged      | ✅ `console.warn` in middleware |
| Rate-limit compile/test      | ✅ Token-bucket via `RateLimiter` |

---

## Testing

```bash
# Request from allowed origin — should succeed (with ALLOWED_ORIGINS set)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Origin: https://ide.stellar.org" \
  http://localhost:3000/api/compile
# expected: 200

# Request from unknown origin — should be blocked
curl -s -w "%{http_code}" \
  -H "Origin: https://evil.example.com" \
  http://localhost:3000/api/compile
# expected: 403  {"error":"Access denied","reason":"CORS policy violation"}

# No origin header — should be blocked
curl -s -w "%{http_code}" http://localhost:3000/api/compile
# expected: 403

# Preflight from unknown origin
curl -s -w "%{http_code}" -X OPTIONS \
  -H "Origin: https://attacker.io" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:3000/api/compile
# expected: 403
```
