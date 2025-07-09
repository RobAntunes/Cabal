import { WebSocketBridge } from './bridge/websocket-bridge.js';

const bridge = new WebSocketBridge(8080);

(async () => {
  await bridge.start();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down bridge...');
    await bridge.shutdown();
    process.exit(0);
  });
})();