"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const START = 20;
const MID = 75;
const DONE = 100;

export default function RouteTopLoader() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    setProgress(START);

    const midTimer = setTimeout(() => setProgress(MID), 180);
    const doneTimer = setTimeout(() => setProgress(DONE), 480);
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 760);

    return () => {
      clearTimeout(midTimer);
      clearTimeout(doneTimer);
      clearTimeout(hideTimer);
    };
  }, [pathname]);

  return (
    <div className="fixed left-0 right-0 top-0 z-[60] pointer-events-none">
      <div
        className="h-[3px] bg-primary transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
