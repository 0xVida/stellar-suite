import { Account, Asset, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  MAX_XDR_DECODED_BYTES,
  MAX_XDR_ENCODED_BYTES,
  formatXdrValidationError,
  validateBase64XdrPayload,
  validateTransactionEnvelopeXdr,
} from "@/utils/XdrValidator";

const NETWORK = Networks.TESTNET;
const SOURCE_PK = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const DESTINATION_PK = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

const buildEnvelopeXdr = (): string => {
  const account = new Account(SOURCE_PK, "1");
  return new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK,
  })
    .addOperation(
      Operation.payment({
        destination: DESTINATION_PK,
        asset: Asset.native(),
        amount: "1",
      }),
    )
    .setTimeout(60)
    .build()
    .toXDR();
};

describe("XdrValidator", () => {
  it("accepts a valid transaction envelope XDR", () => {
    const result = validateTransactionEnvelopeXdr(buildEnvelopeXdr(), NETWORK);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.operationTypes).toEqual(["payment"]);
    expect(result.normalizedXdr).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("rejects malformed base64 before parsing", () => {
    const result = validateBase64XdrPayload("not-valid-xdr!!!");

    expect(result).not.toBeNull();
    expect(result?.error).toBe("XDR payload must be valid standard Base64.");
  });

  it("rejects oversized payloads before parsing", () => {
    const oversized = "A".repeat(MAX_XDR_ENCODED_BYTES);
    const result = validateBase64XdrPayload(oversized);

    expect(result).not.toBeNull();
    expect(result?.error).toContain(String(MAX_XDR_DECODED_BYTES));
  });

  it("formats validation errors with details", () => {
    const error = formatXdrValidationError({
      ok: false,
      error: "XDR payload is invalid.",
      details: ["First detail.", "Second detail."],
    });

    expect(error).toBe("XDR payload is invalid. First detail. Second detail.");
  });
});