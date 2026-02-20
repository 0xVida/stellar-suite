# Design Document: Simulation Result Export

## Overview

The simulation export feature enables users to export simulation results to JSON, CSV, and PDF formats. The design introduces a new `SimulationExportService` that transforms simulation data structures into various output formats, integrates with the existing `SimulationHistoryService` for data retrieval, and provides UI integration points in the simulation panel and command palette.

The architecture follows the existing service pattern in the codebase, maintaining separation of concerns between data transformation, file I/O, and UI interaction. Export operations support both single result and batch export modes, with progress feedback and validation.

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
├─────────────────────┬───────────────────┬───────────────────┤
│  Simulation Panel   │  Command Palette  │  Context Menus    │
└──────────┬──────────┴─────────┬─────────┴──────────┬────────┘
           │                    │                     │
           └────────────────────┼─────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Export Commands       │
                    │  (exportCommands.ts)   │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │ SimulationExportService│
                    │ (Core Export Logic)    │
                    └───┬────────────────┬───┘
                        │                │
            ┌───────────▼─────┐    ┌────▼──────────────┐
            │ Format Exporters│    │ Validation Utils  │
            │ - JSON          │    │                   │
            │ - CSV           │    └───────────────────┘
            │ - PDF           │
            └─────────────────┘
                        │
            ┌───────────▼─────────────┐
            │ SimulationHistoryService│
            │ (Data Source)           │
            └─────────────────────────┘
```

### Data Flow

1. User triggers export from UI (panel button, command, or context menu)
2. Export command collects simulation data and user preferences (format, file location)
3. `SimulationExportService` receives export request with data and format
4. Service delegates to appropriate format exporter (JSON/CSV/PDF)
5. Format exporter transforms data structure to target format
6. Validation utilities verify output integrity
7. Service writes output to file system
8. Progress and completion notifications sent to UI

## Components and Interfaces

### SimulationExportService

Core service responsible for orchestrating export operations.

```typescript
export interface ExportOptions {
    format: 'json' | 'csv' | 'pdf';
    outputPath: string;
    includeStateDiff?: boolean;
    includeResourceUsage?: boolean;
    prettify?: boolean;
}

export interface ExportResult {
    success: boolean;
    outputPath?: string;
    bytesWritten?: number;
    error?: string;
    validationErrors?: string[];
}

export interface BatchExportResult {
    total: number;
    succeeded: number;
    failed: number;
    results: ExportResult[];
    errors: string[];
}

export class SimulationExportService {
    constructor(
        private readonly historyService: SimulationHistoryService,
        private readonly outputChannel?: OutputChannel
    );

    // Single export
    public async exportSimulation(
        entry: SimulationHistoryEntry,
        options: ExportOptions
    ): Promise<ExportResult>;

    // Batch export
    public async exportBatch(
        entries: SimulationHistoryEntry[],
        options: ExportOptions
    ): Promise<BatchExportResult>;

    // Format-specific exports
    public async exportToJson(
        entry: SimulationHistoryEntry,
        outputPath: string,
        options?: JsonExportOptions
    ): Promise<ExportResult>;

    public async exportToCsv(
        entries: SimulationHistoryEntry[],
        outputPath: string,
        options?: CsvExportOptions
    ): Promise<ExportResult>;

    public async exportToPdf(
        entry: SimulationHistoryEntry,
        outputPath: string,
        options?: PdfExportOptions
    ): Promise<ExportResult>;
}
```

### Format Exporters

Each format has a dedicated exporter class for transformation logic.

#### JSON Exporter

```typescript
export interface JsonExportOptions {
  prettify?: boolean;
  includeStateDiff?: boolean;
  includeResourceUsage?: boolean;
}

export class JsonExporter {
  public serialize(
    entry: SimulationHistoryEntry,
    options: JsonExportOptions,
  ): string;

  public serializeBatch(
    entries: SimulationHistoryEntry[],
    options: JsonExportOptions,
  ): string;

  public validate(json: string): boolean;
}
```

#### CSV Exporter

```typescript
export interface CsvExportOptions {
  includeHeaders?: boolean;
  delimiter?: string;
  includeStateDiff?: boolean;
}

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
  durationMs?: number;
  // State diff fields (flattened)
  stateChangesCreated?: number;
  stateChangesModified?: number;
  stateChangesDeleted?: number;
}

export class CsvExporter {
  public serialize(
    entries: SimulationHistoryEntry[],
    options: CsvExportOptions,
  ): string;

  public flattenEntry(entry: SimulationHistoryEntry): CsvRow;

  public validate(csv: string, expectedColumns: number): boolean;
}
```

#### PDF Exporter

```typescript
export interface PdfExportOptions {
  includeStateDiff?: boolean;
  includeResourceUsage?: boolean;
  title?: string;
}

export class PdfExporter {
  public async generate(
    entry: SimulationHistoryEntry,
    options: PdfExportOptions,
  ): Promise<Buffer>;

  public async generateBatch(
    entries: SimulationHistoryEntry[],
    options: PdfExportOptions,
  ): Promise<Buffer>;

  private renderHeader(entry: SimulationHistoryEntry): string;
  private renderResult(entry: SimulationHistoryEntry): string;
  private renderStateDiff(stateDiff: StateDiff): string;
}
```

### Export Commands

Command handlers for VS Code command palette and UI integration.

```typescript
// src/commands/exportCommands.ts

export async function exportCurrentSimulation(
  context: vscode.ExtensionContext,
): Promise<void>;

export async function exportSimulationHistory(
  context: vscode.ExtensionContext,
  entryIds?: string[],
): Promise<void>;

export async function exportSimulationAsJson(
  context: vscode.ExtensionContext,
  entry: SimulationHistoryEntry,
): Promise<void>;

export async function exportSimulationAsCsv(
  context: vscode.ExtensionContext,
  entries: SimulationHistoryEntry[],
): Promise<void>;

export async function exportSimulationAsPdf(
  context: vscode.ExtensionContext,
  entry: SimulationHistoryEntry,
): Promise<void>;
```

### Simulation Panel Integration

Update the existing `SimulationPanel` to include export buttons.

```typescript
// Addition to src/ui/simulationPanel.ts

private _getExportButtonsHtml(): string {
    return `
        <div class="export-actions">
            <button class="btn" onclick="exportAsJson()">Export as JSON</button>
            <button class="btn" onclick="exportAsCsv()">Export as CSV</button>
            <button class="btn" onclick="exportAsPdf()">Export as PDF</button>
        </div>
    `;
}

// Message handlers
case 'exportAsJson':
    await this.exportCurrentResult('json');
    return;
case 'exportAsCsv':
    await this.exportCurrentResult('csv');
    return;
case 'exportAsPdf':
    await this.exportCurrentResult('pdf');
    return;
```

## Data Models

### Export Metadata

```typescript
export interface ExportMetadata {
  exportedAt: string;
  exportedBy: string;
  format: "json" | "csv" | "pdf";
  version: string;
  entryCount: number;
}
```

### Validation Result

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

Property 1: JSON serialization completeness
_For any_ simulation result, the JSON export output SHALL contain all required fields including contractId, functionName, args, outcome, timestamp, network, source, method, and when present, result or error, resourceUsage, and stateDiff
**Validates: Requirements 1.1**

Property 2: JSON round-trip preservation
_For any_ simulation result, serializing to JSON and then parsing back SHALL produce an equivalent data structure with no loss of information
**Validates: Requirements 1.2**

Property 3: JSON file creation
_For any_ valid file path and simulation result, after JSON export completes, a file SHALL exist at the specified path and be readable
**Validates: Requirements 1.3**

Property 4: JSON state diff inclusion
_For any_ simulation result containing state diff data, the JSON export SHALL include both before and after state snapshots
**Validates: Requirements 1.5**

Property 5: CSV structure validity
_For any_ simulation result exported to CSV, the output SHALL be valid CSV format with rows and columns
**Validates: Requirements 2.1**

Property 6: CSV header presence
_For any_ CSV export, the first row SHALL contain column header names
**Validates: Requirements 2.2**

Property 7: CSV nested data serialization
_For any_ simulation result with nested objects or arrays, the CSV export SHALL contain valid JSON strings in cells representing those nested structures
**Validates: Requirements 2.3**

Property 8: CSV state diff row count
_For any_ simulation result with state diff containing N changes, the CSV export SHALL include N rows representing those changes
**Validates: Requirements 2.4**

Property 9: CSV file creation with escaping
_For any_ valid file path and simulation result, after CSV export completes, a file SHALL exist at the specified path containing properly escaped CSV data
**Validates: Requirements 2.5**

Property 10: PDF validity and completeness
_For any_ simulation result, the PDF export SHALL produce a valid PDF file containing all simulation data fields
**Validates: Requirements 3.1**

Property 11: PDF state diff content
_For any_ simulation result with state diff data, the PDF SHALL contain text representing all state changes with before and after values
**Validates: Requirements 3.3**

Property 12: PDF file creation
_For any_ valid file path and simulation result, after PDF export completes, a valid PDF file SHALL exist at the specified path
**Validates: Requirements 3.5**

Property 13: Batch export single file
_For any_ collection of simulation results, batch export to JSON or PDF format SHALL produce exactly one output file containing all results
**Validates: Requirements 4.2**

Property 14: Batch CSV row count
_For any_ collection of N simulation results, batch CSV export SHALL produce a file with N data rows plus one header row
**Validates: Requirements 4.3**

Property 15: Batch partial failure handling
_For any_ batch export containing some invalid entries, the export SHALL complete successfully for valid entries and report errors for invalid entries
**Validates: Requirements 4.4**

Property 16: Batch export count reporting
_For any_ batch export operation, the result SHALL report counts where succeeded + failed equals the total number of input entries
**Validates: Requirements 4.5**

Property 17: Export file verification
_For any_ completed export operation, the output file SHALL exist and be readable from the file system
**Validates: Requirements 6.1**

Property 18: JSON parse validation
_For any_ JSON export, parsing the output file SHALL succeed without errors
**Validates: Requirements 6.2**

Property 19: CSV column consistency
_For any_ CSV export, all data rows SHALL contain the same number of columns as the header row
**Validates: Requirements 6.3**

Property 20: Export success status
_For any_ export operation that completes without errors, the result SHALL indicate success status
**Validates: Requirements 6.5**

Property 21: Panel export invocation
_For any_ export button click in the simulation panel, the panel SHALL invoke the Export Service with the current simulation result data
**Validates: Requirements 7.2**

Property 22: Export cancellation handling
_For any_ export operation that is cancelled by the user, no output file SHALL be created and no error SHALL be thrown
**Validates: Requirements 7.4**

Property 23: History data retrieval
_For any_ valid history entry ID, the Export Service SHALL retrieve the complete simulation data from the Simulation History Service before exporting
**Validates: Requirements 8.2**

Property 24: History batch export
_For any_ collection of history entry IDs, the Export Service SHALL support batch export to a single output file
**Validates: Requirements 8.3**

Property 25: History incomplete entry handling
_For any_ batch export from history containing entries with missing required data, the Export Service SHALL skip invalid entries and include them in the error report
**Validates: Requirements 8.4**

## Error Handling

### Export Errors

The service handles various error conditions:

1. **Serialization Errors**: When data cannot be serialized to the target format
   - Catch serialization exceptions
   - Log the problematic data structure
   - Return error result with descriptive message

2. **File System Errors**: When file cannot be written
   - Handle permission errors
   - Handle disk space errors
   - Handle invalid path errors
   - Return error result with file system error details

3. **Validation Errors**: When exported data fails validation
   - Report specific validation failures
   - Include details about what validation check failed
   - Provide suggestions for resolution

4. **Batch Processing Errors**: When some entries in a batch fail
   - Continue processing remaining entries
   - Collect all errors
   - Return summary with succeeded/failed counts and error details

### Error Response Format

```typescript
export interface ExportError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
}
```

### Error Codes

- `SERIALIZATION_FAILED`: Data could not be serialized to target format
- `FILE_WRITE_FAILED`: Output file could not be written
- `VALIDATION_FAILED`: Exported data failed validation checks
- `INVALID_PATH`: Output path is invalid or inaccessible
- `MISSING_DATA`: Required data fields are missing from simulation result
- `PDF_GENERATION_FAILED`: PDF library encountered an error
- `BATCH_PARTIAL_FAILURE`: Some entries in batch export failed

## Testing Strategy

### Unit Testing

Unit tests will verify specific behaviors and edge cases:

1. **Format Exporter Tests**
   - Test JSON serialization with various data structures
   - Test CSV flattening with nested objects
   - Test PDF generation with minimal and complete data
   - Test handling of null/undefined values
   - Test special character escaping in CSV

2. **Validation Tests**
   - Test JSON parse validation
   - Test CSV column count validation
   - Test PDF validity checking
   - Test file existence verification

3. **Error Handling Tests**
   - Test serialization error reporting
   - Test file system error handling
   - Test validation failure reporting
   - Test batch partial failure handling

4. **Integration Tests**
   - Test export service with history service
   - Test command handlers with export service
   - Test panel message passing for export actions

### Property-Based Testing

Property-based tests will verify universal properties across many inputs using the `fast-check` library for TypeScript. Each test will run a minimum of 100 iterations with randomly generated simulation results.

1. **JSON Export Properties**
   - Property 1: JSON serialization completeness
   - Property 2: JSON round-trip preservation
   - Property 3: JSON file creation
   - Property 4: JSON state diff inclusion

2. **CSV Export Properties**
   - Property 5: CSV structure validity
   - Property 6: CSV header presence
   - Property 7: CSV nested data serialization
   - Property 8: CSV state diff row count
   - Property 9: CSV file creation with escaping
   - Property 19: CSV column consistency

3. **PDF Export Properties**
   - Property 10: PDF validity and completeness
   - Property 11: PDF state diff content
   - Property 12: PDF file creation

4. **Batch Export Properties**
   - Property 13: Batch export single file
   - Property 14: Batch CSV row count
   - Property 15: Batch partial failure handling
   - Property 16: Batch export count reporting

5. **Validation Properties**
   - Property 17: Export file verification
   - Property 18: JSON parse validation
   - Property 20: Export success status

6. **Integration Properties**
   - Property 21: Panel export invocation
   - Property 22: Export cancellation handling
   - Property 23: History data retrieval
   - Property 24: History batch export
   - Property 25: History incomplete entry handling

### Test Data Generation

Property-based tests will use generators for:

- Random simulation results with varying fields
- Random state diff data with different change types
- Random file paths (valid and invalid)
- Random batch sizes (1 to 100 entries)
- Random error conditions (missing fields, invalid data)

### Testing Tools

- **Unit Testing**: Jest or Mocha (following existing test setup)
- **Property-Based Testing**: fast-check library
- **PDF Validation**: pdf-parse library for verifying PDF structure
- **CSV Validation**: csv-parse library for verifying CSV structure
- **File System**: Mock file system for testing file operations

## Implementation Notes

### PDF Generation Library

Use `pdfkit` library for PDF generation:

- Lightweight and well-maintained
- Supports tables, formatting, and colors
- Works in Node.js environment
- Good documentation and examples

### CSV Generation

Use `csv-stringify` library from the `csv` package:

- Standard CSV library for Node.js
- Handles escaping and quoting automatically
- Supports custom delimiters and options

### File Operations

Use VS Code's file system API (`vscode.workspace.fs`) for consistency:

- Works with virtual file systems
- Handles permissions properly
- Integrates with VS Code's file watching

### Progress Reporting

Use VS Code's progress API:

```typescript
vscode.window.withProgress(
  {
    location: vscode.ProgressLocation.Notification,
    title: "Exporting simulation results",
    cancellable: true,
  },
  async (progress, token) => {
    // Export operation with progress updates
  },
);
```

### Performance Considerations

1. **Large Batch Exports**: Process in chunks to avoid memory issues
2. **State Diff Data**: Optionally exclude state diff for faster exports
3. **PDF Generation**: Most expensive operation, show clear progress
4. **File Writing**: Use streaming for large outputs

### Backward Compatibility

The export feature is additive and does not modify existing data structures or services. It only reads from `SimulationHistoryService` and does not alter stored data.
