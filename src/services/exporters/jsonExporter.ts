// ============================================================
// src/services/exporters/jsonExporter.ts
// Handles serialization of simulation results to JSON format.
// Supports single and batch exports with configurable options.
// ============================================================

import { SimulationHistoryEntry } from "../simulationHistoryService";
import {
  JsonExportOptions,
  ExportMetadata,
} from "../../types/simulationExport";

/**
 * JsonExporter handles serialization of simulation results to JSON format.
 *
 * Features:
 * - Single and batch export support
 * - Optional prettification with indentation
 * - Selective inclusion of state diff and resource usage data
 * - Export metadata for tracking
 * - Validation of output JSON
 */
export class JsonExporter {
  /**
   * Serialize a single simulation entry to JSON string.
   *
   * @param entry - The simulation history entry to serialize
   * @param options - JSON export options
   * @returns JSON string representation of the entry
   */
  public serialize(
    entry: SimulationHistoryEntry,
    options: JsonExportOptions = {},
  ): string {
    const data = this.prepareEntry(entry, options);
    const metadata = this.createMetadata("json", 1);

    const output = {
      metadata,
      entry: data,
    };

    return this.stringifyJson(output, options.prettify ?? true);
  }

  /**
   * Serialize multiple simulation entries to JSON string.
   *
   * @param entries - Array of simulation history entries to serialize
   * @param options - JSON export options
   * @returns JSON string representation of all entries
   */
  public serializeBatch(
    entries: SimulationHistoryEntry[],
    options: JsonExportOptions = {},
  ): string {
    const data = entries.map((entry) => this.prepareEntry(entry, options));
    const metadata = this.createMetadata("json", entries.length);

    const output = {
      metadata,
      entries: data,
    };

    return this.stringifyJson(output, options.prettify ?? true);
  }

  /**
   * Validate that a JSON string is parseable.
   *
   * @param json - JSON string to validate
   * @returns True if valid JSON, false otherwise
   */
  public validate(json: string): boolean {
    try {
      JSON.parse(json);
      return true;
    } catch {
      return false;
    }
  }

  // ── Private helpers ───────────────────────────────────────

  /**
   * Prepare a simulation entry for export by filtering fields based on options.
   */
  private prepareEntry(
    entry: SimulationHistoryEntry,
    options: JsonExportOptions,
  ): Partial<SimulationHistoryEntry> {
    const data: Partial<SimulationHistoryEntry> = {
      id: entry.id,
      timestamp: entry.timestamp,
      contractId: entry.contractId,
      functionName: entry.functionName,
      args: entry.args,
      outcome: entry.outcome,
      network: entry.network,
      source: entry.source,
      method: entry.method,
    };

    // Include result or error based on outcome
    if (entry.outcome === "success") {
      data.result = entry.result;
    } else {
      data.error = entry.error;
      data.errorType = entry.errorType;
    }

    // Optional fields
    if (entry.durationMs !== undefined) {
      data.durationMs = entry.durationMs;
    }
    if (entry.label) {
      data.label = entry.label;
    }

    // Include resource usage if requested
    if (options.includeResourceUsage !== false && entry.resourceUsage) {
      data.resourceUsage = entry.resourceUsage;
    }

    // Include state diff if requested
    if (options.includeStateDiff !== false) {
      if (entry.stateSnapshotBefore) {
        data.stateSnapshotBefore = entry.stateSnapshotBefore;
      }
      if (entry.stateSnapshotAfter) {
        data.stateSnapshotAfter = entry.stateSnapshotAfter;
      }
      if (entry.stateDiff) {
        data.stateDiff = entry.stateDiff;
      }
    }

    return data;
  }

  /**
   * Create export metadata.
   */
  private createMetadata(format: string, entryCount: number): ExportMetadata {
    return {
      exportedAt: new Date().toISOString(),
      exportedBy: "Stellar Suite",
      format: format as "json",
      version: "1.0.0",
      entryCount,
    };
  }

  /**
   * Stringify JSON with optional prettification.
   */
  private stringifyJson(data: unknown, prettify: boolean): string {
    if (prettify) {
      return JSON.stringify(data, null, 2);
    }
    return JSON.stringify(data);
  }
}
