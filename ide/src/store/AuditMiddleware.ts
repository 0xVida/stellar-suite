import type { StateCreator, StoreMutatorIdentifier } from "zustand";
import { useAuditLogStore, type AuditCategory, type AuditStatus } from "./useAuditLogStore";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuditEvent {
  category: AuditCategory;
  action: string;
  status: AuditStatus;
  user: string;
  params?: Record<string, unknown>;
  details?: string;
  rawJson?: Record<string, unknown>;
}

/** Sentinel key that store state patches can carry to trigger automatic audit logging. */
const AUDIT_KEY = "__auditEvent__" as const;

type WithAuditSentinel<T> = T & { [typeof AUDIT_KEY]?: AuditEvent };

// ── Middleware type ────────────────────────────────────────────────────────

type AuditMiddlewareImpl = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<T, Mps, Mcs>,
) => StateCreator<T, Mps, Mcs>;

// ── Core middleware ────────────────────────────────────────────────────────

/**
 * Zustand middleware that intercepts any state patch containing an
 * `__auditEvent__` sentinel key and forwards it to `useAuditLogStore`
 * before applying the remaining state update.
 *
 * The sentinel is stripped from the patch so it never leaks into the
 * actual store state — zero manual `addLog` calls needed inside stores
 * that wrap themselves with this middleware.
 *
 * @example
 * ```ts
 * export const useDeployStore = create<DeployState>()(
 *   auditMiddleware((set) => ({
 *     step: "idle",
 *     startDeploy: (user: string, contract: string) =>
 *       set(withAudit(
 *         { step: "uploading" },
 *         { category: "deploy", action: "Contract Deploy", status: "pending", user,
 *           params: { contract }, details: "Upload phase started" },
 *       )),
 *   }))
 * );
 * ```
 */
export const auditMiddleware: AuditMiddlewareImpl =
  (initializer) => (set, get, store) => {
    const auditedSet: typeof set = (partial, replace?) => {
      const patch =
        typeof partial === "function"
          ? (partial as (state: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>)(get())
          : partial;

      if (patch !== null && typeof patch === "object" && AUDIT_KEY in (patch as object)) {
        const { [AUDIT_KEY]: event, ...rest } = patch as WithAuditSentinel<typeof patch>;

        if (event) {
          _dispatchAuditEvent(event);
        }

        (set as (state: typeof rest, replace?: boolean) => void)(rest as any, replace as boolean | undefined);
        return;
      }

      (set as typeof set)(partial, replace as any);
    };

    return initializer(auditedSet, get, store);
  };

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Merge a state update with an audit sentinel in a type-safe way.
 * Use this inside store action implementations that are wrapped with `auditMiddleware`.
 *
 * @example
 * ```ts
 * set(withAudit({ buildState: "success" }, {
 *   category: "build", action: "Contract Build", status: "success",
 *   user: "alice", details: "Compiled successfully",
 * }));
 * ```
 */
export function withAudit<T extends Record<string, unknown>>(
  stateUpdate: T,
  event: AuditEvent,
): T & { [typeof AUDIT_KEY]: AuditEvent } {
  return { ...stateUpdate, [AUDIT_KEY]: event };
}

/**
 * Directly log an audit event to `useAuditLogStore` from outside a Zustand store,
 * e.g. inside a React callback or a non-store service.
 *
 * This replaces manual `addAuditLog` calls scattered through components and
 * ensures a consistent log format for Build, Deploy, and Sign operations.
 *
 * @example
 * ```ts
 * logAuditEvent({
 *   category: "deploy",
 *   action: "Contract Deploy",
 *   status: "success",
 *   user: auditUser,
 *   params: { contractId, network },
 *   details: `Deployed to ${network}`,
 * });
 * ```
 */
export function logAuditEvent(event: AuditEvent): void {
  _dispatchAuditEvent(event);
}

// ── Internal ───────────────────────────────────────────────────────────────

function _dispatchAuditEvent(event: AuditEvent): void {
  const { addLog } = useAuditLogStore.getState();
  addLog({
    category: event.category,
    action: event.action,
    status: event.status,
    user: event.user,
    params: event.params ?? {},
    details: event.details ?? "",
    rawJson: event.rawJson ?? {
      ...event.params,
      action: event.action,
      status: event.status,
      timestamp: new Date().toISOString(),
    },
  });
}

// ── Auditable action name constants ────────────────────────────────────────

/** Well-known action labels used across Build, Deploy, and Sign flows. */
export const AUDIT_ACTIONS = {
  BUILD_START: "Contract Build",
  BUILD_SUCCESS: "Contract Build",
  BUILD_FAILURE: "Contract Build",
  DEPLOY_UPLOAD: "Contract Deploy",
  DEPLOY_INSTANTIATE: "Contract Deploy",
  DEPLOY_SUCCESS: "Contract Deploy",
  DEPLOY_FAILURE: "Contract Deploy",
  INVOKE_SIGN: "Contract Sign",
  INVOKE_SUBMIT: "Contract Invoke",
  INVOKE_FAILURE: "Contract Invoke",
  SECURITY_AUDIT: "Security Audit",
  CLIPPY_RUN: "Clippy Lint",
} as const;
