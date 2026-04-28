"use client";

import React, { useState } from "react";
import { Search, X, Plus, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectCard } from "./ProjectCard";
import { TagBadge } from "./TagManager";
import { TagsEditModal } from "./TagsEditModal";
import { useProjects } from "@/hooks/useProjects";
import { getAllProjectTags, getTagCounts } from "@/store/useProjectsStore";
import type { ProjectMeta } from "@/lib/cloud/cloudSyncService";

export function ProjectsLanding() {
  const {
    projects,
    filteredProjects,
    selectedTags,
    searchQuery,
    isLoading,
    error,
    toggleTag,
    setSearchQuery,
    updateProjectTags,
  } = useProjects();

  const [editingProject, setEditingProject] = useState<ProjectMeta | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const allTags = getAllProjectTags(projects);
  const tagCounts = getTagCounts(projects);

  const handleEditTags = (project: ProjectMeta) => {
    setEditingProject(project);
    setShowEditModal(true);
  };

  const handleSaveTags = (newTags: any[]) => {
    if (editingProject) {
      updateProjectTags(editingProject, newTags);
      setShowEditModal(false);
      setEditingProject(null);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Filter Sidebar */}
      <FilterSidebar
        allTags={allTags}
        selectedTags={selectedTags}
        tagCounts={tagCounts}
        onToggleTag={toggleTag}
        projectCount={filteredProjects.length}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b bg-card p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Projects</h1>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Project
              </Button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search projects by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        {/* Active Filters Display */}
        {selectedTags.length > 0 && (
          <div className="border-b bg-muted/50 p-3 flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">
              Active Filters:
            </span>
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-1"
                  onClick={() => toggleTag(tag)}
                >
                  <TagBadge tag={tag} interactive={true} />
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Clear all filters
              }}
              className="ml-auto"
            >
              Clear All
            </Button>
          </div>
        )}

        {/* Content Area */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {error && (
              <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg">
                {error}
              </div>
            )}

            {isLoading ? (
              <ProjectsGridSkeleton />
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-2">No projects found</p>
                {selectedTags.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Try adjusting your filters
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onOpen={(id) => {
                      // Handle opening project
                      console.log("Opening project:", id);
                    }}
                    onEditTags={handleEditTags}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Edit Tags Modal */}
      {editingProject && (
        <TagsEditModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          project={editingProject}
          onSave={handleSaveTags}
        />
      )}
    </div>
  );
}

interface FilterSidebarProps {
  allTags: any[];
  selectedTags: any[];
  tagCounts: Record<string, number>;
  onToggleTag: (tag: any) => void;
  projectCount: number;
}

function FilterSidebar({
  allTags,
  selectedTags,
  tagCounts,
  onToggleTag,
  projectCount,
}: FilterSidebarProps) {
  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-64 border-r bg-card flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Filters</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {projectCount} project(s)
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Tags Section */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Tags</h3>
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tags yet</p>
              ) : (
                <div className="space-y-2">
                  {allTags.map((tag) => {
                    const isSelected = selectedTags.some((t) => t.id === tag.id);
                    const count = tagCounts[tag.id] || 0;

                    return (
                      <button
                        key={tag.id}
                        onClick={() => onToggleTag(tag)}
                        className={`w-full text-left p-2 rounded-lg transition-colors ${
                          isSelected
                            ? "bg-primary/10"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <TagBadge tag={tag} interactive={false} />
                          <Badge variant="outline" className="text-xs">
                            {count}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Mobile Filter Sheet */}
      <Sheet>
        <SheetTrigger asChild className="lg:hidden absolute top-4 right-4">
          <Button variant="outline" size="icon">
            <Filter className="w-4 h-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-3">Tags</h3>
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tags yet</p>
              ) : (
                <div className="space-y-2">
                  {allTags.map((tag) => {
                    const isSelected = selectedTags.some((t) => t.id === tag.id);
                    const count = tagCounts[tag.id] || 0;

                    return (
                      <button
                        key={tag.id}
                        onClick={() => onToggleTag(tag)}
                        className={`w-full text-left p-2 rounded-lg transition-colors ${
                          isSelected
                            ? "bg-primary/10"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <TagBadge tag={tag} interactive={false} />
                          <Badge variant="outline" className="text-xs">
                            {count}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ProjectsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3 p-4 border rounded-lg">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-20" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
