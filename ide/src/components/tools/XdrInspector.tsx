"use client";

import { useEffect, useMemo, useState } from "react";
import { xdr } from "@stellar/stellar-sdk";
import {
  normalizeXdrPayload,
  validateBase64XdrPayload,
} from "@/utils/XdrValidator";
import { CopyToClipboard } from "@/components/ide/CopyToClipboard";
import { checksumXdrPayload, verifyXdrChecksum } from "@/utils/XdrChecksum";

type DecodedType = "TransactionEnvelope" | "LedgerEntry" | "ScVal";

type DecodedState = {
  type: DecodedType;
  value: xdr.TransactionEnvelope | xdr.LedgerEntry | xdr.ScVal;
};

function serializeScVal(value: xdr.ScVal) {
  const kind = value.switch().name;

  if (kind === "scvBool") {
    return { kind, value: value.b() };
  }

  if (kind === "scvU32") {
    return { kind, value: value.u32() };
  }

  if (kind === "scvI32") {
    return { kind, value: value.i32() };
  }

  if (kind === "scvString") {
    return { kind, value: value.str().toString() };
  }

  if (kind === "scvSymbol") {
    return { kind, value: value.sym().toString() };
  }

  return {
    kind,
    xdrBase64: value.toXDR("base64"),
  };
}

function safeStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, currentValue) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }
      return currentValue;
    },
    2,
  );
}

function asJsonLike(value: DecodedState["value"]) {
  if (value instanceof xdr.ScVal) {
    return serializeScVal(value);
  }

  return {
    xdrBase64: value.toXDR("base64"),
    type: "xdr-object",
  };
}

function decodeXdr(base64: string): DecodedState {
  try {
    return {
      type: "TransactionEnvelope",
      value: xdr.TransactionEnvelope.fromXDR(base64, "base64"),
    };
  } catch {
    // Continue fallback decode attempts.
  }

  try {
    return {
      type: "LedgerEntry",
      value: xdr.LedgerEntry.fromXDR(base64, "base64"),
    };
  } catch {
    // Continue fallback decode attempts.
  }

  try {
    return {
      type: "ScVal",
      value: xdr.ScVal.fromXDR(base64, "base64"),
    };
  } catch {
    throw new Error(
      "Unable to decode this XDR as TransactionEnvelope, LedgerEntry, or ScVal.",
    );
  }
}

export default function XdrInspector() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputBase64, setInputBase64] = useState("");
  const [decoded, setDecoded] = useState<DecodedState | null>(null);
  const [encodedBase64, setEncodedBase64] = useState("");
  const [computedChecksum, setComputedChecksum] = useState("");
  const [expectedChecksum, setExpectedChecksum] = useState("");
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [verificationTone, setVerificationTone] = useState<
    "idle" | "match" | "mismatch" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const decodedJson = useMemo(() => {
    if (!decoded) return "";
    return safeStringify({
      decodedType: decoded.type,
      decoded: asJsonLike(decoded.value),
    });
  }, [decoded]);

  const handleDecode = () => {
    void (async () => {
      const normalized = normalizeXdrPayload(inputBase64);
      if (!normalized) {
        setErrorMessage("Please paste a Base64 XDR value before decoding.");
        setDecoded(null);
        setEncodedBase64("");
        setComputedChecksum("");
        return;
      }

      const validationError = validateBase64XdrPayload(normalized);
      if (validationError) {
        setErrorMessage(validationError.error);
        setDecoded(null);
        setEncodedBase64("");
        setComputedChecksum("");
        return;
      }

      try {
        const [decodedResult, checksumResult] = await Promise.all([
          Promise.resolve(decodeXdr(normalized)),
          checksumXdrPayload(normalized),
        ]);
        setDecoded(decodedResult);
        setComputedChecksum(checksumResult.checksum);
        setEncodedBase64("");
        setErrorMessage(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to decode XDR.";
        setErrorMessage(`Decode failed: ${message}`);
        setDecoded(null);
        setEncodedBase64("");
        setComputedChecksum("");
      }
    })();
  };

  const handleVerifyChecksum = () => {
    const normalized = normalizeXdrPayload(inputBase64);
    if (!normalized) {
      setVerificationTone("error");
      setVerificationMessage("Paste Base64 XDR before verifying a checksum.");
      return;
    }

    void (async () => {
      try {
        const result = await verifyXdrChecksum(normalized, expectedChecksum);
        setComputedChecksum(result.checksum);
        setVerificationTone(result.matches ? "match" : "mismatch");
        setVerificationMessage(
          result.matches
            ? "Checksum verified. The imported XDR matches the supplied SHA-256 digest."
            : "Checksum mismatch. The imported XDR does not match the supplied SHA-256 digest.",
        );
      } catch (error) {
        setVerificationTone("error");
        setVerificationMessage(
          error instanceof Error ? error.message : "Checksum verification failed.",
        );
      }
    })();
  };

  const handleEncode = () => {
    if (!decoded) {
      setErrorMessage("Decode a valid XDR first, then encode.");
      setEncodedBase64("");
      return;
    }

    try {
      setEncodedBase64(decoded.value.toXDR("base64"));
      setErrorMessage(null);
    } catch {
      setErrorMessage("Encoding is not supported for this decoded object.");
      setEncodedBase64("");
    }
  };

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      if (typeof customEvent.detail?.open === "boolean") {
        setIsOpen(customEvent.detail.open);
      } else {
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("ide:xdr-toggle", handleToggle as EventListener);
    return () => {
      window.removeEventListener(
        "ide:xdr-toggle",
        handleToggle as EventListener,
      );
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-3 md:top-14">
      <div className="w-full max-w-5xl">
        {isOpen ? (
          <div className="pointer-events-auto rounded-lg border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  XDR Inspector
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Paste Base64 XDR, decode to JSON, and encode it back.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <label
                htmlFor="xdr-input"
                className="text-sm font-medium text-foreground"
              >
                Base64 XDR Input
              </label>
              <textarea
                id="xdr-input"
                value={inputBase64}
                onChange={(event) => {
                  setInputBase64(event.target.value);
                  setVerificationTone("idle");
                  setVerificationMessage(null);
                }}
                placeholder="AAAAAgAAA..."
                className="min-h-28 w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDecode}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Decode
                </button>
                <button
                  type="button"
                  onClick={handleEncode}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Encode
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-md border border-border bg-background/60 p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Checksum Verification
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Compare imported XDR against a provided SHA-256 digest before manual submission.
                  </p>
                </div>
                {computedChecksum ? (
                  <CopyToClipboard
                    text={computedChecksum}
                    label="Copy computed checksum"
                    copiedLabel="Checksum copied!"
                  />
                ) : null}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="xdr-checksum"
                  className="text-xs font-medium text-foreground"
                >
                  Expected SHA-256 Checksum
                </label>
                <input
                  id="xdr-checksum"
                  value={expectedChecksum}
                  onChange={(event) => {
                    setExpectedChecksum(event.target.value);
                    setVerificationTone("idle");
                    setVerificationMessage(null);
                  }}
                  placeholder="e3b0c44298fc1c149afbf4c8996fb924..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleVerifyChecksum}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Verify Checksum
                </button>
              </div>

              {computedChecksum ? (
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Computed checksum
                  </p>
                  <code className="mt-1 block break-all text-[11px] text-foreground">
                    {computedChecksum}
                  </code>
                </div>
              ) : null}

              {verificationMessage ? (
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${
                    verificationTone === "match"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : verificationTone === "mismatch"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {verificationMessage}
                </div>
              ) : null}
            </div>

            {errorMessage ? (
              <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              <h2 className="text-sm font-medium text-foreground">
                Decoded Output
              </h2>
              <pre className="max-h-60 overflow-auto rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground">
                {decodedJson || "Decode output will appear here."}
              </pre>
            </div>

            <div className="mt-4 space-y-2">
              <h2 className="text-sm font-medium text-foreground">
                Encoded Base64 Output
              </h2>
              <textarea
                readOnly
                value={encodedBase64}
                placeholder="Encoded Base64 will appear here after clicking Encode."
                className="min-h-24 w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
