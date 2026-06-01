import { describe, it, expect } from "vitest";
import { checkUpgradeCompatibility } from "../contractUpgradeabilityChecker";

describe("contractUpgradeabilityChecker", () => {
  it("passes when specs are identical", () => {
    const mockSpec1 = {
      entries: [
        {
          switch: () => ({ name: "scSpecEntryTypeFunction" }),
          function: () => ({
            name: () => ({ toString: () => "hello" }),
            inputs: () => [],
          }),
        },
      ],
    } as any;

    const result = checkUpgradeCompatibility(mockSpec1, mockSpec1);
    expect(result.success).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("fails when a function is removed", () => {
    const mockOldSpec = {
      entries: [
        {
          switch: () => ({ name: "scSpecEntryTypeFunction" }),
          function: () => ({
            name: () => ({ toString: () => "hello" }),
            inputs: () => [],
          }),
        },
      ],
    } as any;

    const mockNewSpec = {
      entries: [],
    } as any;

    const result = checkUpgradeCompatibility(mockOldSpec, mockNewSpec);
    expect(result.success).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("removed");
  });

  it("fails when type switch changes", () => {
    const mockOldSpec = {
      entries: [
        {
          switch: () => ({ name: "scSpecEntryTypeUdtStructV0" }),
          udtStructV0: () => ({
            name: () => ({ toString: () => "DataKey" }),
            fields: () => [],
          }),
        },
      ],
    } as any;

    const mockNewSpec = {
      entries: [
        {
          switch: () => ({ name: "scSpecEntryTypeUdtEnumV0" }),
          udtEnumV0: () => ({
            name: () => ({ toString: () => "DataKey" }),
            cases: () => [],
          }),
        },
      ],
    } as any;

    const result = checkUpgradeCompatibility(mockOldSpec, mockNewSpec);
    expect(result.success).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("Type kind changed");
  });
});
