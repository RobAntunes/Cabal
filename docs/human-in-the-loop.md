# Human-in-the-Loop Architecture

## Overview

The enhanced Cabal system allows agents to operate autonomously while keeping humans informed and involved only when necessary. This creates an efficient balance between automation and human oversight.

## Key Components

### 1. Autonomous Agents
- **Full Autonomy**: Complete independence for routine tasks
- **Supervised**: Works independently but notifies humans of important events
- **Manual**: Requires human approval for most actions

### 2. Human-in-the-Loop Coordinator
- Routes decisions based on confidence levels
- Manages human attention requests
- Logs all agent communications for audit

### 3. Agent Roles
- **Researcher**: Gathers information autonomously
- **Analyst**: Analyzes data, escalates anomalies
- **Executor**: Performs actions with approval gates
- **Reviewer**: Quality assurance with human escalation
- **Coordinator**: Orchestrates multi-agent tasks

## Communication Patterns

### Background Communication
```
Agent A ←→ Agent B (Direct peer communication)
         ↓
    [Logged but not interrupted]
```

### Human Intervention
```
Agent → Low Confidence Decision → Human Request
                                       ↓
                                Human Response
                                       ↓
                                Agent Continues
```

## Human Notifications

1. **Requests** (High Priority)
   - Approval needed
   - Input required
   - Decision making

2. **Alerts** (Medium Priority)
   - Anomalies detected
   - Conflicts between agents
   - System issues

3. **Summaries** (Low Priority)
   - Progress updates
   - Activity logs
   - Milestone completions

## Benefits

- **Efficiency**: Agents handle routine tasks without interruption
- **Oversight**: Humans maintain control over critical decisions
- **Scalability**: Can run many agents with minimal human attention
- **Auditability**: All communications logged for review

## Usage Example

```typescript
// Create specialized agents
const researcher = await cabal.spawnSpecializedAgent({
  name: 'alpha',
  type: 'researcher',
  autonomyLevel: 'full',
  backgroundTasks: ['data-gathering']
});

// Agents work autonomously
// Human only notified when needed
cabal.on('human:attention', (notification) => {
  if (notification.requiresResponse) {
    // Handle critical decision
  }
});
```