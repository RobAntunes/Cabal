import { EnhancedWebSocketBridge } from '../src/bridge/enhanced-bridge.js';

/**
 * Demo: Visual Notification System
 * 
 * Simulates agent activities that trigger different notification levels
 * to demonstrate the TUI's colored border system.
 */

async function runNotificationDemo() {
  console.log('🔔 Notification System Demo\n');
  
  const bridge = new EnhancedWebSocketBridge(8080);
  await bridge.start();
  
  console.log('✅ Bridge started. Connect TUI to see notifications.\n');
  console.log('Demo will simulate various agent activities:\n');
  console.log('🟢 Green border - Normal operation');
  console.log('🟡 Yellow border - Notification/attention needed');
  console.log('🔴 Red border - Critical/approval required\n');
  
  // Get the cabal instance
  const cabal = bridge['cabal'];
  const agents = Array.from(cabal['agents'].values());
  
  // Simulate different scenarios
  setTimeout(async () => {
    console.log('\n📋 Scenario 1: Normal background activity');
    
    // Agent 0 - Researcher doing background work
    const researcher = agents.find(a => a.nodeId.includes('researcher'));
    if (researcher) {
      console.log('   Agent Alpha performing background research...');
      
      // Simulate multiple background activities
      for (let i = 0; i < 5; i++) {
        await researcher.sendToPeer(researcher.nodeId, {
          type: 'research-update',
          data: `Found paper ${i + 1} on distributed systems`
        });
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }, 3000);
  
  setTimeout(async () => {
    console.log('\n📋 Scenario 2: Low-priority notification');
    
    // Agent 1 - Analyst found something interesting
    const analyst = agents.find(a => a.nodeId.includes('analyst'));
    if (analyst) {
      console.log('   Agent Beta found anomaly, requesting review...');
      
      // Simulate low confidence decision
      await analyst.executeTask('anomaly-detection', {
        pattern: 'unusual-spike-in-data',
        confidence: 0.7,
        severity: 'medium'
      });
    }
  }, 8000);
  
  setTimeout(async () => {
    console.log('\n📋 Scenario 3: Critical approval needed');
    
    // Agent 2 - Executor needs approval
    const executor = agents.find(a => a.nodeId.includes('executor'));
    if (executor) {
      console.log('   Agent Gamma requesting approval for critical operation...');
      
      // This will trigger a red notification
      await executor.executeTask('modify-critical', {
        target: 'production-database',
        operation: 'schema-migration',
        risk: 'high'
      });
    }
  }, 13000);
  
  setTimeout(async () => {
    console.log('\n📋 Scenario 4: Multiple agents need attention');
    
    // Simulate multiple agents needing attention
    for (const agent of agents.slice(0, 2)) {
      await agent.executeTask('collaborative-decision', {
        question: 'Should we proceed with optimization?',
        requiresConsensus: true
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }, 18000);
  
  // Simulate human responses
  setTimeout(() => {
    console.log('\n👤 Simulating human response to requests...');
    
    const requests = cabal.getHumanRequests();
    requests.forEach((request, index) => {
      setTimeout(() => {
        console.log(`   Responding to request ${index + 1}...`);
        cabal.respondToRequest(request.id, {
          approved: true,
          reason: 'Automated demo approval',
          guidance: 'Proceed with caution'
        });
      }, index * 2000);
    });
  }, 25000);
  
  // Keep running
  console.log('\n💡 Demo running. Watch the TUI for color changes!');
  console.log('   - Borders change based on notification level');
  console.log('   - Badge shows pending request count');
  console.log('   - Status bar shows system-wide notifications');
  console.log('\nPress Ctrl+C to exit.\n');
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down demo...');
    await bridge.shutdown();
    process.exit(0);
  });
}

// Run the demo
runNotificationDemo().catch(console.error);