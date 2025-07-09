import { WebSocketBridge } from './src/bridge/websocket-bridge.js';

// Test the system without actual Claude instances
console.log('🧪 Testing Cabal setup...\n');

const bridge = new WebSocketBridge(8080);

// Override the spawn method to use mock agents
const originalSpawn = bridge['cabal']['spawnAgent'];
bridge['cabal']['spawnAgent'] = async function(name: string) {
  console.log(`Mock: Would spawn agent "${name}"`);
  return name;
};

(async () => {
  console.log('✅ WebSocket server starting on port 8080');
  console.log('📡 Connect TUI to ws://localhost:8080');
  console.log('\nPress Ctrl+C to exit');
  
  // Keep running
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    process.exit(0);
  });
})();