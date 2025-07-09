import { Transform, PassThrough } from 'stream';
import { EventEmitter } from 'events';

export interface StreamMetadata {
  agentId: string;
  streamId: string;
  type: 'response' | 'event' | 'log';
  started: number;
  chunks: number;
}

export class StreamSplitter extends EventEmitter {
  private streams: Map<string, PassThrough> = new Map();
  private metadata: Map<string, StreamMetadata> = new Map();
  private buffers: Map<string, string> = new Map();

  constructor() {
    super();
  }

  createSplitter(): Transform {
    return new Transform({
      transform: (chunk, encoding, callback) => {
        this.processChunk(chunk);
        callback();
      }
    });
  }

  private processChunk(chunk: Buffer) {
    const data = chunk.toString();
    const lines = data.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);
        this.routeMessage(parsed);
      } catch (e) {
        // Handle partial JSON by buffering
        this.handlePartialMessage(line);
      }
    }
  }

  private routeMessage(msg: any) {
    const streamId = msg.streamId || msg.agentId || 'default';
    
    // Get or create stream
    let stream = this.streams.get(streamId);
    if (!stream) {
      stream = new PassThrough();
      this.streams.set(streamId, stream);
      
      // Initialize metadata
      this.metadata.set(streamId, {
        agentId: msg.agentId || streamId,
        streamId,
        type: msg.type || 'response',
        started: Date.now(),
        chunks: 0
      });
      
      this.emit('stream:created', { streamId, metadata: this.metadata.get(streamId) });
    }

    // Update metadata
    const meta = this.metadata.get(streamId)!;
    meta.chunks++;

    // Handle different message types
    switch (msg.type) {
      case 'stream:start':
        this.emit('stream:start', { streamId, data: msg.data });
        break;
      
      case 'stream:chunk':
        stream.write(JSON.stringify(msg.data) + '\n');
        this.emit('stream:chunk', { streamId, chunk: msg.data });
        break;
      
      case 'stream:end':
        stream.end();
        this.emit('stream:end', { streamId, metadata: meta });
        this.cleanup(streamId);
        break;
      
      default:
        // Regular message
        stream.write(JSON.stringify(msg) + '\n');
    }
  }

  private handlePartialMessage(partial: string) {
    // Simple buffering strategy for partial messages
    const bufferKey = 'partial';
    const existing = this.buffers.get(bufferKey) || '';
    const combined = existing + partial;

    try {
      const parsed = JSON.parse(combined);
      this.routeMessage(parsed);
      this.buffers.delete(bufferKey);
    } catch (e) {
      // Still partial, keep buffering
      this.buffers.set(bufferKey, combined);
    }
  }

  getStream(streamId: string): PassThrough | undefined {
    return this.streams.get(streamId);
  }

  async mergeStreams(streamIds: string[]): Promise<PassThrough> {
    const merged = new PassThrough();
    
    for (const id of streamIds) {
      const stream = this.streams.get(id);
      if (stream) {
        stream.pipe(merged, { end: false });
      }
    }

    return merged;
  }

  // Demultiplex responses based on correlation IDs
  demuxResponse(correlationId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeAllListeners(`response:${correlationId}`);
        reject(new Error('Response timeout'));
      }, 30000);

      this.once(`response:${correlationId}`, (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }

  // Route response to correct waiter
  handleResponse(msg: any) {
    if (msg.correlationId) {
      this.emit(`response:${msg.correlationId}`, msg.data);
    }
  }

  private cleanup(streamId: string) {
    this.streams.delete(streamId);
    this.metadata.delete(streamId);
  }

  getActiveStreams(): StreamMetadata[] {
    return Array.from(this.metadata.values());
  }

  getStats() {
    return {
      activeStreams: this.streams.size,
      totalChunks: Array.from(this.metadata.values())
        .reduce((sum, meta) => sum + meta.chunks, 0),
      bufferedPartials: this.buffers.size
    };
  }
}