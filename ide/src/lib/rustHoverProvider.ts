import type * as Monaco from "monaco-editor";
import {
  extractDocComment,
  extractSignature,
  findSymbolLine,
} from "@/lib/rustDocExtractor";

export function registerRustHoverProvider(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
): Monaco.IDisposable {
  const hoverDisposable = monaco.languages.registerHoverProvider("rust", {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) {
        return null;
      }

      const lines = model.getLinesContent();
      const symbolLine = findSymbolLine(lines, word.word, position);
      if (symbolLine === -1) {
        return null;
      }

      const docComment = extractDocComment(lines, symbolLine);
      const signature = extractSignature(lines, symbolLine);

      if (docComment.length === 0 && signature.length === 0) {
        return null;
      }

      const contents: Monaco.IMarkdownString[] = [];

      if (signature.length > 0) {
        contents.push({ value: `\`\`\`rust\n${signature}\n\`\`\`` });
      }

      if (docComment.length > 0) {
        contents.push({ value: docComment });
      }

      return {
        contents,
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        ),
      };
    },
  });

  const editorDisposeDisposable = editor.onDidDispose(() => {
    hoverDisposable.dispose();
  });

  return {
    dispose() {
      editorDisposeDisposable.dispose();
      hoverDisposable.dispose();
    },
  };
}
