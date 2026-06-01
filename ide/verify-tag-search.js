// Simple verification script for tag-aware project search
const projects = [
  { id: 'p1', name: 'DeFi Dashboard', network: 'testnet', fileCount: 12, tags: [{id:'t1', name:'DeFi', color:'blue'}] },
  { id: 'p2', name: 'NFT Gallery', network: 'mainnet', fileCount: 5, tags: [{id:'t2', name:'NFT', color:'pink'}] },
  { id: 'p3', name: 'Staging Template', network: 'testnet', fileCount: 3, tags: [{id:'t3', name:'Template', color:'green'}] },
  { id: 'p4', name: 'Mixed Project', network: 'mainnet', fileCount: 8, tags: [{id:'t1', name:'DeFi', color:'blue'},{id:'t2', name:'NFT', color:'pink'}] },
];

function searchProjects(query) {
  const q = (query || '').trim();
  if (!q) return projects;
  const tokens = q.split(/\s+/).filter(Boolean);
  const tagTokens = tokens
    .filter((t) => t.toLowerCase().startsWith('tag:') || t.startsWith('#'))
    .map((t) => t.replace(/^tag:/i, '').replace(/^#/, ''));
  const nameTokens = tokens.filter((t) => !t.toLowerCase().startsWith('tag:') && !t.startsWith('#'));

  return projects.filter((project) => {
    const matchesName =
      nameTokens.length === 0 ||
      nameTokens.every((nt) =>
        project.name.toLowerCase().includes(nt.toLowerCase()) ||
        project.id.toLowerCase().includes(nt.toLowerCase()) ||
        project.tags?.some((tag) => tag.name.toLowerCase().includes(nt.toLowerCase())),
      );
    const matchesTags =
      tagTokens.length === 0 ||
      tagTokens.every((tt) => project.tags?.some((tag) => tag.name.toLowerCase() === tt.toLowerCase()));
    return matchesName && matchesTags;
  });
}

const tests = [
  { q: 'DeFi', expect: ['p1','p4'] },
  { q: 'tag:DeFi', expect: ['p1','p4'] },
  { q: '#NFT', expect: ['p2','p4'] },
  { q: 'Template', expect: ['p3'] },
  { q: 'tag:DeFi NFT', expect: ['p4'] },
  { q: 'tag:Nonexistent', expect: [] },
];

console.log('Running tag-search verification...');
for (const t of tests) {
  const res = searchProjects(t.q).map(r => r.id);
  const pass = JSON.stringify(res.sort()) === JSON.stringify(t.expect.sort());
  console.log(`Query: "${t.q}" -> Found: [${res.join(', ')}] Expected: [${t.expect.join(', ')}] ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) process.exitCode = 2;
}

console.log('Verification complete.');
