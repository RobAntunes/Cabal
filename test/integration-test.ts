import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Cabal } from '../src/index.js';

describe('Cabal Integration Tests', () => {
  let cabal: Cabal;

  beforeAll(async () => {
    cabal = new Cabal(3);
  });

  afterAll(async () => {
    if (cabal) {
      await cabal.shutdown();
    }
  });

  it('should create a swarm of agents', async () => {
    await cabal.createSwarm(3);
    const stats = cabal.getStats();
    expect(stats.agents).toBe(3);
  }, 30000);

  it('should handle multicast messages', async () => {
    await cabal.multicast('Hello from the swarm!');
    // Give agents time to process
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it('should handle query responses', async () => {
    const responses = await cabal.query('What is 2+2?', 5000);
    expect(responses).toBeDefined();
    expect(Array.isArray(responses)).toBe(true);
  }, 10000);

  it('should report statistics', () => {
    const stats = cabal.getStats();
    expect(stats).toHaveProperty('agents');
    expect(stats).toHaveProperty('multiplexer');
    expect(stats).toHaveProperty('router');
    expect(stats).toHaveProperty('splitter');
  });
});

describe('Multiplexer Unit Tests', () => {
  it('should handle concurrent message streams', async () => {
    // Test the multiplexer can handle multiple simultaneous streams
    const { ClaudeMultiplexer } = await import('../src/multiplex/multiplexer.js');
    const mux = new ClaudeMultiplexer(2);
    
    const messages: any[] = [];
    mux.on('message:receive', (msg) => messages.push(msg));
    
    // Simulate concurrent operations
    const agent1 = await mux.spawnAgent();
    const agent2 = await mux.spawnAgent();
    
    await Promise.all([
      mux.sendToAgent(agent1, 'Task 1'),
      mux.sendToAgent(agent2, 'Task 2')
    ]);
    
    await mux.killAll();
  });
});