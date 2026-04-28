import React from "react";
import { FunctionInputSpec } from "@/lib/contractAbiParser";
import { ComplexArgInput } from "./ComplexArgInput";

interface DynamicFormBuilderProps {
  inputs: FunctionInputSpec[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

/**
 * DynamicFormBuilder maps over the inputs of a function and renders the appropriate field.
 * It's "recursive" in the sense that it handles complex types like Vector and Struct
 * through its child components (like ComplexArgInput, VecInput, and StructInput).
 */
export function DynamicFormBuilder({ inputs, values, onChange }: DynamicFormBuilderProps) {
  if (inputs.length === 0) {
    return (
      <div className="py-3 text-center border border-dashed border-border/40 rounded-md bg-muted/10">
        <p className="text-[10px] text-muted-foreground/60 italic">This function takes no arguments.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-1">
      {inputs.map((input) => (
        <div key={input.name} className="animate-in fade-in slide-in-from-top-1 duration-200">
          <ComplexArgInput
            label={input.name}
            type={input.type}
            value={values[input.name] ?? ""}
            onChange={(val) => onChange(input.name, val)}
          />
          {input.required && !values[input.name] && (
            <p className="text-[8px] text-destructive/60 mt-0.5 ml-0.5">* Required</p>
          )}
        </div>
      ))}
    </div>
  );
}
