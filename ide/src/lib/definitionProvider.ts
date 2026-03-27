// @ts-ignore - Monaco types will be available at runtime
import * as Monaco from "monaco-editor";
import { symbolIndexer, type SymbolInfo } from "./symbolIndexer";

export class DefinitionProvider {
  private editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  private monaco: typeof Monaco | null = null;

  constructor() {}

  public initialize(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) {
    this.editor = editor;
    this.monaco = monaco;
  }

  public provideDefinition(
    model: Monaco.editor.ITextModel,
    position: Monaco.Position,
    token: Monaco.CancellationToken,
  ): Monaco.languages.ProviderResult<
    Monaco.languages.Location | Monaco.languages.Location[]
  > {
    if (!this.monaco) return null;

    const word = model.getWordAtPosition(position);
    if (!word) return null;

    const symbolName = word.word;
    const definitions = symbolIndexer.findDefinition(symbolName);

    if (definitions.length === 0) return null;

    // Convert to Monaco locations
    const locations: Monaco.languages.Location[] = definitions.map((def) => {
      const filePath = def.filePath.join("/");
      const uri = this.monaco!.Uri.parse(`file://${filePath}`);

      return {
        uri,
        range: {
          startLineNumber: def.range.start.line,
          startColumn: def.range.start.column,
          endLineNumber: def.range.end.line,
          endColumn: def.range.end.column,
        },
      };
    });

    // Return single location or array for multiple definitions
    return locations.length === 1 ? locations[0] : locations;
  }

  public async goToDefinition(symbolName: string): Promise<boolean> {
    if (!this.editor || !this.monaco) return false;

    const definitions = symbolIndexer.findDefinition(symbolName);

    if (definitions.length === 0) return false;

    if (definitions.length === 1) {
      // Single definition - navigate directly
      const def = definitions[0];
      await this.navigateToDefinition(def);
      return true;
    } else {
      // Multiple definitions - show quick pick
      return this.showDefinitionPicker(definitions);
    }
  }

  private async navigateToDefinition(definition: SymbolInfo): Promise<void> {
    if (!this.editor || !this.monaco) return;

    const filePath = definition.filePath.join("/");

    // Check if the file is already open
    const model = this.monaco.editor.getModel(
      this.monaco.Uri.parse(`file://${filePath}`),
    );

    if (!model) {
      // File not open, we need to trigger file opening
      // This will be handled by the workspace store
      this.emitFileOpenRequest(definition.filePath);
    }

    // Wait a bit for the file to load, then navigate
    setTimeout(() => {
      const targetModel = this.monaco!.editor.getModel(
        this.monaco!.Uri.parse(`file://${filePath}`),
      );
      if (targetModel) {
        // Set the model if different from current
        if (this.editor!.getModel() !== targetModel) {
          this.editor!.setModel(targetModel);
        }

        // Navigate to the position
        const position = {
          lineNumber: definition.range.start.line,
          column: definition.range.start.column,
        };

        this.editor!.setPosition(position);
        this.editor!.revealPositionInCenter(position);
        this.editor!.focus();
      }
    }, 100);
  }

  private async showDefinitionPicker(
    definitions: SymbolInfo[],
  ): Promise<boolean> {
    if (!this.editor || !this.monaco) return false;

    // Create quick pick items
    const items = definitions.map((def) => ({
      label: def.name,
      description: `${def.kind} in ${def.filePath.join("/")}:${def.line}`,
      definition: def,
    }));

    // Show quick pick (this is a simplified version - in a real implementation
    // you'd want to use a proper quick pick UI)
    const selected = await this.showQuickPick(items);

    if (selected) {
      await this.navigateToDefinition(selected.definition);
      return true;
    }

    return false;
  }

  private async showQuickPick(
    items: Array<{
      label: string;
      description: string;
      definition: SymbolInfo;
    }>,
  ): Promise<{
    label: string;
    description: string;
    definition: SymbolInfo;
  } | null> {
    // This is a simplified implementation - in a real app you'd use a proper UI component
    // For now, we'll just return the first item
    return items.length > 0 ? items[0] : null;
  }

  private emitFileOpenRequest(filePath: string[]): void {
    // Emit a custom event that the workspace can listen to
    const event = new CustomEvent("openFile", {
      detail: { filePath },
    });
    window.dispatchEvent(event);
  }

  public registerDefinitionProvider(monaco: typeof Monaco) {
    monaco.languages.registerDefinitionProvider(["rust", "toml"], this);
  }

  public registerOnDefinitionHandler(monaco: typeof Monaco) {
    // Register command for Ctrl+Click / Cmd+Click
    monaco.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.F1, () => {
      if (!this.editor) return;

      const position = this.editor.getPosition();
      const model = this.editor.getModel();

      if (position && model) {
        const word = model.getWordAtPosition(position);
        if (word) {
          this.goToDefinition(word.word);
        }
      }
    });

    // Enable Ctrl+Click / Cmd+Click for go to definition
    if (this.editor) {
      this.editor.onMouseDown((e) => {
        if (e.event.ctrlKey || e.event.metaKey) {
          const position = e.target.position;
          const model = this.editor!.getModel();

          if (position && model) {
            const word = model.getWordAtPosition(position);
            if (word) {
              e.event.preventDefault();
              e.event.stopPropagation();
              this.goToDefinition(word.word);
            }
          }
        }
      });

      // Update cursor style on hover with Ctrl/Cmd
      this.editor.onMouseMove((e) => {
        if (e.event.ctrlKey || e.event.metaKey) {
          const position = e.target.position;
          const model = this.editor!.getModel();

          if (position && model) {
            const word = model.getWordAtPosition(position);
            if (word) {
              this.editor!.updateOptions({
                mouseWheelZoom: true,
              });
              // Change cursor to pointer
              this.editor!.getContainerDomNode().style.cursor = "pointer";
            } else {
              this.editor!.getContainerDomNode().style.cursor = "default";
            }
          } else {
            this.editor!.getContainerDomNode().style.cursor = "default";
          }
        } else {
          this.editor!.getContainerDomNode().style.cursor = "default";
        }
      });

      this.editor.onMouseLeave(() => {
        if (this.editor) {
          this.editor.getContainerDomNode().style.cursor = "default";
        }
      });
    }
  }
}

export const definitionProvider = new DefinitionProvider();
