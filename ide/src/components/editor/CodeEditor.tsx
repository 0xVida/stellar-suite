import type { FileNode } from "@/lib/sample-contracts";
import { useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useEditorStore } from "@/store/editorStore";
import Editor, { OnChange, OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import React, { Suspense, useEffect, useRef } from "react";
import { analyzeMathSafety } from "../../lib/mathSafetyAnalyzer";
import { useMathSafetyStore } from "../../store/useMathSafetyStore";
import { Breadcrumbs } from "./Breadcrumbs";

interface CodeEditorProps {
  onCursorChange?: (line: number, col: number) => void;
  onSave?: () => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ onCursorChange, onSave }) => {
  const { activeTabPath, files, updateFileContent } = useWorkspaceStore();
  const { diagnostics } = useDiagnosticsStore();
  const { config, setMathDiagnostics, getAllDiagnostics } =
    useMathSafetyStore();
  const { setJumpToLine } = useEditorStore();
  const rustProviderRegistered = useRef(false);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const activeFile = React.useMemo(() => {
    const findNode = (
      nodes: FileNode[],
      pathParts: string[],
    ): FileNode | null => {
      for (const node of nodes) {
        if (node.name === pathParts[0]) {
          if (pathParts.length === 1) return node;
          if (node.children) return findNode(node.children, pathParts.slice(1));
        }
      }
      return null;
    };
    return findNode(files, activeTabPath);
  }, [files, activeTabPath]);

  const handleEditorChange: OnChange = (value) => {
    if (value !== undefined) {
      updateFileContent(activeTabPath, value);
    }
  };

  // Apply Monaco markers whenever diagnostics or active file changes
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    const virtualId = activeTabPath.join("/");

    // Run math safety analysis if enabled
    if (config.enabled && activeFile?.content) {
      const mathDiags = analyzeMathSafety(
        activeFile.content,
        virtualId,
        config,
      );
      setMathDiagnostics(mathDiags);
    }

    // Combine cargo diagnostics with math safety diagnostics
    const allDiagnostics = getAllDiagnostics(
      virtualId,
      diagnostics.filter((d) => d.fileId === virtualId),
    );

    const severityMap: Record<string, Monaco.MarkerSeverity> = {
      error: monaco.MarkerSeverity.Error,
      warning: monaco.MarkerSeverity.Warning,
      info: monaco.MarkerSeverity.Info,
      hint: monaco.MarkerSeverity.Hint,
    };

    const markers: Monaco.editor.IMarkerData[] = allDiagnostics.map((d) => ({
      severity: severityMap[d.severity] ?? monaco.MarkerSeverity.Error,
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine,
      endColumn: d.endColumn,
      message: d.code ? `[${d.code}] ${d.message}` : d.message,
      source: d.code === "MATH001" ? "math-safety" : "cargo",
    }));

    const model = editorRef.current?.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, "diagnostics", markers);
    }
  }, [
    diagnostics,
    activeTabPath,
    activeFile,
    config,
    setMathDiagnostics,
    getAllDiagnostics,
  ]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;

    // Register jump-to-line function for outline view
    setJumpToLine((line: number) => {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.(e.position.lineNumber, e.position.column);
    });

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

    if (!rustProviderRegistered.current) {
      rustProviderRegistered.current = true;

      monaco.languages.registerCompletionItemProvider("rust", {
        triggerCharacters: [".", ":", " "], // 👈 IMPORTANT

        provideCompletionItems: () => {
          const suggestions = [
            {
              label: "contractimpl",
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: "Soroban contract implementation snippet",
              insertText: [
                "#[contractimpl]",
                "impl Contract {",
                "\tpub fn init(env: Env) {",
                "\t\t$0",
                "\t}",
                "}",
              ].join("\n"),
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            },
            {
              label: "contracttype",
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: "Soroban contract type snippet",
              insertText: [
                "#[contracttype]",
                "pub enum ${1:DataKey} {",
                "\t${2:Admin},",
                "}",
              ].join("\n"),
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            },
            {
              label: "envimports",
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: "Common Soroban SDK imports",
              insertText:
                "use soroban_sdk::{contract, contractimpl, contracttype, Env, Symbol, String};",
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            },
            {
              label: "init",
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: "Rust init function snippet",
              insertText: ["pub fn init(env: Env) {", "\t$0", "}"].join("\n"),
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            },
          ];

          return { suggestions };
        },
      });
    }
  };

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1e1e2e] text-muted-foreground font-mono text-sm">
        Select a file to begin editing
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Breadcrumbs />
      <div
        id="tour-monaco"
        className="flex-1 w-full overflow-hidden relative border-t border-border"
      >
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center bg-[#1e1e2e] text-muted-foreground font-mono text-xs">
              Loading Editor...
            </div>
          }
        >
          <Editor
            height="100%"
            defaultLanguage={
              activeFile.language ||
              (activeFile.name?.endsWith(".toml") ? "toml" : "rust")
            }
            language={
              activeFile.language ||
              (activeFile.name?.endsWith(".toml") ? "toml" : "rust")
            }
            value={activeFile.content}
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
              fontFamily:
                "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            }}
          />
        </Suspense>
      </div>
    </div>
  );
};

export default CodeEditor;
