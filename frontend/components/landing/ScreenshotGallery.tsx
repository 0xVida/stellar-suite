"use client";

import { useState } from "react";
import Image from "next/image";
import { Section, SectionHeader } from "@/components/ui/Section";
import { Modal } from "@/components/ui/Modal";

const SCREENSHOTS = [
  {
    src: "/images/screenshot.png",
    alt: "Stellar Kit sidebar showing contract management",
    caption: "Interactive sidebar with contract discovery and quick actions",
  },
];

export function ScreenshotGallery() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (SCREENSHOTS.length === 0) return null;

  return (
    <Section dark>
      <SectionHeader
        title="Built for developer experience"
        subtitle="A clean, focused interface designed to keep you in the flow."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SCREENSHOTS.map((shot, i) => (
          <button
            key={shot.src}
            onClick={() => setSelectedIndex(i)}
            className="group overflow-hidden rounded-[var(--radius)] border border-border-subtle transition-colors hover:border-electric-cyan/20"
          >
            <Image
              src={shot.src}
              alt={shot.alt}
              width={600}
              height={400}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <div className="bg-slate-gray/30 px-3 py-2 text-left text-xs text-muted-silver">
              {shot.caption}
            </div>
          </button>
        ))}
      </div>

      <Modal
        isOpen={selectedIndex !== null}
        onClose={() => setSelectedIndex(null)}
      >
        {selectedIndex !== null && (
          <Image
            src={SCREENSHOTS[selectedIndex].src}
            alt={SCREENSHOTS[selectedIndex].alt}
            width={1200}
            height={800}
            sizes="90vw"
            className="rounded-[var(--radius)]"
          />
        )}
      </Modal>
    </Section>
  );
}
