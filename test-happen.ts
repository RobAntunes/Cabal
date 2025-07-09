// Simple test to verify Happen import works
import { createHappen } from '@happen/core';

console.log('✅ Happen imported successfully');
console.log('Creating test node...');

const happen = createHappen();
const node = happen.createNode('test-node');
console.log('✅ Node created:', node.id);

await node.emit('test', { message: 'Hello from Cabal!' });
console.log('✅ Event emitted');

console.log('\n🎉 All imports working!');