import { PeerAgent } from './peer-agent.js';
import { HumanInTheLoopCoordinator } from '../human-loop/coordinator.js';
import { ClaudeMultiplexer } from '../multiplex/multiplexer.js';

export interface AutonomousConfig {
  autonomyLevel: 'full' | 'supervised' | 'manual';
  confidenceThreshold: number;
  requiresApprovalFor: string[];
  backgroundTasks: string[];
}

export class AutonomousAgent extends PeerAgent {
  private coordinator: HumanInTheLoopCoordinator;
  private config: AutonomousConfig;
  private currentTask: string | null = null;

  constructor(
    multiplexer: ClaudeMultiplexer,
    nodeId: string,
    coordinator: HumanInTheLoopCoordinator,
    config: Partial<AutonomousConfig> = {}
  ) {
    super(multiplexer, nodeId);
    this.coordinator = coordinator;
    this.config = {
      autonomyLevel: 'supervised',
      confidenceThreshold: 0.8,
      requiresApprovalFor: [],
      backgroundTasks: [],
      ...config
    };

    // Set policy in coordinator
    coordinator.setAgentPolicy(nodeId, {
      agentId: nodeId,
      autonomyLevel: this.config.autonomyLevel,
      requiresApprovalFor: this.config.requiresApprovalFor,
      notifyHumanFor: []
    });
  }

  async executeTask(task: string, context: any = {}): Promise<any> {
    this.currentTask = task;

    // Check if this is a background task
    if (this.config.backgroundTasks.includes(task)) {
      return this.executeBackgroundTask(task, context);
    }

    // Check if task requires approval
    if (this.config.requiresApprovalFor.includes(task)) {
      const approval = await this.requestApproval(task, context);
      if (!approval.approved) {
        return { 
          success: false, 
          reason: 'human-rejected',
          details: approval.reason 
        };
      }
    }

    // Execute with confidence checking
    const result = await this.executeWithConfidenceCheck(task, context);
    this.currentTask = null;
    return result;
  }

  private async executeBackgroundTask(task: string, context: any): Promise<any> {
    // Emit event for monitoring but don't block
    this.coordinator.emit('agent:background-task', {
      agentId: this.nodeId,
      task,
      context,
      timestamp: Date.now()
    });

    // Execute task autonomously
    const response = await this.multiplexer.sendToAgent(
      this.agentId,
      `Execute background task: ${task}\nContext: ${JSON.stringify(context)}`
    );

    return { success: true, background: true, response };
  }

  private async executeWithConfidenceCheck(task: string, context: any): Promise<any> {
    // First, ask Claude to evaluate confidence
    const evaluationPrompt = `
Evaluate your confidence in executing this task:
Task: ${task}
Context: ${JSON.stringify(context)}

Respond with:
1. Confidence level (0-1)
2. Reasoning
3. Potential risks
4. Suggested approach
`;

    await this.multiplexer.sendToAgent(this.agentId, evaluationPrompt);
    
    // Wait for response (simplified - in real implementation would parse response)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const confidence = Math.random(); // Simulate confidence score

    if (confidence < this.config.confidenceThreshold) {
      // Low confidence - request human input
      const humanInput = await this.requestHumanInput(task, {
        context,
        confidence,
        reason: 'low-confidence'
      });

      if (humanInput.abort) {
        return { success: false, reason: 'human-aborted' };
      }

      // Incorporate human guidance
      context = { ...context, humanGuidance: humanInput.guidance };
    }

    // Execute the task
    const result = await this.multiplexer.sendToAgent(
      this.agentId,
      `Execute: ${task}\nContext: ${JSON.stringify(context)}`
    );

    return { success: true, result, confidence };
  }

  private async requestApproval(task: string, context: any): Promise<any> {
    return new Promise((resolve) => {
      this.coordinator.once('human:approval', (response) => {
        resolve(response);
      });

      this.coordinator.emit('human:request', {
        id: crypto.randomUUID(),
        type: 'approval',
        priority: 'high',
        from: this.nodeId,
        context: { task, ...context },
        timestamp: Date.now()
      });
    });
  }

  private async requestHumanInput(task: string, context: any): Promise<any> {
    return new Promise((resolve) => {
      this.coordinator.once('human:input', (response) => {
        resolve(response);
      });

      this.coordinator.emit('human:request', {
        id: crypto.randomUUID(),
        type: 'input',
        priority: 'medium',
        from: this.nodeId,
        context: { task, ...context },
        timestamp: Date.now()
      });
    });
  }

  // Enhanced peer communication with monitoring
  async sendToPeer(targetNodeId: string, content: any): Promise<void> {
    // Log communication for monitoring
    this.coordinator.monitorAgentCommunication(
      this.nodeId,
      targetNodeId,
      { content, timestamp: Date.now() }
    );

    // Send via parent class
    await super.sendToPeer(targetNodeId, content);
  }

  // Collaborative decision making
  async collaborativeDecision(question: string, peers: string[]): Promise<any> {
    const responses = await Promise.all(
      peers.map(peer => this.requestFromPeer(peer, question))
    );

    // Analyze consensus
    const consensus = this.analyzeConsensus(responses);

    if (consensus.agreement < 0.7) {
      // Low agreement - escalate to human
      return this.requestHumanInput('collaborative-decision', {
        question,
        responses,
        consensus
      });
    }

    return consensus;
  }

  private analyzeConsensus(responses: any[]): any {
    // Simplified consensus analysis
    return {
      agreement: 0.8,
      decision: responses[0],
      confidence: 0.85
    };
  }

  getStatus() {
    return {
      nodeId: this.nodeId,
      agentId: this.agentId,
      currentTask: this.currentTask,
      autonomyLevel: this.config.autonomyLevel,
      isAutonomous: this.config.autonomyLevel === 'full'
    };
  }
}