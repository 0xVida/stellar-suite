"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, Plus, Tag, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { ProjectTag } from "@/lib/cloud/cloudSyncService";

export const TAG_COLORS = [
  "blue",
  "green",
  "red",
  "purple",
  "yellow",
  "pink",
  "indigo",
  "cyan",
] as const;

interface TagManagerProps {
  tags: ProjectTag[];
  onTagsChange: (tags: ProjectTag[]) => void;
  maxTags?: number;
}

const colorClasses: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  blue: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    border: "border-blue-300",
  },
  green: {
    bg: "bg-green-100",
    text: "text-green-700",
    border: "border-green-300",
  },
  red: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
  purple: {
    bg: "bg-purple-100",
    text: "text-purple-700",
    border: "border-purple-300",
  },
  yellow: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    border: "border-yellow-300",
  },
  pink: { bg: "bg-pink-100", text: "text-pink-700", border: "border-pink-300" },
  indigo: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    border: "border-indigo-300",
  },
  cyan: { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-300" },
};

export const TagBadge: React.FC<{
  tag: ProjectTag;
  onRemove?: (tagId: string) => void;
  interactive?: boolean;
}> = ({ tag, onRemove, interactive = true }) => {
  const colors = colorClasses[tag.color] || colorClasses.blue;

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}
    >
      <Tag className="w-3 h-3" />
      <span>{tag.name}</span>
      {interactive && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag.id);
          }}
          className="ml-1 hover:opacity-70 transition-opacity"
          title={`Remove ${tag.name} tag`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

export function TagManager({
  tags,
  onTagsChange,
  maxTags = 5,
}: TagManagerProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedColor, setSelectedColor] = useState<
    "blue" | "green" | "red" | "purple" | "yellow" | "pink" | "indigo" | "cyan"
  >("blue");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleAddTag = () => {
    if (inputValue.trim() && tags.length < maxTags) {
      const newTag: ProjectTag = {
        id: `tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: inputValue.trim(),
        color: selectedColor,
      };
      onTagsChange([...tags, newTag]);
      setInputValue("");
      setSelectedColor("blue");
    }
  };

  const handleRemoveTag = (tagId: string) => {
    onTagsChange(tags.filter((t) => t.id !== tagId));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const canAddMore = tags.length < maxTags;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <TagBadge
            key={tag.id}
            tag={tag}
            onRemove={handleRemoveTag}
            interactive={true}
          />
        ))}
      </div>

      {canAddMore && (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-fit gap-1"
              disabled={!canAddMore}
            >
              <Plus className="w-4 h-4" />
              Add Tag
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <div className="p-3 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Tag Name
                </label>
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., DeFi"
                  className="mt-1 text-sm"
                  maxLength={20}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Color
                </label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {TAG_COLORS.map((color) => {
                    const colors = colorClasses[color];
                    return (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`w-8 h-8 rounded-lg border-2 transition-all ${
                          selectedColor === color
                            ? `${colors.border} border-2`
                            : "border-transparent opacity-60 hover:opacity-100"
                        } ${colors.bg}`}
                        title={color}
                      />
                    );
                  })}
                </div>
              </div>

              <Button
                onClick={handleAddTag}
                disabled={!inputValue.trim()}
                size="sm"
                className="w-full"
              >
                <Zap className="w-4 h-4" />
                Add Tag
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {!canAddMore && (
        <p className="text-xs text-muted-foreground">
          Maximum {maxTags} tags allowed
        </p>
      )}
    </div>
  );
}
