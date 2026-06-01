"use client";

import React from "react";
import { useInView } from "@/lib/hooks/use-in-view";
import { cn } from "@/lib/utils";

// Stable observer options so the underlying effect only runs once per mount.
const REVEAL_OPTIONS: IntersectionObserverInit = {
  threshold: 0.15,
  rootMargin: "0px 0px -8% 0px",
};

/**
 * Reveals its children with a subtle fade-and-rise as they scroll into view.
 *
 * Uses a single IntersectionObserver (via `useInView`) that unobserves after
 * the first reveal, so it stays cheap. Users with `prefers-reduced-motion` see
 * the content immediately with no transform (handled purely in CSS).
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const [ref, inView] = useInView(REVEAL_OPTIONS);

  return (
    <div
      ref={ref}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={cn(
        "transition-all duration-700 ease-out will-change-[opacity,transform]",
        // Reduced motion: show instantly, no movement.
        "motion-reduce:!translate-y-0 motion-reduce:!opacity-100 motion-reduce:transition-none",
        inView ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
