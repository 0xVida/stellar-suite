"use strict";
// ============================================================
// src/services/networkValidator.ts
// Network connectivity validation — lightweight endpoint
// reachability tests with configurable timeouts.
// ============================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateNetworkConnectivity = validateNetworkConnectivity;
exports.validateNetworkEndpoints = validateNetworkEndpoints;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
// ── Helpers ───────────────────────────────────────────────────
function createIssue(code, message, options) {
    return {
        severity: 'error',
        code,
        message,
        ...options,
    };
}
function buildResult(issues) {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    return {
        valid: errors.length === 0,
        issues,
        errors,
        warnings,
    };
}
/**
 * Perform a lightweight HEAD / GET request to check endpoint
 * reachability. This is intentionally minimal — we only care
 * about TCP-level connectivity and a non-error HTTP status,
 * not about the response body.
 */
async function checkEndpoint(options, logger) {
    const { url, label } = options;
    const timeoutMs = options.timeoutMs ?? 5000;
    const displayLabel = label || url;
    logger?.debug(`[NetworkValidator] Testing connectivity to ${displayLabel}...`);
    return new Promise((resolve) => {
        let parsed;
        try {
            parsed = new url_1.URL(url);
        }
        catch {
            resolve(createIssue('INVALID_URL', `Invalid URL: "${url}"`, {
                field: 'url',
                receivedValue: url,
                suggestion: 'Provide a valid http(s) URL.',
            }));
            return;
        }
        const requester = parsed.protocol === 'https:' ? https : http;
        const requestOptions = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname || '/',
            method: 'HEAD',
            timeout: timeoutMs,
            headers: {
                'User-Agent': 'StellarSuite-PreFlight/1.0',
            },
        };
        const req = requester.request(requestOptions, (res) => {
            // Any response (even 4xx/5xx) means the endpoint is reachable.
            // We only care about network-level connectivity.
            logger?.debug(`[NetworkValidator] ✔ ${displayLabel} responded with status ${res.statusCode}`);
            res.resume(); // drain
            resolve(undefined);
        });
        req.on('timeout', () => {
            req.destroy();
            logger?.warn(`[NetworkValidator] ✘ ${displayLabel} timed out after ${timeoutMs}ms`);
            resolve(createIssue('NETWORK_TIMEOUT', `Connection to "${displayLabel}" timed out after ${timeoutMs}ms.`, {
                field: 'url',
                receivedValue: url,
                suggestion: `Verify the endpoint is running and reachable. Increase timeout if on a slow network.`,
            }));
        });
        req.on('error', (err) => {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger?.warn(`[NetworkValidator] ✘ ${displayLabel} connection failed: ${errMsg}`);
            let code = 'NETWORK_ERROR';
            let suggestion = 'Check your network connection and try again.';
            if (errMsg.includes('ECONNREFUSED')) {
                code = 'CONNECTION_REFUSED';
                suggestion = `The endpoint at "${url}" is refusing connections. Verify it is running.`;
            }
            else if (errMsg.includes('ENOTFOUND')) {
                code = 'DNS_RESOLUTION_FAILED';
                suggestion = `DNS resolution failed for "${parsed.hostname}". Check the URL and your DNS settings.`;
            }
            else if (errMsg.includes('ECONNRESET')) {
                code = 'CONNECTION_RESET';
                suggestion = 'The connection was reset. This may be transient — retry in a moment.';
            }
            else if (errMsg.includes('certificate') || errMsg.includes('TLS')) {
                code = 'TLS_ERROR';
                suggestion = 'TLS/certificate error. Verify the endpoint certificate or use http for local testing.';
            }
            resolve(createIssue(code, `Failed to connect to "${displayLabel}": ${errMsg}`, {
                field: 'url',
                receivedValue: url,
                suggestion,
            }));
        });
        req.end();
    });
}
// ── Public API ────────────────────────────────────────────────
/**
 * Check network connectivity to a single endpoint.
 */
async function validateNetworkConnectivity(options, logger) {
    const issue = await checkEndpoint(options, logger);
    return buildResult(issue ? [issue] : []);
}
/**
 * Check network connectivity to multiple endpoints.
 * All checks run in parallel for speed.
 */
async function validateNetworkEndpoints(endpoints, logger) {
    if (endpoints.length === 0) {
        return buildResult([]);
    }
    logger?.debug(`[NetworkValidator] Checking ${endpoints.length} endpoint(s)...`);
    const results = await Promise.all(endpoints.map(ep => checkEndpoint(ep, logger)));
    const issues = results.filter((issue) => issue !== undefined);
    const result = buildResult(issues);
    if (result.valid) {
        logger?.debug('[NetworkValidator] All endpoints reachable');
    }
    else {
        logger?.warn(`[NetworkValidator] ${result.errors.length} endpoint(s) unreachable`);
    }
    return result;
}
