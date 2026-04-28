import { Hammer, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type BuildState = "idle" | "building" | "success" | "error";

interface BuildButtonProps {
  onClick: () => void;
  isBuilding: boolean;
  state?: BuildState;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}

const buildStateCopy: Record<BuildState, string> = {
  idle: "Build contract (Cmd/Ctrl+B)",
  building: "Building contract...",
  success: "Last build succeeded",
  error: "Last build failed",
};

export function BuildButton({
  onClick,
  isBuilding,
  state = "idle",
  className,
  compact = false,
  disabled = false,
}: BuildButtonProps) {
  const variantClassName =
    state === "success"
      ? "bg-emerald-600 text-white hover:bg-emerald-500"
      : state === "error"
        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
        : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          id="tour-build-btn"
          type="button"
          onClick={onClick}
          disabled={isBuilding || !!disabled}
          aria-label="Build contract"
          aria-busy={isBuilding}
          title={buildStateCopy[state]}
          className={cn(
            "shadow-sm shadow-black/10",
            variantClassName,
            compact ? "h-8 gap-1.5 px-2.5 text-[11px]" : "h-9 gap-2 px-4 text-xs",
            className
          )}
        >
          {isBuilding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Hammer className="h-4 w-4" />
          )}
          <span>{isBuilding ? "Building..." : "Build"}</span>
          {!compact && <span className="hidden font-mono text-[10px] opacity-80 lg:inline">Cmd/Ctrl+B</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{buildStateCopy[state]}</TooltipContent>
    </Tooltip>
  );
}
