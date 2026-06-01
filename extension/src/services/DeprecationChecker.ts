import * as vscode from 'vscode';
import {
  LATEST_KNOWN_SOROBAN_SDK,
  checkDeprecation,
  fetchLatestSorobanSdk,
  findSorobanSdkVersion,
} from './DeprecationChecker.core';

/**
 * Issue #933 — Soroban SDK Deprecation Warning System (VS Code integration).
 *
 * Watches Cargo.toml manifests and publishes a Problems-panel warning when the
 * pinned `soroban-sdk` version is older than the latest known release. All the
 * parsing/comparison logic lives in the vscode-free ./DeprecationChecker.core,
 * which is unit-tested by scripts/check-deprecation.js.
 */

// Re-export the pure core so callers can `import { ... } from './DeprecationChecker'`.
export * from './DeprecationChecker.core';

export const DEPRECATION_SOURCE = 'soroban-sdk-deprecation';

export class DeprecationChecker implements vscode.Disposable {
  private collection: vscode.DiagnosticCollection;
  private subscriptions: vscode.Disposable[] = [];
  private latest: string = LATEST_KNOWN_SOROBAN_SDK;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('soroban-sdk-deprecation');
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.collection);

    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(doc => this.check(doc)),
      vscode.workspace.onDidSaveTextDocument(doc => this.check(doc)),
      vscode.workspace.onDidCloseTextDocument(doc => this.collection.delete(doc.uri)),
    );
    for (const sub of this.subscriptions) {
      context.subscriptions.push(sub);
    }

    // Best-effort refresh of the latest version; offline fallback otherwise.
    void fetchLatestSorobanSdk().then(v => {
      this.latest = v;
      for (const doc of vscode.workspace.textDocuments) {
        this.check(doc);
      }
    });

    for (const doc of vscode.workspace.textDocuments) {
      this.check(doc);
    }
  }

  /** Returns true when the document is a Cargo.toml manifest. */
  private isManifest(document: vscode.TextDocument): boolean {
    return /(^|[\\/])Cargo\.toml$/.test(document.fileName) || document.languageId === 'toml';
  }

  private check(document: vscode.TextDocument): void {
    if (!this.isManifest(document)) {
      return;
    }
    const match = findSorobanSdkVersion(document.getText());
    if (!match) {
      this.collection.delete(document.uri);
      return;
    }

    const result = checkDeprecation(match.version, this.latest);
    if (result.level === 'ok') {
      this.collection.delete(document.uri);
      return;
    }

    const range = new vscode.Range(
      new vscode.Position(match.line, match.startCol),
      new vscode.Position(match.line, match.endCol),
    );
    const severity =
      result.level === 'deprecated'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;

    const diagnostic = new vscode.Diagnostic(range, result.message, severity);
    diagnostic.source = DEPRECATION_SOURCE;
    diagnostic.code =
      result.level === 'deprecated' ? 'soroban-sdk-deprecated' : 'soroban-sdk-outdated';

    this.collection.set(document.uri, [diagnostic]);
  }

  dispose(): void {
    for (const sub of this.subscriptions) {
      sub.dispose();
    }
    this.subscriptions = [];
    this.collection.dispose();
  }
}
