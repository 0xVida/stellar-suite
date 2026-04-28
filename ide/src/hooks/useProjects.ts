"use client";

import { useEffect, useCallback } from "react";
import { useProjectsStore } from "@/store/useProjectsStore";
import { listProjects, saveProject } from "@/lib/cloud/cloudSyncService";
import type { ProjectMeta, ProjectTag } from "@/lib/cloud/cloudSyncService";

export function useProjects() {
  const {
    projects,
    selectedTags,
    searchQuery,
    isLoading,
    error,
    setProjects,
    setIsLoading,
    setError,
    filteredProjects,
    toggleTag,
    setSelectedTags,
    setSearchQuery,
  } = useProjectsStore();

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load projects";
      setError(message);
      console.error("Failed to load projects:", err);
    } finally {
      setIsLoading(false);
    }
  }, [setProjects, setIsLoading, setError]);

  const updateProjectTags = useCallback(
    async (project: ProjectMeta, newTags: ProjectTag[]) => {
      try {
        const updatedProject = { ...project, tags: newTags };
        // Update local state optimistically
        setProjects(
          projects.map((p) => (p.id === project.id ? updatedProject : p)),
        );
        // Note: You would need to add an updateProject endpoint or use saveProject
        // For now, we're just updating the UI
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update tags";
        setError(message);
        console.error("Failed to update tags:", err);
      }
    },
    [projects, setProjects, setError],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      try {
        // Make API call to delete
        await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
        setProjects(projects.filter((p) => p.id !== projectId));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete project";
        setError(message);
        console.error("Failed to delete project:", err);
      }
    },
    [projects, setProjects, setError],
  );

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    projects,
    filteredProjects: filteredProjects(),
    selectedTags,
    searchQuery,
    isLoading,
    error,
    loadProjects,
    updateProjectTags,
    deleteProject,
    toggleTag,
    setSelectedTags,
    setSearchQuery,
  };
}
