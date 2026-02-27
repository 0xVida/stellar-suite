// src/components/blog/PostBody.tsx
// Renders post.content (markdown string) with consistent typography.
// Uses a lightweight regex-based renderer so no extra dependencies are needed.
// If you later add @next/mdx or remark, replace this component with your MDX renderer.

type Props = {
  content: string;
};

/**
 * Lightweight markdown → HTML renderer.
 * Supports: h2/h3, bold, inline code, fenced code blocks, paragraphs, unordered lists.
 */
function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  const inline = (text: string) =>
    text
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  for (const line of lines) {
    // Fenced code block start
    if (!inCode && line.startsWith("```")) {
      flushList();
      inCode = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      continue;
    }
    // Fenced code block end
    if (inCode && line.startsWith("```")) {
      html.push(
        `<pre class="code-block"><code class="language-${codeLang || "text"}">${codeLines
          .map((l) =>
            l
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;"),
          )
          .join("\n")}</code></pre>`,
      );
      inCode = false;
      codeLines = [];
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // Headings
    if (line.startsWith("## ")) {
      flushList();
      html.push(`<h2 class="post-h2">${inline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      html.push(`<h3 class="post-h3">${inline(line.slice(4))}</h3>`);
      continue;
    }

    // List items
    if (line.startsWith("- ")) {
      if (!inList) {
        html.push('<ul class="post-list">');
        inList = true;
      }
      html.push(`<li class="post-li">${inline(line.slice(2))}</li>`);
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // Paragraph
    flushList();
    html.push(`<p class="post-p">${inline(line)}</p>`);
  }

  flushList();
  return html.join("\n");
}

export function PostBody({ content }: Props) {
  return (
    <>
      <style>{`
        .post-body .post-h2 {
          font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
          font-size: 1.5rem;
          font-weight: 700;
          color: hsl(var(--foreground));
          margin-top: 2.5rem;
          margin-bottom: 1rem;
          line-height: 1.3;
        }
        .post-body .post-h3 {
          font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
          font-size: 1.15rem;
          font-weight: 600;
          color: hsl(var(--foreground));
          margin-top: 2rem;
          margin-bottom: 0.75rem;
        }
        .post-body .post-p {
          font-family: var(--font-body, 'DM Sans', sans-serif);
          font-size: 1.0625rem;
          line-height: 1.85;
          color: hsl(var(--muted-foreground));
          margin-bottom: 1.25rem;
        }
        .post-body .post-list {
          margin-bottom: 1.25rem;
          padding-left: 1.5rem;
          list-style: none;
        }
        .post-body .post-li {
          font-family: var(--font-body, 'DM Sans', sans-serif);
          font-size: 1.0625rem;
          line-height: 1.8;
          color: hsl(var(--muted-foreground));
          position: relative;
          padding-left: 0.25rem;
          margin-bottom: 0.4rem;
        }
        .post-body .post-li::before {
          content: '';
          position: absolute;
          left: -1.1rem;
          top: 0.75rem;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: hsl(var(--primary));
        }
        .post-body .inline-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85em;
          background: hsl(var(--muted));
          color: hsl(var(--primary));
          border-radius: 4px;
          padding: 0.15em 0.4em;
        }
        .post-body .code-block {
          background: hsl(222 47% 6%);
          border: 1px solid hsl(var(--border));
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          overflow-x: auto;
          margin: 1.75rem 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.875rem;
          line-height: 1.7;
          color: #cdd3de;
        }
        .dark .post-body .code-block {
          background: hsl(222 47% 4%);
        }
        .post-body strong {
          font-weight: 600;
          color: hsl(var(--foreground));
        }
      `}</style>
      <div
        className="post-body"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </>
  );
}
