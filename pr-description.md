# PR Description: RPC Rate Limiting Handling

## Description
This PR introduces robust handling for RPC rate limiting (HTTP 429 Too Many Requests) within Stellar Suite. 

When an endpoint becomes rate-limited, the new `RpcRateLimiter` intercepts the error, extracts `Retry-After` headers (or falls back to exponential backoff), queues up new incoming requests to prevent further abuse, and automatically replays the blocked requests once the rate limit lifts.

## Key Features
- **Rate Limit Detection & Queuing:** Halts request processing upon a 429 error and stores subsequent requests in a queue buffer instead of aggressively pinging the API.
- **Smart Backoff Strategies:** Extracts standard `Retry-After` header directives (both seconds and HTTP dates) to delay exactly the right amount of time. If unavailable, falls back to a multiplicative exponential backoff.
- **User Notifications:** Actively displays non-obtrusive VS Code warning messages (`showWarningMessage`) notifying users when limits are hit and when endpoints eventually recover.
- **Configurable Constraints:** Users can adjust behavior through VS Code Settings:
  - `stellarSuite.rpc.rateLimit.maxRetries` (Default: 3)
  - `stellarSuite.rpc.rateLimit.initialBackoffMs` (Default: 1000)
  - `stellarSuite.rpc.rateLimit.maxBackoffMs` (Default: 30000)

## Files Added/Changed
- **`src/types/rpcRateLimit.ts`:** Core typing and event definitions for rate limit configurations and internal states.
- **`src/services/rpcRateLimitService.ts`:** Pure Typescript implementation of the RateLimiter tracking state, queue resolution, and header parsing.
- **`src/services/rpcService.ts`:** Injects `RpcRateLimiter` to proxy all outbound `/rpc` and `/health` requests, bubbling up warning notifications to the UX.
- **`package.json`:** Exposes limiting parameters to the Extensions settings.
- **`src/test/rpcRateLimitService.test.ts`:** Adds standalone native `assert` unit tests explicitly guaranteeing retry thresholds, queuing concurrency, and timestamp parsing behave as intended.

## Testing
- **New Unit Tests:** 5 new integration tests cover behavior for bypassing, retrying, tracking Header offsets, retry exhaustion, and concurrent queued resolutions on recovering thresholds.
- Run `npm run test:rpc-rate-limit` to execute the dedicated test suite.
