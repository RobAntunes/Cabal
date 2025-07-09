import { EnhancedWebSocketBridge } from './bridge/enhanced-bridge.js';
import { spawn } from 'child_process';

// Mock the Claude spawn to simulate responses
const originalSpawn = spawn as any;
(global as any).spawn = function(command: string, args: string[], options: any) {
  if (command === 'claude') {
    console.log(`Mock: Spawning mock Claude agent`);
    
    // Create a mock process that simulates Claude responses
    const mockScript = `
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });
      
      rl.on('line', (line) => {
        try {
          const input = JSON.parse(line);
          const content = input.content || '';
          
          // Simulate different responses based on content
          let response = {
            type: 'response',
            content: 'Mock agent acknowledges: ' + content
          };
          
          if (content.includes('confidence')) {
            response.content = 'Confidence level: 0.75\\nReasoning: Based on available data\\nRisks: Moderate\\nApproach: Proceed with caution';
          } else if (content.includes('Execute')) {
            response.content = 'Task executed successfully.\\nResult: Operation completed\\nStatus: Success';
          } else if (content.includes('research')) {
            response.content = 'Research findings:\\n- Key insight 1\\n- Key insight 2\\n- Recommendation: Continue investigation';
          }
          
          console.log(JSON.stringify(response));
        } catch (e) {
          console.log(JSON.stringify({ type: 'error', message: e.message }));
        }
      });
    `;
    
    const proc = originalSpawn('node', ['-e', mockScript], options);
    return proc;
  }
  return originalSpawn(command, args, options);
};

const bridge = new EnhancedWebSocketBridge(8080);

(async () => {
  console.log('🧪 Starting Enhanced Cabal Mock Server...\n');
  console.log('Features:');
  console.log('✅ Mock Claude agents with simulated responses');
  console.log('✅ Human-in-the-loop notification system');
  console.log('✅ Colored borders in TUI based on agent status');
  console.log('✅ Notification badges and counters\n');
  
  await bridge.start();
  
  console.log('📡 Mock server ready on ws://localhost:8080');
  console.log('🎨 TUI will show:');
  console.log('   - Green borders for normal operation');
  console.log('   - Yellow borders for notifications');
  console.log('   - Red borders for critical/approval needed');
  console.log('   - Badges with pending request counts\n');
  
  // Simulate some initial activity after 5 seconds
  setTimeout(() => {
    console.log('🎭 Starting simulated agent activities...');
    
    // Trigger some background activities
    const cabal = bridge['cabal'];
    const agents = Array.from(cabal['agents'].values());
    
    if (agents.length > 0) {
      // Simulate background research
      agents[0].executeTask('literature-review', {
        topic: 'AI safety',
        background: true
      });
      
      // Simulate a notification after 3 seconds
      setTimeout(() => {
        agents[1].executeTask('data-analysis', {
          confidence: 0.6,
          data: 'market-trends'
        });
      }, 3000);
    }
  }, 5000);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down enhanced mock server...');
    await bridge.shutdown();
    process.exit(0);
  });
})();