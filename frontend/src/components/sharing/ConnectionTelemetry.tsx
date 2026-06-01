"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionHealth = "connected" | "degraded" | "disconnected" | "connecting";

export interface TelemetryState {
  health: ConnectionHealth;
  latencyMs: number | null;
  peerCount: number;
  lastPingAt: number | null;
  errorMessage: string | null;
}

export interface ConnectionTelemetryProps {
  wsUrl?: string;
  sessionId?: string;
  pingIntervalMs?: number;
  degradedThresholdMs?: number;
  className?: string;
  onHealthChange?: (health: ConnectionHealth) => void;
}

const HEALTH_COLORS: Record<ConnectionHealth, string> = {
  connected: "#22c55e",
  degraded: "#f59e0b",
  disconnected: "#ef4444",
  connecting: "#6366f1",
};

const HEALTH_LABELS: Record<ConnectionHealth, string> = {
  connected: "Connected",
  degraded: "Degraded",
  disconnected: "Disconnected",
  connecting: "Connecting",
};

function PulseRing({ color, active }: { color: string; active: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        position: "relative",
        width: 10,
        height: 10,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          backgroundColor: color,
          opacity: active ? 1 : 0.4,
        }}
      />
      {active && (
        <span
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: "50%",
            border: `2px solid ${color}`,
            animation: "ct-pulse 1.4s ease-out infinite",
            opacity: 0,
          }}
        />
      )}
    </span>
  );
}

function LatencyBar({ latencyMs, degradedThresholdMs }: { latencyMs: number | null; degradedThresholdMs: number }) {
  if (latencyMs === null) {
    return (
      <span style={{ color: "#9ca3af", fontSize: 11 }}>—</span>
    );
  }

  const capped = Math.min(latencyMs, degradedThresholdMs * 2);
  const pct = Math.round((capped / (degradedThresholdMs * 2)) * 100);
  const color = latencyMs >= degradedThresholdMs ? "#f59e0b" : "#22c55e";

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          display: "inline-block",
          width: 48,
          height: 4,
          borderRadius: 2,
          backgroundColor: "#374151",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${pct}%`,
            backgroundColor: color,
            transition: "width 0.3s ease, background-color 0.3s ease",
          }}
        />
      </span>
      <span style={{ fontSize: 11, color, minWidth: 36, textAlign: "right" }}>
        {latencyMs}ms
      </span>
    </span>
  );
}

export function ConnectionTelemetry({
  wsUrl,
  sessionId,
  pingIntervalMs = 5000,
  degradedThresholdMs = 300,
  className,
  onHealthChange,
}: ConnectionTelemetryProps) {
  const [state, setState] = useState<TelemetryState>({
    health: wsUrl ? "connecting" : "disconnected",
    latencyMs: null,
    peerCount: 0,
    lastPingAt: null,
    errorMessage: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingStartRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const updateHealth = useCallback(
    (health: ConnectionHealth) => {
      setState((prev) => (prev.health === health ? prev : { ...prev, health }));
      onHealthChange?.(health);
    },
    [onHealthChange],
  );

  const sendPing = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    pingStartRef.current = performance.now();
    try {
      ws.send(JSON.stringify({ type: "ping", sessionId, ts: pingStartRef.current }));
    } catch {
      // socket may have closed between the readyState check and send
    }
  }, [sessionId]);

  const connect = useCallback(() => {
    if (!wsUrl || unmountedRef.current) return;

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setState((prev) => ({ ...prev, health: "connecting", errorMessage: null }));
    onHealthChange?.("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      if (!unmountedRef.current) {
        setState((prev) => ({
          ...prev,
          health: "disconnected",
          errorMessage: err instanceof Error ? err.message : "Failed to create WebSocket",
        }));
        onHealthChange?.("disconnected");
      }
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      setState((prev) => ({ ...prev, health: "connected", errorMessage: null }));
      onHealthChange?.("connected");

      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      pingTimerRef.current = setInterval(sendPing, pingIntervalMs);
      sendPing();
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === "pong" && pingStartRef.current !== null) {
          const latencyMs = Math.round(performance.now() - pingStartRef.current);
          pingStartRef.current = null;
          const health: ConnectionHealth = latencyMs >= degradedThresholdMs ? "degraded" : "connected";
          setState((prev) => ({
            ...prev,
            health,
            latencyMs,
            lastPingAt: Date.now(),
          }));
          onHealthChange?.(health);
        }

        if (typeof data.peerCount === "number") {
          setState((prev) => ({ ...prev, peerCount: data.peerCount }));
        }
      } catch {
        // non-JSON messages are ignored
      }
    };

    ws.onclose = (event) => {
      if (unmountedRef.current) return;
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      setState((prev) => ({
        ...prev,
        health: "disconnected",
        latencyMs: null,
        errorMessage: event.wasClean ? null : `Connection closed (code ${event.code})`,
      }));
      onHealthChange?.("disconnected");

      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) connect();
      }, 3000);
    };

    ws.onerror = () => {
      if (unmountedRef.current) return;
      setState((prev) => ({
        ...prev,
        health: "disconnected",
        errorMessage: "WebSocket error",
      }));
      onHealthChange?.("disconnected");
    };
  }, [wsUrl, sessionId, pingIntervalMs, degradedThresholdMs, sendPing, onHealthChange]);

  useEffect(() => {
    unmountedRef.current = false;
    if (wsUrl) connect();

    return () => {
      unmountedRef.current = true;
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [wsUrl, connect]);

  const { health, latencyMs, peerCount, errorMessage } = state;
  const color = HEALTH_COLORS[health];
  const isActive = health === "connected" || health === "degraded";
  const showWarning = health === "disconnected" || health === "degraded";

  return (
    <>
      <style>{`
        @keyframes ct-pulse {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0; }
        }
      `}</style>

      <div
        className={className}
        role="status"
        aria-live="polite"
        aria-label={`Live share connection: ${HEALTH_LABELS[health]}`}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          gap: 6,
          userSelect: "none",
        }}
      >
        {/* Telemetry bar */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px",
            borderRadius: 6,
            backgroundColor: "#111827",
            border: `1px solid ${showWarning ? color : "#1f2937"}`,
            transition: "border-color 0.3s ease",
            fontSize: 12,
            color: "#d1d5db",
            fontFamily: "ui-monospace, monospace",
            whiteSpace: "nowrap",
          }}
        >
          <PulseRing color={color} active={isActive} />

          <span style={{ color, fontWeight: 600, minWidth: 82 }}>
            {HEALTH_LABELS[health]}
          </span>

          <span style={{ color: "#6b7280" }}>|</span>

          <LatencyBar latencyMs={latencyMs} degradedThresholdMs={degradedThresholdMs} />

          <span style={{ color: "#6b7280" }}>|</span>

          <span style={{ color: "#9ca3af" }}>
            {peerCount} {peerCount === 1 ? "peer" : "peers"}
          </span>
        </div>

        {/* Degraded / disconnected warning overlay */}
        {showWarning && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 6,
              backgroundColor: health === "disconnected" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
              border: `1px solid ${color}44`,
              fontSize: 11,
              color,
              fontFamily: "ui-monospace, monospace",
              animation: "ct-fade-in 0.2s ease",
            }}
          >
            <svg
              width={12}
              height={12}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <path
                d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z"
                fill={color}
              />
              <path d="M7.25 4.75h1.5v4.5h-1.5V4.75zM7.25 10.75h1.5v1.5h-1.5v-1.5z" fill={color} />
            </svg>
            <span>
              {errorMessage ??
                (health === "disconnected"
                  ? "Session disconnected — attempting to reconnect"
                  : "High latency detected on live share session")}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
