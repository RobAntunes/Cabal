import { ClaudeMultiplexer } from './multiplex/multiplexer.js';
import { PeerAgent } from './agents/peer-agent.js';
import { AsyncRouter } from './multiplex/async-router.js';
import { StreamSplitter } from './multiplex/stream-splitter.js';
import { Happen } from '@happen/core';

export class Cabal {
  private multiplexer: ClaudeMultiplexer;
  private agents: Map<string, PeerAgent> = new Map();
  private router: AsyncRouter;
  private splitter: StreamSplitter;

  constructor(private maxAgents: number = 5) {
    this.multiplexer = new ClaudeMultiplexer(maxAgents);
    this.router = new AsyncRouter('cabal-main');
    this.splitter = new StreamSplitter();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Route for agent collaboration
    this.router.addRoute('collaborate', {
      pattern: /collaborate/,
      handler: async (msg) => {
        // Distribute work among available agents
        const agents = Array.from(this.agents.values());
        const tasks = msg.tasks || [];
        
        const results = await Promise.all(
          tasks.map((task, i) => {
            const agent = agents[i % agents.length];
            return agent.requestFromPeer(agent.nodeId, task);
          })
        );
        
        return { results, processedBy: agents.length };
      }
    });

    // Route for knowledge sharing
    this.router.addRoute('knowledge', {
      pattern: 'share-knowledge',
      handler: async (msg) => {
        // Broadcast knowledge to all peers
        for (const agent of this.agents.values()) {
          await agent.broadcast({
            type: 'knowledge',
            data: msg.knowledge
          });
        }
      }
    });
  }

  async spawnAgent(name: string): Promise<PeerAgent> {
    const agent = new PeerAgent(this.multiplexer, name);
    await agent.initialize();
    this.agents.set(name, agent);
    
    console.log(`Agent ${name} spawned and connected`);
    return agent;
  }

  async createSwarm(count: number): Promise<void> {
    const promises: Promise<PeerAgent>[] = [];
    
    for (let i = 0; i < count; i++) {
      promises.push(this.spawnAgent(`agent-${i}`));
    }
    
    await Promise.all(promises);
    console.log(`Swarm of ${count} agents created`);
  }

  // Fully async multiplex mode - fire and forget
  async multicast(message: string): Promise<void> {
    await this.multiplexer.broadcast(message);
  }

  // Buffered request/response mode - collect responses
  async query(question: string, timeout = 10000): Promise<any[]> {
    const responses: any[] = [];
    const correlationId = crypto.randomUUID();
    
    // Set up response collectors
    const collectors = Array.from(this.agents.values()).map(agent => 
      this.splitter.demuxResponse(correlationId)
        .then(resp => responses.push(resp))
        .catch(() => {}) // Ignore timeouts
    );
    
    // Send query to all agents
    for (const agent of this.agents.values()) {
      await agent.sendToPeer(agent.nodeId, {
        type: 'query',
        data: question,
        correlationId
      });
    }
    
    // Wait for responses or timeout
    await Promise.race([
      Promise.all(collectors),
      new Promise(resolve => setTimeout(resolve, timeout))
    ]);
    
    return responses;
  }

  async shutdown(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.shutdown();
    }
    await this.multiplexer.killAll();
  }

  getStats() {
    return {
      agents: this.agents.size,
      multiplexer: this.multiplexer.getAgentIds(),
      router: this.router.getStats(),
      splitter: this.splitter.getStats()
    };
  }
}

// Export for CLI usage
export { ClaudeMultiplexer, PeerAgent, AsyncRouter, StreamSplitter };

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const cabal = new Cabal();
  
  (async () => {
    // Create a swarm of 3 agents
    await cabal.createSwarm(3);
    
    // Example: Collaborative query
    console.log('Sending collaborative query...');
    const responses = await cabal.query('What are the key principles of distributed systems?');
    console.log('Responses:', responses);
    
    // Keep alive for demo
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await cabal.shutdown();
      process.exit(0);
    });
  })();
}