import { contract, xdr } from "@stellar/stellar-sdk";
import { describeSpecType } from "../contractAbiParser";

export interface CompatibilityFinding {
  type: "error" | "warning";
  path: string; // e.g. "UDT: DataKey" or "Function: hello"
  message: string;
}

export interface UpgradeCompatibilityResult {
  success: boolean;
  findings: CompatibilityFinding[];
}

/**
 * Checks if upgrading from oldSpec to newSpec is backward-compatible.
 * Specifically validates that UDTs used for storage keys/values or function parameters
 * maintain structural integrity (types are not changed or removed, order is preserved).
 */
export function checkUpgradeCompatibility(
  oldSpec: contract.Spec,
  newSpec: contract.Spec
): UpgradeCompatibilityResult {
  const findings: CompatibilityFinding[] = [];

  const oldEntries = oldSpec.entries || [];
  const newEntries = newSpec.entries || [];

  const getEntryName = (entry: xdr.ScSpecEntry): string | null => {
    try {
      const switchName = entry.switch().name;
      switch (switchName) {
        case "scSpecEntryTypeFunction":
          return entry.function().name().toString();
        case "scSpecEntryTypeUdtStructV0":
          return entry.udtStructV0().name().toString();
        case "scSpecEntryTypeUdtUnionV0":
          return entry.udtUnionV0().name().toString();
        case "scSpecEntryTypeUdtEnumV0":
          return entry.udtEnumV0().name().toString();
        case "scSpecEntryTypeUdtErrorEnumV0":
          return entry.udtErrorEnumV0().name().toString();
      }
    } catch {
      // ignore
    }
    return null;
  };

  const oldMap = new Map<string, xdr.ScSpecEntry>();
  for (const entry of oldEntries) {
    const name = getEntryName(entry);
    if (name) oldMap.set(name, entry);
  }

  const newMap = new Map<string, xdr.ScSpecEntry>();
  for (const entry of newEntries) {
    const name = getEntryName(entry);
    if (name) newMap.set(name, entry);
  }

  // 1. Check backward compatibility of all old entries
  for (const [name, oldEntry] of oldMap.entries()) {
    const newEntry = newMap.get(name);
    if (!newEntry) {
      findings.push({
        type: "error",
        path: name,
        message: `Entry '${name}' was removed. This will break any existing storage or client integrations.`,
      });
      continue;
    }

    const oldSwitch = oldEntry.switch().name;
    const newSwitch = newEntry.switch().name;

    if (oldSwitch !== newSwitch) {
      findings.push({
        type: "error",
        path: name,
        message: `Type kind changed from '${oldSwitch}' to '${newSwitch}'. Storage layout is incompatible.`,
      });
      continue;
    }

    // Compare structs
    if (oldSwitch === "scSpecEntryTypeUdtStructV0") {
      const oldFields = oldEntry.udtStructV0().fields();
      const newFields = newEntry.udtStructV0().fields();

      for (let i = 0; i < oldFields.length; i++) {
        const oldField = oldFields[i];
        const newField = newFields[i];

        if (!newField) {
          findings.push({
            type: "error",
            path: `${name}.${oldField.name().toString()}`,
            message: `Field '${oldField.name().toString()}' was removed from struct.`,
          });
          continue;
        }

        if (oldField.name().toString() !== newField.name().toString()) {
          findings.push({
            type: "error",
            path: `${name}.${oldField.name().toString()}`,
            message: `Field order or name changed (expected '${oldField.name().toString()}', got '${newField.name().toString()}').`,
          });
          continue;
        }

        // Compare types
        const oldTypeStr = describeSpecType(oldField.type());
        const newTypeStr = describeSpecType(newField.type());
        if (oldTypeStr !== newTypeStr) {
          findings.push({
            type: "error",
            path: `${name}.${oldField.name().toString()}`,
            message: `Field type changed from '${oldTypeStr}' to '${newTypeStr}'.`,
          });
        }
      }

      if (newFields.length > oldFields.length) {
        findings.push({
          type: "warning",
          path: name,
          message: `Struct '${name}' has new fields added. Ensure this type is not serialized directly in persistent storage where fixed-size decoding is expected.`,
        });
      }
    } 
    // Compare union/enum cases
    else if (oldSwitch === "scSpecEntryTypeUdtUnionV0") {
      const oldCases = oldEntry.udtUnionV0().cases();
      const newCases = newEntry.udtUnionV0().cases();

      for (let i = 0; i < oldCases.length; i++) {
        const oldCase = oldCases[i];
        const newCase = newCases[i];

        if (!newCase) {
          findings.push({
            type: "error",
            path: `${name}.${oldCase.name().toString()}`,
            message: `Union case/variant '${oldCase.name().toString()}' was removed.`,
          });
          continue;
        }

        if (oldCase.name().toString() !== newCase.name().toString()) {
          findings.push({
            type: "error",
            path: `${name}.${oldCase.name().toString()}`,
            message: `Union case order or name changed (expected '${oldCase.name().toString()}', got '${newCase.name().toString()}').`,
          });
          continue;
        }

        const oldKind = oldCase.switch().name;
        const newKind = newCase.switch().name;
        if (oldKind !== newKind) {
          findings.push({
            type: "error",
            path: `${name}.${oldCase.name().toString()}`,
            message: `Union case switch kind changed from '${oldKind}' to '${newKind}'.`,
          });
        }
      }
    } 
    // Compare simple enums
    else if (oldSwitch === "scSpecEntryTypeUdtEnumV0") {
      const oldCases = oldEntry.udtEnumV0().cases();
      const newCases = newEntry.udtEnumV0().cases();

      for (let i = 0; i < oldCases.length; i++) {
        const oldCase = oldCases[i];
        const newCase = newCases[i];

        if (!newCase) {
          findings.push({
            type: "error",
            path: `${name}.${oldCase.name().toString()}`,
            message: `Enum variant '${oldCase.name().toString()}' was removed.`,
          });
          continue;
        }

        if (oldCase.name().toString() !== newCase.name().toString()) {
          findings.push({
            type: "error",
            path: `${name}.${oldCase.name().toString()}`,
            message: `Enum variant order or name changed (expected '${oldCase.name().toString()}', got '${newCase.name().toString()}').`,
          });
          continue;
        }

        if (oldCase.value() !== newCase.value()) {
          findings.push({
            type: "error",
            path: `${name}.${oldCase.name().toString()}`,
            message: `Enum variant value changed from ${oldCase.value()} to ${newCase.value()}.`,
          });
        }
      }
    } 
    // Compare functions
    else if (oldSwitch === "scSpecEntryTypeFunction") {
      const oldInputs = oldEntry.function().inputs();
      const newInputs = newEntry.function().inputs();

      for (let i = 0; i < oldInputs.length; i++) {
        const oldInput = oldInputs[i];
        const newInput = newInputs[i];

        if (!newInput) {
          findings.push({
            type: "error",
            path: `${name}(input:${oldInput.name().toString()})`,
            message: `Function input parameter '${oldInput.name().toString()}' was removed.`,
          });
          continue;
        }

        const oldTypeStr = describeSpecType(oldInput.type());
        const newTypeStr = describeSpecType(newInput.type());

        if (oldTypeStr !== newTypeStr) {
          findings.push({
            type: "error",
            path: `${name}(input:${oldInput.name().toString()})`,
            message: `Function parameter type changed from '${oldTypeStr}' to '${newTypeStr}'.`,
          });
        }
      }
    }
  }

  // 2. Identify risks of key shadowing or new structures overriding old keys
  // (e.g., if there are duplicate naming patterns or newly introduced functions that match historical keys)
  return {
    success: !findings.some((f) => f.type === "error"),
    findings,
  };
}

export function parseSpecFromFile(name: string, content: string): contract.Spec {
  const trimmed = content.trim();
  if (name.endsWith(".wasm")) {
    return contract.Spec.fromWasm(Buffer.from(trimmed, "base64"));
  }
  
  if (name.endsWith(".json")) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return new contract.Spec(parsed);
    }
    if (parsed && typeof parsed === "object") {
      const entries = parsed.entries || parsed.functions || parsed.spec;
      if (Array.isArray(entries)) {
        return new contract.Spec(entries);
      }
    }
  }
  
  return new contract.Spec(trimmed);
}
