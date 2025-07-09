import { WebSocketBridge } from './bridge/websocket-bridge.js';
import { spawn } from 'child_process';

// Mock the Claude spawn to use echo for testing
const originalSpawn = spawn as any;
(global as any).spawn = function(command: string, args: string[], options: any) {
  if (command === 'claude') {
    console.log(`Mock: Would spawn claude with args:`, args);
    // Return a mock process that echoes input
    const proc = originalSpawn('sh', ['-c', 'while read line; do echo "Mock response: $line"; done'], options);
    return proc;
  }
  return originalSpawn(command, args, options);
};

const bridge = new WebSocketBridge(8080);

(async () => {
  console.log('🧪 Starting Cabal in mock mode...\n');
  await bridge.start();
  console.log('✅ Mock server ready on ws://localhost:8080');
  console.log('📝 Claude commands will be mocked with echo responses');
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down mock server...');
    await bridge.shutdown();
    process.exit(0);
  });
})();