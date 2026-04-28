import * as Monaco from "monaco-editor";
import { symbolIndexer } from "./symbolIndexer";

export class ReferenceProvider implements Monaco.languages.ReferenceProvider {
  private monaco: typeof Monaco | null = null;

  constructor() {}

  public initialize(monaco: typeof Monaco) {
    this.monaco = monaco;
  }

  public provideReferences(
    model: Monaco.editor.ITextModel,
    position: Monaco.Position,
    context: Monaco.languages.ReferenceContext,
    token: Monaco.CancellationToken
  ): Monaco.languages.ProviderResult<Monaco.languages.Location[]> {
    if (!this.monaco) return null;

    const word = model.getWordAtPosition(position);
    if (!word) return null;

    const symbolName = word.word;
    const references = symbolIndexer.findReferences(symbolName);

    if (references.length === 0) return null;

    const locations: Monaco.languages.Location[] = references
      .filter(ref => context.includeDeclaration || !ref.isDeclaration)
      .map(ref => {
        const filePath = ref.filePath.join("/");
        const uri = this.monaco!.Uri.parse(`file://${filePath}`);

        return {
          uri,
          range: {
            startLineNumber: ref.range.start.line,
            startColumn: ref.range.start.column,
            endLineNumber: ref.range.end.line,
            endColumn: ref.range.end.column,
          },
        };
      });

    // Notify the UI about new references (for the sidebar)
    const event = new CustomEvent("referencesFound", {
      detail: { symbolName, references }
    });
    window.dispatchEvent(event);

    return locations;
  }

  public register(monaco: typeof Monaco) {
    this.monaco = monaco;
    return monaco.languages.registerReferenceProvider(["rust", "toml"], this);
  }
}

export const referenceProvider = new ReferenceProvider();
