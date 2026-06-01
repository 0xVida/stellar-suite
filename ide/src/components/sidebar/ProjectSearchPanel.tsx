"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Search, Tag, ExternalLink } from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TagBadge } from "@/components/projects/TagManager";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface ProjectSearchResult {
  type: "project";
  id: string;
  name: string;
  network: string;
  tags: any[];
}

export function ProjectSearchPanel() {
  const { projects } = useProjects();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  const results = useMemo(() => {
    const filtered = projects.filter((project) => {
      const matchesQuery =
        !debouncedQuery ||
        project.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        project.id.toLowerCase().includes(debouncedQuery.toLowerCase());

      const matchesTag =
        !selectedTag ||
        project.tags?.some((tag) => tag.id === selectedTag);

      return matchesQuery && matchesTag;
    });

    return filtered.slice(0, 10); // Limit to 10 results
  }, [debouncedQuery, selectedTag, projects]);

  if (projects.length === 0) {
    return null;
  }

  return (
    <div className="border-b bg-sidebar p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Tag className="w-3 h-3" />
        <span>Search Projects</span>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search projects..."
          className="h-7 pl-7 pr-2 text-xs"
        />
      </div>

      {results.length > 0 && (
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
          {results.map((project) => (
            <div
              key={project.id}
              className="p-2 hover:bg-sidebar-accent rounded cursor-pointer transition-colors group"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-medium truncate">
                  {project.name}
                </span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0" />
              </div>
              {project.tags && project.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {project.tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => setSelectedTag(tag.id)}
                      className="text-[10px]"
                    >
                      <TagBadge tag={tag} interactive={false} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Export function to search projects by tag
 */
export function searchProjectsByTag(
  projects: any[],
  tagId: string,
): ProjectSearchResult[] {
  return projects
    .filter((project) => project.tags?.some((tag: any) => tag.id === tagId))
    .map((project) => ({
      type: "project" as const,
      id: project.id,
      name: project.name,
      network: project.network,
      tags: project.tags,
    }));
}
