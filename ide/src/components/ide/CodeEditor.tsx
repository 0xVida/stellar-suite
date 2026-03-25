import React, { Suspense, useEffect, useRef } from "react";
import Editor, { type OnChange, type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";

export interface CodeEditorProps {
  content: string;
  language: string;
  onChange?: (value: string) => void;
  onCursorChange?: (line: number, col: number) => void;
  onSave?: () => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  content,
  language,
  onChange,
  onCursorChange,
  onSave,
}: CodeEditorProps) => {
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleEditorChange: OnChange = (value) => {
    if (value === undefined) return;
    onChange?.(value);
  };

  const defineTheme = (monaco: typeof Monaco) => {
    // Define theme only once per mount.
    monaco.editor.defineTheme("stellar-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1e1e2e",
        "editor.foreground": "#cdd6f4",
        "editor.lineHighlightBackground": "#313244",
        "editor.selectionBackground": "#45475a",
        "editorCursor.foreground": "#f5e0dc",
        "editorWhitespace.foreground": "#45475a",
        "editorIndentGuide.background": "#313244",
        "editorIndentGuide.activeBackground": "#45475a",
      },
    });
    monaco.editor.setTheme("stellar-dark");
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;

    defineTheme(monaco);

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.(e.position.lineNumber, e.position.column);
    });
  };

  // Monaco's height is controlled by the parent container in this layout.
  return (
    <div className="h-full w-full overflow-hidden relative border-t border-border">
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center bg-[#1e1e2e] text-muted-foreground font-mono text-xs">
            Loading Editor...
          </div>
        }
      >
        <Editor
          height="100%"
          defaultLanguage={language}
          language={language}
          value={content}
          theme="stellar-dark"
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            lineNumbers: "on",
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
          }}
        />
      </Suspense>
    </div>
  );
};

export default CodeEditor;

