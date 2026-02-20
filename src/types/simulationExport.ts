// ============================================================
// src/types/simulationExport.ts
// Type definitions for simulation export functionality.
// Defines export options, results, errors, and metadata.
// ============================================================

import { SimulationHistoryEntry } from "../services/simulationHistoryService";

/** Supported export formats. */
export type ExportFormat = "json" | "csv" | "pdf";

/** Options for exporting simulation results. */
export interface ExportOptions {
  /** Target export format. */
  format: ExportFormat;
  /** Output file path. */
  outputPath: string;
  /** Include state diff data in export (default: true). */
  includeStateDiff?: boolean;
  /** Include resource usage data in export (default: true). */
  includeResourceUsage?: boolean;
  /** Prettify JSON output (default: true). */
  prettify?: boolean;
}

/** Result of a single export operation. */
export interface ExportResult {
  /** Whether the export succeeded. */
  success: boolean;
  /** Output file path if successful. */
  outputPath?: string;
  /** Number of bytes written to file. */
  bytesWritten?: number;
  /** Error message if export failed. */
  error?: string;
  /** Validation errors encountered during export. */
  validationErrors?: string[];
}

/** Result of a batch export operation. */
export interface BatchExportResult {
  /** Total number of entries attempted. */
  total: number;
  /** Number of successfully exported entries. */
  succeeded: number;
  /** Number of failed entries. */
  failed: number;
  /** Individual export results for each entry. */
  results: ExportResult[];
  /** Error messages from failed exports. */
  errors: string[];
}

/** Export error with code and details. */
export interface ExportError {
  /** Error code for categorization. */
  code: ExportErrorCode;
  /** Human-readable error message. */
  message: string;
  /** Additional error details. */
  details?: Record<string, unknown>;
  /** Suggestions for resolving the error. */
  suggestions?: string[];
}

/** Standard export error codes. */
export type ExportErrorCode =
  | "SERIALIZATION_FAILED"
  | "FILE_WRITE_FAILED"
  | "VALIDATION_FAILED"
  | "INVALID_PATH"
  | "MISSING_DATA"
  | "PDF_GENERATION_FAILED"
  | "BATCH_PARTIAL_FAILURE";

/** Metadata included in exports. */
export interface ExportMetadata {
  /** Timestamp when export was created. */
  exportedAt: string;
  /** User or system that created the export. */
  exportedBy: string;
  /** Export format used. */
  format: ExportFormat;
  /** Export format version. */
  version: string;
  /** Number of entries in the export. */
  entryCount: number;
}

/** Options specific to JSON export. */
export interface JsonExportOptions {
  /** Prettify JSON output with indentation. */
  prettify?: boolean;
  /** Include state diff data. */
  includeStateDiff?: boolean;
  /** Include resource usage data. */
  includeResourceUsage?: boolean;
}

/** Options specific to CSV export. */
export interface CsvExportOptions {
  /** Include column headers in output. */
  includeHeaders?: boolean;
  /** CSV delimiter character (default: ','). */
  delimiter?: string;
  /** Include state diff data as separate rows. */
  includeStateDiff?: boolean;
}

/** Options specific to PDF export. */
export interface PdfExportOptions {
  /** Include state diff data in PDF. */
  includeStateDiff?: boolean;
  /** Include resource usage data in PDF. */
  includeResourceUsage?: boolean;
  /** Custom title for the PDF document. */
  title?: string;
}

/** Flattened CSV row representation of a simulation entry. */
export interface CsvRow {
  id: string;
  timestamp: string;
  contractId: string;
  functionName: string;
  outcome: string;
  result?: string;
  error?: string;
  cpuInstructions?: number;
  memoryBytes?: number;
  network: string;
  source: string;
  method: string;
  durationMs?: number;
  label?: string;
  stateChangesCreated?: number;
  stateChangesModified?: number;
  stateChangesDeleted?: number;
}

/** Validation result for exported data. */
export interface ValidationResult {
  /** Whether validation passed. */
  valid: boolean;
  /** Validation errors. */
  errors: string[];
  /** Validation warnings. */
  warnings: string[];
}
