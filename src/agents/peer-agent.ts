import { createHappen, HappenNode, Event } from '@happen/core';
import { ClaudeMultiplexer, AgentMessage } from '../multiplex/multiplexer.js';

export interface PeerMessage {
  from: string;
  to: string | 'broadcast';
  content: any;
  requestId?: string;
}

export class PeerAgent {
  private node: HappenNode;
  private agentId: string;
  private peers: Set<string> = new Set();
  private happen = createHappen();

  constructor(
    private multiplexer: ClaudeMultiplexer,
    private nodeId: string
  ) {
    this.node = this.happen.createNode(nodeId);
    this.agentId = '';
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    // Spawn Claude instance
    this.agentId = await this.multiplexer.spawnAgent({
      args: ['--temperature', '0.7']
    });

    // Announce presence to network
    await this.node.emit('peer:announce', {
      nodeId: this.nodeId,
      agentId: this.agentId,
      capabilities: ['chat', 'code', 'analysis']
    });

    // Listen for multiplexer events
    this.multiplexer.on('message:receive', (msg: AgentMessage) => {
      if (msg.agentId === this.agentId) {
        this.handleClaudeResponse(msg);
      }
    });
  }

  private setupEventHandlers() {
    // Peer discovery
    this.node.on('peer:announce', async (event: Event) => {
      const { nodeId, agentId } = event.data;
      if (nodeId !== this.nodeId) {
        this.peers.add(nodeId);
        this.node.emit('peer:discovered', { nodeId, agentId });
      }
    });

    // Direct peer messages
    this.node.on('peer:message', async (event: Event) => {
      const msg = event.data as PeerMessage;
      if (msg.to === this.nodeId || msg.to === 'broadcast') {
        await this.handlePeerMessage(msg);
      }
    });

    // Request-response pattern
    this.node.on('peer:request', async (event: Event) => {
      const { from, content, requestId } = event.data;
      
      // Forward to Claude
      await this.multiplexer.sendToAgent(this.agentId, content, requestId);
      
      // Response will be handled in handleClaudeResponse
    });
  }

  private async handlePeerMessage(msg: PeerMessage) {
    // Process peer message
    if (msg.content.type === 'query') {
      // Forward to Claude for processing
      await this.multiplexer.sendToAgent(this.agentId, msg.content.data);
    } else if (msg.content.type === 'share') {
      // Store shared knowledge
      this.node.state.set(`shared:${msg.from}`, msg.content.data);
    }
  }

  private async handleClaudeResponse(msg: AgentMessage) {
    // Emit response back to network if it has a correlation ID
    if (msg.correlationId) {
      await this.node.emit('peer:response', {
        nodeId: this.nodeId,
        agentId: this.agentId,
        requestId: msg.correlationId,
        data: msg.data
      });
    }

    // Broadcast interesting findings
    if (this.shouldBroadcast(msg)) {
      await this.broadcastDiscovery(msg);
    }
  }

  private shouldBroadcast(msg: AgentMessage): boolean {
    // Logic to determine if response should be shared
    // Could check for keywords, confidence scores, etc.
    return msg.data.confidence > 0.8 || msg.data.type === 'discovery';
  }

  private async broadcastDiscovery(msg: AgentMessage) {
    await this.node.emit('peer:discovery', {
      from: this.nodeId,
      agentId: this.agentId,
      discovery: msg.data,
      timestamp: msg.timestamp
    });
  }

  async sendToPeer(targetNodeId: string, content: any): Promise<void> {
    const msg: PeerMessage = {
      from: this.nodeId,
      to: targetNodeId,
      content
    };
    await this.node.emit('peer:message', msg);
  }

  async requestFromPeer(targetNodeId: string, query: string): Promise<any> {
    const requestId = crypto.randomUUID();
    
    return new Promise((resolve) => {
      // Set up response handler
      const handler = (event: Event) => {
        if (event.data.requestId === requestId) {
          this.node.off('peer:response', handler);
          resolve(event.data.data);
        }
      };
      this.node.on('peer:response', handler);

      // Send request
      this.node.emit('peer:request', {
        from: this.nodeId,
        to: targetNodeId,
        content: query,
        requestId
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        this.node.off('peer:response', handler);
        resolve(null);
      }, 30000);
    });
  }

  async broadcast(content: any): Promise<void> {
    const msg: PeerMessage = {
      from: this.nodeId,
      to: 'broadcast',
      content
    };
    await this.node.emit('peer:message', msg);
  }

  async shutdown(): Promise<void> {
    await this.multiplexer.killAgent(this.agentId);
    await this.node.emit('peer:leave', { nodeId: this.nodeId });
  }
}