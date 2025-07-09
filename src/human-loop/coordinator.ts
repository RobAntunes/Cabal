import { EventEmitter } from 'events';
import { PeerAgent } from '../agents/peer-agent.js';
import { AsyncRouter } from '../multiplex/async-router.js';

export interface HumanRequest {
  id: string;
  type: 'approval' | 'decision' | 'input' | 'review';
  priority: 'high' | 'medium' | 'low';
  from: string;
  context: any;
  options?: string[];
  timestamp: number;
  timeout?: number;
}

export interface AgentPolicy {
  agentId: string;
  autonomyLevel: 'full' | 'supervised' | 'manual';
  requiresApprovalFor: string[];
  notifyHumanFor: string[];
}

export class HumanInTheLoopCoordinator extends EventEmitter {
  private pendingRequests: Map<string, HumanRequest> = new Map();
  private policies: Map<string, AgentPolicy> = new Map();
  private router: AsyncRouter;
  private humanAttentionThreshold = 0.8; // Confidence threshold

  constructor() {
    super();
    this.router = new AsyncRouter('human-loop');
    this.setupRoutes();
  }

  private setupRoutes() {
    // Route for agent decisions that might need human input
    this.router.addRoute('decision', {
      pattern: /decision:/,
      handler: async (msg) => {
        return this.handleDecision(msg);
      },
      priority: 10
    });

    // Route for autonomous agent communication
    this.router.addRoute('agent-comm', {
      pattern: /^agent:/,
      handler: async (msg) => {
        // Log but don't interrupt - agents talking to each other
        this.emit('agent:background', {
          from: msg.from,
          to: msg.to,
          type: 'communication',
          content: msg.content
        });
        return { handled: true };
      }
    });

    // Route for human attention requests
    this.router.addRoute('human-needed', {
      pattern: /human:|attention:|help:/,
      handler: async (msg) => {
        return this.requestHumanAttention(msg);
      },
      priority: 100
    });
  }

  setAgentPolicy(agentId: string, policy: Partial<AgentPolicy>) {
    const existing = this.policies.get(agentId) || {
      agentId,
      autonomyLevel: 'supervised',
      requiresApprovalFor: [],
      notifyHumanFor: []
    };

    this.policies.set(agentId, { ...existing, ...policy });
  }

  private async handleDecision(msg: any): Promise<any> {
    const policy = this.policies.get(msg.agentId);
    
    // Check if this decision type requires human approval
    if (policy && policy.requiresApprovalFor.includes(msg.decisionType)) {
      return this.requestHumanApproval(msg);
    }

    // Check confidence level
    if (msg.confidence < this.humanAttentionThreshold) {
      return this.requestHumanReview(msg);
    }

    // Otherwise, let agent proceed autonomously
    this.emit('agent:autonomous', {
      agentId: msg.agentId,
      decision: msg.decision,
      confidence: msg.confidence
    });

    return { approved: true, autonomous: true };
  }

  private async requestHumanApproval(msg: any): Promise<any> {
    const request: HumanRequest = {
      id: crypto.randomUUID(),
      type: 'approval',
      priority: 'high',
      from: msg.agentId,
      context: msg,
      timestamp: Date.now(),
      timeout: 30000
    };

    this.pendingRequests.set(request.id, request);
    this.emit('human:request', request);

    // Wait for human response
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        resolve({ approved: false, reason: 'timeout' });
      }, request.timeout!);

      this.once(`response:${request.id}`, (response) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(request.id);
        resolve(response);
      });
    });
  }

  private async requestHumanReview(msg: any): Promise<any> {
    const request: HumanRequest = {
      id: crypto.randomUUID(),
      type: 'review',
      priority: 'medium',
      from: msg.agentId,
      context: msg,
      timestamp: Date.now()
    };

    this.pendingRequests.set(request.id, request);
    this.emit('human:request', request);

    // For reviews, we can proceed but flag for human attention
    return { 
      approved: true, 
      flaggedForReview: true,
      requestId: request.id 
    };
  }

  private async requestHumanAttention(msg: any): Promise<any> {
    const request: HumanRequest = {
      id: crypto.randomUUID(),
      type: 'input',
      priority: msg.urgent ? 'high' : 'medium',
      from: msg.agentId,
      context: msg,
      timestamp: Date.now()
    };

    this.pendingRequests.set(request.id, request);
    this.emit('human:request', request);

    // Wait for human input
    return new Promise((resolve) => {
      this.once(`response:${request.id}`, (response) => {
        this.pendingRequests.delete(request.id);
        resolve(response);
      });
    });
  }

  // Human responds to a request
  respondToRequest(requestId: string, response: any) {
    if (this.pendingRequests.has(requestId)) {
      this.emit(`response:${requestId}`, response);
    }
  }

  // Get all pending human requests
  getPendingRequests(): HumanRequest[] {
    return Array.from(this.pendingRequests.values())
      .sort((a, b) => {
        // Sort by priority then timestamp
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const aDiff = priorityWeight[a.priority];
        const bDiff = priorityWeight[b.priority];
        if (aDiff !== bDiff) return bDiff - aDiff;
        return a.timestamp - b.timestamp;
      });
  }

  // Monitor agent conversations
  monitorAgentCommunication(from: string, to: string, message: any) {
    const policy = this.policies.get(from);
    
    // Check if we should notify human about this communication
    if (policy && policy.notifyHumanFor.some(pattern => 
      message.content.includes(pattern)
    )) {
      this.emit('human:notify', {
        type: 'agent-communication',
        from,
        to,
        message,
        reason: 'keyword-match'
      });
    }

    // Log all communications for audit
    this.emit('communication:log', {
      from,
      to,
      message,
      timestamp: Date.now()
    });
  }

  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      policies: this.policies.size,
      requests: Array.from(this.pendingRequests.values()).map(r => ({
        id: r.id,
        type: r.type,
        priority: r.priority,
        from: r.from,
        age: Date.now() - r.timestamp
      }))
    };
  }
}