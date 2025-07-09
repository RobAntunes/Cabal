import { EnhancedWebSocketBridge } from './bridge/enhanced-bridge.js';

const bridge = new EnhancedWebSocketBridge(8080);

(async () => {
  await bridge.start();
  
  console.log('🚀 Enhanced Cabal Server Running');
  console.log('   - Human-in-the-loop enabled');
  console.log('   - Visual notifications in TUI');
  console.log('   - Autonomous agent operations\n');
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down enhanced server...');
    await bridge.shutdown();
    process.exit(0);
  });
})();