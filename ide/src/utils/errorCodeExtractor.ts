/**
 * Extracts error codes from diagnostic messages
 * Supports both Rust error codes (E0277) and custom Soroban codes
 */
export function extractErrorCode(message: string): string | null {
  const lowered = message.toLowerCase();

  // Match Rust error codes like [E0277]
  const rustErrorMatch = message.match(/\[([E]\d{4})\]/);
  if (rustErrorMatch) {
    return rustErrorMatch[1];
  }

  // Match custom error codes like [SOROBAN_STATE_LIMIT]
  const customErrorMatch = message.match(/\[([A-Z0-9_]+)\]/);
  if (customErrorMatch) {
    return customErrorMatch[1];
  }

  // Check for common error patterns in the message itself
  if (
    (lowered.includes("the trait") && lowered.includes("not implemented")) ||
    (lowered.includes("trait bound") && lowered.includes("not satisfied")) ||
    (lowered.includes("trait") && lowered.includes("not implemented"))
  ) {
    return "E0277";
  }

  if (lowered.includes("cannot find")) {
    return "E0425";
  }

  if (
    lowered.includes("mismatched types") ||
    (lowered.includes("expected") && lowered.includes("found"))
  ) {
    return "E0308";
  }

  if (
    lowered.includes("use of moved value") ||
    lowered.includes("value used here after move")
  ) {
    return "E0382";
  }

  if (
    lowered.includes("no method named") ||
    lowered.includes("no function or associated item named")
  ) {
    return "E0599";
  }

  if (lowered.includes("cannot move out of")) {
    return "E0507";
  }

  // Soroban-specific patterns
  if (
    lowered.includes("state limit") ||
    lowered.includes("64kb")
  ) {
    return "SOROBAN_STATE_LIMIT";
  }

  if (lowered.includes("authorization") || lowered.includes("require_auth")) {
    return "SOROBAN_AUTH";
  }

  if (lowered.includes("panic") || lowered.includes("unwrap")) {
    return "SOROBAN_PANIC";
  }

  if (lowered.includes("overflow") || lowered.includes("underflow")) {
    return "SOROBAN_OVERFLOW";
  }

  return null;
}

/**
 * List of error codes that have help documentation available
 */
export const KNOWN_ERROR_CODES = [
  "E0277",
  "E0425",
  "E0308",
  "E0382",
  "E0599",
  "E0507",
  "SOROBAN_STATE_LIMIT",
  "SOROBAN_AUTH",
  "SOROBAN_PANIC",
  "SOROBAN_OVERFLOW",
  "MATH001",
];

/**
 * Checks if an error code has help documentation available
 */
export function hasErrorHelp(errorCode: string): boolean {
  return KNOWN_ERROR_CODES.includes(errorCode);
}
