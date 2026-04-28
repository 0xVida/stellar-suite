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
import { FileText, Network, Calendar, Edit2 } from "lucide-react";
import { TagBadge } from "./TagManager";
import type { ProjectMeta, ProjectTag } from "@/lib/cloud/cloudSyncService";
import { formatDistanceToNow } from "date-fns";

interface ProjectCardProps {
  project: ProjectMeta;
  onOpen?: (projectId: string) => void;
  onEditTags?: (project: ProjectMeta) => void;
  isSelected?: boolean;
}

export function ProjectCard({
  project,
  onOpen,
  onEditTags,
  isSelected,
}: ProjectCardProps) {
  const [isHovering, setIsHovering] = useState(false);

  const updatedDate = new Date(project.updatedAt);
  const timeAgo = formatDistanceToNow(updatedDate, { addSuffix: true });

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-lg ${
        isSelected ? "ring-2 ring-blue-500" : ""
      }`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={() => onOpen?.(project.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate text-lg">{project.name}</CardTitle>
            <CardDescription className="text-xs mt-1">
              ID: {project.id.slice(0, 8)}...
            </CardDescription>
          </div>
          {isHovering && onEditTags && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onEditTags(project);
              }}
              className="ml-2"
              title="Edit tags"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Project Metadata */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Network className="w-4 h-4" />
            <span className="capitalize">{project.network}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="w-4 h-4" />
            <span>{project.fileCount} file(s)</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>Updated {timeAgo}</span>
          </div>
        </div>

        {/* Tags */}
        {project.tags && project.tags.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Tags
            </p>
            <div className="flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} interactive={false} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
