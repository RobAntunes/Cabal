import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { EnhancedCabal } from '../enhanced-cabal.js';
import { HumanNotification } from '../enhanced-cabal.js';

export interface TUINotification {
  type: 'agent:notification';
  payload: {
    agentId: string;
    notificationLevel: 'normal' | 'notification' | 'critical';
    pendingRequests: number;
    message?: string;
  };
}

export interface BridgeMessage {
  type: 'agent:spawn' | 'agent:kill' | 'agent:message' | 'agent:list' | 'stats' | 'human:response' | 'agent:notification';
  payload: any;
  id?: string;
}

export class EnhancedWebSocketBridge extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private cabal: EnhancedCabal;
  private agentNotificationStates: Map<string, any> = new Map();

  constructor(port: number = 8080) {
    super();
    this.wss = new WebSocketServer({ port });
    this.cabal = new EnhancedCabal();
    this.setupServer();
    this.setupNotificationHandlers();
  }

  private setupServer() {
    this.wss.on('connection', (ws) => {
      console.log('TUI client connected');
      this.clients.add(ws);

      // Send initial state
      this.sendToClient(ws, {
        type: 'stats',
        payload: this.cabal.getSystemStatus()
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
  }

  private setupNotificationHandlers() {
    // Listen for human attention requests
    this.cabal.on('human:attention', (notification: HumanNotification) => {
      // Map notification to TUI format
      if (notification.type === 'request' && notification.content.from) {
        const agentId = notification.content.from;
        
        // Determine notification level
        let level: 'normal' | 'notification' | 'critical' = 'notification';
        if (notification.priority === 'high') {
          level = 'critical';
        } else if (notification.priority === 'low') {
          level = 'normal';
        }

        // Update agent state
        const currentState = this.agentNotificationStates.get(agentId) || {
          pendingRequests: 0
        };
        
        currentState.pendingRequests++;
        this.agentNotificationStates.set(agentId, currentState);

        // Send to TUI
        this.broadcast({
          type: 'agent:notification',
          payload: {
            agentId,
            notificationLevel: level,
            pendingRequests: currentState.pendingRequests,
            message: this.formatNotificationMessage(notification)
          }
        } as TUINotification);
      }
    });

    // Listen for agent spawns
    this.cabal.on('agent:spawned', (data) => {
      this.broadcast({
        type: 'agent:spawn',
        payload: {
          ...data,
          agentId: data.agentId,
          notificationLevel: 'normal',
          pendingRequests: 0
        }
      });
    });

    // Monitor background activity
    let activityBuffer: any[] = [];
    this.cabal.on('agent:background', (activity) => {
      activityBuffer.push(activity);
      
      // Send summary every 5 activities
      if (activityBuffer.length >= 5) {
        const summary = this.summarizeActivity(activityBuffer);
        activityBuffer = [];
        
        // Send low-priority notification
        this.broadcast({
          type: 'agent:notification',
          payload: {
            agentId: activity.from,
            notificationLevel: 'normal',
            pendingRequests: 0,
            message: summary
          }
        } as TUINotification);
      }
    });
  }

  private formatNotificationMessage(notification: HumanNotification): string {
    const { content } = notification;
    
    switch (notification.type) {
      case 'request':
        if (content.type === 'approval') {
          return `Approval needed: ${content.context.task || 'Unknown task'}`;
        } else if (content.type === 'input') {
          return `Input requested: ${content.context.reason || 'Guidance needed'}`;
        } else if (content.type === 'review') {
          return `Review requested: Low confidence decision`;
        }
        break;
      case 'milestone':
        return `Milestone: ${content.event}`;
      case 'alert':
        return `Alert: ${content.event || content.message}`;
      case 'summary':
        return `Background activity: ${content.activityCount} operations`;
    }
    
    return 'Notification';
  }

  private summarizeActivity(activities: any[]): string {
    const types = activities.map(a => a.type);
    const uniqueTypes = [...new Set(types)];
    return `Completed: ${uniqueTypes.join(', ')} (${activities.length} total)`;
  }

  private async handleMessage(ws: WebSocket, msg: BridgeMessage) {
    switch (msg.type) {
      case 'agent:spawn':
        // Spawn specialized agent with role
        const role = msg.payload.role || {
          name: msg.payload.name || `agent-${Date.now()}`,
          type: 'analyst',
          autonomyLevel: 'supervised'
        };
        await this.cabal.spawnSpecializedAgent(role);
        break;

      case 'agent:kill':
        // Not implemented in EnhancedCabal yet
        break;

      case 'agent:message':
        // Route message to specific agent
        const agent = this.cabal['agents'].get(msg.payload.agentId);
        if (agent) {
          await agent.executeTask('user-message', {
            message: msg.payload.content
          });
        }
        break;

      case 'human:response':
        // Human responding to a request
        this.cabal.respondToRequest(msg.payload.requestId, msg.payload.response);
        
        // Update notification state
        const agentId = msg.payload.agentId;
        if (agentId && this.agentNotificationStates.has(agentId)) {
          const state = this.agentNotificationStates.get(agentId);
          state.pendingRequests = Math.max(0, state.pendingRequests - 1);
          
          // Send updated state
          this.broadcast({
            type: 'agent:notification',
            payload: {
              agentId,
              notificationLevel: state.pendingRequests > 0 ? 'notification' : 'normal',
              pendingRequests: state.pendingRequests
            }
          } as TUINotification);
        }
        break;

      case 'stats':
        this.sendToClient(ws, {
          type: 'stats',
          payload: this.cabal.getSystemStatus()
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
    console.log(`Enhanced WebSocket bridge listening on port ${this.wss.options.port}`);
    
    // Create initial specialized agents
    const roles = [
      { name: 'alpha', type: 'researcher' as const, autonomyLevel: 'full' as const },
      { name: 'beta', type: 'analyst' as const, autonomyLevel: 'supervised' as const },
      { name: 'gamma', type: 'executor' as const, autonomyLevel: 'manual' as const }
    ];

    for (const role of roles) {
      await this.cabal.spawnSpecializedAgent(role);
    }
    
    console.log('Initial agent swarm created');
  }

  async shutdown() {
    await this.cabal.shutdown();
    this.wss.close();
  }
}