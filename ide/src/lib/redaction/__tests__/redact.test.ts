import { describe, it, expect } from "vitest";
import { redactString, shannonEntropy } from "../redact";

const STELLAR_SECRET = "SBYWPHAFGRRPMHFSGYRC4VVH62MAGNK6QGAERA6DUQNX2YYTKDDOMQDB";
const STELLAR_PUBLIC = "GBJ4MN5GUTUOXHC2PB72LQ6JWXJK7XVCYLRY4LRTU2T4XYDPRWPFCSWJ";
const STELLAR_CONTRACT = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";

describe("redactString", () => {
  it("masks Stellar secret keys completely", () => {
    const out = redactString(`secret=${STELLAR_SECRET}`);
    expect(out.redacted).toContain("[REDACTED:STELLAR_SECRET]");
    expect(out.redacted).not.toContain(STELLAR_SECRET);
    expect(out.count).toBeGreaterThanOrEqual(1);
  });

  it("partially masks Stellar public keys (keeps prefix and suffix)", () => {
    const out = redactString(STELLAR_PUBLIC);
    expect(out.redacted).not.toBe(STELLAR_PUBLIC);
    expect(out.redacted.startsWith("GBJ4")).toBe(true);
    expect(out.redacted.endsWith(STELLAR_PUBLIC.slice(-4))).toBe(true);
    expect(out.redacted).toContain("…");
  });

  it("partially masks Stellar contract IDs", () => {
    const out = redactString(`contract=${STELLAR_CONTRACT}`);
    expect(out.redacted).not.toContain(STELLAR_CONTRACT);
    expect(out.redacted).toContain("CAS3");
  });

  it("masks JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = redactString(jwt);
    expect(out.redacted).toBe("[REDACTED:JWT]");
  });

  it("masks Bearer tokens in Authorization headers", () => {
    const out = redactString(
      "curl -H 'Authorization: Bearer sk-live-XXXXXXXXXXXXXXXXXXXXXXXX'",
    );
    // The exact form depends on which rule fires first; the contract is
    // simply that the credential value never survives.
    expect(out.redacted).not.toContain("sk-live-XXXXXXXXXXXXXXXXXXXXXXXX");
    expect(out.redacted).toContain("[REDACTED]");
  });

  it("masks bare Bearer tokens (no Authorization prefix)", () => {
    const out = redactString(
      "Token from header: Bearer sk-live-XXXXXXXXXXXXXXXXXXXXXXXX",
    );
    expect(out.redacted).toContain("Bearer [REDACTED]");
    expect(out.redacted).not.toContain("sk-live-XXXXXXXXXXXXXXXXXXXXXXXX");
  });

  it("partially masks raw 64-char hex private keys", () => {
    const hex = "a".repeat(64);
    const out = redactString(`priv=${hex}`);
    expect(out.redacted).not.toContain(hex);
    expect(out.redacted).toContain("aaaa…aaaa");
  });

  it("does not mask short readable identifiers", () => {
    const out = redactString("transfer to alice succeeded for 100 XLM");
    expect(out.redacted).toBe("transfer to alice succeeded for 100 XLM");
    expect(out.count).toBe(0);
  });

  it("uses entropy fallback for unknown high-entropy tokens", () => {
    // 32-char base64-ish random-looking token, no whitespace
    const token = "Q2hhcmFjdGVycz0xMjM0NTYJMTIzNDU2-AB";
    const out = redactString(`api_key=${token}`);
    expect(out.redacted).not.toContain(token);
    expect(out.hits.some((h) => h.rule === "high-entropy")).toBe(true);
  });

  it("can disable entropy fallback", () => {
    const token = "Q2hhcmFjdGVycz0xMjM0NTYJMTIzNDU2-AB";
    const out = redactString(token, { enableEntropyFallback: false });
    expect(out.redacted).toBe(token);
  });

  it("masks multiple distinct values in one pass", () => {
    const text = `secret=${STELLAR_SECRET}\npublic=${STELLAR_PUBLIC}`;
    const out = redactString(text);
    expect(out.redacted).not.toContain(STELLAR_SECRET);
    expect(out.redacted).not.toContain(STELLAR_PUBLIC);
    expect(out.count).toBeGreaterThanOrEqual(2);
  });

  it("returns empty input untouched", () => {
    expect(redactString("").redacted).toBe("");
    expect(redactString("").count).toBe(0);
  });
});

describe("shannonEntropy", () => {
  it("scores prose below the high-entropy threshold", () => {
    expect(shannonEntropy("the quick brown fox")).toBeLessThan(4);
  });

  it("scores random tokens above the threshold", () => {
    expect(shannonEntropy("Q2hhcmFjdGVycz0xMjM0NTYJMTIzNDU2-AB")).toBeGreaterThan(4);
  });

  it("returns 0 for an empty string", () => {
    expect(shannonEntropy("")).toBe(0);
  });
});
