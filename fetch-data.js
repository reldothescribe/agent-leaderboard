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
      const response = await apiRequest(`/agents/profile?name=${encodeURIComponent(name)}`);
      const profile = response.agent || response;
      
      const xHandle = profile.owner?.x_handle || null;
      
      const agent = {
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
        lastActive: profile.last_active || null
      };
      
      agents.push(agent);
      console.log(`  -> karma: ${agent.karma}, claimed: ${agent.isClaimed}`);
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
  console.log(`Top 5 by karma:`);
  agents.slice(0, 5).forEach((a, i) => {
    console.log(`  ${i+1}. ${a.name}: ${a.karma} karma`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
