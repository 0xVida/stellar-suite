import type { FileNode } from "./sample-contracts";

export interface DiscoveredWasmFile {
  name: string;
  path: string;
  content?: string;
}

export function discoverWasmFiles(nodes: FileNode[], currentPath: string[] = []): DiscoveredWasmFile[] {
  const result: DiscoveredWasmFile[] = [];
  if (!nodes) return result;
  
  for (const node of nodes) {
    const nextPath = [...currentPath, node.name];
    if (node.type === "folder" && node.children) {
      result.push(...discoverWasmFiles(node.children, nextPath));
    } else if (node.type === "file" && node.name.endsWith(".wasm")) {
      result.push({
        name: node.name,
        path: nextPath.join("/"),
        content: node.content,
      });
    }
  }
  return result;
}

export function getWasmDisplayName(file: DiscoveredWasmFile): string {
  return file.path;
}
