"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Rocket, Zap, Accessibility, Sparkles, Check } from "lucide-react";

export function ReleaseNotes() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("1.0.0");

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const response = await fetch("/api/version"); // Assuming we have or build an API or we could just use process.env.npm_package_version which is undefined in browser so let's import package.json using dynamic import.
        const pkg = await import("../../../package.json");
        const currentVersion = pkg.version;
        setVersion(currentVersion);

        const lastSeen = localStorage.getItem("ide_last_seen_version");
        if (lastSeen !== currentVersion) {
            setOpen(true);
        }
      } catch (err) {
        // Fallback if import fails
      }
    };
    void checkVersion();
  }, []);

  const handleDismiss = () => {
    setOpen(false);
  };

  const handleDoNotShowAgain = () => {
    localStorage.setItem("ide_last_seen_version", version);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl bg-background border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            What's New in {version}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            We've made some exciting updates to the Soroban IDE!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex gap-4">
            <div className="p-2 h-max rounded-full bg-primary/20 text-primary">
              <Accessibility className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-base mb-1 text-foreground">Accessibility Sweep & Focus</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Full keyboard navigation support, improved screen reader compatibility with rich ARIA labels, 
                and higher contrast ratios across the entire IDE. Experience our 'Skip to Main Content' utility
                built perfectly for power users.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="p-2 h-max rounded-full bg-success/20 text-success">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-base mb-1 text-foreground">Diagnostics Dashboard (IDE Health)</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A highly-requested performance profiler metric dashboard has been added. Open your Settings 
                and select "Diagnostics" to view live Frame Rate (FPS) tracking and JS Heap memory size over time.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="p-2 h-max rounded-full bg-warning/20 text-warning">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-base mb-1 text-foreground">Release Notes Modal</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This very modal! Keeps you connected to the latest tools, improvements, and features 
                added with every major and minor version upgrade.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center sm:justify-between border-t border-border pt-4">
          <Button variant="ghost" onClick={handleDismiss} className="text-muted-foreground">
            Dismiss
          </Button>
          <Button onClick={handleDoNotShowAgain} className="bg-primary text-primary-foreground hover:bg-primary/90 flex gap-2">
            <Check className="h-4 w-4" /> Do not show again for this version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
