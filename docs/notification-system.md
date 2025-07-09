# Visual Notification System

## Overview

The enhanced TUI includes a visual notification system that helps you quickly identify which agents need attention. This system uses colored borders and notification badges to communicate agent status at a glance.

## Visual Indicators

### Border Colors

- **🟢 Green Border** - Normal Operation
  - Agent is working autonomously
  - No human intervention needed
  - Background tasks proceeding normally

- **🟡 Yellow/Orange Border** - Notification
  - Agent has information to share
  - Low-priority decision pending
  - Review requested but not urgent

- **🔴 Red Border** - Critical
  - Immediate human attention required
  - Approval needed for critical operation
  - High-priority decision pending

### Notification Badges

- Shows in agent list: `Agent Name [3]`
- Shows in agent header: `Agent Name (ready) [ 2 pending ]`
- Red background with white text
- Number indicates pending requests

### Status Bar

- Shows total system notifications
- `🔴 2 critical` - When critical requests exist
- `🟡 5 notifications` - When only normal notifications exist

## How It Works

### Agent Notification Levels

Each agent maintains:
- `notificationLevel`: Current urgency state
- `pendingRequests`: Number of pending human interactions

### Triggering Notifications

Notifications are triggered when:

1. **Low Confidence Decision** (Yellow)
   ```typescript
   // Agent confidence below threshold
   if (confidence < 0.8) {
     requestHumanReview();
   }
   ```

2. **Approval Required** (Red)
   ```typescript
   // Critical operations
   if (requiresApprovalFor.includes(task)) {
     requestHumanApproval();
   }
   ```

3. **Information Sharing** (Yellow)
   ```typescript
   // Important findings
   if (anomalyDetected) {
     notifyHuman();
   }
   ```

## Usage

### Running with Notifications

```bash
# Production mode (real Claude)
./run-enhanced.sh

# Mock mode (simulated agents)
./run-enhanced.sh --mock
```

### Responding to Notifications

1. **Switch to agent** - Press Tab to cycle through agents
2. **View notification** - Agent with colored border shows notification in message history
3. **Respond** - Type response and press Enter
4. **Clear notification** - Border returns to green after response

### Demo

Run the notification demo to see all states:

```bash
npm run demo:notifications
```

This will simulate:
- Normal background activity (green)
- Low-priority notifications (yellow)
- Critical approvals (red)
- Multiple simultaneous notifications

## Benefits

1. **Quick Visual Scan** - Instantly see which agents need attention
2. **Priority Management** - Red borders draw immediate attention
3. **Non-Intrusive** - Background work continues without interruption
4. **Clear Status** - Always know system state at a glance

## Integration

The notification system integrates with:
- Human-in-the-loop coordinator
- Autonomous agent confidence levels
- Background task monitoring
- Multi-agent collaboration

## Customization

Notification levels can be configured per agent:

```typescript
const agent = await cabal.spawnSpecializedAgent({
  name: 'alpha',
  type: 'executor',
  autonomyLevel: 'manual', // More notifications
  requiresApprovalFor: ['delete', 'modify'] // Red notifications
});
```