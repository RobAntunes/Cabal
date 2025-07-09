import { Cabal } from '../src/index.js';

/**
 * Example: Collaborative Research Workflow
 * 
 * This demonstrates how multiple agents can work together
 * on a research task without central orchestration.
 */

async function collaborativeResearch() {
  const cabal = new Cabal(4);
  
  console.log('🚀 Starting Collaborative Research Example\n');
  
  // Create specialized agents
  await cabal.spawnAgent('researcher');
  await cabal.spawnAgent('analyst');
  await cabal.spawnAgent('summarizer');
  await cabal.spawnAgent('critic');
  
  console.log('✅ Agents spawned\n');
  
  // Example 1: Parallel research on a topic
  console.log('📚 Example 1: Parallel Research');
  console.log('Topic: "Future of distributed AI systems"\n');
  
  const researchPrompt = `Research the topic: "Future of distributed AI systems"
  Focus on your specialty:
  - Researcher: Find key papers and references
  - Analyst: Identify trends and patterns
  - Summarizer: Create concise summaries
  - Critic: Evaluate strengths and weaknesses`;
  
  // Multicast to all agents (fire-and-forget)
  await cabal.multicast(researchPrompt);
  
  // Give agents time to process
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Example 2: Collect and synthesize responses
  console.log('\n🔄 Example 2: Synthesis Phase');
  
  const synthesisPrompt = 'Based on your research, what are the top 3 insights?';
  const insights = await cabal.query(synthesisPrompt, 8000);
  
  console.log(`\n📊 Collected ${insights.length} responses`);
  insights.forEach((insight, i) => {
    console.log(`\nAgent ${i + 1} insights:`, insight);
  });
  
  // Example 3: Peer review
  console.log('\n👥 Example 3: Peer Review');
  
  const reviewPrompt = 'Review and critique the insights shared by other agents';
  await cabal.multicast(reviewPrompt);
  
  // Example 4: Consensus building
  console.log('\n🤝 Example 4: Building Consensus');
  
  const consensusPrompt = 'What is the most important finding we all agree on?';
  const consensus = await cabal.query(consensusPrompt, 10000);
  
  console.log('\n✨ Consensus Results:');
  consensus.forEach((response, i) => {
    console.log(`Agent ${i + 1}:`, response);
  });
  
  // Display final stats
  console.log('\n📈 System Statistics:');
  console.log(cabal.getStats());
  
  // Cleanup
  await cabal.shutdown();
  console.log('\n👋 Example completed');
}

// Run the example
collaborativeResearch().catch(console.error);