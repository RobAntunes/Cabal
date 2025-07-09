import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export interface AgentMessage {
  agentId: string;
  type: 'request' | 'response' | 'stream' | 'error';
  data: any;
  timestamp: number;
  correlationId?: string;
}

export interface AgentOptions {
  id?: string;
  args?: string[];
  env?: Record<string, string>;
}

export class ClaudeMultiplexer extends EventEmitter {
  private agents: Map<string, ChildProcess> = new Map();
  private messageBuffer: Map<string, AgentMessage[]> = new Map();
  private streamHandlers: Map<string, (chunk: any) => void> = new Map();

  constructor(private maxConcurrent: number = 5) {
    super();
  }

  async spawnAgent(options: AgentOptions = {}): Promise<string> {
    const agentId = options.id || randomUUID();
    
    if (this.agents.size >= this.maxConcurrent) {
      throw new Error(`Maximum concurrent agents (${this.maxConcurrent}) reached`);
    }

    const args = [
      'code', 
      '--print',
      '--format', 'json-stream',
      ...(options.args || [])
    ];

    const agent = spawn('claude', args, {
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.agents.set(agentId, agent);
    this.messageBuffer.set(agentId, []);

    // Handle stdout (responses)
    agent.stdout.on('data', (data) => {
      this.handleAgentOutput(agentId, data);
    });

    // Handle stderr (errors)
    agent.stderr.on('data', (data) => {
      this.emit('agent:error', {
        agentId,
        error: data.toString()
      });
    });

    // Handle exit
    agent.on('exit', (code) => {
      this.agents.delete(agentId);
      this.messageBuffer.delete(agentId);
      this.emit('agent:exit', { agentId, code });
    });

    this.emit('agent:spawn', { agentId });
    return agentId;
  }

  async sendToAgent(agentId: string, message: string, correlationId?: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const msg: AgentMessage = {
      agentId,
      type: 'request',
      data: message,
      timestamp: Date.now(),
      correlationId: correlationId || randomUUID()
    };

    this.emit('message:send', msg);
    agent.stdin.write(JSON.stringify({ content: message }) + '\n');
  }

  async broadcast(message: string): Promise<void> {
    const promises = Array.from(this.agents.keys()).map(agentId => 
      this.sendToAgent(agentId, message)
    );
    await Promise.all(promises);
  }

  private handleAgentOutput(agentId: string, data: Buffer) {
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const msg: AgentMessage = {
          agentId,
          type: parsed.type || 'response',
          data: parsed,
          timestamp: Date.now()
        };

        this.messageBuffer.get(agentId)?.push(msg);
        this.emit('message:receive', msg);

        // Handle streaming responses
        if (parsed.type === 'stream' && this.streamHandlers.has(agentId)) {
          this.streamHandlers.get(agentId)?.(parsed);
        }
      } catch (e) {
        // Handle non-JSON output
        this.emit('agent:output', { agentId, data: line });
      }
    }
  }

  setStreamHandler(agentId: string, handler: (chunk: any) => void) {
    this.streamHandlers.set(agentId, handler);
  }

  removeStreamHandler(agentId: string) {
    this.streamHandlers.delete(agentId);
  }

  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  async killAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.kill();
      this.agents.delete(agentId);
    }
  }

  async killAll(): Promise<void> {
    for (const [agentId, agent] of this.agents) {
      agent.kill();
    }
    this.agents.clear();
    this.messageBuffer.clear();
  }
}