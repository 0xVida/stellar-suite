import { useState } from "react";
import { Code2, Coins, Hash, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type ProjectTemplate, templateRegistry } from "@/lib/templateRegistry";
import type { FileNode } from "@/lib/sample-contracts";
import { useWorkspaceStore } from "@/store/workspaceStore";

interface StarterProjectWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const templateIcons: Record<string, typeof Code2> = {
  "hello-world": Code2,
  token: Coins,
  counter: Hash,
};

function findFirstFile(nodes: FileNode[]): string[] | null {
  for (const node of nodes) {
    if (node.type === "file" && node.language === "rust") {
      return [node.name];
    }
    if (node.type === "folder" && node.children) {
      const found = findFirstFile(node.children);
      if (found) return [node.name, ...found];
    }
  }
  return null;
}

export function StarterProjectWizard({
  open,
  onOpenChange,
}: StarterProjectWizardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const { setFiles, addTab, setActiveTabPath } = useWorkspaceStore();

  const handleCreate = () => {
    const template = templateRegistry.find((t) => t.id === selected);
    if (!template) return;

    setFiles(JSON.parse(JSON.stringify(template.files)));

    const firstFile = findFirstFile(template.files);
    if (firstFile) {
      addTab(firstFile, firstFile[firstFile.length - 1]);
      setActiveTabPath(firstFile);
    }

    toast.success(`Created "${template.name}" project`);
    onOpenChange(false);
    setSelected(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Start from Template</DialogTitle>
          <DialogDescription>
            Choose a Soroban starter project to populate your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {templateRegistry.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selected === template.id}
              onSelect={() => setSelected(template.id)}
            />
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button onClick={handleCreate} disabled={!selected}>
            <Rocket className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: ProjectTemplate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = templateIcons[template.id] ?? Code2;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-start gap-4 rounded-lg border p-4 text-left transition-all ${
        isSelected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border hover:border-muted-foreground/40 hover:bg-muted/50"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="font-medium leading-none">{template.name}</p>
        <p className="mt-1.5 text-sm text-muted-foreground leading-snug">
          {template.description}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {template.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </button>
  );
}
