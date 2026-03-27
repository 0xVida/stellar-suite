import { FileNode } from "@/lib/sample-contracts";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useEditorStore } from "@/store/editorStore";
import { parseRustSymbols, RustSymbol, SymbolKind } from "@/utils/rustSymbolParser";
import {
  Box,
  Braces,
  Code2,
  FileCode,
  FunctionSquare,
  Hash,
  Package,
  Type,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface OutlineViewProps {
  onSymbolClick?: (line: number) => void;
}

/**
 * Get icon for symbol kind
 */
function getSymbolIcon(kind: SymbolKind) {
  switch (kind) {
    case "struct":
      return <Box className="h-3.5 w-3.5 text-blue-400" />;
    case "enum":
      return <Braces className="h-3.5 w-3.5 text-purple-400" />;
    case "function":
      return <FunctionSquare className="h-3.5 w-3.5 text-yellow-400" />;
    case "macro":
      return <Zap className="h-3.5 w-3.5 text-pink-400" />;
    case "impl":
      return <Code2 className="h-3.5 w-3.5 text-green-400" />;
    case "trait":
      return <FileCode className="h-3.5 w-3.5 text-cyan-400" />;
    case "const":
      return <Hash className="h-3.5 w-3.5 text-orange-400" />;
    case "type":
      return <Type className="h-3.5 w-3.5 text-indigo-400" />;
    case "mod":
      return <Package className="h-3.5 w-3.5 text-teal-400" />;
    default:
      return <FileCode className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

/**
 * Get visibility badge
 */
function VisibilityBadge({ visibility }: { visibility: "pub" | "private" }) {
  if (visibility === "pub") {
    return (
      <span className="text-[10px] font-mono text-green-500 opacity-70">
        pub
      </span>
    );
  }
  return null;
}

interface SymbolItemProps {
  symbol: RustSymbol;
  isActive: boolean;
  onClick: () => void;
}

function SymbolItem({ symbol, isActive, onClick }: SymbolItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
        isActive
          ? "bg-primary/10 text-primary"
          : "text-foreground hover:bg-muted/40"
      }`}
    >
      {getSymbolIcon(symbol.kind)}
      <span className="flex-1 truncate font-mono">{symbol.name}</span>
      <VisibilityBadge visibility={symbol.visibility} />
      <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">
        :{symbol.line}
      </span>
    </button>
  );
}

interface ImplBlockProps {
  implName: string;
  methods: RustSymbol[];
  currentLine: number;
  onSymbolClick: (line: number) => void;
}

function ImplBlock({ implName, methods, currentLine, onSymbolClick }: ImplBlockProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-l-2 border-muted/30 ml-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/40"
      >
        <Code2 className="h-3.5 w-3.5 text-green-400" />
        <span className="flex-1 truncate font-mono">impl {implName}</span>
        <span className="text-[10px]">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded &&
        methods.map((method) => (
          <div key={`${method.name}-${method.line}`} className="pl-4">
            <SymbolItem
              symbol={method}
              isActive={currentLine === method.line}
              onClick={() => onSymbolClick(method.line)}
            />
          </div>
        ))}
    </div>
  );
}

export function OutlineView({ onSymbolClick }: OutlineViewProps) {
  const { activeTabPath, files, cursorPos } = useWorkspaceStore();
  const { jumpToLine } = useEditorStore();
  const [currentLine, setCurrentLine] = useState(cursorPos.line);

  // Update current line when cursor moves
  useEffect(() => {
    setCurrentLine(cursorPos.line);
  }, [cursorPos.line]);

  // Get active file content
  const activeFile = useMemo(() => {
    const findNode = (nodes: typeof files, pathParts: string[]): FileNode | null => {
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

  // Parse symbols from active file
  const symbols = useMemo(() => {
    if (!activeFile?.content || activeFile.type !== "file") {
      return [];
    }

    // Only parse Rust files
    if (!activeFile.name?.endsWith(".rs")) {
      return [];
    }

    return parseRustSymbols(activeFile.content);
  }, [activeFile]);

  // Group symbols: top-level and impl methods
  const { topLevel, implBlocks } = useMemo(() => {
    const topLevel: RustSymbol[] = [];
    const implBlocks = new Map<string, RustSymbol[]>();

    for (const symbol of symbols) {
      if (symbol.parent) {
        // This is a method inside an impl block
        if (!implBlocks.has(symbol.parent)) {
          implBlocks.set(symbol.parent, []);
        }
        implBlocks.get(symbol.parent)!.push(symbol);
      } else if (symbol.kind !== "impl") {
        // Top-level symbol (not impl block itself)
        topLevel.push(symbol);
      }
    }

    return { topLevel, implBlocks };
  }, [symbols]);

  const handleSymbolClick = (line: number) => {
    if (onSymbolClick) {
      onSymbolClick(line);
    } else if (jumpToLine) {
      jumpToLine(line);
    }
  };

  if (!activeFile || activeFile.type !== "file") {
    return (
      <div className="flex h-full flex-col bg-sidebar">
        <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Outline</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
          No file selected
        </div>
      </div>
    );
  }

  if (!activeFile.name?.endsWith(".rs")) {
    return (
      <div className="flex h-full flex-col bg-sidebar">
        <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Outline</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
          Outline view is only available for Rust files (.rs)
        </div>
      </div>
    );
  }

  if (symbols.length === 0) {
    return (
      <div className="flex h-full flex-col bg-sidebar">
        <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Outline</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
          No symbols found in this file
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Outline</span>
        <span className="text-[10px] font-normal normal-case">
          {symbols.length} symbol{symbols.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {/* Top-level symbols */}
        {topLevel.map((symbol) => (
          <SymbolItem
            key={`${symbol.name}-${symbol.line}`}
            symbol={symbol}
            isActive={currentLine === symbol.line}
            onClick={() => handleSymbolClick(symbol.line)}
          />
        ))}

        {/* Impl blocks with methods */}
        {Array.from(implBlocks.entries()).map(([implName, methods]) => (
          <ImplBlock
            key={implName}
            implName={implName}
            methods={methods}
            currentLine={currentLine}
            onSymbolClick={handleSymbolClick}
          />
        ))}
      </div>
    </div>
  );
}
