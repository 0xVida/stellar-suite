"use client";

import React, { useState } from 'react';

export default function TeamsPage() {
  const [teamMembers, setTeamMembers] = useState([
    { id: 1, name: 'Alice Smith', email: 'alice@example.com', role: 'Admin' },
    { id: 2, name: 'Bob Jones', email: 'bob@example.com', role: 'Developer' },
  ]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [configContent, setConfigContent] = useState('{\n  "network": "testnet",\n  "rpcUrl": "https://soroban-testnet.stellar.org"\n}');
  const [configVersion, setConfigVersion] = useState('v1.0.0');

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail) {
      setTeamMembers([...teamMembers, { id: Date.now(), name: 'Pending Invite', email: inviteEmail, role: 'Developer' }]);
      setInviteEmail('');
    }
  };

  const handleSaveConfig = () => {
    // In a real app, we would sync this with the backend
    setConfigVersion((prev) => {
      const parts = prev.split('.');
      return `v${parts[0].replace('v', '')}.${parseInt(parts[1]) + 1}.0`;
    });
    alert('Shared configuration saved and synced.');
  };

  return (
    <div className="container mx-auto p-8 max-w-5xl">
      <h1 className="text-4xl font-bold mb-8 text-gray-800 dark:text-white">Shared Environment Management</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Team Management */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">Team Members</h2>
          
          <ul className="divide-y divide-gray-200 dark:divide-gray-700 mb-6">
            {teamMembers.map((member) => (
              <li key={member.id} className="py-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{member.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{member.email}</p>
                </div>
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${member.role === 'Admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
                  {member.role}
                </span>
              </li>
            ))}
          </ul>

          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Enter email to invite"
              className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2 border"
              required
            />
            <button
              type="submit"
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Invite
            </button>
          </form>
        </div>

        {/* Shared Configuration */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">Shared Configuration</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Version: {configVersion}</span>
          </div>
          
          <div className="mb-4">
            <label htmlFor="config" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Environment Variables & Network Config (JSON)
            </label>
            <textarea
              id="config"
              rows={8}
              value={configContent}
              onChange={(e) => setConfigContent(e.target.value)}
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 rounded-md font-mono bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-3 border"
            />
          </div>
          
          <button
            onClick={handleSaveConfig}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Save & Sync Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
