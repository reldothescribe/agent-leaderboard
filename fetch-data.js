// Fetch agent data from Moltbook API with incremental updates
import fs from 'fs';

const API_BASE = 'https://www.moltbook.com/api/v1';
const API_KEY = process.env.MOLTBOOK_API_KEY || 'moltbook_sk_gtxyJHdS4FyG9w_kagoSB7Ho7im7czob';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function apiRequest(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function loadExistingData() {
  try {
    const data = JSON.parse(fs.readFileSync('data/agents.json', 'utf8'));
    return data;
  } catch {
    return { agents: [], lastUpdated: null, lastFullIndex: null };
  }
}

function saveData(data) {
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/agents.json', JSON.stringify(data, null, 2));
}

async function fetchAgentProfile(name) {
  const response = await apiRequest(`/agents/profile?name=${encodeURIComponent(name)}`);
  const profile = response.agent || response;
  const xHandle = profile.owner?.x_handle || null;
  
  return {
    name: profile.name || name,
    karma: profile.karma || 0,
    description: profile.description || '',
    followerCount: profile.follower_count || 0,
    followingCount: profile.following_count || 0,
    xHandle: xHandle,
    ownerName: profile.owner?.x_name || null,
    ownerAvatar: profile.owner?.x_avatar || null,
    moltbookUrl: `https://www.moltbook.com/agent/${encodeURIComponent(profile.name || name)}`,
    twitterUrl: xHandle ? `https://twitter.com/${xHandle}` : null,
    avatarUrl: profile.avatar_url || null,
    isActive: profile.is_active || false,
    isClaimed: profile.is_claimed || false,
    lastActive: profile.last_active || null,
    fetchedAt: new Date().toISOString()
  };
}

async function getRecentlyActiveAgents() {
  // Get recent posts to find active agents
  const postsData = await apiRequest('/posts?sort=new&limit=50');
  const posts = postsData.posts || postsData || [];
  
  const activeAgents = new Set();
  for (const post of posts) {
    if (post.author?.name) {
      activeAgents.add(post.author.name);
    }
  }
  
  return activeAgents;
}

async function getNewAgentsFromIntroductions(lastCheck) {
  const postsData = await apiRequest('/posts?submolt=introductions&limit=100');
  const posts = postsData.posts || postsData || [];
  
  const newAgents = new Set();
  const lastCheckDate = lastCheck ? new Date(lastCheck) : new Date(0);
  
  for (const post of posts) {
    const postDate = new Date(post.created_at);
    if (postDate > lastCheckDate && post.author?.name) {
      newAgents.add(post.author.name);
    }
  }
  
  return newAgents;
}

async function getAllAgentsFromIntroductions() {
  const postsData = await apiRequest('/posts?submolt=introductions&limit=100');
  const posts = postsData.posts || postsData || [];
  
  const agents = new Set();
  for (const post of posts) {
    if (post.author?.name) {
      agents.add(post.author.name);
    }
  }
  
  return agents;
}

async function runFullIndex() {
  console.log('=== FULL INDEX ===');
  
  const allAgents = await getAllAgentsFromIntroductions();
  console.log(`Found ${allAgents.size} agents in introductions`);
  
  const agents = [];
  let count = 0;
  
  for (const name of allAgents) {
    count++;
    console.log(`[${count}/${allAgents.size}] Fetching ${name}...`);
    
    try {
      const agent = await fetchAgentProfile(name);
      agents.push(agent);
      console.log(`  -> karma: ${agent.karma}`);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
    
    await delay(1000); // Rate limit
  }
  
  agents.sort((a, b) => b.karma - a.karma);
  
  const output = {
    lastUpdated: new Date().toISOString(),
    lastFullIndex: new Date().toISOString(),
    agentCount: agents.length,
    agents: agents
  };
  
  saveData(output);
  console.log(`\nSaved ${agents.length} agents`);
  return output;
}

async function runIncrementalUpdate() {
  console.log('=== INCREMENTAL UPDATE ===');
  
  const existing = loadExistingData();
  const agentMap = new Map(existing.agents.map(a => [a.name, a]));
  
  // 1. Find recently active agents
  console.log('Finding recently active agents...');
  const recentlyActive = await getRecentlyActiveAgents();
  console.log(`Found ${recentlyActive.size} recently active agents`);
  await delay(1000);
  
  // 2. Find new agents from introductions
  console.log('Checking for new agents...');
  const newAgents = await getNewAgentsFromIntroductions(existing.lastUpdated);
  console.log(`Found ${newAgents.size} new agents`);
  await delay(1000);
  
  // 3. Get top 50 by karma (always refresh these)
  const top50Names = new Set(
    existing.agents
      .slice(0, 50)
      .map(a => a.name)
  );
  console.log(`Will refresh top ${top50Names.size} agents`);
  
  // 4. Combine all agents to update
  const toUpdate = new Set([...recentlyActive, ...newAgents, ...top50Names]);
  console.log(`Total agents to update: ${toUpdate.size}`);
  
  // 5. Fetch updated profiles
  let count = 0;
  for (const name of toUpdate) {
    count++;
    console.log(`[${count}/${toUpdate.size}] Updating ${name}...`);
    
    try {
      const agent = await fetchAgentProfile(name);
      agentMap.set(name, agent);
      console.log(`  -> karma: ${agent.karma}`);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
    
    await delay(1000); // Rate limit
  }
  
  // 6. Sort and save
  const agents = Array.from(agentMap.values());
  agents.sort((a, b) => b.karma - a.karma);
  
  const output = {
    lastUpdated: new Date().toISOString(),
    lastFullIndex: existing.lastFullIndex,
    agentCount: agents.length,
    agents: agents
  };
  
  saveData(output);
  console.log(`\nSaved ${agents.length} agents (updated ${toUpdate.size})`);
  return output;
}

async function main() {
  const mode = process.argv[2] || 'incremental';
  const existing = loadExistingData();
  
  // Determine if we need a full index
  const now = new Date();
  const lastFull = existing.lastFullIndex ? new Date(existing.lastFullIndex) : null;
  const hoursSinceFullIndex = lastFull ? (now - lastFull) / (1000 * 60 * 60) : Infinity;
  
  // Full index if: explicitly requested, no data, or >24 hours since last full
  const needsFullIndex = mode === 'full' || 
                         existing.agents.length === 0 || 
                         hoursSinceFullIndex > 24;
  
  console.log(`Mode: ${mode}`);
  console.log(`Existing agents: ${existing.agents.length}`);
  console.log(`Hours since full index: ${hoursSinceFullIndex.toFixed(1)}`);
  console.log(`Will run: ${needsFullIndex ? 'FULL INDEX' : 'INCREMENTAL'}`);
  console.log('');
  
  let result;
  if (needsFullIndex) {
    result = await runFullIndex();
  } else {
    result = await runIncrementalUpdate();
  }
  
  // Print top 5
  console.log('\nTop 5 by karma:');
  result.agents.slice(0, 5).forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.name}: ${a.karma} karma`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
