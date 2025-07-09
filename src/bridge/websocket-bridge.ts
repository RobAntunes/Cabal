import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { Cabal } from '../index.js';
import { AgentMessage } from '../multiplex/multiplexer.js';

export interface BridgeMessage {
  type: 'agent:spawn' | 'agent:kill' | 'agent:message' | 'agent:list' | 'stats';
  payload: any;
  id?: string;
}

export class WebSocketBridge extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private cabal: Cabal;

  constructor(port: number = 8080) {
    super();
    this.wss = new WebSocketServer({ port });
    this.cabal = new Cabal();
    this.setupServer();
  }

  private setupServer() {
    this.wss.on('connection', (ws) => {
      console.log('TUI client connected');
      this.clients.add(ws);

      // Send initial state
      this.sendToClient(ws, {
        type: 'stats',
        payload: this.cabal.getStats()
      });

      ws.on('message', async (data) => {
        try {
          const msg: BridgeMessage = JSON.parse(data.toString());
          await this.handleMessage(ws, msg);
        } catch (e) {
          this.sendError(ws, e.message);
        }
      });

      ws.on('close', () => {
        console.log('TUI client disconnected');
        this.clients.delete(ws);
      });
    });

    // Forward agent events to TUI
    this.setupCabalListeners();
  }

  private setupCabalListeners() {
    // Listen to multiplexer events
    this.cabal['multiplexer'].on('agent:spawn', (data) => {
      this.broadcast({
        type: 'agent:spawn',
        payload: data
      });
    });

    this.cabal['multiplexer'].on('agent:exit', (data) => {
      this.broadcast({
        type: 'agent:kill',
        payload: data
      });
    });

    this.cabal['multiplexer'].on('message:receive', (msg: AgentMessage) => {
      this.broadcast({
        type: 'agent:message',
        payload: {
          agentId: msg.agentId,
          content: msg.data,
          timestamp: msg.timestamp
        }
      });
    });
  }

  private async handleMessage(ws: WebSocket, msg: BridgeMessage) {
    switch (msg.type) {
      case 'agent:spawn':
        const agentName = msg.payload.name || `agent-${Date.now()}`;
        await this.cabal.spawnAgent(agentName);
        break;

      case 'agent:kill':
        await this.cabal['multiplexer'].killAgent(msg.payload.agentId);
        break;

      case 'agent:message':
        const { agentId, content } = msg.payload;
        await this.cabal['multiplexer'].sendToAgent(agentId, content);
        break;

      case 'agent:list':
        this.sendToClient(ws, {
          type: 'agent:list',
          payload: this.cabal['multiplexer'].getAgentIds()
        });
        break;

      case 'stats':
        this.sendToClient(ws, {
          type: 'stats',
          payload: this.cabal.getStats()
        });
        break;
    }
  }

  private sendToClient(ws: WebSocket, msg: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private sendError(ws: WebSocket, error: string) {
    this.sendToClient(ws, {
      type: 'error',
      payload: { error }
    });
  }

  private broadcast(msg: any) {
    const data = JSON.stringify(msg);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  async start() {
    console.log(`WebSocket bridge listening on port ${this.wss.options.port}`);
    
    // Create initial swarm
    await this.cabal.createSwarm(3);
    console.log('Initial swarm created');
  }

  async shutdown() {
    await this.cabal.shutdown();
    this.wss.close();
  }
}