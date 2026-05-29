import { beforeEach, describe, expect, it } from "vitest";
import {
  browserSessionStorage,
  memorySessionStorage,
} from "@/lib/wallet/storage";

describe("memorySessionStorage", () => {
  it("round-trips a session value", () => {
    const store = memorySessionStorage();
    expect(store.read()).toBeNull();
    store.write({ topic: "abc", savedAt: 1 });
    expect(store.read()).toEqual({ topic: "abc", savedAt: 1 });
  });

  it("clears the stored value", () => {
    const store = memorySessionStorage();
    store.write({ topic: "abc", savedAt: 1 });
    store.clear();
    expect(store.read()).toBeNull();
  });
});

describe("browserSessionStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists into the underlying localStorage", () => {
    const store = browserSessionStorage("test-key");
    store.write({ topic: "abc", savedAt: 42 });
    expect(JSON.parse(window.localStorage.getItem("test-key") ?? "null")).toEqual({
      topic: "abc",
      savedAt: 42,
    });
    expect(store.read()).toEqual({ topic: "abc", savedAt: 42 });
  });

  it("returns null when nothing is stored", () => {
    const store = browserSessionStorage("test-empty");
    expect(store.read()).toBeNull();
  });

  it("returns null when the stored blob is malformed", () => {
    window.localStorage.setItem("test-bad", "not-json");
    const store = browserSessionStorage("test-bad");
    expect(store.read()).toBeNull();
  });

  it("returns null when the stored blob has the wrong shape", () => {
    window.localStorage.setItem(
      "test-wrong",
      JSON.stringify({ unrelated: true }),
    );
    const store = browserSessionStorage("test-wrong");
    expect(store.read()).toBeNull();
  });
});
