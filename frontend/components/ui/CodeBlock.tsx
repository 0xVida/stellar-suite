"use client";

interface CodeBlockProps {
  code: string;
  showLineNumbers?: boolean;
}

const RUST_KEYWORDS =
  /\b(pub|fn|let|mut|impl|struct|enum|use|if|else|match|return|self|Self|for|in|loop|while|break|continue|const|static|type|trait|where|async|await|mod|crate|super|extern|ref|move|unsafe|true|false|panic!)\b/g;

const RUST_TYPES =
  /\b(Env|Address|String|Vec|Map|Option|Result|i128|i64|i32|u128|u64|u32|bool|Bytes)\b/g;

const RUST_STRINGS = /"[^"]*"/g;
const RUST_COMMENTS = /\/\/.*/g;
const RUST_NUMBERS = /\b\d+\b/g;

function highlightLine(line: string): React.ReactNode[] {
  // Order matters: comments first, then strings, then keywords/types/numbers
  const segments: { start: number; end: number; cls: string }[] = [];

  function addMatches(regex: RegExp, cls: string) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Don't overlap with existing segments
      if (!segments.some((s) => start < s.end && end > s.start)) {
        segments.push({ start, end, cls });
      }
    }
  }

  addMatches(RUST_COMMENTS, "text-muted-silver italic");
  addMatches(RUST_STRINGS, "text-success");
  addMatches(RUST_KEYWORDS, "text-stellar-blue");
  addMatches(RUST_TYPES, "text-electric-cyan");
  addMatches(RUST_NUMBERS, "text-warning");

  segments.sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let pos = 0;

  for (const seg of segments) {
    if (seg.start > pos) {
      nodes.push(line.slice(pos, seg.start));
    }
    nodes.push(
      <span key={seg.start} className={seg.cls}>
        {line.slice(seg.start, seg.end)}
      </span>,
    );
    pos = seg.end;
  }

  if (pos < line.length) {
    nodes.push(line.slice(pos));
  }

  return nodes;
}

export function CodeBlock({ code, showLineNumbers = true }: CodeBlockProps) {
  const lines = code.split("\n");

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-border-subtle bg-cosmic-navy">
      <pre className="p-4 text-sm leading-6 font-mono text-stardust-white">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {showLineNumbers && (
                <span className="mr-4 inline-block w-6 text-right text-muted-silver/50 select-none">
                  {i + 1}
                </span>
              )}
              <span>{highlightLine(line)}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
