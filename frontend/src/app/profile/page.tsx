"use client";

import React, { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function ProfilePage() {
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-4xl w-full mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-foreground mb-8">User Profile & Identity</h1>
        
        <div className="bg-card shadow-sm border rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">Edit Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-muted-foreground">Avatar URL</label>
              <input 
                type="text" 
                value={avatar} 
                onChange={(e) => setAvatar(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-muted-foreground">Bio</label>
              <textarea 
                value={bio} 
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                rows={4}
                placeholder="Tell us about yourself..."
              />
            </div>
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
              Save Profile
            </button>
          </div>
        </div>

        <div className="bg-card shadow-sm border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">Linked Accounts</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
              <div className="flex items-center space-x-3">
                <span className="font-medium text-foreground">GitHub</span>
              </div>
              <button className="text-sm bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80 transition-colors">
                Link Account
              </button>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
              <div className="flex items-center space-x-3">
                <span className="font-medium text-foreground">Stellar Wallet</span>
              </div>
              <button className="text-sm bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80 transition-colors">
                Connect Wallet
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
