"use client";

import { useInView } from "@/lib/hooks/use-in-view";

interface SectionProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
}

export function Section({ id, children, className = "", dark }: SectionProps) {
  const [ref, isInView] = useInView();

  return (
    <section
      id={id}
      ref={ref}
      className={`px-6 py-20 md:px-12 lg:py-28 ${
        dark ? "bg-cosmic-navy text-stardust-white" : ""
      } ${className}`}
    >
      <div
        className={`mx-auto max-w-6xl transition-opacity duration-500 ${
          isInView ? "animate-fade-in-up" : "opacity-0"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-12 max-w-2xl">
      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-muted-silver text-base leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
