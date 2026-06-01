/**
 * src/lib/error/index.ts
 * ============================================================
 * Public barrel for the error handling framework.
 *
 * Import everything you need from this single entry-point:
 *
 *   import {
 *     AppError, CompilerError, NetworkError, ContractError, AuthError, UIError,
 *     ErrorCodes,
 *     isAppError, isCompilerError, isNetworkError,
 *     apiFetch, apiPost, apiGet,
 *   } from "@/lib/error";
 * ============================================================
 */

export * from "./AppError";
export * from "./apiInterceptor";
