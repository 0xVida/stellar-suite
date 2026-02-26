"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { getSearchIndex, SearchResult } from "@/lib/search";
import { 
  FileText, 
  Book, 
  History, 
  HelpCircle, 
  ArrowRight
} from "lucide-react";

export function SearchDialog() {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState<SearchResult[]>([]);
  const router = useRouter();

  React.useEffect(() => {
    setIndex(getSearchIndex());
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const getIcon = (category: string) => {
    switch (category) {
      case "blog":
        return <FileText className="mr-2 h-4 w-4 text-blue-500" />;
      case "changelog":
        return <History className="mr-2 h-4 w-4 text-green-500" />;
      case "faq":
        return <HelpCircle className="mr-2 h-4 w-4 text-purple-500" />;
      case "docs":
        return <Book className="mr-2 h-4 w-4 text-orange-500" />;
      default:
        return <ArrowRight className="mr-2 h-4 w-4 text-muted-foreground" />;
    }
  };

  const groupedResults = index.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative inline-flex h-9 w-full items-center justify-start rounded-[0.5rem] bg-muted/50 px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:pr-12 md:w-40 lg:w-64"
      >
        <span className="hidden lg:inline-flex">Search content...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(groupedResults).map(([category, items]) => (
            <React.Fragment key={category}>
              <CommandGroup heading={category.toUpperCase()}>
                {items.map((item) => (
                  <CommandItem
                    key={item.link + item.title}
                    onSelect={() => {
                      runCommand(() => router.push(item.link));
                    }}
                    className="flex flex-col items-start gap-1 py-3"
                  >
                    <div className="flex items-center w-full">
                      {getIcon(item.category)}
                      <span className="font-semibold text-foreground">{item.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground line-clamp-1 ml-6">
                      {item.excerpt}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
