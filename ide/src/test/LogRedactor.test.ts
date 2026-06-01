import { describe, expect, it } from "vitest";
import { redactText, DEFAULT_REDACTION_RULES } from "@/components/ide/LogRedactor";

// Real-shaped Stellar identifiers for the tests (56-char base32 with the
// known leading byte). The actual values are public examples — the test
// only cares about the *shape* being detected.
const SECRET_KEY = "SCEJBJ3K2I5R4QY7PWZGD6XPLHFW7B6QVK45Y6PXOXMHQ3RHFTPK7LZ2";
const PUBLIC_KEY = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2QHIGOYJBNFDQOM";
const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQ4";

describe("redactText", () => {
  it("returns input unchanged when empty", () => {
    expect(redactText("")).toBe("");
  });

  it("redacts Stellar secret keys", () => {
    const out = redactText(`secret=${SECRET_KEY}`);
    expect(out).not.toContain(SECRET_KEY);
    expect(out.startsWith("secret=S")).toBe(true);
    expect(out).toMatch(/█/);
  });

  it("redacts Stellar public keys", () => {
    const out = redactText(`signer ${PUBLIC_KEY} authorized`);
    expect(out).not.toContain(PUBLIC_KEY);
    expect(out).toContain("signer ");
    expect(out).toContain(" authorized");
  });

  it("redacts Stellar contract addresses", () => {
    const out = redactText(`contract: ${CONTRACT_ID}`);
    expect(out).not.toContain(CONTRACT_ID);
  });

  it("redacts long hex blobs (hashes, signatures)", () => {
    const hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const out = redactText(`hash=${hash}`);
    expect(out).not.toContain(hash);
  });

  it("redacts hex blobs prefixed with 0x", () => {
    const hex = "0xdeadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef";
    const out = redactText(hex);
    expect(out).not.toContain(hex);
  });

  it("redacts JWT-shaped tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = redactText(`Authorization: Bearer ${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain("Authorization: Bearer eyJ");
  });

  it("leaves ordinary log lines untouched", () => {
    const plain = "Build finished in 1.2s — 0 warnings.";
    expect(redactText(plain)).toBe(plain);
  });

  it("redacts multiple secrets within the same payload", () => {
    const payload = `from=${PUBLIC_KEY} to=${PUBLIC_KEY} signed_by=${SECRET_KEY}`;
    const out = redactText(payload);
    expect(out).not.toContain(SECRET_KEY);
    expect(out).not.toContain(PUBLIC_KEY);
    // Word boundaries (` to=`, ` signed_by=`) should be preserved
    expect(out).toContain(" to=");
    expect(out).toContain(" signed_by=");
  });

  it("exposes the rule list for customization", () => {
    expect(DEFAULT_REDACTION_RULES.length).toBeGreaterThan(0);
    for (const rule of DEFAULT_REDACTION_RULES) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("accepts a custom rule list and ignores defaults when overridden", () => {
    const custom = [
      {
        name: "literal-token",
        pattern: /TOKEN-\d+/g,
      },
    ];
    expect(redactText("TOKEN-12345 plus secret " + SECRET_KEY, custom)).not.toContain(
      "TOKEN-12345",
    );
    // The default rules are NOT applied, so the secret key remains
    expect(redactText("TOKEN-12345 plus secret " + SECRET_KEY, custom)).toContain(SECRET_KEY);
  });
});
