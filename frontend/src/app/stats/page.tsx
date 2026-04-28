"use client";

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

export default function StatsDashboard() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    // Mock anonymized data reflecting deployments, users, and transactions
    const mockData = [
      { name: 'Jan', deployments: 4000, users: 2400, transactions: 2400 },
      { name: 'Feb', deployments: 3000, users: 1398, transactions: 2210 },
      { name: 'Mar', deployments: 2000, users: 9800, transactions: 2290 },
      { name: 'Apr', deployments: 2780, users: 3908, transactions: 2000 },
      { name: 'May', deployments: 1890, users: 4800, transactions: 2181 },
      { name: 'Jun', deployments: 2390, users: 3800, transactions: 2500 },
      { name: 'Jul', deployments: 3490, users: 4300, transactions: 2100 },
    ];
    setData(mockData);
  }, []);

  return (
    <div className="min-h-screen p-8 bg-black text-white">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Public Analytics Dashboard</h1>
          <p className="text-gray-400">Anonymized usage statistics for the Stellar IDE platform.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-6">User Growth & Deployments</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }} />
                  <Legend />
                  <Line type="monotone" dataKey="users" stroke="#8B5CF6" strokeWidth={3} activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="deployments" stroke="#10B981" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-6">Transaction Volume</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }} cursor={{fill: '#374151'}} />
                  <Legend />
                  <Bar dataKey="transactions" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
