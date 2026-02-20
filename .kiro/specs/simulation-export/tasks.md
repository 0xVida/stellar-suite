# Implementation Plan

- [x] 1. Set up export service infrastructure and types
  - Create `src/services/simulationExportService.ts` with core service class
  - Create `src/types/simulationExport.ts` with export-related type definitions
  - Define `ExportOptions`, `ExportResult`, `BatchExportResult`, and error types
  - Set up service constructor with dependency injection for `SimulationHistoryService`
  - _Requirements: 1.1, 2.1, 3.1, 4.1_

- [x] 2. Implement JSON export functionality
  - [x] 2.1 Create JSON exporter class
    - Create `src/services/exporters/jsonExporter.ts`
    - Implement `serialize()` method for single simulation result
    - Implement `serializeBatch()` method for multiple results
    - Add options support for prettify, includeStateDiff, includeResourceUsage
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 2.2 Implement JSON export in main service
    - Add `exportToJson()` method to `SimulationExportService`
    - Integrate JSON exporter with file writing
    - Add validation for JSON output
    - Handle serialization errors with descriptive messages
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 3. Implement CSV export functionality
  - [x] 3.1 Create CSV exporter class
    - Create `src/services/exporters/csvExporter.ts`
    - Implement `flattenEntry()` method to convert simulation result to CSV row
    - Implement `serialize()` method to generate CSV string from entries
    - Handle nested objects/arrays by serializing to JSON strings
    - Add proper CSV escaping for special characters
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [x] 3.2 Implement CSV export in main service
    - Add `exportToCsv()` method to `SimulationExportService`
    - Integrate CSV exporter with file writing
    - Add validation for CSV column consistency
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 4. Implement PDF export functionality (Optional - Future Enhancement)
  - [ ] 4.1 Install and configure PDF generation library
    - Add `pdfkit` and `@types/pdfkit` to package.json
    - _Requirements: 3.1_
    - _Note: PDF export currently returns "not yet implemented" error_

  - [ ] 4.2 Create PDF exporter class
    - Create `src/services/exporters/pdfExporter.ts`
    - Implement `generate()` method for single simulation result
    - Implement `generateBatch()` method for multiple results
    - Add helper methods: `renderHeader()`, `renderResult()`, `renderStateDiff()`
    - Apply formatting with headers, tables, and status color coding
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 4.3 Implement PDF export in main service
    - Add `exportToPdf()` method to `SimulationExportService`
    - Integrate PDF exporter with file writing
    - Handle PDF generation errors with descriptive messages
    - _Requirements: 3.1, 3.3, 3.4, 3.5_
    - _Note: Placeholder exists, returns error message_

- [x] 5. Implement batch export functionality
  - [x] 5.1 Add batch export method to main service
    - Implement `exportBatch()` method in `SimulationExportService`
    - Process entries sequentially with error collection
    - Support all three formats (JSON, CSV, PDF)
    - Combine results into single output file
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.2 Implement batch error handling
    - Continue processing on individual entry failures
    - Collect all errors during batch processing
    - Return comprehensive result with success/failure counts
    - _Requirements: 4.4, 4.5_

- [x] 6. Implement validation utilities
  - [ ] 6.1 Create validation utility functions
    - Create `src/utils/exportValidation.ts`
    - Implement file existence verification
    - Implement JSON parse validation
    - Implement CSV structure validation
    - Implement PDF validity checking
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 6.2 Integrate validation into export service
    - Call validation after each export operation
    - Report validation failures with specific error details
    - Confirm success when validation passes
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Create export commands
  - [x] 7.1 Implement export command handlers
    - Create `src/commands/exportCommands.ts`
    - Implement `exportCurrentSimulation()` command
    - Implement `exportSimulationHistory()` command
    - Implement format-specific commands: `exportSimulationAsJson()`, `exportSimulationAsCsv()`, `exportSimulationAsPdf()`
    - Add file picker dialogs for output path selection
    - _Requirements: 7.1, 7.2, 7.3, 8.1_

  - [x] 7.2 Add progress reporting to commands
    - Integrate VS Code progress API
    - Show progress notifications during export
    - Display success/failure notifications on completion
    - Support cancellation for long-running exports
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.3 Register commands in extension.ts
    - Register all export commands in `src/extension.ts`
    - Add command palette entries
    - Set up command context and activation
    - _Requirements: 7.1, 8.1_

- [x] 8. Integrate export functionality with simulation panel
  - [x] 8.1 Update simulation panel UI
    - Modify `src/ui/simulationPanel.ts`
    - Add export buttons HTML to panel template
    - Add CSS styling for export buttons
    - _Requirements: 7.1_

  - [x] 8.2 Implement panel message handlers
    - Add message handlers for `exportAsJson`, `exportAsCsv`, `exportAsPdf`
    - Implement `exportCurrentResult()` method in panel class
    - Store current simulation result for export
    - Invoke export commands with current result data
    - _Requirements: 7.2, 7.5_

  - [x] 8.3 Handle export from panel workflow
    - Show file picker when export button clicked
    - Handle user cancellation gracefully
    - Display export status in panel
    - _Requirements: 7.3, 7.4, 7.5_

- [x] 9. Implement history export integration
  - [x] 9.1 Add history retrieval to export service
    - Implement method to retrieve simulation data by entry ID
    - Integrate with `SimulationHistoryService`
    - Handle missing or incomplete history entries
    - _Requirements: 8.2, 8.4_

  - [x] 9.2 Implement batch history export
    - Support exporting multiple history entries by ID
    - Combine history entries into single export file
    - Skip entries with missing required data
    - Report skipped entries in export summary
    - _Requirements: 8.3, 8.4, 8.5_

- [x] 10. Add error handling and logging
  - [x] 10.1 Implement comprehensive error handling
    - Add try-catch blocks for all export operations
    - Create error result objects with descriptive messages
    - Log errors to output channel
    - Provide user-friendly error notifications
    - _Requirements: 1.4, 3.4, 6.4_

  - [x] 10.2 Add export operation logging
    - Log export start with parameters
    - Log export completion with file size
    - Log validation results
    - Log batch export progress and summary
    - _Requirements: 5.2, 5.5_

- [ ] 11. Update documentation
  - [ ] 11.1 Add JSDoc comments to all public methods
    - Document export service methods
    - Document exporter classes
    - Document command handlers
    - _Requirements: All_

  - [ ] 11.2 Add usage examples
    - Add code examples in comments
    - Document export options and their effects
    - _Requirements: All_

  - [ ] 11.3 Update README
    - Add export feature description
    - Add usage instructions
    - Add screenshots if applicable
    - _Requirements: All_
