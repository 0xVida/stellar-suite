"use client";

import { useState } from "react";
import type { ContentItem } from "@/lib/data/content";
import { Badge } from "@/components/ui/Badge";
import { CodeBlock } from "@/components/ui/CodeBlock";

const CATEGORY_VARIANT: Record<string, "cyan" | "blue" | "default"> = {
  DeFi: "cyan",
  Governance: "blue",
  Security: "blue",
  NFTs: "cyan",
  Payments: "default",
};

interface TemplateCardProps {
  template: ContentItem;
}

export function TemplateCard({ template }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-[var(--radius)] border border-border-subtle bg-slate-gray/30 transition-colors hover:border-electric-cyan/20">
      <div className="p-5">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-stardust-white">
            {template.title}
          </h3>
          <Badge variant={CATEGORY_VARIANT[template.category] ?? "default"}>
            {template.category}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-silver">
          {template.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {template.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        {template.codeSnippet && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 text-xs text-electric-cyan transition-opacity hover:opacity-80"
          >
            {expanded ? "Hide code" : "View code"}
          </button>
        )}
      </div>
      {expanded && template.codeSnippet && (
        <div className="border-t border-border-subtle">
          <CodeBlock code={template.codeSnippet} />
        </div>
      )}
    </div>
  );
}
