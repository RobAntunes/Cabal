import { Cabal } from '../src/index.js';

/**
 * Simple demonstration of Cabal's multiplexed multi-agent system
 */

async function simpleDemo() {
  console.log('🎭 Cabal - Simple Multi-Agent Demo\n');
  
  // Create system with max 3 agents
  const cabal = new Cabal(3);
  
  // Spawn individual agents
  console.log('🤖 Spawning agents...');
  const agent1 = await cabal.spawnAgent('alpha');
  const agent2 = await cabal.spawnAgent('beta');
  const agent3 = await cabal.spawnAgent('gamma');
  console.log('✅ 3 agents created\n');
  
  // Test 1: Multicast (fire-and-forget)
  console.log('📡 Test 1: Multicast Message');
  await cabal.multicast('Hello agents! Please introduce yourselves.');
  console.log('Message sent to all agents\n');
  
  // Give agents time to process
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 2: Query with response collection
  console.log('❓ Test 2: Query with Response Collection');
  const responses = await cabal.query(
    'What makes you unique as an agent?',
    5000
  );
  
  console.log(`Received ${responses.length} responses:`);
  responses.forEach((resp, i) => {
    console.log(`\nAgent ${i + 1}:`, resp);
  });
  
  // Test 3: Peer-to-peer communication
  console.log('\n\n🔗 Test 3: Direct Peer Communication');
  
  // Agents discover each other
  await cabal.multicast('Announce your presence to other agents');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test collaborative task
  console.log('\n🤝 Test 4: Collaborative Task');
  
  const task = `
Work together to solve: "What are the prime factors of 2310?"
Share your findings with each other and reach consensus.
`;
  
  await cabal.multicast(task);
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const solutions = await cabal.query('What answer did you reach?', 3000);
  console.log('\nCollaborative results:');
  solutions.forEach((sol, i) => {
    console.log(`Agent ${i + 1}:`, sol);
  });
  
  // Show system stats
  console.log('\n\n📊 System Statistics:');
  const stats = cabal.getStats();
  console.log(JSON.stringify(stats, null, 2));
  
  // Cleanup
  console.log('\n🔚 Shutting down...');
  await cabal.shutdown();
  console.log('✨ Demo completed!');
}

// Run demo
if (import.meta.url === `file://${process.argv[1]}`) {
  simpleDemo().catch(console.error);
}