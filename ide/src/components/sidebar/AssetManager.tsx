import React, { useMemo, useState } from "react";
import {
  FileImage,
  Info,
  Search,
  Maximize2,
  ChevronDown,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { FileNode } from "@/lib/sample-contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Asset {
  name: string;
  path: string[];
  type: string;
  size: number;
  content: string;
  dimensions?: string;
}

export function AssetManager() {
  const { files } = useWorkspaceStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Recursively find all "assets" (files with image/svg extensions)
  const allAssets = useMemo(() => {
    const assets: Asset[] = [];
    const traverse = (nodes: FileNode[], path: string[] = []) => {
      for (const node of nodes) {
        const currentPath = [...path, node.name];
        if (node.type === "folder" && node.children) {
          traverse(node.children, currentPath);
        } else if (node.type === "file") {
          const extension = node.name.split(".").pop()?.toLowerCase();
          if (
            ["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(
              extension || "",
            )
          ) {
            assets.push({
              name: node.name,
              path: currentPath,
              type: extension || "unknown",
              size: node.content?.length || 0, // Simplified size estimation
              content: node.content || "",
              dimensions: extension === "svg" ? "Vector" : "512 x 512", // Mock dimensions
            });
          }
        }
      }
    };
    traverse(files);
    return assets;
  }, [files]);

  const filteredAssets = useMemo(() => {
    return allAssets.filter((a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [allAssets, searchQuery]);

  const renderThumbnail = (asset: Asset) => {
    if (asset.type === "svg") {
      return (
        <div
          className="w-full h-full flex items-center justify-center p-2 bg-muted/20 overflow-hidden"
          dangerouslySetInnerHTML={{ __html: asset.content }}
        />
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30">
        <FileImage className="h-8 w-8 text-muted-foreground/50" />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-border overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <FileImage className="h-4 w-4 text-primary" />
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Assets
          </h2>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary transition-colors z-10" />
          <Input
            type="text"
            placeholder="Search assets..."
            className="h-8 pl-8 text-[11px] bg-muted/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid View */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-[11px]">No assets found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredAssets.map((asset) => (
              <button
                key={asset.path.join("/")}
                onClick={() =>
                  setSelectedAsset(
                    selectedAsset?.path.join("/") === asset.path.join("/")
                      ? null
                      : asset,
                  )
                }
                className={`group relative aspect-square rounded-md border transition-all overflow-hidden ${
                  selectedAsset?.path.join("/") === asset.path.join("/")
                    ? "border-primary ring-1 ring-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50 bg-muted/20"
                }`}
                title={asset.name}
              >
                {renderThumbnail(asset)}
                <div className="absolute inset-x-0 bottom-0 bg-background/80 backdrop-blur-sm p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[9px] truncate font-medium text-foreground">
                    {asset.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Details View */}
      {selectedAsset && (
        <div className="shrink-0 border-t border-border bg-muted/30 animate-in slide-in-from-bottom-2 duration-200">
          <div className="p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3 w-3" /> Asset Details
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedAsset(null)}
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                title="Close details"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-muted-foreground">Name:</span>
                <span className="text-foreground font-medium truncate ml-4 max-w-[120px]">
                  {selectedAsset.name}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-muted-foreground">Type:</span>
                <span className="text-foreground font-medium uppercase">
                  {selectedAsset.type}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-muted-foreground">Dimensions:</span>
                <span className="text-foreground font-medium">
                  {selectedAsset.dimensions}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-muted-foreground">File Size:</span>
                <span className="text-foreground font-medium">
                  {(selectedAsset.size / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="w-full gap-2 text-[10px] font-bold uppercase tracking-wider"
            >
              <Maximize2 className="h-3 w-3" /> Preview Full
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
