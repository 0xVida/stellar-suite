'use client';

import React, { useState } from 'react';
import { 
  Search, 
  Copy, 
  Share2, 
  Code, 
  User, 
  Calendar, 
  Tag, 
  ChevronRight,
  Eye,
  Github
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const MOCK_GIST = {
  id: 'gist-123',
  title: 'Basic Escrow Implementation',
  description: 'A simple escrow contract that holds funds until both parties agree to release.',
  author: '0xVida',
  date: 'Oct 24, 2023',
  tags: ['Smart Contract', 'Soroban', 'Escrow'],
  views: '1.2k',
  code: `// Soroban Escrow Contract
use soroban_sdk::{contract, contractimpl, Address, Env, Symbol};

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn initialize(env: Env, buyer: Address, seller: Address, amount: i128) {
        // Initialization logic here
    }

    pub fn deposit(env: Env, from: Address) {
        // Deposit funds into escrow
    }

    pub fn release(env: Env) {
        // Release funds to seller
    }

    pub fn refund(env: Env) {
        // Refund funds to buyer
    }
}`,
};

export default function GistViewerPage({ params }: { params: { id: string } }) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleCopyCode = () => {
    navigator.clipboard.writeText(MOCK_GIST.code);
    toast.success('Code copied to clipboard!');
  };

  const handleShare = () => {
    toast.info('Link copied to clipboard!', {
      description: 'You can now share this gist with others.',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Search Header */}
      <div className="border-b bg-muted/30 py-4 px-6 sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search gists by name, author, or tags..." 
              className="pl-10 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="ghost" className="hidden md:flex">Browse All</Button>
          <Button>New Gist</Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Info */}
        <div className="space-y-6 lg:col-span-1">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Gists</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">{params.id || MOCK_GIST.id}</span>
            </div>
            <h1 className="text-2xl font-bold">{MOCK_GIST.title}</h1>
            <p className="text-muted-foreground text-sm">{MOCK_GIST.description}</p>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-3 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{MOCK_GIST.author}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Created {MOCK_GIST.date}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" />
              <span>{MOCK_GIST.views} views</span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Tag className="h-3 w-3" /> Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {MOCK_GIST.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <Button variant="outline" className="w-full justify-start gap-2" onClick={handleShare}>
            <Share2 className="h-4 w-4" /> Share Gist
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2">
            <Github className="h-4 w-4" /> View on GitHub
          </Button>
        </div>

        {/* Code Viewer */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="overflow-hidden border-2 shadow-sm">
            <CardHeader className="bg-muted/50 border-b py-3 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-primary" />
                <span className="font-mono text-xs font-semibold">escrow.rs</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCopyCode} className="h-8 px-2">
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-[#0d1117] p-6 overflow-x-auto">
                <pre className="font-mono text-sm leading-relaxed text-slate-300">
                  <code>
                    {MOCK_GIST.code.split('\n').map((line, i) => (
                      <div key={i} className="flex gap-4 group">
                        <span className="w-8 text-slate-600 text-right select-none">{i + 1}</span>
                        <span>{line}</span>
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Discussion Mock */}
          <div className="pt-8 space-y-4">
            <h3 className="text-lg font-bold">Discussion</h3>
            <div className="bg-muted/30 rounded-lg p-8 text-center border-2 border-dashed">
              <p className="text-muted-foreground">Sign in to join the conversation.</p>
              <Button variant="outline" className="mt-4">Login with GitHub</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
