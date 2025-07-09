import { AutonomousAgent } from './autonomous-agent.js';
import { AgentProfile } from '../registry/agent-registry.js';
import { ClaudeMultiplexer } from '../multiplex/multiplexer.js';
import { HumanInTheLoopCoordinator } from '../human-loop/coordinator.js';

export class RegisteredAgent extends AutonomousAgent {
  private heartbeatInterval?: NodeJS.Timer;
  private tasksCompleted = 0;
  private totalResponseTime = 0;
  private successfulTasks = 0;
  private startTime = Date.now();

  constructor(
    multiplexer: ClaudeMultiplexer,
    nodeId: string,
    coordinator: HumanInTheLoopCoordinator,
    private agentType: string,
    private capabilities: string[] = [],
    config?: any
  ) {
    super(multiplexer, nodeId, coordinator, config);
  }

  async initialize(): Promise<void> {
    await super.initialize();
    
    // Register with registry
    await this.registerWithRegistry();
    
    // Start heartbeat
    this.startHeartbeat();
  }

  private async registerWithRegistry(): Promise<void> {
    const profile: AgentProfile = {
      id: this.agentId,
      name: this.nodeId,
      type: this.agentType,
      status: 'online',
      capabilities: this.capabilities,
      performance: {
        tasksCompleted: 0,
        avgResponseTime: 0,
        successRate: 1.0,
        lastSeen: Date.now()
      },
      metadata: {
        nodeId: this.nodeId,
        version: '1.0.0',
        startTime: this.startTime,
        autonomyLevel: this.config.autonomyLevel
      }
    };

    await this.node.emit('registry:announce', profile);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.node.emit('registry:heartbeat', {
        agentId: this.agentId
      });
    }, 10000); // Every 10 seconds
  }

  async executeTask(task: string, context: any = {}): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Update status to busy
      await this.updateStatus('busy');
      
      const result = await super.executeTask(task, context);
      
      // Update metrics
      this.tasksCompleted++;
      this.totalResponseTime += (Date.now() - startTime);
      if (result.success) {
        this.successfulTasks++;
      }
      
      // Update registry with new performance metrics
      await this.updatePerformanceMetrics();
      
      // Update status back to online
      await this.updateStatus('online');
      
      return result;
    } catch (error) {
      // Update status to error
      await this.updateStatus('error');
      throw error;
    }
  }

  private async updateStatus(status: 'online' | 'offline' | 'busy' | 'error'): Promise<void> {
    await this.node.emit('registry:update', {
      agentId: this.agentId,
      updates: { status }
    });
  }

  private async updatePerformanceMetrics(): Promise<void> {
    const avgResponseTime = this.tasksCompleted > 0 
      ? this.totalResponseTime / this.tasksCompleted 
      : 0;
    
    const successRate = this.tasksCompleted > 0
      ? this.successfulTasks / this.tasksCompleted
      : 1.0;

    await this.node.emit('registry:update', {
      agentId: this.agentId,
      updates: {
        performance: {
          tasksCompleted: this.tasksCompleted,
          avgResponseTime,
          successRate,
          lastSeen: Date.now()
        }
      }
    });
  }

  async addCapability(capability: string): Promise<void> {
    if (!this.capabilities.includes(capability)) {
      this.capabilities.push(capability);
      await this.node.emit('registry:update', {
        agentId: this.agentId,
        updates: { capabilities: this.capabilities }
      });
    }
  }

  async removeCapability(capability: string): Promise<void> {
    const index = this.capabilities.indexOf(capability);
    if (index > -1) {
      this.capabilities.splice(index, 1);
      await this.node.emit('registry:update', {
        agentId: this.agentId,
        updates: { capabilities: this.capabilities }
      });
    }
  }

  async shutdown(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Notify registry of departure
    await this.node.emit('registry:leave', {
      agentId: this.agentId
    });
    
    await super.shutdown();
  }
}