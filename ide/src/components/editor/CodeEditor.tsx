import type { FileNode } from "@/lib/sample-contracts";
import { useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import { useCoverageStore } from "@/store/useCoverageStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import {
  applyEditsToTree,
  computeRenameEdits,
  validateRustIdentifier,
} from "@/utils/renameProvider";
import { useDiagnosticsStore as _useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import { useEditorStore } from "@/store/editorStore";
import { useErrorHelpStore } from "@/store/useErrorHelpStore";
import { extractErrorCode, hasErrorHelp } from "@/utils/errorCodeExtractor";
import {
  createRustFoldingRangeProvider,
  RUST_FOLD_REGION_END,
  RUST_FOLD_REGION_START,
} from "@/lib/rustFolding";
import { RustSemanticTokensProvider } from "@/lib/semanticTokensProvider";
import { definitionProvider } from "@/lib/definitionProvider";
import { symbolIndexer } from "@/lib/symbolIndexer";
import Editor, { OnChange, OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import React, { Suspense, useEffect, useRef, useState } from "react";
import { analyzeMathSafety } from "../../lib/mathSafetyAnalyzer";
import { useMathSafetyStore } from "../../store/useMathSafetyStore";
import { useUserSettingsStore } from "@/store/useUserSettingsStore";
import { Breadcrumbs } from "./Breadcrumbs";
import { GitBlameLines } from "./GitBlameLines";
import { getAllMonacoCompletions } from "@/utils/proptestSnippets";
import { useTestGutter } from "@/hooks/useTestGutter";
import { GitGutterMarkers } from "./GitGutterMarkers";
import { git } from "@/lib/git";
import "@/styles/editor-gutter.css";
import { referenceProvider } from "@/lib/referenceProvider";
import { useLiveShare } from "@/hooks/useLiveShare";

interface CodeEditorProps {
  onCursorChange?: (line: number, col: number) => void;
  onSave?: () => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ onCursorChange, onSave }) => {
  const { activeTabPath, files, updateFileContent } = useWorkspaceStore();
  const { diagnostics } = useDiagnosticsStore();
  const { config, setMathDiagnostics, getAllDiagnostics } =
    useMathSafetyStore();
  const { getFileCoverage } = useCoverageStore();
  const { setJumpToLine, saveViewState, getViewState } = useEditorStore();
  const { openErrorHelp } = useErrorHelpStore();
  const { mode, isSharing, broadcastContentChange } = useLiveShare();
  const rustProviderRegistered = useRef(false);

  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const semanticProviderRegistered = useRef(false);
  const coverageDecorations =
    useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const codeActionProviderRegistered = useRef(false);

  // Git gutter: track mounted editor/monaco and HEAD content for active file
  const [mountedEditor, setMountedEditor] =
    useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [mountedMonaco, setMountedMonaco] = useState<typeof Monaco | null>(
    null,
  );
  const [headContent, setHeadContent] = useState<string>("");
  const activeFileId = activeTabPath.join("/");
  const activeFileIdRef = useRef(activeFileId);

  useTestGutter({
    editor: editorRef.current,
    monaco: monacoRef.current,
    filePath: activeFileId,
  });

  // Keep a live ref to files so the rename provider always sees the latest state
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

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

  // User settings (font size and theme)
  const { fontSize, theme: currentTheme } = useUserSettingsStore();

  const handleEditorChange: OnChange = (value) => {
    if (value !== undefined) {
      updateFileContent(activeTabPath, value);
      
      // Broadcast change if in sharing mode
      if (isSharing && mode === "broadcaster") {
        broadcastContentChange(activeTabPath, value);
      }

      // Re-index files when content changes (with debouncing)
      setTimeout(() => {
        symbolIndexer.indexFiles(files);
      }, 500);
    }
  };

  // Fetch HEAD content for the active file whenever the path changes
  useEffect(() => {
    if (activeTabPath.length === 0) return;
    let cancelled = false;
    git
      .readTree(activeTabPath)
      .then((content) => {
        if (!cancelled) setHeadContent(content);
      })
      .catch(() => {
        if (!cancelled) setHeadContent("");
      });
    return () => {
      cancelled = true;
    };
  }, [activeTabPath]);

  // Apply Monaco markers whenever diagnostics or active file changes
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    const virtualId = activeFileId;

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
    activeFileId,
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

  useEffect(() => {
    return () => {
      if (!activeFileId) return;
      const viewState = editorRef.current?.saveViewState();
      if (viewState) {
        saveViewState(activeFileId, viewState);
      }
    };
  }, [activeFileId, saveViewState]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFileId) return;

    const frameId = window.requestAnimationFrame(() => {
      const storedViewState = getViewState(
        activeFileId,
      ) as Monaco.editor.ICodeEditorViewState | null;
      if (storedViewState) {
        editor.restoreViewState(storedViewState);
        editor.render();
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeFileId, getViewState]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    setMountedEditor(editor);
    setMountedMonaco(monaco);

    // Initialize symbol indexer and definition provider
    symbolIndexer.indexFiles(files);
    definitionProvider.initialize(editor, monaco);
    definitionProvider.registerDefinitionProvider(monaco);
    definitionProvider.registerOnDefinitionHandler(monaco);
    referenceProvider.initialize(monaco);
    referenceProvider.register(monaco);

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

    const handleJumpToPosition = (event: CustomEvent) => {
      const { line, column } = event.detail;
      editor.revealPositionInCenter({ lineNumber: line, column });
      editor.setPosition({ lineNumber: line, column });
      editor.focus();
    };
    window.addEventListener(
      "jumpToPosition",
      handleJumpToPosition as EventListener,
    );

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.(e.position.lineNumber, e.position.column);
    });

    editor.onDidChangeHiddenAreas(() => {
      const currentFileId = activeFileIdRef.current;
      if (!currentFileId) return;

      const viewState = editor.saveViewState();
      if (viewState) {
        saveViewState(currentFileId, viewState);
      }
    });

    monaco.editor.defineTheme("stellar-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        // Semantic token styling rules
        { token: "variable", foreground: "89b4fa" },
        { token: "constant", foreground: "f9e2af", fontStyle: "bold" },
        {
          token: "mutableVariable",
          foreground: "eba0ac",
          fontStyle: "underline",
        },
        { token: "customType", foreground: "94e2d5", fontStyle: "italic" },
        { token: "struct", foreground: "a6e3a1", fontStyle: "bold" },
        { token: "enum", foreground: "f38ba8", fontStyle: "bold" },
        { token: "trait", foreground: "cba6f7", fontStyle: "italic" },
        { token: "function", foreground: "b4befe", fontStyle: "bold" },
        { token: "macro", foreground: "fab387", fontStyle: "bold" },
        { token: "lifetime", foreground: "6c7086", fontStyle: "italic" },
      ],
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

    // Initial theme setup
    const initialIsDark =
      currentTheme === "dark" ||
      (currentTheme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    monaco.editor.setTheme(initialIsDark ? "stellar-dark" : "vs");

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
    }

    // Register code action provider for error help
    if (!codeActionProviderRegistered.current) {
      codeActionProviderRegistered.current = true;

      monaco.languages.registerCodeActionProvider("rust", {
        provideCodeActions: (model, range, context) => {
          const actions: Monaco.languages.CodeAction[] = [];

          // Check if there are any diagnostics at this position
          for (const marker of context.markers) {
            // Extract error code from marker message
            const errorCode = extractErrorCode(marker.message);

            if (errorCode && hasErrorHelp(errorCode)) {
              actions.push({
                title: `💡 Learn More About ${errorCode}`,
                kind: "quickfix",
                diagnostics: [marker],
                isPreferred: true,
                command: {
                  id: "stellar.openErrorHelp",
                  title: "Open Error Help",
                  arguments: [errorCode],
                },
              });
            }
          }

          return {
            actions,
            dispose: () => {},
          };
        },
      });

      // Register the command to open error help
      editor.addAction({
        id: "stellar.openErrorHelp",
        label: "Open Error Help",
        run: (_editor, errorCode: string) => {
          openErrorHelp(errorCode);
        },
      });
    }

    if (!rustProviderRegistered.current) {
      rustProviderRegistered.current = true;

      monaco.languages.setLanguageConfiguration("rust", {
        comments: {
          lineComment: "//",
          blockComment: ["/*", "*/"],
        },
        brackets: [
          ["{", "}"],
          ["[", "]"],
          ["(", ")"],
        ],
        autoClosingPairs: [
          { open: "{", close: "}" },
          { open: "[", close: "]" },
          { open: "(", close: ")" },
          { open: '"', close: '"' },
        ],
        surroundingPairs: [
          { open: "{", close: "}" },
          { open: "[", close: "]" },
          { open: "(", close: ")" },
          { open: '"', close: '"' },
        ],
        folding: {
          markers: {
            start: RUST_FOLD_REGION_START,
            end: RUST_FOLD_REGION_END,
          },
          offSide: false,
        },
      });

      monaco.languages.registerFoldingRangeProvider(
        "rust",
        createRustFoldingRangeProvider(),
      );

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
            // Proptest snippets — all categories
            ...getAllMonacoCompletions(monaco),
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
          if (validationError)
            return Promise.reject(new Error(validationError));

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
              const uri = monaco.Uri.parse(
                `inmemory://workspace/${edit.fileId}`,
              );
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
      window.removeEventListener(
        "jumpToPosition",
        handleJumpToPosition as EventListener,
      );
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
      <GitBlameLines
        editor={editorRef.current}
        monaco={monacoRef.current}
        filePath={activeTabPath}
      />
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
            path={activeFileId}
            defaultLanguage={
              activeFile.language ||
              (activeFile.name?.endsWith(".toml") ? "toml" : "rust")
            }
            language={
              activeFile.language ||
              (activeFile.name?.endsWith(".toml") ? "toml" : "rust")
            }
            value={activeFile.content}
            theme={
              currentTheme === "dark" ||
              (currentTheme === "system" &&
                typeof window !== "undefined" &&
                window.matchMedia("(prefers-color-scheme: dark)").matches)
                ? "stellar-dark"
                : "vs"
            }
            saveViewState={false}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            options={{
              fontSize: fontSize,
              readOnly: mode === "recipient",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              lineNumbers: "on",
              glyphMargin: true,
              folding: true,
              foldingStrategy: "auto",
              foldingHighlight: true,
              showFoldingControls: "always",
              unfoldOnClickAfterEndOfLine: false,
              lineDecorationsWidth: 10,
              lineNumbersMinChars: 3,
              fontFamily:
                "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
            }}
          />
          {mountedEditor && mountedMonaco && (
            <GitGutterMarkers
              editor={mountedEditor}
              monaco={mountedMonaco}
              headContent={headContent}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default CodeEditor;
