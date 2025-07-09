import { EnhancedCabal } from './enhanced-cabal.js';
import { AgentRegistry } from './registry/agent-registry.js';
import { RegisteredAgent } from './agents/registered-agent.js';
import { EventEmitter } from 'events';

export interface ControlCenterEvent {
  timestamp: number;
  type: string;
  from: string;
  to: string;
  data: any;
}

export class ControlCenterCabal extends EnhancedCabal {
  private registry: AgentRegistry;
  private eventStream: ControlCenterEvent[] = [];
  private eventEmitter = new EventEmitter();
  private readonly MAX_EVENTS = 1000;

  constructor(maxAgents: number = 10) {
    super(maxAgents);
    this.registry = new AgentRegistry();
    this.setupRegistryHandlers();
    this.setupEventCapture();
  }

  private setupRegistryHandlers() {
    // Forward registry events
    this.registry.on('agent:joined', (event) => {
      this.emit('registry:update', {
        type: 'agent:joined',
        agents: this.registry.getAllAgents()
      });
    });

    this.registry.on('agent:left', (event) => {
      this.emit('registry:update', {
        type: 'agent:left',
        agents: this.registry.getAllAgents()
      });
    });

    this.registry.on('agent:updated', (event) => {
      this.emit('registry:update', {
        type: 'agent:updated',
        agents: this.registry.getAllAgents()
      });
    });
  }

  private setupEventCapture() {
    // Capture all Happen events for the event stream
    const captureEvent = (type: string, data: any) => {
      const event: ControlCenterEvent = {
        timestamp: Date.now(),
        type,
        from: data.from || data.agentId || 'system',
        to: data.to || 'broadcast',
        data
      };

      this.eventStream.unshift(event);
      if (this.eventStream.length > this.MAX_EVENTS) {
        this.eventStream = this.eventStream.slice(0, this.MAX_EVENTS);
      }

      this.emit('event:captured', event);
    };

    // Intercept agent communications
    this.coordinator.on('agent:background', (data) => {
      captureEvent('agent:communication', data);
    });

    this.coordinator.on('communication:log', (data) => {
      captureEvent('communication', data);
    });

    // Capture human interactions
    this.on('human:attention', (notification) => {
      captureEvent('human:notification', notification);
    });
  }

  async spawnRegisteredAgent(role: any): Promise<RegisteredAgent> {
    const config = {
      autonomyLevel: role.autonomyLevel,
      backgroundTasks: role.backgroundTasks || [],
      requiresApprovalFor: this.getApprovalTasksForRole(role.type)
    };

    const agent = new RegisteredAgent(
      this.multiplexer,
      `${role.type}-${role.name}`,
      this.coordinator,
      role.type,
      role.capabilities || this.getDefaultCapabilities(role.type),
      config
    );

    await agent.initialize();
    this.agents.set(agent.nodeId, agent);

    // Emit spawn event
    this.emit('agent:spawned', {
      agentId: agent.nodeId,
      role,
      profile: this.registry.getAgent(agent['agentId'])
    });

    return agent;
  }

  private getDefaultCapabilities(roleType: string): string[] {
    const capabilityMap: Record<string, string[]> = {
      'researcher': ['search', 'analyze', 'summarize', 'cite'],
      'analyst': ['pattern-recognition', 'data-analysis', 'visualization', 'reporting'],
      'executor': ['code-generation', 'task-execution', 'system-commands', 'file-operations'],
      'reviewer': ['quality-check', 'validation', 'testing', 'approval'],
      'coordinator': ['planning', 'scheduling', 'resource-allocation', 'monitoring']
    };
    return capabilityMap[roleType] || [];
  }

  // Enhanced task distribution using registry
  async executeSmartTask(
    taskDescription: string,
    requiredCapabilities: string[],
    options: {
      preferredAgentType?: string;
      maxAgents?: number;
      timeout?: number;
    } = {}
  ): Promise<any> {
    // Find suitable agents using registry
    const candidates = requiredCapabilities.length > 0
      ? this.registry.getAgentsByCapability(requiredCapabilities[0])
      : this.registry.getOnlineAgents();

    // Filter by additional capabilities
    const suitableAgents = candidates.filter(agent =>
      requiredCapabilities.every(cap => agent.capabilities.includes(cap))
    );

    if (suitableAgents.length === 0) {
      throw new Error('No suitable agents found for task');
    }

    // Sort by performance
    suitableAgents.sort((a, b) => {
      const scoreA = a.performance.successRate / (a.performance.avgResponseTime || 1);
      const scoreB = b.performance.successRate / (b.performance.avgResponseTime || 1);
      return scoreB - scoreA;
    });

    // Use top performers
    const selectedAgents = suitableAgents.slice(0, options.maxAgents || 3);

    // Execute task with selected agents
    const results = await Promise.all(
      selectedAgents.map(agentProfile => {
        const agent = this.agents.get(agentProfile.name);
        if (!agent) return null;
        
        return agent.executeTask(taskDescription, {
          capabilities: requiredCapabilities,
          timeout: options.timeout
        });
      })
    );

    return {
      task: taskDescription,
      agents: selectedAgents.map(a => a.name),
      results: results.filter(r => r !== null),
      timestamp: Date.now()
    };
  }

  // Get system-wide statistics
  getControlCenterStats() {
    const registryStats = this.registry.getStats();
    const systemStats = this.getSystemStatus();
    
    // Calculate events per minute
    const recentEvents = this.eventStream.filter(e => 
      e.timestamp > Date.now() - 60000
    );

    return {
      registry: registryStats,
      system: systemStats,
      events: {
        total: this.eventStream.length,
        perMinute: recentEvents.length,
        recent: this.eventStream.slice(0, 10)
      },
      performance: {
        avgResponseTime: registryStats.avgResponseTime,
        successRate: registryStats.avgSuccessRate,
        tasksCompleted: this.agents.size * 10 // Placeholder
      }
    };
  }

  // Get live event stream
  getEventStream(limit: number = 100): ControlCenterEvent[] {
    return this.eventStream.slice(0, limit);
  }

  // Find best agent for specific task
  async findBestAgentForTask(requirements: {
    type?: string;
    capabilities?: string[];
    urgency?: 'high' | 'medium' | 'low';
  }): Promise<string | undefined> {
    const agent = this.registry.findBestAgent({
      type: requirements.type,
      capabilities: requirements.capabilities,
      preferOnline: requirements.urgency === 'high'
    });

    return agent?.id;
  }

  // Monitor agent performance
  onAgentPerformance(callback: (agentId: string, metrics: any) => void) {
    this.registry.on('agent:updated', (event) => {
      if (event.profile?.performance) {
        callback(event.agentId, event.profile.performance);
      }
    });
  }

  // Monitor event stream
  onEvent(callback: (event: ControlCenterEvent) => void) {
    this.on('event:captured', callback);
  }
}