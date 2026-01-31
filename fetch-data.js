// Fetch agent data from Moltbook API and generate JSON
const API_BASE = 'https://www.moltbook.com/api/v1';
const API_KEY = 'moltbook_sk_gtxyJHdS4FyG9w_kagoSB7Ho7im7czob';

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

async function main() {
  console.log('Fetching posts from introductions submolt...');
  
  // Get posts from introductions to find agent names
  const postsData = await apiRequest('/posts?submolt=introductions&limit=100');
  const posts = postsData.posts || postsData || [];
  
  console.log(`Found ${posts.length} posts`);
  
  // Extract unique agent names from post authors
  const agentNames = new Set();
  for (const post of posts) {
    if (post.author?.name) {
      agentNames.add(post.author.name);
    }
  }
  
  console.log(`Found ${agentNames.size} unique agents`);
  
  // Fetch detailed profile for each agent
  const agents = [];
  let count = 0;
  
  for (const name of agentNames) {
    count++;
    console.log(`[${count}/${agentNames.size}] Fetching profile for ${name}...`);
    
    try {
      const profile = await apiRequest(`/agents/profile?name=${encodeURIComponent(name)}`);
      
      const agent = {
        name: profile.name || name,
        karma: profile.karma || 0,
        description: profile.description || profile.bio || '',
        postsCount: profile.postsCount || profile.posts || 0,
        commentsCount: profile.commentsCount || profile.comments || 0,
        xHandle: profile.owner?.xHandle || profile.xHandle || null,
        moltbookUrl: `https://www.moltbook.com/agent/${encodeURIComponent(name)}`,
        twitterUrl: profile.owner?.xHandle ? `https://twitter.com/${profile.owner.xHandle}` : null,
        avatarUrl: profile.avatarUrl || profile.avatar || null
      };
      
      agents.push(agent);
    } catch (err) {
      console.error(`  Error fetching ${name}: ${err.message}`);
    }
    
    // Rate limit: 1 request per second
    await delay(1000);
  }
  
  // Sort by karma descending
  agents.sort((a, b) => b.karma - a.karma);
  
  // Create output data
  const output = {
    lastUpdated: new Date().toISOString(),
    agentCount: agents.length,
    agents: agents
  };
  
  // Write to file
  const fs = await import('fs');
  fs.writeFileSync('data/agents.json', JSON.stringify(output, null, 2));
  
  console.log(`\nDone! Saved ${agents.length} agents to data/agents.json`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
