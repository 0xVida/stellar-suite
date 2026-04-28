'use client';

import React from 'react';
import { 
  Activity, 
  Box, 
  CheckCircle2, 
  Clock, 
  ExternalLink, 
  Plus, 
  Search, 
  ShieldCheck, 
  Zap 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

const MOCK_STATS = [
  { label: 'Total Deployments', value: '24', icon: Box, color: 'text-blue-500' },
  { label: 'Active Contracts', value: '18', icon: Zap, color: 'text-yellow-500' },
  { label: 'Network Interactions', value: '1.2k', icon: Activity, color: 'text-green-500' },
  { label: 'Verified Sources', value: '15', icon: ShieldCheck, color: 'text-purple-500' },
];

const MOCK_DEPLOYMENTS = [
  {
    id: 'TX...8a2f',
    name: 'Liquidity Pool v1',
    network: 'Mainnet',
    date: '2024-03-15',
    status: 'Verified',
    interaction: '320',
  },
  {
    id: 'TX...3b1e',
    name: 'Governance Token',
    network: 'Testnet',
    date: '2024-03-12',
    status: 'Pending',
    interaction: '12',
  },
  {
    id: 'TX...9c4d',
    name: 'Escrow Contract',
    network: 'Mainnet',
    date: '2024-03-10',
    status: 'Verified',
    interaction: '85',
  },
  {
    id: 'TX...1f7a',
    name: 'Oracle Adapter',
    network: 'Testnet',
    date: '2024-03-05',
    status: 'Failed',
    interaction: '0',
  },
  {
    id: 'TX...5e8b',
    name: 'NFT Minter',
    network: 'Mainnet',
    date: '2024-02-28',
    status: 'Verified',
    interaction: '1.5k',
  },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Developer Portfolio</h1>
            <p className="text-muted-foreground">Manage your deployments and on-chain interactions.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline">
              <Search className="mr-2 h-4 w-4" />
              Find Contract
            </Button>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Deployment
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MOCK_STATS.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold">{stat.value}</p>
                  </div>
                  <div className={`p-2 bg-muted rounded-full ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Deployment History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                Recent Deployments
              </CardTitle>
              <Button variant="ghost" size="sm">View All</Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract Name</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Deployment Date</TableHead>
                  <TableHead>Interactions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_DEPLOYMENTS.map((deployment) => (
                  <TableRow key={deployment.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{deployment.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{deployment.id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={deployment.network === 'Mainnet' ? 'default' : 'secondary'}>
                        {deployment.network}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{deployment.date}</TableCell>
                    <TableCell>{deployment.interaction}</TableCell>
                    <TableCell>
                      {deployment.status === 'Verified' ? (
                        <div className="flex items-center gap-1.5 text-green-500">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm font-medium">Verified</span>
                        </div>
                      ) : deployment.status === 'Pending' ? (
                        <div className="flex items-center gap-1.5 text-yellow-500">
                          <Clock className="h-4 w-4" />
                          <span className="text-sm font-medium">Pending</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-red-500">
                          <Activity className="h-4 w-4" />
                          <span className="text-sm font-medium">Failed</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
