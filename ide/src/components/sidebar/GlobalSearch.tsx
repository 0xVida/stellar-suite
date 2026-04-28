"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Search, 
  X, 
  ChevronRight, 
  ChevronDown, 
  CaseSensitive, 
  Regex,
  Filter,
  FileText,
  FolderOpen,
  Tag as TagIcon
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { searchWalker, type SearchMatch, type SearchOptions } from "@/utils/searchWalker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useProjects } from "@/hooks/useProjects";
import { TagBadge } from "@/components/projects/TagManager";

export function GlobalSearch() {
  const { files, setActiveTabPath } = useWorkspaceStore();
  const { projects, filteredProjects } = useProjects();
  
  const [query, setQuery] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [includeFiles, setIncludeFiles] = useState("");
  const [excludeFiles, setExcludeFiles] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState("files");
  
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const debouncedQuery = useDebouncedValue(query, 300);
  const debouncedInclude = useDebouncedValue(includeFiles, 300);
  const debouncedExclude = useDebouncedValue(excludeFiles, 300);
  const debouncedProjectQuery = useDebouncedValue(projectSearchQuery, 300);

  useEffect(() => {
    async function performSearch() {
      if (!debouncedQuery) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setError(null);

      const options: SearchOptions = {
        query: debouncedQuery,
        isRegex,
        matchCase,
        includeFiles: debouncedInclude || undefined,
        excludeFiles: debouncedExclude || undefined,
      };

      try {
        const result = await searchWalker(files, options);
        if (result.error) {
          setError(result.error);
        } else {
          setResults(result.matches);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setIsSearching(false);
      }
    }

    performSearch();
  }, [debouncedQuery, debouncedInclude, debouncedExclude, matchCase, isRegex, files]);

  const groupedResults = useMemo(() => {
    const map = new Map<string, SearchMatch[]>();
    for (const match of results) {
      const list = map.get(match.fileId) ?? [];
      list.push(match);
      map.set(match.fileId, list);
    }
    return Array.from(map.entries());
  }, [results]);

  // Filter projects based on search query
  const projectSearchResults = useMemo(() => {
    if (!debouncedProjectQuery) return filteredProjects;
    
    return filteredProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(debouncedProjectQuery.toLowerCase()) ||
        project.id.toLowerCase().includes(debouncedProjectQuery.toLowerCase())
    );
  }, [debouncedProjectQuery, filteredProjects]);

  const clearSearch = () => {
    setQuery("");
    setResults([]);
  };

  const handleResultClick = (match: SearchMatch) => {
    // This is a placeholder for actual navigation logic in the IDE
    // In a real scenario, this would open the file and scroll to the line/column
    setActiveTabPath(match.pathParts);
    // You might also need to trigger a cursor jump, but setActiveTabPath is a good start
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <div className="border-b border-sidebar-border">
          <TabsList className="w-full rounded-none bg-transparent h-auto p-0 border-b border-sidebar-border">
            <TabsTrigger
              value="files"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
            >
              <FileText className="w-4 h-4 mr-2" />
              Files
            </TabsTrigger>
            {projects.length > 0 && (
              <TabsTrigger
                value="projects"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Projects
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* File Search Tab */}
        <TabsContent value="files" className="flex-1 flex flex-col mt-0">
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              File Search
            </h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className={`h-3.5 w-3.5 ${showFilters ? "text-primary" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle Search Filters</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="px-4 pb-2 space-y-2">
            <div className="relative">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files..."
                className="h-8 pr-16 text-xs bg-background/50 border-sidebar-border focus-visible:ring-sidebar-ring"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${matchCase ? "bg-primary/20 text-primary" : ""}`}
                        onClick={() => setMatchCase(!matchCase)}
                      >
                        <CaseSensitive className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Match Case</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${isRegex ? "bg-primary/20 text-primary" : ""}`}
                        onClick={() => setIsRegex(!isRegex)}
                      >
                        <Regex className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Use Regular Expression</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {query && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setQuery("")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground px-1 uppercase">Files to include</label>
                  <Input
                    value={includeFiles}
                    onChange={(e) => setIncludeFiles(e.target.value)}
                    placeholder="e.g. *.ts, src/*"
                    className="h-7 text-[11px] bg-background/30 border-sidebar-border focus-visible:ring-sidebar-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground px-1 uppercase">Files to exclude</label>
                  <Input
                    value={excludeFiles}
                    onChange={(e) => setExcludeFiles(e.target.value)}
                    placeholder="e.g. node_modules, dist"
                    className="h-7 text-[11px] bg-background/30 border-sidebar-border focus-visible:ring-sidebar-ring"
                  />
                </div>
                <Separator className="my-2 bg-sidebar-border" />
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="px-2 py-2">
              {isSearching && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-5 w-5 animate-pulse text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Searching...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="px-2 py-4 text-xs text-destructive bg-destructive/10 rounded-sm mx-2">
                  {error}
                </div>
              )}

              {!isSearching && query && results.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <span className="text-xs text-muted-foreground">No results found for "{query}"</span>
                </div>
              )}

              {!isSearching && results.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 pb-2">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-sidebar-accent text-sidebar-accent-foreground">
                      {results.length} results in {groupedResults.length} files
                    </Badge>
                  </div>
                  
                  {groupedResults.map(([fileId, matches]) => (
                    <FileResultGroup 
                      key={fileId} 
                      fileId={fileId} 
                      matches={matches} 
                      onResultClick={handleResultClick}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Project Search Tab */}
        {projects.length > 0 && (
          <TabsContent value="projects" className="flex-1 flex flex-col mt-0">
            <div className="flex items-center justify-between px-4 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Project Search
              </h2>
            </div>

            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="pl-10 h-8 text-xs bg-background/50 border-sidebar-border focus-visible:ring-sidebar-ring"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-2 py-2">
                {projectSearchResults.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <span className="text-xs text-muted-foreground">
                      {projects.length === 0
                        ? "No projects available"
                        : 'No projects found for "' + projectSearchQuery + '"'}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="px-2 pb-2">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-sidebar-accent text-sidebar-accent-foreground">
                        {projectSearchResults.length} project(s)
                      </Badge>
                    </div>
                    {projectSearchResults.map((project) => (
                      <div
                        key={project.id}
                        className="p-2 hover:bg-sidebar-accent rounded cursor-pointer transition-colors"
                      >
                        <div className="text-xs font-medium truncate mb-1">
                          {project.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground mb-2">
                          {project.network} • {project.fileCount} file(s)
                        </div>
                        {project.tags && project.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {project.tags.map((tag) => (
                              <TagBadge key={tag.id} tag={tag} interactive={false} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

interface FileResultGroupProps {
  fileId: string;
  matches: SearchMatch[];
  onResultClick: (match: SearchMatch) => void;
}

function FileResultGroup({ fileId, matches, onResultClick }: FileResultGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="group">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-xs hover:bg-sidebar-accent rounded transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate font-medium text-sidebar-foreground/80">{fileId}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">{matches.length}</span>
      </button>

      {isExpanded && (
        <div className="mt-0.5 ml-3 pl-2 border-l border-sidebar-border space-y-0.5">
          {matches.map((match, idx) => (
            <button
              key={`${fileId}-${match.lineNumber}-${idx}`}
              onClick={() => onResultClick(match)}
              className="flex w-full flex-col gap-0.5 px-2 py-1.5 text-left hover:bg-sidebar-accent/50 rounded transition-colors group/item"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-primary/70">{match.lineNumber}:</span>
                <div className="text-[11px] font-mono truncate text-sidebar-foreground/70">
                  <HighlightedText text={match.lineText} match={match.matchText} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HighlightedText({ text, match }: { text: string; match: string }) {
  if (!match) return <>{text}</>;
  
  // Find all occurrences of the match in the text
  // We need to be careful with regex here
  try {
    const parts = text.split(new RegExp(`(${match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === match.toLowerCase() ? (
            <mark key={i} className="bg-primary/30 text-primary-foreground rounded-sm px-0.5">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  } catch (e) {
    return <>{text}</>;
  }
}
