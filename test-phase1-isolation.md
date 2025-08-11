# Phase 1 Testing: Agent Isolation

## Goal
Test that we can spawn a single Claude agent that:
1. Executes its task without spawning more agents
2. Completes and exits cleanly
3. Reports results back to CNS
4. Doesn't create infinite recursion

## Test Procedure

### Step 1: Launch CNS Server
```bash
npm start
# Wait for "Agent runner started successfully"
```

### Step 2: Queue a Simple Task
Use Claude Code to queue a test task:
```bash
/cns-mcp-server:launch_agent
```

### Step 3: Monitor Agent Execution
Watch the logs for:
- ✅ "Phase 1: Spawning isolated Claude agent"
- ✅ "Agent spawned successfully" (with PID)
- ✅ Agent stdout/stderr output
- ✅ "Agent completed" (with exit code)
- ✅ "Agent completion signaled to orchestration"

### Success Criteria
- [x] Only ONE agent process spawned
- [x] Agent executes task and exits (not infinite loop)
- [x] No recursive spawning detected
- [x] Clean completion and result reporting

### Expected Environment Variables in Spawned Agent
- CNS_MODE=isolated_agent
- CNS_DISABLE_MCP_CNS=true
- MCP_SERVERS_CONFIG={}
- CNS_WORKFLOW_ID=(workflow id)
- CNS_AGENT_TYPE=(agent type)

## Next Phase
If Phase 1 succeeds → Phase 2: Multiple agents in parallel