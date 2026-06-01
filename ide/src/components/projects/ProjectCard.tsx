"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Network, Calendar, Edit2, Plus, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { TagBadge } from "./TagManager";
import type { ProjectMeta } from "@/lib/cloud/cloudSyncService";
import { formatDistanceToNow } from "date-fns";

interface ProjectCardProps {
  project: any; // Mapped ProjectMeta with deleted_at/daysRemaining
  onOpen?: (projectId: string) => void;
  onEditTags?: (project: ProjectMeta) => void;
  onDelete?: (projectId: string) => void;
  onRestore?: (projectId: string) => void;
  isTrash?: boolean;
  isSelected?: boolean;
}

export function ProjectCard({
  project,
  onOpen,
  onEditTags,
  onDelete,
  onRestore,
  isTrash = false,
  isSelected = false,
}: ProjectCardProps) {
  const [isHovering, setIsHovering] = useState(false);

  const updatedDate = new Date(project.updatedAt || project.updated_at);
  const timeAgo = formatDistanceToNow(updatedDate, { addSuffix: true });

  // Calculate days remaining if soft deleted
  let daysRemaining = 30;
  if (project.deletedAt) {
    const deletedTime = new Date(project.deletedAt).getTime();
    const elapsedDays = (Date.now() - deletedTime) / (1000 * 60 * 60 * 24);
    daysRemaining = Math.max(0, 30 - Math.floor(elapsedDays));
  }

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-lg relative overflow-hidden flex flex-col justify-between h-[210px] ${
        isSelected ? "ring-2 ring-blue-500" : ""
      } ${isTrash ? "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10" : ""}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={() => {
        if (!isTrash) {
          onOpen?.(project.id);
        }
      }}
    >
      <div>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-start justify-between gap-1">
            <div className="flex-1 min-w-0">
              <CardTitle className="truncate text-base font-bold text-foreground">{project.name}</CardTitle>
              <CardDescription className="text-[10px] font-mono text-muted-foreground mt-0.5">
                ID: {project.id.slice(0, 8)}...
              </CardDescription>
            </div>
            
            {/* Action buttons (only show on hover or for tag edits) */}
            {!isTrash && (
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {onEditTags && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7 hover:bg-muted"
                    onClick={() => onEditTags(project)}
                    title="Add or edit tags"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(project.id)}
                    title="Move to trash"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-2 px-4 pb-2 text-xs">
          {isTrash && (
            <div className="flex items-center gap-1.5 text-amber-500 font-semibold mb-2 bg-amber-500/10 rounded-md p-1.5 text-[10px]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining in Trash</span>
            </div>
          )}

          {/* Project Metadata */}
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Network className="w-3.5 h-3.5" />
              <span className="capitalize">{project.network}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              <span>{project.fileCount} file(s)</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>Updated {timeAgo}</span>
            </div>
          </div>
        </CardContent>
      </div>

      {/* Footer / Tags & Trash action panel */}
      <div className="px-4 pb-3 pt-2 border-t border-border/40 mt-auto flex items-center justify-between shrink-0" onClick={(e) => e.stopPropagation()}>
        {isTrash ? (
          <div className="flex w-full gap-2 justify-end">
            {onRestore && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] gap-1 px-2.5"
                onClick={() => onRestore(project.id)}
              >
                <RotateCcw className="w-3 h-3" />
                Restore
              </Button>
            )}
            {onDelete && (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-[10px] gap-1 px-2.5 bg-red-600 hover:bg-red-700"
                onClick={() => onDelete(project.id)}
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
            {project.tags && project.tags.length > 0 ? (
              project.tags.map((tag: any) => (
                <TagBadge key={tag.id} tag={tag} interactive={false} />
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground/40 italic">No tags</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
