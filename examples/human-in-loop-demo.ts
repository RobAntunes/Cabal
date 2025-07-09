import { EnhancedCabal, AgentRole, HumanNotification } from '../src/enhanced-cabal.js';
import * as readline from 'readline';

/**
 * Demo: Human-in-the-Loop Multi-Agent System
 * 
 * Shows how agents work autonomously while involving
 * humans only when necessary.
 */

class HumanInterface {
  private rl: readline.Interface;
  private cabal: EnhancedCabal;

  constructor(cabal: EnhancedCabal) {
    this.cabal = cabal;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    console.log('👤 Human Interface Active\n');
    
    // Listen for human attention requests
    this.cabal.on('human:attention', (notification: HumanNotification) => {
      this.handleNotification(notification);
    });

    // Start monitoring
    this.showStatus();
  }

  private handleNotification(notification: HumanNotification) {
    const icons = {
      request: '❗',
      alert: '🚨',
      summary: '📊',
      milestone: '✅'
    };

    console.log(`\n${icons[notification.type]} ${notification.type.toUpperCase()}`);
    console.log(`Priority: ${notification.priority}`);
    console.log('Content:', JSON.stringify(notification.content, null, 2));

    if (notification.requiresResponse) {
      this.promptForResponse(notification.content);
    }
  }

  private async promptForResponse(request: any) {
    if (request.type === 'approval') {
      const answer = await this.ask(`\nApprove "${request.context.task}"? (y/n): `);
      this.cabal.respondToRequest(request.id, {
        approved: answer.toLowerCase() === 'y',
        reason: answer.toLowerCase() !== 'y' ? 'Human rejected' : 'Human approved'
      });
    } else if (request.type === 'input') {
      const input = await this.ask(`\nProvide guidance for "${request.context.task}": `);
      this.cabal.respondToRequest(request.id, {
        guidance: input,
        abort: false
      });
    }
  }

  private ask(question: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(question, resolve);
    });
  }

  private showStatus() {
    setInterval(() => {
      const status = this.cabal.getSystemStatus();
      const activity = this.cabal.getBackgroundActivity(5);
      
      console.log('\n--- System Status ---');
      console.log(`Active Agents: ${status.agents.length}`);
      console.log(`Pending Human Requests: ${status.humanRequests}`);
      console.log(`Background Activities: ${status.backgroundActivity}`);
      
      if (activity.length > 0) {
        console.log('\nRecent Background Activity:');
        activity.forEach(a => {
          console.log(`- ${a.from} → ${a.to}: ${a.type}`);
        });
      }
    }, 30000); // Every 30 seconds
  }

  close() {
    this.rl.close();
  }
}

async function runDemo() {
  console.log('🤖 Enhanced Cabal - Human-in-the-Loop Demo\n');
  
  const cabal = new EnhancedCabal(6);
  const humanInterface = new HumanInterface(cabal);

  // Define agent roles
  const roles: AgentRole[] = [
    {
      name: 'alpha',
      type: 'researcher',
      autonomyLevel: 'full',
      backgroundTasks: ['literature-review', 'data-gathering']
    },
    {
      name: 'beta',
      type: 'analyst',
      autonomyLevel: 'supervised',
      specialization: 'pattern-recognition'
    },
    {
      name: 'gamma',
      type: 'executor',
      autonomyLevel: 'manual',
      specialization: 'code-generation'
    },
    {
      name: 'delta',
      type: 'reviewer',
      autonomyLevel: 'supervised',
      specialization: 'quality-assurance'
    },
    {
      name: 'epsilon',
      type: 'coordinator',
      autonomyLevel: 'supervised',
      backgroundTasks: ['progress-tracking']
    }
  ];

  // Spawn specialized agents
  console.log('🚀 Spawning specialized agents...\n');
  for (const role of roles) {
    await cabal.spawnSpecializedAgent(role);
    console.log(`✅ Spawned ${role.type} agent: ${role.name} (${role.autonomyLevel} autonomy)`);
  }

  // Start human interface
  await humanInterface.start();

  // Demo scenarios
  console.log('\n📋 Starting demo scenarios...\n');

  // Scenario 1: Fully autonomous background task
  console.log('1️⃣ Scenario 1: Autonomous Research Task');
  console.log('   Researcher agents will work in background...\n');
  
  const researchAgent = Array.from(cabal['agents'].values())
    .find(a => a.nodeId.includes('researcher'));
  
  if (researchAgent) {
    researchAgent.executeTask('literature-review', {
      topic: 'distributed systems',
      scope: 'recent-papers'
    });
  }

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Scenario 2: Task requiring approval
  console.log('\n2️⃣ Scenario 2: Critical Operation');
  console.log('   Executor will request human approval...\n');
  
  const executorAgent = Array.from(cabal['agents'].values())
    .find(a => a.nodeId.includes('executor'));
  
  if (executorAgent) {
    executorAgent.executeTask('modify-critical', {
      target: 'production-config',
      changes: ['update-api-key', 'change-endpoint']
    });
  }

  await new Promise(resolve => setTimeout(resolve, 5000));

  // Scenario 3: Complex collaborative task
  console.log('\n3️⃣ Scenario 3: Complex Collaborative Task');
  console.log('   Multiple agents working together...\n');
  
  await cabal.executeComplexTask(
    'Analyze and optimize system performance',
    ['researcher', 'analyst', 'executor', 'reviewer'],
    true // human oversight enabled
  );

  // Scenario 4: Low confidence decision
  console.log('\n4️⃣ Scenario 4: Low Confidence Decision');
  console.log('   Agent will ask for human guidance...\n');
  
  const analystAgent = Array.from(cabal['agents'].values())
    .find(a => a.nodeId.includes('analyst'));
  
  if (analystAgent) {
    // Simulate a low-confidence scenario
    analystAgent.executeTask('anomaly-detection', {
      data: 'suspicious-pattern-xyz',
      confidence: 0.6
    });
  }

  // Keep running for demo
  console.log('\n💡 Demo running. Agents are working autonomously.');
  console.log('   You\'ll be notified when human input is needed.');
  console.log('   Press Ctrl+C to exit.\n');

  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down demo...');
    humanInterface.close();
    await cabal.shutdown();
    process.exit(0);
  });
}

// Run the demo
runDemo().catch(console.error);