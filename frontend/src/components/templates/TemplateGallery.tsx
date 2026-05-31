'use client';

import React, { useState } from 'react';
import { Search, Code, Star, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

import communityTemplates from '@/data/community-templates.json';

export function TemplateGallery() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<'All' | 'DeFi' | 'Utility' | 'DAO'>('All');

  const filteredTemplates = communityTemplates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase())) ||
      t.author.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || t.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryCount = (category: string) => {
    if (category === 'All') return communityTemplates.length;
    return communityTemplates.filter(t => t.category === category).length;
  };

  const handleOpenInIDE = (id: string, name: string) => {
    toast.success(`Opening template "${name}" in VS Code/IDE`, {
      description: `Attempting deep-link using stellar-suite://open-template/${id}`
    });
    // Use window.location to trigger the protocol handler cleanly without opening blank tabs
    window.location.href = `stellar-suite://open-template/${id}`;
  };

  return (
    <section className="relative py-24 px-4 bg-background border-t border-border overflow-hidden">
      {/* Glowing premium radial background accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-primary via-primary/80 to-primary/50 bg-clip-text text-transparent">
              Community Templates
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Jumpstart your Soroban development with battle-tested contract templates from the community.
            </p>
          </div>
          
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates, tags, authors..."
              className="pl-10 bg-background/50 backdrop-blur-sm border-border hover:border-primary/50 transition-colors focus-visible:ring-primary/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-8">
          {(['All', 'DeFi', 'Utility', 'DAO'] as const).map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <Button
                key={cat}
                variant={isActive ? 'default' : 'outline'}
                className="rounded-full px-5 py-2 transition-all duration-300 font-medium active:scale-95 flex items-center gap-2 group"
                onClick={() => setActiveCategory(cat)}
              >
                <span>{cat}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                  isActive 
                    ? 'bg-primary-foreground/20 text-primary-foreground' 
                    : 'bg-muted text-muted-foreground group-hover:bg-muted-foreground/15'
                }`}>
                  {getCategoryCount(cat)}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-500">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="group flex flex-col hover:shadow-xl hover:-translate-y-1 hover:border-primary/40 transition-all duration-300 bg-card/60 backdrop-blur-sm border-border/80 overflow-hidden">
              <CardHeader className="flex-none">
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <Code className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 dark:bg-muted/30 px-2.5 py-1 rounded-full border border-border/30">
                    <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                    <span className="font-semibold text-foreground/90">{template.stars}</span>
                  </div>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight text-foreground/90 group-hover:text-primary transition-colors">
                  {template.name}
                </CardTitle>
                <CardDescription className="line-clamp-2 mt-2 leading-relaxed text-sm">
                  {template.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1 pb-4">
                <div className="flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => (
                    <Badge 
                      key={tag} 
                      variant="secondary" 
                      className="font-normal text-xs transition-colors hover:bg-primary hover:text-primary-foreground cursor-pointer"
                      onClick={() => setSearch(tag)}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              
              <CardFooter className="flex-none flex flex-col gap-4 border-t border-border/40 pt-4 bg-muted/20 dark:bg-muted/5">
                <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
                  <span>by <span className="text-foreground font-semibold hover:underline cursor-pointer" onClick={() => setSearch(template.author)}>{template.author}</span></span>
                  <span className="font-mono bg-muted/80 px-2 py-0.5 rounded border border-border/40">v{template.version}</span>
                </div>
                <Button 
                  className="w-full group/btn font-semibold active:scale-[0.98] transition-transform duration-100" 
                  onClick={() => handleOpenInIDE(template.id, template.name)}
                >
                  <Download className="mr-2 h-4 w-4 group-hover/btn:translate-y-0.5 transition-transform" />
                  Open in IDE
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-20 bg-muted/20 dark:bg-muted/5 rounded-2xl border-2 border-dashed border-border/60 backdrop-blur-sm">
            <p className="text-muted-foreground text-lg mb-4">No templates found matching your criteria.</p>
            <Button variant="outline" onClick={() => { setSearch(''); setActiveCategory('All'); }}>
              Reset Filters
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
