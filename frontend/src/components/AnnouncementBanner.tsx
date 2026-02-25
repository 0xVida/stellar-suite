"use client";

import { X } from "lucide-react";
import { useState } from "react";

const AnnouncementBanner = () => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="fixed top-[65px] left-0 right-0 z-40 bg-banner text-banner-foreground" role="region" aria-label="Announcement">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-center gap-3 px-6 py-2.5 relative">
        <span className="text-sm text-center sm:text-left">
          It&apos;s here: Stellar Suite 1.0 — build, deploy & simulate from VS Code.
        </span>
        <a
          href="#features"
          className="inline-flex min-h-[32px] items-center justify-center rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity w-full sm:w-auto"
        >
          Learn more
        </a>
        <button
          onClick={() => setVisible(false)}
          className="absolute right-6 top-2 sm:top-1/2 sm:-translate-y-1/2 text-banner-foreground/60 hover:text-banner-foreground transition-colors"
          aria-label="Dismiss announcement"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default AnnouncementBanner;
