import { EventEmitter } from 'events';
import { Happen, Node, Event } from '@happen/core';

export interface RouteConfig {
  pattern: string | RegExp;
  handler: (msg: any) => Promise<any>;
  priority?: number;
}

export class AsyncRouter extends EventEmitter {
  private routes: Map<string, RouteConfig[]> = new Map();
  private node: Node;
  private messageQueue: Array<{ msg: any; timestamp: number }> = [];
  private processing = false;

  constructor(nodeId: string) {
    super();
    this.node = Happen.create(`router:${nodeId}`);
    this.setupBaseRoutes();
  }

  private setupBaseRoutes() {
    // Auto-discovery route
    this.node.on('route:discover', async (event: Event) => {
      const routes = Array.from(this.routes.keys());
      await this.node.emit('route:announce', {
        nodeId: this.node.id,
        routes,
        timestamp: Date.now()
      });
    });

    // Message routing
    this.node.on('route:message', async (event: Event) => {
      this.messageQueue.push({
        msg: event.data,
        timestamp: Date.now()
      });
      
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  async addRoute(topic: string, config: RouteConfig): Promise<void> {
    if (!this.routes.has(topic)) {
      this.routes.set(topic, []);
    }
    
    const routes = this.routes.get(topic)!;
    routes.push(config);
    
    // Sort by priority (higher first)
    routes.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Announce new route
    await this.node.emit('route:added', {
      nodeId: this.node.id,
      topic,
      pattern: config.pattern.toString()
    });
  }

  private async processQueue() {
    this.processing = true;
    
    while (this.messageQueue.length > 0) {
      const { msg } = this.messageQueue.shift()!;
      
      // Process in parallel for all matching routes
      const promises: Promise<void>[] = [];
      
      for (const [topic, routes] of this.routes) {
        for (const route of routes) {
          if (this.matchesPattern(msg, route.pattern)) {
            promises.push(this.handleRoute(topic, route, msg));
          }
        }
      }
      
      // Wait for all handlers to complete
      await Promise.allSettled(promises);
    }
    
    this.processing = false;
  }

  private matchesPattern(msg: any, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return msg.topic === pattern || msg.type === pattern;
    } else {
      const testString = JSON.stringify(msg);
      return pattern.test(testString);
    }
  }

  private async handleRoute(topic: string, route: RouteConfig, msg: any): Promise<void> {
    try {
      const start = Date.now();
      const result = await route.handler(msg);
      const duration = Date.now() - start;
      
      this.emit('route:handled', {
        topic,
        pattern: route.pattern.toString(),
        duration,
        success: true
      });
      
      // If handler returns a result, emit it
      if (result) {
        await this.node.emit('route:result', {
          originalMsg: msg,
          result,
          handledBy: this.node.id,
          topic
        });
      }
    } catch (error) {
      this.emit('route:error', {
        topic,
        pattern: route.pattern.toString(),
        error: error.message,
        msg
      });
    }
  }

  async broadcast(topic: string, message: any): Promise<void> {
    await this.node.emit('route:message', {
      topic,
      ...message,
      broadcasted: true,
      from: this.node.id
    });
  }

  async sendDirect(targetNodeId: string, message: any): Promise<void> {
    await this.node.emit(`route:direct:${targetNodeId}`, {
      ...message,
      from: this.node.id,
      direct: true
    });
  }

  // Enable request-response pattern without central coordination
  async request(topic: string, payload: any, timeout = 5000): Promise<any> {
    const requestId = crypto.randomUUID();
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.node.off(`route:response:${requestId}`, handler);
        reject(new Error('Request timeout'));
      }, timeout);
      
      const handler = (event: Event) => {
        clearTimeout(timer);
        resolve(event.data.result);
      };
      
      this.node.once(`route:response:${requestId}`, handler);
      
      this.node.emit('route:request', {
        topic,
        payload,
        requestId,
        from: this.node.id,
        replyTo: `route:response:${requestId}`
      });
    });
  }

  // Handle requests
  async onRequest(topic: string, handler: (payload: any) => Promise<any>): Promise<void> {
    this.node.on('route:request', async (event: Event) => {
      if (event.data.topic === topic) {
        try {
          const result = await handler(event.data.payload);
          await this.node.emit(event.data.replyTo, {
            result,
            requestId: event.data.requestId,
            success: true
          });
        } catch (error) {
          await this.node.emit(event.data.replyTo, {
            error: error.message,
            requestId: event.data.requestId,
            success: false
          });
        }
      }
    });
  }

  getStats() {
    return {
      routes: this.routes.size,
      queueLength: this.messageQueue.length,
      processing: this.processing,
      nodeId: this.node.id
    };
  }
}