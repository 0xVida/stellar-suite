/**
 * src/lib/error/__tests__/apiInterceptor.test.ts
 * ============================================================
 * Unit tests for the Global API Interceptor — Issue #826
 * ============================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, apiGet, apiPost } from "../apiInterceptor";
import {
  AuthError,
  CompilerError,
  ContractError,
  UIError,
  NetworkError,
  ErrorCodes,
} from "../AppError";

// Mock the 'sonner' module to avoid rendering real toasts
vi.mock("sonner", () => {
  return {
    toast: {
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  };
});

import { toast } from "sonner";

describe("apiInterceptor — apiFetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns raw Response on successful 2xx status", async () => {
    const mockResponse = new Response(JSON.stringify({ data: "ok" }), {
      status: 200,
      statusText: "OK",
    });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const res = await apiFetch("/api/projects", { method: "GET" });
    expect(res).toBe(mockResponse);
    expect(await res.json()).toEqual({ data: "ok" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("intercepts network failure and throws NetworkError with suggestions", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(apiFetch("/api/projects", { method: "GET" })).rejects.toThrow(
      NetworkError
    );

    expect(toast.error).toHaveBeenCalled();
    const toastCall = vi.mocked(toast.error).mock.calls[0];
    expect(toastCall[0]).toBe("Fetch Failed");
    expect(toastCall[1]?.description).toContain("Check your internet connection");
  });

  it("intercepts timeout and throws NetworkError with RPC_TIMEOUT", async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));

    try {
      await apiFetch("/api/projects");
      fail("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(NetworkError);
      expect(err.code).toBe(ErrorCodes.RPC_TIMEOUT);
    }

    expect(toast.warning).toHaveBeenCalled();
    const toastCall = vi.mocked(toast.warning).mock.calls[0];
    expect(toastCall[0]).toBe("Rpc Timeout");
  });

  it("resolves route prefix to correct error domain (compiler error)", async () => {
    const mockResponse = new Response("cargo compile error details", {
      status: 500,
      statusText: "Internal Server Error",
    });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    try {
      await apiFetch("/api/compile");
      fail("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(CompilerError);
      expect(err.code).toBe(ErrorCodes.WASM_BUILD_FAILED);
      expect(err.rawOutput).toBe("cargo compile error details");
    }

    expect(toast.error).toHaveBeenCalled();
  });

  it("resolves auth error domains and handles unauthorized status", async () => {
    const mockResponse = new Response("Access denied", {
      status: 401,
      statusText: "Unauthorized",
    });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    try {
      await apiFetch("/api/auth");
      fail("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(AuthError);
      expect(err.code).toBe(ErrorCodes.UNAUTHORIZED);
    }

    expect(toast.error).toHaveBeenCalled();
  });

  it("respects silent option to suppress toast notification", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      apiFetch("/api/projects", { method: "GET" }, { silent: true })
    ).rejects.toThrow(NetworkError);

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});

describe("apiInterceptor — convenience wrappers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("apiGet calls fetch with GET and returns parsed JSON", async () => {
    const mockResponse = new Response(JSON.stringify({ value: 42 }), {
      status: 200,
    });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const data = await apiGet<{ value: number }>("/api/projects");
    expect(data).toEqual({ value: 42 });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("apiPost calls fetch with POST, JSON headers, body, and returns parsed JSON", async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), {
      status: 200,
    });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const data = await apiPost<{ success: boolean }>("/api/projects", { foo: "bar" });
    expect(data).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foo: "bar" }),
      })
    );
  });
});

function fail(msg: string) {
  throw new Error(msg);
}
