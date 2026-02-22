// ============================================================
// src/commands/exportCommands.ts
// Command handlers for exporting simulation results.
// Provides VS Code commands for JSON, CSV, and PDF export.
// ============================================================

import * as vscode from "vscode";
import { SimulationExportService } from "../services/simulationExportService";
import {
  SimulationHistoryService,
  SimulationHistoryEntry,
} from "../services/simulationHistoryService";
import { ExportFormat } from "../types/simulationExport";

/**
 * Export simulation results from history to a file.
 * Prompts user to select entries, format, and output location.
 */
export async function exportSimulationHistory(
  context: vscode.ExtensionContext,
): Promise<void> {
  const historyService = new SimulationHistoryService(context);
  const exportService = new SimulationExportService(historyService);

  // Get all history entries
  const entries = historyService.getAllEntries();

  if (entries.length === 0) {
    vscode.window.showInformationMessage("No simulation history to export.");
    return;
  }

  // Show quick pick to select entries
  const items = entries.map((entry) => ({
    label: `${entry.functionName}() on ${entry.contractId.substring(0, 8)}...`,
    description: `${entry.outcome} - ${new Date(entry.timestamp).toLocaleString()}`,
    entry,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: "Select simulation results to export",
  });

  if (!selected || selected.length === 0) {
    return;
  }

  const selectedEntries = selected.map(
    (item: { entry: SimulationHistoryEntry }) => item.entry,
  );

  // Prompt for export format
  const format = await promptForFormat();
  if (!format) {
    return;
  }

  // Prompt for output file
  const outputPath = await promptForOutputFile(format);
  if (!outputPath) {
    return;
  }

  // Perform export
  await performExport(exportService, selectedEntries, format, outputPath);
}

/**
 * Export a single simulation result as JSON.
 */
export async function exportSimulationAsJson(
  context: vscode.ExtensionContext,
  entry: SimulationHistoryEntry,
): Promise<void> {
  const historyService = new SimulationHistoryService(context);
  const exportService = new SimulationExportService(historyService);

  const outputPath = await promptForOutputFile("json");
  if (!outputPath) {
    return;
  }

  await performExport(exportService, [entry], "json", outputPath);
}

/**
 * Export simulation results as CSV.
 */
export async function exportSimulationAsCsv(
  context: vscode.ExtensionContext,
  entries: SimulationHistoryEntry[],
): Promise<void> {
  const historyService = new SimulationHistoryService(context);
  const exportService = new SimulationExportService(historyService);

  const outputPath = await promptForOutputFile("csv");
  if (!outputPath) {
    return;
  }

  await performExport(exportService, entries, "csv", outputPath);
}

/**
 * Export a single simulation result as PDF.
 */
export async function exportSimulationAsPdf(
  context: vscode.ExtensionContext,
  entry: SimulationHistoryEntry,
): Promise<void> {
  const historyService = new SimulationHistoryService(context);
  const exportService = new SimulationExportService(historyService);

  const outputPath = await promptForOutputFile("pdf");
  if (!outputPath) {
    return;
  }

  await performExport(exportService, [entry], "pdf", outputPath);
}

/**
 * Export the current simulation result from the panel.
 */
export async function exportCurrentSimulation(
  context: vscode.ExtensionContext,
  entry: SimulationHistoryEntry,
  format: ExportFormat,
): Promise<void> {
  const historyService = new SimulationHistoryService(context);
  const exportService = new SimulationExportService(historyService);

  const outputPath = await promptForOutputFile(format);
  if (!outputPath) {
    return;
  }

  await performExport(exportService, [entry], format, outputPath);
}

// ── Helper functions ──────────────────────────────────────────

/**
 * Prompt user to select an export format.
 */
async function promptForFormat(): Promise<ExportFormat | undefined> {
  const formatItems = [
    {
      label: "JSON",
      description: "JavaScript Object Notation",
      value: "json" as ExportFormat,
    },
    {
      label: "CSV",
      description: "Comma-Separated Values",
      value: "csv" as ExportFormat,
    },
    {
      label: "PDF",
      description: "Portable Document Format",
      value: "pdf" as ExportFormat,
    },
  ];

  const selected = await vscode.window.showQuickPick(formatItems, {
    placeHolder: "Select export format",
  });

  return selected?.value;
}

/**
 * Prompt user to select an output file location.
 */
async function promptForOutputFile(
  format: ExportFormat,
): Promise<string | undefined> {
  const defaultName = `simulation-export-${Date.now()}.${format}`;

  const filters: { [name: string]: string[] } = {};
  switch (format) {
    case "json":
      filters["JSON Files"] = ["json"];
      break;
    case "csv":
      filters["CSV Files"] = ["csv"];
      break;
    case "pdf":
      filters["PDF Files"] = ["pdf"];
      break;
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultName),
    filters,
    title: `Export Simulation Results as ${format.toUpperCase()}`,
  });

  return uri?.fsPath;
}

/**
 * Perform the export operation with progress indication.
 */
async function performExport(
  exportService: SimulationExportService,
  entries: SimulationHistoryEntry[],
  format: ExportFormat,
  outputPath: string,
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Exporting ${entries.length} simulation result(s) to ${format.toUpperCase()}`,
      cancellable: false,
    },
    async (
      progress: vscode.Progress<{ increment?: number; message?: string }>,
    ) => {
      progress.report({ increment: 0 });

      try {
        let result;

        if (entries.length === 1) {
          // Single export
          result = await exportService.exportSimulation(entries[0], {
            format,
            outputPath,
            includeStateDiff: true,
            includeResourceUsage: true,
            prettify: true,
          });
        } else {
          // Batch export
          result = await exportService.exportBatch(entries, {
            format,
            outputPath,
            includeStateDiff: true,
            includeResourceUsage: true,
            prettify: true,
          });

          // For batch results, check if any succeeded
          if ("succeeded" in result) {
            if (result.succeeded > 0) {
              vscode.window.showInformationMessage(
                `Successfully exported ${result.succeeded} of ${result.total} simulation results to ${outputPath}`,
              );
              return;
            } else {
              vscode.window.showErrorMessage(
                `Failed to export simulation results: ${result.errors.join(", ")}`,
              );
              return;
            }
          }
        }

        progress.report({ increment: 100 });

        if (result.success) {
          const action = await vscode.window.showInformationMessage(
            `Successfully exported simulation results to ${outputPath}`,
            "Open File",
          );

          if (action === "Open File") {
            const doc = await vscode.workspace.openTextDocument(outputPath);
            await vscode.window.showTextDocument(doc);
          }
        } else {
          vscode.window.showErrorMessage(
            `Failed to export simulation results: ${result.error}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Export failed: ${message}`);
      }
    },
  );
}
