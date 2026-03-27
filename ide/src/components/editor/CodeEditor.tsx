import type { FileNode } from "@/lib/sample-contracts";
import { useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import { useCoverageStore } from "@/store/useCoverageStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { applyEditsToTree, computeRenameEdits, validateRustIdentifier } from "@/utils/renameProvider";
import { useDiagnosticsStore as _useDiagnosticsStore } from "@/store/useDiagnosticsStore";
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
  const { config, setMathDiagnostics, getAllDiagnostics } = useMathSafetyStore();
  const { getFileCoverage } = useCoverageStore();
  const { setJumpToLine } = useEditorStore();
  const rustProviderRegistered = useRef(false);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const semanticProviderRegistered = useRef(false);
  const coverageDecorations = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  // Keep a live ref to files so the rename provider always sees the latest state
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

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

      // Re-index files when content changes (with debouncing)
      setTimeout(() => {
        symbolIndexer.indexFiles(files);
      }, 500);
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

  // Apply coverage gutter decorations whenever the active file or coverage data changes.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const fileId = activeTabPath.join("/");
    const fileCov = getFileCoverage(fileId);

    // Lazily create the decoration collection once
    if (!coverageDecorations.current) {
      coverageDecorations.current = editor.createDecorationsCollection([]);
    }

    if (!fileCov) {
      coverageDecorations.current.clear();
      return;
    }

    const decorations: Monaco.editor.IModelDeltaDecoration[] = Object.entries(
      fileCov.lines,
    ).map(([lineStr, hits]) => {
      const lineNumber = Number(lineStr);
      const covered = hits > 0;
      return {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          // Gutter icon — green dot for covered, red dot for uncovered
          glyphMarginClassName: covered
            ? "coverage-gutter-covered"
            : "coverage-gutter-uncovered",
          glyphMarginHoverMessage: {
            value: covered
              ? `✅ Covered (${hits} hit${hits === 1 ? "" : "s"})`
              : "❌ Not covered",
          },
          // Subtle background tint — does not obscure text
          className: covered
            ? "coverage-line-covered"
            : "coverage-line-uncovered",
        },
      };
    });

    coverageDecorations.current.set(decorations);
  }, [activeTabPath, getFileCoverage]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;

    // Initialize symbol indexer and definition provider
    symbolIndexer.indexFiles(files);
    definitionProvider.initialize(editor, monaco);
    definitionProvider.registerDefinitionProvider(monaco);
    definitionProvider.registerOnDefinitionHandler(monaco);

    // Listen for file open requests from definition provider
    const handleFileOpen = (event: CustomEvent) => {
      const { filePath } = event.detail;
      // Find the file in the workspace and open it
      const findNode = (
        nodes: FileNode[],
        pathParts: string[],
      ): FileNode | null => {
        for (const node of nodes) {
          if (node.name === pathParts[0]) {
            if (pathParts.length === 1) return node;
            if (node.children)
              return findNode(node.children, pathParts.slice(1));
          }
        }
        return null;
      };

      const node = findNode(files, filePath);
      if (node && node.type === "file") {
        // This would trigger opening the file in the workspace
        // For now, we'll need to integrate with the workspace store
        const { addTab } = useWorkspaceStore.getState();
        addTab(filePath, node.name);
      }
    };

    window.addEventListener("openFile", handleFileOpen as EventListener);
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
      encodedSemanticsColors: {
        // Semantic token colors for different classifications
        "semanticHighlighting.variable": "#89b4fa", // Light blue for variables
        "semanticHighlighting.constant": "#f9e2af", // Yellow for constants (SHOUTY_CASE)
        "semanticHighlighting.mutableVariable": "#eba0ac", // Light red for mutable variables
        "semanticHighlighting.customType": "#94e2d5", // Teal for custom types
        "semanticHighlighting.struct": "#a6e3a1", // Green for structs
        "semanticHighlighting.enum": "#f38ba8", // Pink for enums
        "semanticHighlighting.trait": "#cba6f7", // Purple for traits
        "semanticHighlighting.function": "#b4befe", // Lavender for functions
        "semanticHighlighting.macro": "#fab387", // Orange for macros
        "semanticHighlighting.lifetime": "#6c7086", // Gray for lifetimes
      },
    });
    monaco.editor.setTheme("stellar-dark");

    // Register semantic tokens provider for Rust
    if (!semanticProviderRegistered.current) {
      semanticProviderRegistered.current = true;

      const semanticProvider = new RustSemanticTokensProvider();
      const legend = semanticProvider.getLegend();

      // Register semantic tokens provider
      monaco.languages.registerDocumentSemanticTokensProvider(
        "rust",
        semanticProvider,
        legend,
      );

      // Define semantic token styling rules
      monaco.editor.defineSemanticTokenRules("stellar-dark", [
        // Constants (SHOUTY_CASE) - bright yellow/orange
        {
          token: legend.tokenTypes.indexOf("constant"),
          foreground: "f9e2af", // Yellow
          fontStyle: "bold",
        },
        // Mutable variables - light red with strikethrough effect
        {
          token: legend.tokenTypes.indexOf("mutableVariable"),
          foreground: "eba0ac", // Light red
          fontStyle: "underline", // Using underline instead of strikethrough for better readability
        },
        // Regular variables - light blue
        {
          token: legend.tokenTypes.indexOf("variable"),
          foreground: "89b4fa", // Light blue
        },
        // Custom types (structs, enums, traits) - teal
        {
          token: legend.tokenTypes.indexOf("customType"),
          foreground: "94e2d5", // Teal
          fontStyle: "italic",
        },
        // Structs specifically - green
        {
          token: legend.tokenTypes.indexOf("struct"),
          foreground: "a6e3a1", // Green
          fontStyle: "bold",
        },
        // Enums specifically - pink
        {
          token: legend.tokenTypes.indexOf("enum"),
          foreground: "f38ba8", // Pink
          fontStyle: "bold",
        },
        // Traits specifically - purple
        {
          token: legend.tokenTypes.indexOf("trait"),
          foreground: "cba6f7", // Purple
          fontStyle: "italic",
        },
        // Functions - lavender
        {
          token: legend.tokenTypes.indexOf("function"),
          foreground: "b4befe", // Lavender
          fontStyle: "bold",
        },
        // Macros - orange
        {
          token: legend.tokenTypes.indexOf("macro"),
          foreground: "fab387", // Orange
          fontStyle: "bold",
        },
        // Lifetimes - gray
        {
          token: legend.tokenTypes.indexOf("lifetime"),
          foreground: "6c7086", // Gray
          fontStyle: "italic",
        },
        // Declaration modifier - underline
        {
          token: -1, // Applies to all tokens
          modifiers: [legend.tokenModifiers.indexOf("declaration")],
          fontStyle: "underline",
        },
        // Static modifier - italic
        {
          token: -1, // Applies to all tokens
          modifiers: [legend.tokenModifiers.indexOf("static")],
          fontStyle: "italic",
        },
      ]);
    }

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

      // Workspace-wide rename provider (F2)
      monaco.languages.registerRenameProvider("rust", {
        provideRenameEdits(model, position, newName) {
          const oldName = model.getWordAtPosition(position)?.word;
          if (!oldName) return { edits: [] };

          const validationError = validateRustIdentifier(newName);
          if (validationError) return Promise.reject(new Error(validationError));

          const { edits, matchCount, error } = computeRenameEdits(
            filesRef.current,
            oldName,
            newName,
          );

          if (error) return Promise.reject(new Error(error));
          if (matchCount === 0) return { edits: [] };

          // Atomic update: compute the full new tree then write it in one setFiles call.
          // Zustand's persist middleware flushes this to IndexedDB as a single transaction.
          const { setFiles } = useWorkspaceStore.getState();
          const nextTree = applyEditsToTree(filesRef.current, edits);
          setFiles(nextTree);

          // Invalidate the symbol index so the next build re-indexes from scratch.
          _useDiagnosticsStore.getState().clearDiagnostics();

          // Return workspace edits so Monaco can show the preview diff (F2 UI)
          const workspaceEdits: Monaco.languages.WorkspaceEdit = {
            edits: edits.flatMap((edit) => {
              const uri = monaco.Uri.parse(`inmemory://workspace/${edit.fileId}`);
              const lines = edit.newContent.split("\n");
              return [
                {
                  resource: uri,
                  textEdit: {
                    range: {
                      startLineNumber: 1,
                      startColumn: 1,
                      endLineNumber: lines.length,
                      endColumn: lines[lines.length - 1].length + 1,
                    },
                    text: edit.newContent,
                  },
                  versionId: undefined,
                },
              ];
            }),
          };

          return workspaceEdits;
        },

        resolveRenameLocation(model, position) {
          const word = model.getWordAtPosition(position);
          if (!word) return { range: new monaco.Range(0, 0, 0, 0), text: "" };
          return {
            range: new monaco.Range(
              position.lineNumber,
              word.startColumn,
              position.lineNumber,
              word.endColumn,
            ),
            text: word.word,
          };
        },
      });
    }

    // Cleanup function
    return () => {
      window.removeEventListener("openFile", handleFileOpen as EventListener);
    };
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
              glyphMargin: true,
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
