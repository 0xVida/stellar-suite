import { TransactionBuilder } from "@stellar/stellar-sdk";
import { z } from "zod";

export const MAX_XDR_ENCODED_BYTES = 512 * 1024;
export const MAX_XDR_DECODED_BYTES = 256 * 1024;

const BASE64_XDR_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const knownOperationTypes = [
  "createAccount",
  "payment",
  "pathPaymentStrictReceive",
  "manageSellOffer",
  "createPassiveSellOffer",
  "setOptions",
  "changeTrust",
  "allowTrust",
  "accountMerge",
  "inflation",
  "manageData",
  "bumpSequence",
  "manageBuyOffer",
  "pathPaymentStrictSend",
  "createClaimableBalance",
  "claimClaimableBalance",
  "beginSponsoringFutureReserves",
  "endSponsoringFutureReserves",
  "revokeSponsorship",
  "clawback",
  "clawbackClaimableBalance",
  "setTrustLineFlags",
  "liquidityPoolDeposit",
  "liquidityPoolWithdraw",
  "invokeHostFunction",
  "extendFootprintTtl",
  "extendFootprintTTL",
  "bumpFootprintExpiration",
  "restoreFootprint",
] as const;

const operationSchema = z
  .object({
    type: z.enum(knownOperationTypes),
    source: z.string().min(1).nullable().optional(),
  })
  .passthrough();

const transactionStructureSchema = z.object({
  source: z.string().min(1),
  fee: z.union([z.string().min(1), z.number().nonnegative()]),
  sequence: z.union([z.string().min(1), z.number()]).optional(),
  operations: z.array(operationSchema).min(1).max(100),
});

export interface XdrValidationSuccess {
  ok: true;
  normalizedXdr: string;
  transaction: ReturnType<typeof TransactionBuilder.fromXDR>;
  operationTypes: string[];
}

export interface XdrValidationFailure {
  ok: false;
  error: string;
  details?: string[];
}

export type XdrValidationResult = XdrValidationSuccess | XdrValidationFailure;

export function normalizeXdrPayload(input: string): string {
  return input.replace(/\s+/g, "");
}

function decodedLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function validateBase64XdrPayload(input: string): XdrValidationFailure | null {
  if (!input) {
    return {
      ok: false,
      error: "Paste a base64-encoded Transaction Envelope XDR.",
    };
  }

  if (input.length > MAX_XDR_ENCODED_BYTES) {
    return {
      ok: false,
      error: `XDR payload is too large. Maximum encoded size is ${MAX_XDR_ENCODED_BYTES} bytes.`,
    };
  }

  if (input.length % 4 !== 0 || !BASE64_XDR_PATTERN.test(input)) {
    return {
      ok: false,
      error: "XDR payload must be valid standard Base64.",
    };
  }

  if (decodedLength(input) > MAX_XDR_DECODED_BYTES) {
    return {
      ok: false,
      error: `XDR payload is too large. Maximum decoded size is ${MAX_XDR_DECODED_BYTES} bytes.`,
    };
  }

  return null;
}

export function validateTransactionEnvelopeXdr(
  input: string,
  networkPassphrase: string,
): XdrValidationResult {
  const normalizedXdr = normalizeXdrPayload(input);
  const preflightError = validateBase64XdrPayload(normalizedXdr);
  if (preflightError) return preflightError;

  let transaction: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    transaction = TransactionBuilder.fromXDR(normalizedXdr, networkPassphrase);
  } catch (error) {
    return {
      ok: false,
      error: "XDR payload is not a valid Stellar transaction envelope.",
      details: [error instanceof Error ? error.message : "Unable to parse XDR."],
    };
  }

  const innerTransaction =
    "innerTransaction" in transaction
      ? typeof transaction.innerTransaction === "function"
        ? transaction.innerTransaction()
        : transaction.innerTransaction
      : null;
  const operationTransaction = innerTransaction ?? transaction;

  const structure = {
    source: operationTransaction.source,
    fee: operationTransaction.fee,
    sequence:
      "sequence" in operationTransaction ? operationTransaction.sequence : undefined,
    operations: operationTransaction.operations,
  };

  const schemaResult = transactionStructureSchema.safeParse(structure);
  if (!schemaResult.success) {
    return {
      ok: false,
      error: "Transaction XDR failed structural validation.",
      details: schemaResult.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      }),
    };
  }

  return {
    ok: true,
    normalizedXdr,
    transaction,
    operationTypes: schemaResult.data.operations.map((operation) => operation.type),
  };
}

export function assertValidTransactionEnvelopeXdr(
  input: string,
  networkPassphrase: string,
): XdrValidationSuccess {
  const result = validateTransactionEnvelopeXdr(input, networkPassphrase);
  if (!result.ok) {
    const detail = result.details?.length ? ` ${result.details.join(" ")}` : "";
    throw new Error(`${result.error}${detail}`);
  }
  return result;
}
