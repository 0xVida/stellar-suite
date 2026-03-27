import { type ComponentType, useMemo, useState } from "react";
import { Check, Copy, Download, FileCode2, FolderPlus, Github, Gitlab } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { mergeFileNodes } from "@/lib/file-drop";
import { type CiProvider, generateCiTemplate, inferCiProjectInfo } from "@/lib/ciTemplates";
import type { FileNode } from "@/lib/sample-contracts";
import { useFileStore } from "@/store/useFileStore";

interface CiConfigGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProviderOption {
  id: CiProvider;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const providerOptions: ProviderOption[] = [
  {
    id: "github",
    label: "GitHub Actions",
    description: "Saves to .github/workflows/ci.yml",
    icon: Github,
  },
  {
    id: "gitlab",
    label: "GitLab CI",
    description: "Saves to .gitlab-ci.yml",
    icon: Gitlab,
  },
  {
    id: "circleci",
    label: "CircleCI",
    description: "Saves to .circleci/config.yml",
    icon: FileCode2,
  },
];

const languageForPath = (path: string): FileNode["language"] => {
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  return "text";
};

const buildIncomingTree = (path: string, content: string): FileNode[] => {
  const pathParts = path.split("/").filter(Boolean);
  if (pathParts.length === 0) return [];

  const fileName = pathParts[pathParts.length - 1];
  const folders = pathParts.slice(0, -1);
  const fileNode: FileNode = {
    name: fileName,
    type: "file",
    content,
    language: languageForPath(path),
  };

  if (folders.length === 0) return [fileNode];

  const root: FileNode[] = [];
  let cursor = root;

  folders.forEach((folderName, index) => {
    const folderNode: FileNode = { name: folderName, type: "folder", children: [] };
    cursor.push(folderNode);

    if (index === folders.length - 1) {
      folderNode.children?.push(fileNode);
    }

    cursor = folderNode.children ?? [];
  });

  return root;
};

const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function CiConfigGenerator({ open, onOpenChange }: CiConfigGeneratorProps) {
  const [provider, setProvider] = useState<CiProvider>("github");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const files = useFileStore((state) => state.files);
  const setFiles = useFileStore((state) => state.setFiles);

  const projectInfo = useMemo(() => inferCiProjectInfo(files), [files]);
  const template = useMemo(() => generateCiTemplate(provider, projectInfo), [provider, projectInfo]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template.content);
      setCopied(true);
      toast.success("CI config copied to clipboard.");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Unable to copy CI config.");
    }
  };

  const handleDownload = () => {
    downloadTextFile(template.filename, template.content);
    toast.success(`Downloaded ${template.filename}`);
  };

  const handleSaveToWorkspace = () => {
    try {
      setIsSaving(true);
      const incoming = buildIncomingTree(template.path, template.content);
      const merged = mergeFileNodes(files, incoming);
      setFiles(merged);
      toast.success(`Saved to ${template.path}`);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save CI file.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" />
            Export CI Config
          </DialogTitle>
          <DialogDescription>
            Generate production-ready CI YAML for Soroban with build, test, clippy, rustfmt, and caching.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider</h3>
            <RadioGroup value={provider} onValueChange={(value) => setProvider(value as CiProvider)} className="space-y-2">
              {providerOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Label
                    key={option.id}
                    htmlFor={`ci-provider-${option.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background px-3 py-2.5 hover:border-primary/50"
                  >
                    <RadioGroupItem id={`ci-provider-${option.id}`} value={option.id} className="mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Icon className="h-4 w-4 text-primary" />
                        {option.label}
                      </div>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </Label>
                );
              })}
            </RadioGroup>

            <div className="rounded-md border border-border bg-background p-2.5">
              <p className="text-[11px] text-muted-foreground">
                Detected contracts: <span className="font-mono text-foreground">{projectInfo.contractNames.join(", ")}</span>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Target path: <span className="font-mono text-foreground">{template.path}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>
            <pre className="max-h-[52vh] overflow-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {template.content}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSaveToWorkspace} disabled={isSaving} className="gap-2">
            <FolderPlus className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save To Workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
