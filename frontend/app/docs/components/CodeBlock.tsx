"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  showLineNumbers?: boolean;
}

export default function CodeBlock({ code, language = "typescript", title, showLineNumbers = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split("\n");

  return (
    <div className="rounded-xl border border-border overflow-hidden my-4">
      {title && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted border-b border-border">
          <span className="text-xs font-medium text-muted-fg">{title}</span>
          <span className="text-xs text-muted-fg font-mono">{language}</span>
        </div>
      )}
      <div className="relative group">
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 p-2 rounded-lg bg-muted/50 text-muted-fg hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-all"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>
        <pre className="overflow-x-auto p-4 bg-code-bg text-code-text text-sm font-mono leading-relaxed">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="flex">
                {showLineNumbers && (
                  <span className="select-none pr-4 text-right min-w-10 text-muted-fg/40">{i + 1}</span>
                )}
                <span>{line}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
