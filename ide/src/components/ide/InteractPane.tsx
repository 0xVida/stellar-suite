import React, { useState } from "react";
import { FunctionSpec } from "@/lib/contractAbiParser";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { DynamicFormBuilder } from "./DynamicFormBuilder";
import { buildArgsJson } from "@/lib/invokeUtils";
import { Rocket, Info, Calculator, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface InteractPaneProps {
  functions: FunctionSpec[];
  onInvoke: (fnName: string, args: string) => void;
  invokeState?: {
    phase: "idle" | "preparing" | "signing" | "submitting" | "confirming" | "success" | "failed";
    message: string;
  };
  contractId: string | null;
  activeContext: any;
}

/**
 * InteractPane displays an accordion of all contract functions.
 * Each function expands to show typed input fields via DynamicFormBuilder.
 */
export function InteractPane({ functions, onInvoke, invokeState, contractId, activeContext }: InteractPaneProps) {
  const [argValues, setArgValues] = useState<Record<string, Record<string, string>>>({});
  const [activeItem, setActiveItem] = useState<string | undefined>(undefined);

  const handleArgChange = (fnName: string, argName: string, value: string) => {
    setArgValues((prev) => ({
      ...prev,
      [fnName]: {
        ...(prev[fnName] || {}),
        [argName]: value,
      },
    }));
  };

  const handleRun = (fn: FunctionSpec) => {
    if (!contractId) {
      toast.error("No contract ID available. Please deploy or provide a contract ID.");
      return;
    }
    if (!activeContext) {
      toast.error("Please select a signing identity in the Identity Manager.");
      return;
    }

    // Basic validation
    const missingFields = fn.inputs
      .filter((input) => input.required && !(argValues[fn.name]?.[input.name]?.trim()))
      .map((input) => input.name);

    if (missingFields.length > 0) {
      toast.warning(`Required fields missing: ${missingFields.join(", ")}`);
      return;
    }

    const argsJson = buildArgsJson(fn.inputs, argValues[fn.name] || {});
    onInvoke(fn.name, argsJson);
  };

  if (functions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-4 opacity-70 animate-in fade-in duration-500">
        <div className="p-4 bg-muted/50 rounded-2xl shadow-inner border border-border/50">
          <TerminalSquare className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <div className="max-w-[200px]">
          <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/80">No Methods</h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-2">
            Contract ABI hasn't been parsed yet. Click <strong>Parse Contract ABI</strong> below to load available methods.
          </p>
        </div>
      </div>
    );
  }

  // Logical grouping: group by mutability then name
  const sortedFunctions = [...functions].sort((a, b) => {
    if (a.mutability === b.mutability) return a.name.localeCompare(b.name);
    return a.mutability === 'readonly' ? -1 : 1;
  });

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mt-2">
          Contract Methods
        </h3>
        <Badge variant="outline" className="text-[9px] px-2 h-4 font-mono bg-muted/40 border-border/50 text-muted-foreground/80">
          {functions.length}
        </Badge>
      </div>

      <Accordion 
        type="single" 
        collapsible 
        value={activeItem}
        onValueChange={setActiveItem}
        className="w-full space-y-2"
      >
        {sortedFunctions.map((fn) => {
          const isRead = fn.mutability === 'readonly';
          const isRunning = invokeState?.phase === 'confirming' && invokeState.message.includes(fn.name);
          
          return (
            <AccordionItem 
              key={fn.name} 
              value={fn.name} 
              className="border border-border/60 rounded-lg overflow-hidden bg-muted/5 transition-all duration-200 hover:bg-muted/10 data-[state=open]:bg-muted/20 data-[state=open]:border-primary/20"
            >
              <AccordionTrigger className="hover:no-underline py-3 px-3 group">
                <div className="flex items-center justify-between w-full pr-2">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md shadow-sm transition-colors ${
                      isRead 
                        ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' 
                        : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                    }`}>
                      {isRead ? <Calculator className="h-3.5 w-3.5" /> : <Rocket className="h-3.5 w-3.5" />}
                    </div>
                    <div className="text-left">
                        <span className="text-xs font-mono font-bold block truncate max-w-[140px] group-hover:text-primary transition-all">
                            {fn.name}
                        </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                        variant="secondary" 
                        className={`text-[8px] font-black uppercase tracking-tighter px-1 h-3.5 rounded-sm border ${
                            isRead 
                                ? 'bg-blue-500/5 text-blue-500 border-blue-500/10' 
                                : 'bg-orange-500/5 text-orange-500 border-orange-500/10'
                        }`}
                    >
                        {isRead ? 'Query' : 'Invoke'}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-4 pt-1 space-y-4">
                {fn.doc && (
                  <div className="text-[10px] text-muted-foreground leading-relaxed bg-background/40 p-2.5 rounded-md border-l-2 border-primary/40 italic">
                    {fn.doc}
                  </div>
                )}
                
                <div className="px-1">
                    <DynamicFormBuilder 
                        inputs={fn.inputs} 
                        values={argValues[fn.name] || {}} 
                        onChange={(argName, val) => handleArgChange(fn.name, argName, val)} 
                    />
                </div>
                
                <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-between">
                  <div className="text-[9px] text-muted-foreground/40 font-mono tracking-tight bg-muted/30 px-1.5 py-0.5 rounded">
                    {fn.inputs.length} param{fn.inputs.length === 1 ? '' : 's'}
                  </div>
                  <Button 
                    onClick={(e) => {
                        e.stopPropagation();
                        handleRun(fn);
                    }}
                    size="sm"
                    className={`h-8 text-[11px] font-black uppercase tracking-wider px-5 shadow-lg transition-all active:scale-95 ${
                        isRead 
                          ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20' 
                          : 'bg-primary hover:bg-primary/90 shadow-primary/20'
                    }`}
                    disabled={isRunning || (invokeState?.phase && invokeState.phase !== 'idle' && invokeState.phase !== 'success' && invokeState.phase !== 'failed')}
                  >
                    {isRunning ? (
                        <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Running
                        </div>
                    ) : (
                        <>
                            <Rocket className="h-3 w-3 mr-2" />
                            {isRead ? "Simulate" : "Execute"}
                        </>
                    )}
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
