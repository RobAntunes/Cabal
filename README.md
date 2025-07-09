# Cabal - Multiplexed Multi-Agent System

A flat, peer-to-peer multi-agent system that multiplexes connections to Claude instances with a beautiful TUI interface.

## Architecture

- **No Orchestrator**: Flat peer-to-peer architecture with direct agent communication
- **Multiplexed Signals**: Async message routing without central coordination
- **Stream Splitting**: Efficient handling of concurrent agent responses
- **Beautiful TUI**: Charm.sh-based terminal interface with markdown rendering

## Components

### Core Multiplexer (`src/multiplex/multiplexer.ts`)
- Spawns and manages multiple Claude processes
- Handles stdin/stdout communication
- Emits events for message routing

### Peer Agents (`src/agents/peer-agent.ts`)
- Each agent is a Happen node
- Direct peer-to-peer communication
- Self-organizing network with discovery

### Async Router (`src/multiplex/async-router.ts`)
- Pattern-based message routing
- No central coordination required
- Request-response patterns supported

### Stream Splitter (`src/multiplex/stream-splitter.ts`)
- Demultiplexes agent responses by correlation ID
- Handles streaming responses
- Buffers partial messages

### TUI (`tui/main.go`)
- Multi-pane view of all agents
- Glamour-powered markdown rendering
- Real-time agent status updates

## Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Install Go dependencies
cd tui && go mod download
```

## Usage

```bash
# Run everything with the launch script
./run.sh

# Or run components separately:
# Terminal 1: Start backend
npm run dev

# Terminal 2: Start TUI
cd tui && go run main.go
```

## TUI Controls

- **Tab**: Switch between agents
- **Enter**: Send message to active agent
- **Ctrl+C**: Quit

## Example Code

```typescript
// Create a swarm of agents
const cabal = new Cabal();
await cabal.createSwarm(3);

// Multicast to all agents (fire-and-forget)
await cabal.multicast('Hello agents!');

// Query with response collection
const responses = await cabal.query('What is the meaning of life?');
```

## Features

- ✅ Flat peer-to-peer architecture
- ✅ Multiplexed async communication
- ✅ Beautiful terminal UI with markdown
- ✅ No central orchestrator
- ✅ Stream splitting for responses
- ✅ Direct inter-agent communication

## Architecture Decisions

1. **No Orchestrator**: Agents communicate directly via Happen events
2. **Multiplexing**: Single process manages multiple Claude instances
3. **Async First**: All operations are non-blocking
4. **Peer Discovery**: Agents announce and discover each other automatically