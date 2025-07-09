import { Cabal } from '../src/index.js';
import { AsyncRouter } from '../src/multiplex/async-router.js';

/**
 * Example: Swarm Problem Solving
 * 
 * Demonstrates emergent problem-solving behavior
 * through agent collaboration without orchestration.
 */

async function swarmProblemSolving() {
  const cabal = new Cabal(5);
  const router = new AsyncRouter('swarm-coordinator');
  
  console.log('🐝 Starting Swarm Problem Solving Example\n');
  
  // Set up problem-solving routes
  router.addRoute('problem', {
    pattern: /problem:/,
    handler: async (msg) => {
      console.log('📋 Problem detected:', msg.problem);
      // Agents will self-organize to solve it
      return { acknowledged: true, problem: msg.problem };
    }
  });
  
  router.addRoute('solution', {
    pattern: /solution:/,
    handler: async (msg) => {
      console.log('💡 Solution proposed:', msg.solution);
      return { solution: msg.solution, confidence: msg.confidence };
    }
  });
  
  // Create a diverse swarm
  await cabal.createSwarm(5);
  console.log('✅ Swarm initialized\n');
  
  // Problem 1: Code optimization
  console.log('🔧 Problem 1: Code Optimization Challenge');
  
  const codeOptimizationProblem = `
problem: Optimize this function for performance:

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

Each agent should propose a different optimization approach.
`;
  
  await cabal.multicast(codeOptimizationProblem);
  await router.broadcast('problem', { problem: 'fibonacci-optimization' });
  
  // Wait for solutions
  await new Promise(resolve => setTimeout(resolve, 6000));
  
  // Collect optimization proposals
  const optimizations = await cabal.query(
    'Share your optimization approach and explain why it\'s effective',
    8000
  );
  
  console.log('\n🎯 Optimization Proposals:');
  optimizations.forEach((opt, i) => {
    console.log(`\nAgent ${i}:`, opt);
  });
  
  // Problem 2: Distributed task allocation
  console.log('\n\n📊 Problem 2: Distributed Task Allocation');
  
  const tasks = [
    'Analyze user feedback data',
    'Generate weekly report',
    'Review code pull requests',
    'Update documentation',
    'Monitor system performance'
  ];
  
  const allocationProblem = `
problem: Self-organize to handle these tasks efficiently:
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Coordinate without central control. Claim tasks based on your capabilities.
`;
  
  await cabal.multicast(allocationProblem);
  
  // Agents coordinate
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const assignments = await cabal.query(
    'Which task did you claim and why?',
    5000
  );
  
  console.log('\n📋 Task Assignments:');
  assignments.forEach((assignment, i) => {
    console.log(`Agent ${i}:`, assignment);
  });
  
  // Problem 3: Emergent consensus
  console.log('\n\n🌊 Problem 3: Emergent Consensus');
  
  const consensusProblem = `
problem: As a swarm, decide on the best programming language for:
- High-performance computing
- Web development
- Machine learning
- Mobile apps

Discuss and reach consensus through peer communication.
`;
  
  await cabal.multicast(consensusProblem);
  
  // Let agents discuss
  await new Promise(resolve => setTimeout(resolve, 8000));
  
  const decisions = await cabal.query(
    'What consensus did the swarm reach for each category?',
    5000
  );
  
  console.log('\n🤝 Swarm Consensus:');
  decisions.forEach((decision, i) => {
    console.log(`\nAgent ${i} reports:`, decision);
  });
  
  // Demonstrate emergent behavior
  console.log('\n\n🌟 Emergent Behavior Test');
  
  const emergentTest = `
Without any central coordination:
1. Form groups of 2-3 agents
2. Each group should focus on a different aspect of AI safety
3. Share findings with other groups
4. Synthesize a unified perspective
`;
  
  await cabal.multicast(emergentTest);
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  const synthesis = await cabal.query(
    'What unified perspective on AI safety emerged from your collaboration?',
    8000
  );
  
  console.log('\n🎨 Emergent Synthesis:');
  synthesis.forEach((s, i) => {
    console.log(`\nAgent ${i}:`, s);
  });
  
  // Final stats
  console.log('\n\n📊 Swarm Statistics:');
  const stats = cabal.getStats();
  console.log('Active agents:', stats.agents);
  console.log('Router stats:', stats.router);
  console.log('Stream splitter:', stats.splitter);
  
  await cabal.shutdown();
  console.log('\n✨ Swarm problem solving completed');
}

// Run the example
swarmProblemSolving().catch(console.error);