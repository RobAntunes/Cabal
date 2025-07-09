import { EventEmitter } from 'events';
import { createHappen } from '@happen/core';

export interface AgentProfile {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  capabilities: string[];
  performance: {
    tasksCompleted: number;
    avgResponseTime: number;
    successRate: number;
    lastSeen: number;
  };
  metadata: {
    nodeId: string;
    version: string;
    startTime: number;
    autonomyLevel: string;
  };
}

export interface RegistryEvent {
  type: 'agent:joined' | 'agent:left' | 'agent:updated' | 'agent:heartbeat';
  agentId: string;
  profile?: AgentProfile;
  timestamp: number;
}

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentProfile> = new Map();
  private happen = createHappen();
  private registryNode = this.happen.createNode('agent-registry');
  private heartbeatIntervals: Map<string, NodeJS.Timer> = new Map();
  private readonly HEARTBEAT_INTERVAL = 10000; // 10 seconds
  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds

  constructor() {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Listen for agent announcements
    this.registryNode.on('registry:announce', async (event) => {
      const profile = event.data as AgentProfile;
      await this.registerAgent(profile);
    });

    // Listen for heartbeats
    this.registryNode.on('registry:heartbeat', async (event) => {
      const { agentId } = event.data;
      await this.updateHeartbeat(agentId);
    });

    // Listen for agent updates
    this.registryNode.on('registry:update', async (event) => {
      const { agentId, updates } = event.data;
      await this.updateAgent(agentId, updates);
    });

    // Listen for agent departure
    this.registryNode.on('registry:leave', async (event) => {
      const { agentId } = event.data;
      await this.unregisterAgent(agentId);
    });

    // Start cleanup interval
    setInterval(() => this.cleanupStaleAgents(), this.HEARTBEAT_INTERVAL);
  }

  async registerAgent(profile: AgentProfile): Promise<void> {
    const existingAgent = this.agents.get(profile.id);
    
    // Update profile with latest info
    profile.performance.lastSeen = Date.now();
    profile.status = 'online';
    
    this.agents.set(profile.id, profile);
    
    // Set up heartbeat expectation
    this.resetHeartbeatTimer(profile.id);
    
    // Emit appropriate event
    if (!existingAgent) {
      this.emit('agent:joined', {
        type: 'agent:joined',
        agentId: profile.id,
        profile,
        timestamp: Date.now()
      } as RegistryEvent);
      
      // Broadcast to network
      await this.registryNode.emit('registry:agent-joined', profile);
    } else {
      this.emit('agent:updated', {
        type: 'agent:updated',
        agentId: profile.id,
        profile,
        timestamp: Date.now()
      } as RegistryEvent);
    }
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    // Clear heartbeat timer
    const timer = this.heartbeatIntervals.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatIntervals.delete(agentId);
    }
    
    // Remove from registry
    this.agents.delete(agentId);
    
    this.emit('agent:left', {
      type: 'agent:left',
      agentId,
      timestamp: Date.now()
    } as RegistryEvent);
    
    // Broadcast departure
    await this.registryNode.emit('registry:agent-left', { agentId });
  }

  async updateAgent(agentId: string, updates: Partial<AgentProfile>): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    // Merge updates
    const updatedProfile = { ...agent, ...updates };
    updatedProfile.performance.lastSeen = Date.now();
    
    this.agents.set(agentId, updatedProfile);
    
    this.emit('agent:updated', {
      type: 'agent:updated',
      agentId,
      profile: updatedProfile,
      timestamp: Date.now()
    } as RegistryEvent);
  }

  private async updateHeartbeat(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    agent.performance.lastSeen = Date.now();
    agent.status = 'online';
    
    // Reset heartbeat timer
    this.resetHeartbeatTimer(agentId);
    
    this.emit('agent:heartbeat', {
      type: 'agent:heartbeat',
      agentId,
      timestamp: Date.now()
    } as RegistryEvent);
  }

  private resetHeartbeatTimer(agentId: string) {
    // Clear existing timer
    const existingTimer = this.heartbeatIntervals.get(agentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      this.markAgentOffline(agentId);
    }, this.HEARTBEAT_TIMEOUT);
    
    this.heartbeatIntervals.set(agentId, timer);
  }

  private markAgentOffline(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    agent.status = 'offline';
    
    this.emit('agent:updated', {
      type: 'agent:updated',
      agentId,
      profile: agent,
      timestamp: Date.now()
    } as RegistryEvent);
  }

  private cleanupStaleAgents() {
    const now = Date.now();
    const staleThreshold = now - (this.HEARTBEAT_TIMEOUT * 2);
    
    for (const [agentId, agent] of this.agents) {
      if (agent.performance.lastSeen < staleThreshold && agent.status === 'offline') {
        this.unregisterAgent(agentId);
      }
    }
  }

  // Query methods
  getAgent(agentId: string): AgentProfile | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentProfile[] {
    return Array.from(this.agents.values());
  }

  getOnlineAgents(): AgentProfile[] {
    return this.getAllAgents().filter(a => a.status === 'online');
  }

  getAgentsByType(type: string): AgentProfile[] {
    return this.getAllAgents().filter(a => a.type === type);
  }

  getAgentsByCapability(capability: string): AgentProfile[] {
    return this.getAllAgents().filter(a => 
      a.capabilities.includes(capability)
    );
  }

  // Find best agent for a task
  findBestAgent(requirements: {
    type?: string;
    capabilities?: string[];
    preferOnline?: boolean;
  }): AgentProfile | undefined {
    let candidates = this.getAllAgents();
    
    if (requirements.type) {
      candidates = candidates.filter(a => a.type === requirements.type);
    }
    
    if (requirements.capabilities) {
      candidates = candidates.filter(a => 
        requirements.capabilities!.every(cap => a.capabilities.includes(cap))
      );
    }
    
    if (requirements.preferOnline) {
      const online = candidates.filter(a => a.status === 'online');
      if (online.length > 0) candidates = online;
    }
    
    // Sort by performance
    candidates.sort((a, b) => {
      const scoreA = a.performance.successRate * (1 / (a.performance.avgResponseTime || 1));
      const scoreB = b.performance.successRate * (1 / (b.performance.avgResponseTime || 1));
      return scoreB - scoreA;
    });
    
    return candidates[0];
  }

  // Statistics
  getStats() {
    const agents = this.getAllAgents();
    const online = agents.filter(a => a.status === 'online');
    const byType = agents.reduce((acc, agent) => {
      acc[agent.type] = (acc[agent.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: agents.length,
      online: online.length,
      offline: agents.length - online.length,
      byType,
      avgResponseTime: agents.reduce((sum, a) => sum + a.performance.avgResponseTime, 0) / agents.length || 0,
      avgSuccessRate: agents.reduce((sum, a) => sum + a.performance.successRate, 0) / agents.length || 0
    };
  }
}