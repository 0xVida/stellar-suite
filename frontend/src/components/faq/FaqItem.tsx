"use client";

import { useState, useId } from "react";
import { Plus, Minus } from "lucide-react";
import type { FaqItem as FaqItemType } from "@/lib/faq";

type Props = {
  item: FaqItemType;
  defaultOpen?: boolean;
};

export function FaqItem({ item, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const answerId = useId();

  return (
    <div
      className={`rounded-xl border transition-colors duration-200 ${
        open
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card hover:border-border/80"
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={answerId}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl"
      >
        <span
          className={`font-display font-semibold text-sm leading-snug transition-colors duration-150 ${
            open ? "text-primary" : "text-foreground"
          }`}
        >
          {item.question}
        </span>
        <span
          className={`mt-0.5 flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-150 ${
            open
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {open ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </span>
      </button>

      <div
        id={answerId}
        role="region"
        aria-labelledby={undefined}
        hidden={!open}
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-[600px]" : "max-h-0"}`}
      >
        <p className="px-5 pb-5 text-sm font-body text-muted-foreground leading-relaxed">
          {item.answer}
        </p>
      </div>
    </div>
  );
}
