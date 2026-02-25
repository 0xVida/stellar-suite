"use client";

import { useState } from "react";

interface Tab {
  label: string;
  content: React.ReactNode;
}

interface TabSwitcherProps {
  tabs: Tab[];
  defaultIndex?: number;
}

export function TabSwitcher({ tabs, defaultIndex = 0 }: TabSwitcherProps) {
  const [active, setActive] = useState(defaultIndex);

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-border-subtle pb-px">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActive(i)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
              i === active
                ? "border-b-2 border-electric-cyan text-electric-cyan"
                : "text-muted-silver hover:text-stardust-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-4">{tabs[active]?.content}</div>
    </div>
  );
}
