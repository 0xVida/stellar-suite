"use client";

import { create } from "zustand";
import type { ProjectMeta, ProjectTag } from "@/lib/cloud/cloudSyncService";

interface ProjectsStore {
  projects: ProjectMeta[];
  selectedTags: ProjectTag[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;

  // Actions
  setProjects: (projects: ProjectMeta[]) => void;
  setSelectedTags: (tags: ProjectTag[]) => void;
  toggleTag: (tag: ProjectTag) => void;
  setSearchQuery: (query: string) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Computed
  filteredProjects: () => ProjectMeta[];
}

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  projects: [],
  selectedTags: [],
  searchQuery: "",
  isLoading: false,
  error: null,

  setProjects: (projects) => set({ projects }),
  setSelectedTags: (tags) => set({ selectedTags: tags }),
  toggleTag: (tag) => {
    const { selectedTags } = get();
    const exists = selectedTags.some((t) => t.id === tag.id);
    if (exists) {
      set({ selectedTags: selectedTags.filter((t) => t.id !== tag.id) });
    } else {
      set({ selectedTags: [...selectedTags, tag] });
    }
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  filteredProjects: () => {
    const { projects, selectedTags, searchQuery } = get();

    return projects.filter((project) => {
      // Search by name or ID
      const matchesSearch =
        !searchQuery ||
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.id.toLowerCase().includes(searchQuery.toLowerCase());

      // Filter by tags
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((selectedTag) =>
          project.tags?.some((tag) => tag.id === selectedTag.id),
        );

      return matchesSearch && matchesTags;
    });
  },
}));

/**
 * Get all unique tags across all projects
 */
export function getAllProjectTags(projects: ProjectMeta[]): ProjectTag[] {
  const tagMap = new Map<string, ProjectTag>();

  projects.forEach((project) => {
    project.tags?.forEach((tag) => {
      if (!tagMap.has(tag.id)) {
        tagMap.set(tag.id, tag);
      }
    });
  });

  return Array.from(tagMap.values());
}

/**
 * Get count of projects for each tag
 */
export function getTagCounts(
  projects: ProjectMeta[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  projects.forEach((project) => {
    project.tags?.forEach((tag) => {
      counts[tag.id] = (counts[tag.id] || 0) + 1;
    });
  });

  return counts;
}
