# Alternative Execution Strategy: Database-Driven Coordination

## Problem
Spawning Claude processes creates infinite recursion loops.

## Alternative: Pure Database Coordination

Instead of spawning processes, use the database as the coordination layer:

### Architecture
```
[Supervisor Claude] → [CNS Database] ← [Agent Claude Instances]
```

### Flow
1. **Task Queuing**: Supervisor queues tasks in database
2. **Agent Polling**: Running Claude instances poll database for work
3. **Task Assignment**: Agents pick up tasks and mark as "in_progress"
4. **Work Execution**: Agents execute tasks normally (with full MCP access)
5. **Result Storage**: Agents store results back to database
6. **Supervisor Review**: Supervisor monitors and reviews results

### Database Tables
```sql
-- Task queue with status tracking
CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  workflow_id TEXT,
  agent_type TEXT,
  specifications TEXT,
  status TEXT, -- 'pending', 'assigned', 'in_progress', 'completed', 'failed'
  assigned_to TEXT, -- Agent instance ID
  result TEXT,
  created_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Agent registration and heartbeat
CREATE TABLE active_agents (
  agent_id TEXT PRIMARY KEY,
  agent_type TEXT,
  last_heartbeat TIMESTAMP,
  status TEXT, -- 'idle', 'working', 'offline'
  capabilities TEXT
);
```

### Benefits
- **No process spawning** - eliminates recursion risk
- **Natural Claude usage** - agents use full MCP toolkit
- **Scalable** - any number of Claude instances can join
- **Resilient** - agents can crash and restart without losing work
- **Observable** - full visibility into all agent activity

### Implementation
1. **Agent Registration**: Each Claude instance registers itself on startup
2. **Heartbeat System**: Agents send periodic heartbeats to show they're alive
3. **Work Polling**: Agents query for available tasks matching their type
4. **Lock-based Assignment**: Database ensures only one agent gets each task
5. **Result Reporting**: Agents update database with progress and results

Would this approach solve the spawning problem while achieving the team factory vision?