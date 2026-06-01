"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TagManager } from "./TagManager";
import type { ProjectMeta, ProjectTag } from "@/lib/cloud/cloudSyncService";

interface TagsEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectMeta;
  onSave: (tags: ProjectTag[]) => void;
}

export function TagsEditModal({
  open,
  onOpenChange,
  project,
  onSave,
}: TagsEditModalProps) {
  const [tags, setTags] = useState<ProjectTag[]>(project.tags || []);

  useEffect(() => {
    setTags(project.tags || []);
  }, [project, open]);

  const handleSave = () => {
    onSave(tags);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Project Tags</DialogTitle>
          <DialogDescription>
            Manage tags for "{project.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <TagManager tags={tags} onTagsChange={setTags} maxTags={5} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
