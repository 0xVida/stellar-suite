"use client";

import React, { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function RoadmapPage() {
  const [features, setFeatures] = useState([
    { id: 1, title: "Dark Mode Support", status: "Done", votes: 120 },
    { id: 2, title: "Soroban CLI Integration", status: "In Progress", votes: 85 },
    { id: 3, title: "Advanced Testnet Faucet", status: "Planned", votes: 45 },
    { id: 4, title: "Template Generator", status: "Planned", votes: 30 },
  ]);

  const handleVote = (id: number) => {
    setFeatures(features.map(f => f.id === id ? { ...f, votes: f.votes + 1 } : f));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-6xl w-full mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Interactive Roadmap</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Community-driven product development. View our progress, vote on feature requests, or submit your own ideas to help shape the future of Stellar Suite.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {["Planned", "In Progress", "Done"].map(status => (
            <div key={status} className="bg-card shadow-sm border rounded-xl p-6 flex flex-col">
              <h2 className="text-xl font-semibold mb-4 border-b pb-3 text-card-foreground">
                {status} <span className="text-sm font-normal text-muted-foreground ml-2">({features.filter(f => f.status === status).length})</span>
              </h2>
              <div className="space-y-4 flex-1">
                {features.filter(f => f.status === status).map(feature => (
                  <div key={feature.id} className="p-4 border rounded-lg bg-background flex flex-col justify-between hover:border-primary/50 transition-colors">
                    <h3 className="font-medium mb-3 text-foreground">{feature.title}</h3>
                    <div className="flex items-center justify-between mt-auto pt-2">
                      <span className="text-sm text-muted-foreground font-medium">{feature.votes} votes</span>
                      <button 
                        onClick={() => handleVote(feature.id)}
                        className="text-sm bg-primary/10 text-primary px-3 py-1.5 rounded-md hover:bg-primary/20 transition-colors flex items-center font-medium"
                      >
                        <span className="mr-1">▲</span> Upvote
                      </button>
                    </div>
                  </div>
                ))}
                {features.filter(f => f.status === status).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No items in this column.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-primary/5 rounded-xl p-8 text-center border border-primary/10">
          <h3 className="text-2xl font-semibold mb-3">Have a Feature Request?</h3>
          <p className="text-muted-foreground mb-6">We are always looking for ways to improve our tools for the Stellar community.</p>
          <button className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:opacity-90 transition-opacity">
            Submit Request
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
