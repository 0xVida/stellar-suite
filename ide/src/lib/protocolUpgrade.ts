import {
  getDeprecationWarnings,
  getSimulationRules,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type OperationTag,
  type ProtocolVersion,
} from "@/config/ProtocolMatrix";

export interface ProtocolCompatibilityReport {
  protocolVersion: ProtocolVersion;
  warnings: string[];
}

export function normalizeProtocolVersion(version: unknown): ProtocolVersion {
  return typeof version === "number" && SUPPORTED_PROTOCOL_VERSIONS.includes(version as ProtocolVersion)
    ? (version as ProtocolVersion)
    : LATEST_PROTOCOL_VERSION;
}

export function buildProtocolCompatibilityReport(
  version: unknown,
  operations: OperationTag[],
): ProtocolCompatibilityReport {
  const protocolVersion = normalizeProtocolVersion(version);
  return {
    protocolVersion,
    warnings: getDeprecationWarnings(protocolVersion, operations),
  };
}

export function getProtocolSimulationEnvelope(version: unknown) {
  const protocolVersion = normalizeProtocolVersion(version);
  return {
    protocolVersion,
    simulationRules: getSimulationRules(protocolVersion),
  };
}
