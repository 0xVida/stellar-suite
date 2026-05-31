"use client";

import Link from "next/link";
import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Users, Rocket, FileCode2, Activity, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const DEPLOYMENT_DATA = [
  { month: "Dec", deployments: 840 },
  { month: "Jan", deployments: 1120 },
  { month: "Feb", deployments: 980 },
  { month: "Mar", deployments: 1540 },
  { month: "Apr", deployments: 1890 },
  { month: "May", deployments: 2340 },
];

const USER_DATA = [
  { month: "Dec", users: 3200 },
  { month: "Jan", users: 4100 },
  { month: "Feb", users: 4600 },
  { month: "Mar", users: 5900 },
  { month: "Apr", users: 7200 },
  { month: "May", users: 9100 },
];

const TRANSACTION_DATA = [
  { week: "W1", transactions: 12400 },
  { week: "W2", transactions: 18700 },
  { week: "W3", transactions: 15900 },
  { week: "W4", transactions: 22100 },
  { week: "W5", transactions: 19800 },
  { week: "W6", transactions: 28400 },
  { week: "W7", transactions: 31200 },
  { week: "W8", transactions: 26700 },
];

const CONTRACT_CATEGORIES = [
  { name: "Token", count: 2840 },
  { name: "NFT", count: 1620 },
  { name: "DeFi", count: 1190 },
  { name: "Wallet", count: 870 },
  { name: "Oracle", count: 540 },
  { name: "Other", count: 390 },
];

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  change: string;
  positive: boolean;
}

function StatCard({ icon, label, value, change, positive }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <span
          className={`text-xs font-semibold font-display px-2 py-1 rounded-full ${
            positive
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {change}
        </span>
      </div>
      <p className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-foreground mb-1">
        {value}
      </p>
      <p className="text-sm font-body text-muted-foreground">{label}</p>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="font-display font-bold text-foreground text-base mb-0.5">
          {title}
        </h2>
        <p className="text-xs font-body text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: "0.75rem",
    fontFamily: "var(--font-body, sans-serif)",
    color: "hsl(var(--foreground))",
  },
  labelStyle: {
    color: "hsl(var(--muted-foreground))",
    marginBottom: "2px",
  },
};

const AXIS_STYLE = {
  style: {
    fontSize: "0.7rem",
    fill: "hsl(var(--muted-foreground))",
    fontFamily: "var(--font-display, sans-serif)",
  },
};

export default function StatsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main id="main-content" className="pt-20 pb-20 px-4 sm:pt-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 mb-10 text-xs sm:text-sm font-body text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-foreground">Stats</span>
          </nav>

          {/* Hero */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
            <div>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-foreground mb-2">
                Platform Analytics
              </h1>
              <p className="text-base font-body text-muted-foreground max-w-lg">
                Anonymized usage statistics for the Stellar IDE platform. All
                data is aggregated and privacy-preserving.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-body text-muted-foreground shrink-0">
              <ShieldCheck className="h-4 w-4 text-green-500" />
              Privacy-first · No PII collected
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="Active developers"
              value="9,100"
              change="+26%"
              positive
            />
            <StatCard
              icon={<Rocket className="h-5 w-5" />}
              label="Total deployments"
              value="8,710"
              change="+24%"
              positive
            />
            <StatCard
              icon={<FileCode2 className="h-5 w-5" />}
              label="Contracts deployed"
              value="7,450"
              change="+18%"
              positive
            />
            <StatCard
              icon={<Activity className="h-5 w-5" />}
              label="Transactions (8w)"
              value="175K"
              change="+41%"
              positive
            />
          </div>

          {/* Charts — row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartCard
              title="Deployments Over Time"
              subtitle="Monthly contract deployments, last 6 months"
            >
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={DEPLOYMENT_DATA}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="deployGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...CHART_TOOLTIP_STYLE}
                    formatter={(value) => [Number(value).toLocaleString(), "Deployments"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="deployments"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#deployGrad)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Active Developers"
              subtitle="Monthly unique active developers, last 6 months"
            >
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={USER_DATA}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...CHART_TOOLTIP_STYLE}
                    formatter={(value) => [Number(value).toLocaleString(), "Users"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="users"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Charts — row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Transaction Volume"
              subtitle="Weekly on-chain transactions, last 8 weeks"
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={TRANSACTION_DATA}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="week"
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...CHART_TOOLTIP_STYLE}
                    formatter={(value) => [Number(value).toLocaleString(), "Transactions"]}
                  />
                  <Bar
                    dataKey="transactions"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    opacity={0.85}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Contract Types"
              subtitle="Breakdown of deployed contracts by category"
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={CONTRACT_CATEGORIES}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    {...CHART_TOOLTIP_STYLE}
                    formatter={(value) => [Number(value).toLocaleString(), "Contracts"]}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                    opacity={0.85}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Privacy notice */}
          <div className="mt-10 rounded-xl border border-border bg-card p-5 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <p className="text-sm font-body text-muted-foreground leading-relaxed">
              All statistics shown are anonymized and aggregated. No personally
              identifiable information (PII) is collected or displayed. Data is
              refreshed daily.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
