import { ClaudeMultiplexer } from './multiplex/multiplexer.js';
import { AutonomousAgent, AutonomousConfig } from './agents/autonomous-agent.js';
import { HumanInTheLoopCoordinator } from './human-loop/coordinator.js';
import { AsyncRouter } from './multiplex/async-router.js';
import { StreamSplitter } from './multiplex/stream-splitter.js';
import { EventEmitter } from 'events';

export interface AgentRole {
  name: string;
  type: 'researcher' | 'analyst' | 'executor' | 'reviewer' | 'coordinator';
  autonomyLevel: 'full' | 'supervised' | 'manual';
  specialization?: string;
  backgroundTasks?: string[];
}

export interface HumanNotification {
  type: 'request' | 'alert' | 'summary' | 'milestone';
  priority: 'high' | 'medium' | 'low';
  content: any;
  requiresResponse: boolean;
}

export class EnhancedCabal extends EventEmitter {
  private multiplexer: ClaudeMultiplexer;
  private agents: Map<string, AutonomousAgent> = new Map();
  private coordinator: HumanInTheLoopCoordinator;
  private router: AsyncRouter;
  private splitter: StreamSplitter;
  private backgroundActivity: any[] = [];

  constructor(private maxAgents: number = 5) {
    super();
    this.multiplexer = new ClaudeMultiplexer(maxAgents);
    this.coordinator = new HumanInTheLoopCoordinator();
    this.router = new AsyncRouter('enhanced-cabal');
    this.splitter = new StreamSplitter();
    this.setupCoordination();
  }

  private setupCoordination() {
    // Monitor human requests
    this.coordinator.on('human:request', (request) => {
      this.emit('human:attention', {
        type: 'request',
        priority: request.priority,
        content: request,
        requiresResponse: true
      } as HumanNotification);
    });

    // Monitor background agent activity
    this.coordinator.on('agent:background', (activity) => {
      this.backgroundActivity.push(activity);
      // Emit summary every 10 activities
      if (this.backgroundActivity.length % 10 === 0) {
        this.emit('human:attention', {
          type: 'summary',
          priority: 'low',
          content: {
            activityCount: this.backgroundActivity.length,
            recentActivity: this.backgroundActivity.slice(-5)
          },
          requiresResponse: false
        } as HumanNotification);
      }
    });

    // Set up autonomous agent coordination routes
    this.router.addRoute('coordinate', {
      pattern: /coordinate:/,
      handler: async (msg) => {
        return this.coordinateAgents(msg);
      }
    });
  }

  async spawnSpecializedAgent(role: AgentRole): Promise<AutonomousAgent> {
    const config: Partial<AutonomousConfig> = {
      autonomyLevel: role.autonomyLevel,
      backgroundTasks: role.backgroundTasks || [],
      requiresApprovalFor: this.getApprovalTasksForRole(role.type)
    };

    const agent = new AutonomousAgent(
      this.multiplexer,
      `${role.type}-${role.name}`,
      this.coordinator,
      config
    );

    await agent.initialize();
    this.agents.set(agent.nodeId, agent);

    // Initialize agent with its role
    await agent.sendToPeer(agent.nodeId, {
      type: 'role-assignment',
      role: role.type,
      specialization: role.specialization,
      instructions: this.getRoleInstructions(role)
    });

    this.emit('agent:spawned', {
      agentId: agent.nodeId,
      role,
      autonomyLevel: role.autonomyLevel
    });

    return agent;
  }

  private getApprovalTasksForRole(roleType: string): string[] {
    const approvalMap: Record<string, string[]> = {
      'executor': ['delete', 'modify-critical', 'deploy'],
      'coordinator': ['restructure', 'terminate-agent'],
      'analyst': ['publish-report', 'share-sensitive'],
      'researcher': ['external-api-call', 'data-export'],
      'reviewer': ['approve-changes', 'reject-work']
    };
    return approvalMap[roleType] || [];
  }

  private getRoleInstructions(role: AgentRole): string {
    const instructions: Record<string, string> = {
      'researcher': 'Focus on gathering and analyzing information. Work autonomously on research tasks.',
      'analyst': 'Analyze data and patterns. Collaborate with researchers. Flag anomalies for human review.',
      'executor': 'Execute approved tasks. Always verify with human before critical operations.',
      'reviewer': 'Review other agents work. Provide quality assurance. Escalate concerns to human.',
      'coordinator': 'Coordinate multi-agent tasks. Monitor progress. Report milestones to human.'
    };
    return instructions[role.type] || 'Perform assigned tasks within your autonomy level.';
  }

  async executeComplexTask(
    taskDescription: string,
    requiredRoles: string[],
    humanOversight: boolean = true
  ): Promise<any> {
    // Notify human about task start
    if (humanOversight) {
      this.emit('human:attention', {
        type: 'milestone',
        priority: 'medium',
        content: {
          event: 'task-start',
          task: taskDescription,
          agents: requiredRoles
        },
        requiresResponse: false
      } as HumanNotification);
    }

    // Assign agents to subtasks
    const assignments = await this.assignSubtasks(taskDescription, requiredRoles);
    
    // Execute in parallel with monitoring
    const results = await Promise.all(
      assignments.map(async (assignment) => {
        const agent = this.agents.get(assignment.agentId);
        if (!agent) return null;

        return agent.executeTask(assignment.subtask, {
          mainTask: taskDescription,
          role: assignment.role
        });
      })
    );

    // Compile results
    const compilation = await this.compileResults(results, taskDescription);

    // Final human review if needed
    if (humanOversight && compilation.confidence < 0.9) {
      const review = await this.requestHumanReview(compilation);
      return { ...compilation, humanReview: review };
    }

    return compilation;
  }

  private async coordinateAgents(msg: any): Promise<any> {
    const { task, agents } = msg;
    
    // Create coordination plan
    const plan = {
      phases: this.breakDownTask(task),
      assignments: new Map<string, string[]>()
    };

    // Let agents self-organize within constraints
    for (const phase of plan.phases) {
      const volunteers = await this.requestVolunteers(phase, agents);
      plan.assignments.set(phase.id, volunteers);
    }

    return plan;
  }

  private breakDownTask(task: string): any[] {
    // Simplified task breakdown
    return [
      { id: 'research', description: 'Research phase' },
      { id: 'analysis', description: 'Analysis phase' },
      { id: 'execution', description: 'Execution phase' },
      { id: 'review', description: 'Review phase' }
    ];
  }

  private async requestVolunteers(phase: any, agentIds: string[]): Promise<string[]> {
    const volunteers: string[] = [];
    
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      if (agent) {
        // Agent decides if it wants to volunteer based on its capabilities
        const response = await agent.requestFromPeer(agentId, {
          type: 'volunteer-request',
          phase: phase
        });
        
        if (response && response.volunteer) {
          volunteers.push(agentId);
        }
      }
    }
    
    return volunteers;
  }

  private async assignSubtasks(task: string, roles: string[]): Promise<any[]> {
    // Smart assignment based on agent capabilities and current load
    const assignments: any[] = [];
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => {
        const status = agent.getStatus();
        return !status.currentTask && roles.includes(status.nodeId.split('-')[0]);
      });

    // Distribute subtasks
    const subtasks = this.generateSubtasks(task, roles);
    for (let i = 0; i < subtasks.length; i++) {
      const agent = availableAgents[i % availableAgents.length];
      assignments.push({
        agentId: agent.nodeId,
        role: agent.nodeId.split('-')[0],
        subtask: subtasks[i]
      });
    }

    return assignments;
  }

  private generateSubtasks(mainTask: string, roles: string[]): string[] {
    // Generate role-specific subtasks
    return roles.map(role => `${role}: ${mainTask}`);
  }

  private async compileResults(results: any[], task: string): Promise<any> {
    // Aggregate and analyze results
    const successful = results.filter(r => r && r.success);
    const failed = results.filter(r => r && !r.success);
    
    return {
      task,
      success: failed.length === 0,
      confidence: successful.length / results.length,
      results: successful,
      failures: failed,
      timestamp: Date.now()
    };
  }

  private async requestHumanReview(compilation: any): Promise<any> {
    return new Promise((resolve) => {
      this.coordinator.once('human:review', resolve);
      
      this.emit('human:attention', {
        type: 'request',
        priority: 'high',
        content: {
          type: 'review',
          compilation
        },
        requiresResponse: true
      } as HumanNotification);
    });
  }

  // Human interface methods
  respondToRequest(requestId: string, response: any) {
    this.coordinator.respondToRequest(requestId, response);
  }

  getHumanRequests() {
    return this.coordinator.getPendingRequests();
  }

  getBackgroundActivity(limit: number = 10) {
    return this.backgroundActivity.slice(-limit);
  }

  getSystemStatus() {
    const agentStatuses = Array.from(this.agents.values())
      .map(agent => agent.getStatus());

    return {
      agents: agentStatuses,
      coordinator: this.coordinator.getStats(),
      backgroundActivity: this.backgroundActivity.length,
      humanRequests: this.getHumanRequests().length
    };
  }

  async shutdown() {
    // Notify human of shutdown
    this.emit('human:attention', {
      type: 'alert',
      priority: 'high',
      content: { event: 'system-shutdown' },
      requiresResponse: false
    } as HumanNotification);

    // Graceful shutdown
    for (const agent of this.agents.values()) {
      await agent.shutdown();
    }
    await this.multiplexer.killAll();
  }
}