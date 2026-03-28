"use client";

import { useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";
import { parseRustTests } from "@/lib/rustTestParser";
import { useTestGutterStore, type TestStatus } from "@/store/useTestGutterStore";

let stylesInjected = false;

function injectGutterStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-test-gutter", "");
  style.textContent = `
    .test-gutter-icon {
      cursor: pointer;
      width: 16px !important;
      height: 16px !important;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      transition: opacity 0.12s ease, transform 0.1s ease;
      opacity: 0.7;
      margin-top: 2px;
    }
    .test-gutter-icon:hover { opacity: 1; transform: scale(1.15); }

    .test-gutter-play::before {
      content: "";
      display: inline-block;
      width: 0; height: 0;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 9px solid #6cb6ff;
      margin-left: 2px;
    }

    .test-gutter-running::before {
      content: "";
      display: inline-block;
      width: 8px; height: 8px;
      border: 2px solid #555;
      border-top-color: #f0c040;
      border-radius: 50%;
      animation: test-gutter-spin 0.65s linear infinite;
    }
    @keyframes test-gutter-spin { to { transform: rotate(360deg); } }

    .test-gutter-passed::before {
      content: "✓";
      font-size: 11px; font-weight: 700; color: #3fb950; line-height: 1;
    }

    .test-gutter-failed::before {
      content: "✕";
      font-size: 11px; font-weight: 700; color: #f85149; line-height: 1;
    }
  `;
  document.head.appendChild(style);
}

function statusToClass(status: TestStatus): string {
  switch (status) {
    case "running": return "test-gutter-running";
    case "passed":  return "test-gutter-passed";
    case "failed":  return "test-gutter-failed";
    default:        return "test-gutter-play";
  }
}

interface UseTestGutterOptions {
  editor: Monaco.editor.IStandaloneCodeEditor | null;
  monaco: typeof Monaco | null;
  filePath: string;
  debounceMs?: number;
}

export function useTestGutter({ editor, monaco, filePath, debounceMs = 400 }: UseTestGutterOptions) {
  const { results, runTest } = useTestGutterStore();

  const decorationCollection = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const testsRef = useRef<ReturnType<typeof parseRustTests>>([]);
  const resultsRef = useRef(results);
  const runTestRef = useRef(runTest);
  const filePathRef = useRef(filePath);

  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => { runTestRef.current = runTest; }, [runTest]);
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);

  const applyDecorations = (ed: Monaco.editor.IStandaloneCodeEditor, mc: typeof Monaco) => {
    if (!decorationCollection.current) {
      decorationCollection.current = ed.createDecorationsCollection([]);
    }
    const decorations: Monaco.editor.IModelDeltaDecoration[] = testsRef.current.map((test) => {
      const result = resultsRef.current[test.testName];
      const status: TestStatus = result?.status ?? "idle";
      const hoverLines = [`**▶ Run test:** \`${test.testName}\``];
      if (result) {
        hoverLines.push(`*${result.status}* · ${result.durationMs ?? 0}ms`);
        if (result.output) hoverLines.push("```\n" + result.output.slice(0, 300) + "\n```");
      }
      return {
        range: new mc.Range(test.line, 1, test.line, 1),
        options: {
          glyphMarginClassName: `test-gutter-icon ${statusToClass(status)}`,
          glyphMarginHoverMessage: { value: hoverLines.join("\n\n") },
          stickiness: mc.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      };
    });
    decorationCollection.current.set(decorations);
  };

  const reparseAndDecorate = (ed: Monaco.editor.IStandaloneCodeEditor, mc: typeof Monaco) => {
    const model = ed.getModel();
    if (!model) return;
    testsRef.current = parseRustTests(filePathRef.current, model.getValue());
    applyDecorations(ed, mc);
  };

  // Redecorate when results change
  useEffect(() => {
    if (!editor || !monaco) return;
    applyDecorations(editor, monaco);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, editor, monaco]);

  // Wire up editor events on mount
  useEffect(() => {
    if (!editor || !monaco) return;
    injectGutterStyles();
    reparseAndDecorate(editor, monaco);

    let timer: ReturnType<typeof setTimeout>;
    const contentSub = editor.onDidChangeModelContent(() => {
      clearTimeout(timer);
      timer = setTimeout(() => reparseAndDecorate(editor, monaco), debounceMs);
    });

    const clickSub = editor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const line = e.target.position?.lineNumber;
      if (line == null) return;
      const test = testsRef.current.find((t) => t.line === line);
      if (!test) return;
      runTestRef.current(test.testName, filePathRef.current);
    });

    return () => {
      clearTimeout(timer);
      contentSub.dispose();
      clickSub.dispose();
      decorationCollection.current?.clear();
      decorationCollection.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, monaco]);

  // Reparse when file switches
  useEffect(() => {
    if (!editor || !monaco) return;
    reparseAndDecorate(editor, monaco);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);
}
