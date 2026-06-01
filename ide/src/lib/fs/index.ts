/**
 * Issue #882 — Public surface for the abstract file-system layer.
 *
 * Import the interface and adapters from here rather than reaching into
 * individual files, e.g.:
 *   import { type FileSystemProvider, LocalFileSystemProvider } from "@/lib/fs";
 */
export {
  type FileSystemProvider,
  type FileStat,
  FileNotFoundError,
  normalizePath,
  dirname,
  basename,
} from "./FileSystemProvider";

export { BrowserFileSystemProvider } from "./adapters/BrowserFileSystemProvider";
export { LocalFileSystemProvider } from "./adapters/LocalFileSystemProvider";
export {
  GitHubFileSystemProvider,
  type GitHubProviderOptions,
} from "./adapters/GitHubFileSystemProvider";
