import type { FileNode } from "@/lib/sample-contracts";
import { parseRustTests, type RustDiscoveredTest } from "@/lib/rustTestParser";

export type DiscoveredTestType = "unit" | "integration";

export interface DiscoveredWorkspaceTest extends RustDiscoveredTest {
  contractName: string;
  testType: DiscoveredTestType;
  integrationTarget?: string;
}

function flattenNodes(nodes: FileNode[], parentPath: string[] = []): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];

  for (const node of nodes) {
    const nextPath = [...parentPath, node.name];

    if (node.type === "folder") {
      files.push(...flattenNodes(node.children ?? [], nextPath));
      continue;
    }

    files.push({
      path: nextPath.join("/"),
      content: node.content ?? "",
    });
  }

  return files;
}

function toRustPath(path: string): string {
  const parts = path.split("/");
  if (parts.length === 2 && parts[1].endsWith(".rs")) {
    return `${parts[0]}/src/${parts[1]}`;
  }

  return path;
}

function classifyTestType(filePath: string, test: RustDiscoveredTest): DiscoveredTestType {
  if (filePath.includes("/tests/")) {
    return "integration";
  }

  if (test.modulePath.some((segment) => segment.toLowerCase().includes("integration"))) {
    return "integration";
  }

  return "unit";
}

function deriveIntegrationTarget(filePath: string): string | undefined {
  const parts = filePath.split("/");
  const testsIndex = parts.indexOf("tests");
  if (testsIndex < 0 || testsIndex + 1 >= parts.length) {
    return undefined;
  }

  const testFile = parts[parts.length - 1];
  if (!testFile.endsWith(".rs")) {
    return undefined;
  }

  return testFile.slice(0, -3);
}

export function discoverWorkspaceTests(files: FileNode[], contractName: string): DiscoveredWorkspaceTest[] {
  const allFiles = flattenNodes(files);

  return allFiles
    .filter((file) => file.path.startsWith(`${contractName}/`) && file.path.endsWith(".rs"))
    .flatMap((file) => {
      const rustPath = toRustPath(file.path);
      const discovered = parseRustTests(rustPath, file.content);
      return discovered.map<DiscoveredWorkspaceTest>((test) => {
        const testType = classifyTestType(rustPath, test);
        return {
          ...test,
          contractName,
          testType,
          integrationTarget: testType === "integration" ? deriveIntegrationTarget(rustPath) : undefined,
        };
      });
    });
}

export function hasRootTestsDirectory(files: FileNode[], contractName: string): boolean {
  const contract = files.find((node) => node.type === "folder" && node.name === contractName);
  if (!contract || !contract.children) {
    return false;
  }

  return contract.children.some((child) => child.type === "folder" && child.name === "tests");
}

export function listIntegrationTargets(discoveredTests: DiscoveredWorkspaceTest[]): string[] {
  const targets = new Set<string>();

  for (const test of discoveredTests) {
    if (test.testType === "integration" && test.integrationTarget) {
      targets.add(test.integrationTarget);
    }
  }

  return Array.from(targets.values());
}
