// ============================================================
// src/services/exporters/csvExporter.ts
// Handles serialization of simulation results to CSV format.
// Flattens nested data structures and handles proper escaping.
// ============================================================

import { SimulationHistoryEntry } from "../simulationHistoryService";
import { CsvExportOptions, CsvRow } from "../../types/simulationExport";

/**
 * CsvExporter handles serialization of simulation results to CSV format.
 *
 * Features:
 * - Flattens simulation entries into tabular rows
 * - Handles nested objects/arrays by serializing to JSON strings
 * - Proper CSV escaping for special characters
 * - Optional state diff data as summary fields
 * - Configurable delimiters and headers
 */
export class CsvExporter {
  /**
   * Serialize multiple simulation entries to CSV string.
   *
   * @param entries - Array of simulation history entries to serialize
   * @param options - CSV export options
   * @returns CSV string representation of all entries
   */
  public serialize(
    entries: SimulationHistoryEntry[],
    options: CsvExportOptions = {},
  ): string {
    const delimiter = options.delimiter ?? ",";
    const includeHeaders = options.includeHeaders !== false;

    const rows: string[] = [];

    // Add header row
    if (includeHeaders) {
      rows.push(this.createHeaderRow(delimiter));
    }

    // Add data rows
    for (const entry of entries) {
      const csvRow = this.flattenEntry(entry);
      rows.push(this.createDataRow(csvRow, delimiter));
    }

    return rows.join("\n");
  }

  /**
   * Flatten a simulation entry into a CSV row object.
   *
   * @param entry - The simulation history entry to flatten
   * @returns Flattened CSV row with all fields
   */
  public flattenEntry(entry: SimulationHistoryEntry): CsvRow {
    const row: CsvRow = {
      id: entry.id,
      timestamp: entry.timestamp,
      contractId: entry.contractId,
      functionName: entry.functionName,
      outcome: entry.outcome,
      network: entry.network,
      source: entry.source,
      method: entry.method,
    };

    // Add result or error based on outcome
    if (entry.outcome === "success" && entry.result !== undefined) {
      row.result = this.serializeValue(entry.result);
    } else if (entry.outcome === "failure" && entry.error) {
      row.error = entry.error;
    }

    // Add optional fields
    if (entry.durationMs !== undefined) {
      row.durationMs = entry.durationMs;
    }
    if (entry.label) {
      row.label = entry.label;
    }

    // Add resource usage
    if (entry.resourceUsage) {
      row.cpuInstructions = entry.resourceUsage.cpuInstructions;
      row.memoryBytes = entry.resourceUsage.memoryBytes;
    }

    // Add state diff summary
    if (entry.stateDiff) {
      row.stateChangesCreated = entry.stateDiff.summary.created;
      row.stateChangesModified = entry.stateDiff.summary.modified;
      row.stateChangesDeleted = entry.stateDiff.summary.deleted;
    }

    return row;
  }

  /**
   * Validate that a CSV string has consistent column counts.
   *
   * @param csv - CSV string to validate
   * @param expectedColumns - Expected number of columns
   * @returns True if all rows have the expected column count
   */
  public validate(csv: string, expectedColumns: number): boolean {
    const lines = csv.split("\n").filter((line) => line.trim().length > 0);

    for (const line of lines) {
      const columns = this.parseRow(line);
      if (columns.length !== expectedColumns) {
        return false;
      }
    }

    return true;
  }

  // ── Private helpers ───────────────────────────────────────

  /**
   * Create the CSV header row.
   */
  private createHeaderRow(delimiter: string): string {
    const headers = [
      "id",
      "timestamp",
      "contractId",
      "functionName",
      "outcome",
      "result",
      "error",
      "cpuInstructions",
      "memoryBytes",
      "network",
      "source",
      "method",
      "durationMs",
      "label",
      "stateChangesCreated",
      "stateChangesModified",
      "stateChangesDeleted",
    ];

    return headers.join(delimiter);
  }

  /**
   * Create a CSV data row from a flattened entry.
   */
  private createDataRow(row: CsvRow, delimiter: string): string {
    const values = [
      row.id,
      row.timestamp,
      row.contractId,
      row.functionName,
      row.outcome,
      row.result ?? "",
      row.error ?? "",
      row.cpuInstructions?.toString() ?? "",
      row.memoryBytes?.toString() ?? "",
      row.network,
      row.source,
      row.method,
      row.durationMs?.toString() ?? "",
      row.label ?? "",
      row.stateChangesCreated?.toString() ?? "",
      row.stateChangesModified?.toString() ?? "",
      row.stateChangesDeleted?.toString() ?? "",
    ];

    return values.map((v) => this.escapeValue(v)).join(delimiter);
  }

  /**
   * Serialize a value to a string for CSV.
   * Complex objects/arrays are serialized as JSON.
   */
  private serializeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Escape a CSV value according to RFC 4180.
   * - Values containing delimiter, quotes, or newlines are quoted
   * - Quotes within values are doubled
   */
  private escapeValue(value: string): string {
    // Check if value needs quoting
    const needsQuoting =
      value.includes(",") ||
      value.includes('"') ||
      value.includes("\n") ||
      value.includes("\r");

    if (!needsQuoting) {
      return value;
    }

    // Escape quotes by doubling them
    const escaped = value.replace(/"/g, '""');

    // Wrap in quotes
    return `"${escaped}"`;
  }

  /**
   * Parse a CSV row into columns (simple implementation).
   */
  private parseRow(row: string): string[] {
    const columns: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        // End of column
        columns.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    // Add last column
    columns.push(current);

    return columns;
  }
}
