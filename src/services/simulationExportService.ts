// ============================================================
// src/services/simulationExportService.ts
// Core service for exporting simulation results to various
// formats (JSON, CSV, PDF). Orchestrates format-specific
// exporters and handles file I/O, validation, and errors.
// ============================================================

import * as vscode from "vscode";
import {
  SimulationHistoryService,
  SimulationHistoryEntry,
} from "./simulationHistoryService";
import {
  ExportOptions,
  ExportResult,
  BatchExportResult,
  ExportError,
  ExportErrorCode,
  JsonExportOptions,
  CsvExportOptions,
  PdfExportOptions,
} from "../types/simulationExport";
import { JsonExporter } from "./exporters/jsonExporter";
import { CsvExporter } from "./exporters/csvExporter";

// ── Minimal VS Code-compatible interfaces ────────────────────

interface SimpleOutputChannel {
  appendLine(value: string): void;
}

// ── Service class ─────────────────────────────────────────────

/**
 * SimulationExportService handles exporting simulation results to multiple formats.
 *
 * Responsibilities:
 * - Orchestrating export operations across different formats
 * - Managing file I/O operations
 * - Validating exported data
 * - Handling errors and providing detailed error messages
 * - Supporting both single and batch export operations
 */
export class SimulationExportService {
  private readonly outputChannel: SimpleOutputChannel;
  private readonly jsonExporter: JsonExporter;
  private readonly csvExporter: CsvExporter;

  constructor(
    private readonly historyService: SimulationHistoryService,
    outputChannel?: SimpleOutputChannel,
  ) {
    this.outputChannel = outputChannel ?? {
      appendLine: (_msg: string) => {
        /* no-op */
      },
    };
    this.jsonExporter = new JsonExporter();
    this.csvExporter = new CsvExporter();
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Export a single simulation result to the specified format.
   *
   * @param entry - The simulation history entry to export
   * @param options - Export options including format and output path
   * @returns Export result with success status and details
   */
  public async exportSimulation(
    entry: SimulationHistoryEntry,
    options: ExportOptions,
  ): Promise<ExportResult> {
    this.log(
      `[Export] Starting ${options.format.toUpperCase()} export to ${options.outputPath}`,
    );

    try {
      switch (options.format) {
        case "json":
          return await this.exportToJson(entry, options.outputPath, {
            prettify: options.prettify,
            includeStateDiff: options.includeStateDiff,
            includeResourceUsage: options.includeResourceUsage,
          });
        case "csv":
          return await this.exportToCsv([entry], options.outputPath, {
            includeStateDiff: options.includeStateDiff,
          });
        case "pdf":
          return await this.exportToPdf(entry, options.outputPath, {
            includeStateDiff: options.includeStateDiff,
            includeResourceUsage: options.includeResourceUsage,
          });
        default:
          return this.createErrorResult(
            "SERIALIZATION_FAILED",
            `Unsupported export format: ${options.format}`,
          );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`[Export] Failed: ${message}`);
      return this.createErrorResult("SERIALIZATION_FAILED", message);
    }
  }

  /**
   * Export multiple simulation results to a single file.
   *
   * @param entries - Array of simulation history entries to export
   * @param options - Export options including format and output path
   * @returns Batch export result with success/failure counts
   */
  public async exportBatch(
    entries: SimulationHistoryEntry[],
    options: ExportOptions,
  ): Promise<BatchExportResult> {
    this.log(
      `[Export] Starting batch export of ${entries.length} entries to ${options.format.toUpperCase()}`,
    );

    const results: ExportResult[] = [];
    const errors: string[] = [];
    let succeeded = 0;
    let failed = 0;

    // For JSON and PDF, combine all entries into a single file
    if (options.format === "json" || options.format === "pdf") {
      try {
        let result: ExportResult;
        if (options.format === "json") {
          // Use batch serialization for JSON
          const jsonString = this.jsonExporter.serializeBatch(entries, {
            prettify: options.prettify,
            includeStateDiff: options.includeStateDiff,
            includeResourceUsage: options.includeResourceUsage,
          });

          if (!this.jsonExporter.validate(jsonString)) {
            result = this.createErrorResult(
              "VALIDATION_FAILED",
              "Generated JSON is not valid",
            );
          } else {
            const uri = vscode.Uri.file(options.outputPath);
            const encoder = new TextEncoder();
            const buffer = encoder.encode(jsonString);
            await vscode.workspace.fs.writeFile(uri, buffer);
            result = this.createSuccessResult(
              options.outputPath,
              buffer.length,
            );
          }
        } else {
          // PDF batch not yet implemented
          result = await this.exportToPdf(entries[0], options.outputPath, {
            includeStateDiff: options.includeStateDiff,
            includeResourceUsage: options.includeResourceUsage,
          });
        }

        results.push(result);
        if (result.success) {
          succeeded = entries.length;
        } else {
          failed = entries.length;
          if (result.error) {
            errors.push(result.error);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        failed = entries.length;
      }
    } else if (options.format === "csv") {
      // CSV combines all entries into rows
      try {
        const result = await this.exportToCsv(entries, options.outputPath, {
          includeStateDiff: options.includeStateDiff,
        });
        results.push(result);
        if (result.success) {
          succeeded = entries.length;
        } else {
          failed = entries.length;
          if (result.error) {
            errors.push(result.error);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        failed = entries.length;
      }
    }

    this.log(
      `[Export] Batch complete: ${succeeded} succeeded, ${failed} failed`,
    );

    return {
      total: entries.length,
      succeeded,
      failed,
      results,
      errors,
    };
  }

  /**
   * Export a simulation result to JSON format.
   *
   * @param entry - The simulation history entry to export
   * @param outputPath - File path for the JSON output
   * @param options - JSON-specific export options
   * @returns Export result with success status
   */
  public async exportToJson(
    entry: SimulationHistoryEntry,
    outputPath: string,
    options: JsonExportOptions = {},
  ): Promise<ExportResult> {
    try {
      this.log(`[Export] Serializing entry ${entry.id} to JSON`);

      // Serialize the entry to JSON
      const jsonString = this.jsonExporter.serialize(entry, options);

      // Validate the JSON output
      if (!this.jsonExporter.validate(jsonString)) {
        return this.createErrorResult(
          "VALIDATION_FAILED",
          "Generated JSON is not valid",
        );
      }

      // Write to file
      const uri = vscode.Uri.file(outputPath);
      const encoder = new TextEncoder();
      const buffer = encoder.encode(jsonString);
      await vscode.workspace.fs.writeFile(uri, buffer);

      this.log(
        `[Export] JSON export successful: ${buffer.length} bytes written to ${outputPath}`,
      );

      return this.createSuccessResult(outputPath, buffer.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`[Export] JSON export failed: ${message}`);
      return this.createErrorResult("SERIALIZATION_FAILED", message);
    }
  }

  /**
   * Export simulation results to CSV format.
   *
   * @param entries - Array of simulation history entries to export
   * @param outputPath - File path for the CSV output
   * @param options - CSV-specific export options
   * @returns Export result with success status
   */
  public async exportToCsv(
    entries: SimulationHistoryEntry[],
    outputPath: string,
    options: CsvExportOptions = {},
  ): Promise<ExportResult> {
    try {
      this.log(`[Export] Serializing ${entries.length} entries to CSV`);

      // Serialize the entries to CSV
      const csvString = this.csvExporter.serialize(entries, options);

      // Validate the CSV output
      const expectedColumns = 17; // Number of columns in our CSV format
      if (!this.csvExporter.validate(csvString, expectedColumns)) {
        return this.createErrorResult(
          "VALIDATION_FAILED",
          "Generated CSV has inconsistent column counts",
        );
      }

      // Write to file
      const uri = vscode.Uri.file(outputPath);
      const encoder = new TextEncoder();
      const buffer = encoder.encode(csvString);
      await vscode.workspace.fs.writeFile(uri, buffer);

      this.log(
        `[Export] CSV export successful: ${buffer.length} bytes written to ${outputPath}`,
      );

      return this.createSuccessResult(outputPath, buffer.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`[Export] CSV export failed: ${message}`);
      return this.createErrorResult("SERIALIZATION_FAILED", message);
    }
  }

  /**
   * Export a simulation result to PDF format.
   *
   * @param entry - The simulation history entry to export
   * @param outputPath - File path for the PDF output
   * @param options - PDF-specific export options
   * @returns Export result with success status
   */
  public async exportToPdf(
    entry: SimulationHistoryEntry,
    outputPath: string,
    options: PdfExportOptions = {},
  ): Promise<ExportResult> {
    // Placeholder implementation - will be completed in task 4
    this.log(`[Export] PDF export not yet implemented`);
    return this.createErrorResult(
      "PDF_GENERATION_FAILED",
      "PDF export not yet implemented",
    );
  }

  /**
   * Retrieve a simulation entry from history by ID.
   *
   * @param entryId - The unique identifier of the history entry
   * @returns The simulation history entry, or undefined if not found
   */
  public getHistoryEntry(entryId: string): SimulationHistoryEntry | undefined {
    return this.historyService.getEntry(entryId);
  }

  /**
   * Retrieve multiple simulation entries from history by IDs.
   *
   * @param entryIds - Array of unique identifiers
   * @returns Array of found entries (missing entries are skipped)
   */
  public getHistoryEntries(entryIds: string[]): SimulationHistoryEntry[] {
    const entries: SimulationHistoryEntry[] = [];
    for (const id of entryIds) {
      const entry = this.historyService.getEntry(id);
      if (entry) {
        entries.push(entry);
      }
    }
    return entries;
  }

  // ── Private helpers ───────────────────────────────────────

  /**
   * Create an error result object.
   */
  private createErrorResult(
    code: ExportErrorCode,
    message: string,
  ): ExportResult {
    return {
      success: false,
      error: `${code}: ${message}`,
      validationErrors: [],
    };
  }

  /**
   * Create a success result object.
   */
  private createSuccessResult(
    outputPath: string,
    bytesWritten: number,
  ): ExportResult {
    return {
      success: true,
      outputPath,
      bytesWritten,
    };
  }

  /**
   * Log a message to the output channel.
   */
  private log(message: string): void {
    this.outputChannel.appendLine(message);
  }
}
