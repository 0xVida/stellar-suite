import { describe, expect, it } from "vitest";

import { generateCiTemplate, inferCiProjectInfo, type CiProvider } from "@/lib/ciTemplates";
import type { FileNode } from "@/lib/sample-contracts";

const testWorkspace: FileNode[] = [
  {
    name: "hello",
    type: "folder",
    children: [
      {
        name: "Cargo.toml",
        type: "file",
        content: `[package]
name = "hello-contract"
version = "0.1.0"
edition = "2021"`,
      },
      {
        name: "lib.rs",
        type: "file",
        content: "#![no_std]",
      },
    ],
  },
  {
    name: "token",
    type: "folder",
    children: [
      {
        name: "Cargo.toml",
        type: "file",
        content: `[package]
name = "token-contract"
version = "0.1.0"
edition = "2021"`,
      },
    ],
  },
];

describe("ciTemplates", () => {
  it("infers project info from workspace manifests", () => {
    const info = inferCiProjectInfo(testWorkspace);

    expect(info.contractNames).toEqual(["hello-contract", "token-contract"]);
    expect(info.contractManifests).toEqual(["hello/Cargo.toml", "token/Cargo.toml"]);
    expect(info.projectName).toBe("hello-contract");
  });

  it.each<CiProvider>(["github", "gitlab", "circleci"])(
    "generates %s template with required quality gates",
    (provider) => {
      const info = inferCiProjectInfo(testWorkspace);
      const template = generateCiTemplate(provider, info);

      expect(template.content).toContain("build");
      expect(template.content).toContain("test");
      expect(template.content).toContain("clippy");
      expect(template.content).toContain("fmt --check");
      expect(template.content).toContain("Detected contracts: hello-contract, token-contract");
      expect(template.content).toContain("Cargo.toml");
    },
  );

  it("uses official Stellar action for github workflow setup", () => {
    const info = inferCiProjectInfo(testWorkspace);
    const template = generateCiTemplate("github", info);

    expect(template.path).toBe(".github/workflows/ci.yml");
    expect(template.content).toContain("uses: stellar/stellar-cli@v23.0.1");
    expect(template.content).toContain("actions/cache@v4");
  });
});
