"use client";

import { useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectsStore } from "@/store/useProjectsStore";
import { listProjects } from "@/lib/cloud/cloudSyncService";
import type { ProjectMeta, ProjectTag } from "@/lib/cloud/cloudSyncService";

export function useProjects() {
  const queryClient = useQueryClient();

  const {
    projects,
    selectedTags,
    searchQuery,
    setProjects,
    filteredProjects,
    toggleTag,
    setSelectedTags,
    setSearchQuery,
  } = useProjectsStore();

  const { data: queryProjects = [], isLoading, error: queryError, refetch: loadProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  // Synchronize React Query list to the local store
  useEffect(() => {
    if (queryProjects) {
      setProjects(queryProjects);
    }
  }, [queryProjects, setProjects]);

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Failed to delete project");
      }
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setProjects(projects.filter((p) => p.id !== projectId));
    },
  });

  const updateProjectTags = useCallback(
    async (project: ProjectMeta, newTags: ProjectTag[]) => {
      const updatedProject = { ...project, tags: newTags };
      setProjects(
        projects.map((p) => (p.id === project.id ? updatedProject : p)),
      );
    },
    [projects, setProjects],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      await deleteMutation.mutateAsync(projectId);
    },
    [deleteMutation],
  );

  const error = queryError instanceof Error ? queryError.message : queryError ? "Failed to load projects" : null;

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
