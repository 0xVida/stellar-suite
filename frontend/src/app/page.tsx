'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Calendar, Trophy, TrendingUp, Target } from 'lucide-react';

interface Deployment {
  id: string;
  contractName: string;
  network: 'Testnet' | 'Futurenet' | 'Mainnet';
  address: string;
  timestamp: string;
  status: 'Verified' | 'Pending' | 'Failed';
  interactions: number;
  gasUsed: string;
}

const Dashboard = () => {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  // Mock data - Replace with real API call later
  useEffect(() => {
    setTimeout(() => {
      setDeployments([
        {
          id: "1",
          contractName: "TokenVesting",
          network: "Testnet",
          address: "CDT...K7P2",
          timestamp: "2025-05-28 14:32",
          status: "Verified",
          interactions: 124,
          gasUsed: "1.24M",
        },
        {
          id: "2",
          contractName: "LiquidityPool",
          network: "Futurenet",
          address: "CBZ...9X3M",
          timestamp: "2025-05-27 09:15",
          status: "Verified",
          interactions: 87,
          gasUsed: "2.81M",
        },
        {
          id: "3",
          contractName: "GovernanceDAO",
          network: "Testnet",
          address: "CAG...L9K1",
          timestamp: "2025-05-25 16:48",
          status: "Pending",
          interactions: 12,
          gasUsed: "3.45M",
        },
      ]);
      setLoading(false);
    }, 800);
  }, []);

  const totalDeployments = deployments.length;
  const verifiedContracts = deployments.filter(d => d.status === 'Verified').length;
  const totalInteractions = deployments.reduce((sum, d) => sum + d.interactions, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Developer Portfolio
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Track your Stellar contract deployments and activity
            </p>
          </div>
          <Button size="lg">
            New Deployment
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Deployments</CardTitle>
              <Target className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalDeployments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Verified Contracts</CardTitle>
              <Trophy className="h-5 w-5 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-600">{verifiedContracts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Interactions</CardTitle>
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalInteractions}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <Calendar className="h-5 w-5 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {totalDeployments > 0 ? Math.round((verifiedContracts / totalDeployments) * 100) : 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-8" />

        {/* Deployments History */}
        <Card>
          <CardHeader>
            <CardTitle>Deployment History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-12 text-gray-500">Loading your deployments...</p>
            ) : deployments.length === 0 ? (
              <p className="text-center py-12 text-gray-500">No deployments yet. Start building!</p>
            ) : (
              <div className="space-y-4">
                {deployments.map((deployment) => (
                  <div
                    key={deployment.id}
                    className="flex items-center justify-between p-5 border rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-semibold text-lg">{deployment.contractName}</p>
                        <p className="text-sm text-gray-500 font-mono">{deployment.address}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div>
                        <p className="text-xs text-gray-500">NETWORK</p>
                        <Badge variant={deployment.network === 'Mainnet' ? 'default' : 'secondary'}>
                          {deployment.network}
                        </Badge>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">STATUS</p>
                        <Badge 
                          variant={deployment.status === 'Verified' ? 'default' : 'outline'}
                          className={deployment.status === 'Verified' ? 'bg-emerald-600' : ''}
                        >
                          {deployment.status}
                        </Badge>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">INTERACTIONS</p>
                        <p className="font-medium">{deployment.interactions}</p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">DEPLOYED</p>
                        <p className="text-sm">{deployment.timestamp}</p>
                      </div>

                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;