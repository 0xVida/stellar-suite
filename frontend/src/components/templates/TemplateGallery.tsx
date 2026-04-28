'use client';

import React, { useState } from 'react';
import { Search, ExternalLink, Code, Star, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const MOCK_TEMPLATES = [
  {
    id: '1',
    name: 'Liquidity Pool',
    description: 'A standard Constant Product Market Maker (CPMM) implementation for Soroban.',
    author: 'StellarDev',
    stars: 128,
    tags: ['DeFi', 'AMM'],
    version: '1.0.2',
  },
  {
    id: '2',
    name: 'NFT Marketplace',
    description: 'Complete marketplace contract with minting, listing, and royalty support.',
    author: 'OrbitalLabs',
    stars: 85,
    tags: ['NFT', 'Assets'],
    version: '0.9.5',
  },
  {
    id: '3',
    name: 'DAO Governance',
    description: 'On-chain voting and proposal management system for decentralized organizations.',
    author: 'AstroChain',
    stars: 210,
    tags: ['DAO', 'Governance'],
    version: '2.1.0',
  },
  {
    id: '4',
    name: 'Token Bridge',
    description: 'Cross-chain token transfer bridge logic with multisig verification.',
    author: 'QuantumBridge',
    stars: 56,
    tags: ['Bridge', 'Security'],
    version: '1.2.0',
  },
  {
    id: '5',
    name: 'Stablecoin Vault',
    description: 'Collateralized debt position (CDP) contract for minting stablecoins.',
    author: 'NovaFinance',
    stars: 94,
    tags: ['Stablecoin', 'Finance'],
    version: '1.1.0',
  },
  {
    id: '6',
    name: 'Subscription Engine',
    description: 'Recurring payment logic for SaaS products on the Stellar network.',
    author: 'StellarPay',
    stars: 42,
    tags: ['Payments', 'SaaS'],
    version: '0.8.0',
  },
];

export function TemplateGallery() {
  const [search, setSearch] = useState('');

  const filteredTemplates = MOCK_TEMPLATES.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
  );

  const handleOpenInIDE = (id: string) => {
    // Mock deep-linking API
    window.open(`stellar-suite://open-template/${id}`, '_blank');
  };

  return (
    <section className="py-16 px-4 bg-background border-t border-border">
      <div className="container mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Community Templates
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Jumpstart your Soroban development with battle-tested contract templates from the community.
            </p>
          </div>
          
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates or tags..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="group hover:shadow-xl hover:border-primary/50 transition-all duration-300">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Code className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                    <span>{template.stars}</span>
                  </div>
                </div>
                <CardTitle className="text-xl">{template.name}</CardTitle>
                <CardDescription className="line-clamp-2 mt-2">
                  {template.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
                  <span>by <span className="text-foreground font-medium">{template.author}</span></span>
                  <span>v{template.version}</span>
                </div>
                <Button 
                  className="w-full group" 
                  onClick={() => handleOpenInIDE(template.id)}
                >
                  <Download className="mr-2 h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
                  Open in IDE
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-20 bg-muted/30 rounded-2xl border-2 border-dashed">
            <p className="text-muted-foreground text-lg">No templates found matching your search.</p>
            <Button variant="link" onClick={() => setSearch('')}>Clear search</Button>
          </div>
        )}
      </div>
    </section>
  );
}
