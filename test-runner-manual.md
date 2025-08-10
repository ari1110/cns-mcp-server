# 🧪 Agent Execution System Testing Guide

## Quick Test (5 minutes)

### Step 1: Build and verify binaries
```bash
npm run build
ls -la dist/cli/  # Should show server.js, client.js, runner.js
```

### Step 2: Start CNS MCP Server
```bash
# Terminal 1
npx cns-server start
# Expected: Server starts, shows MCP tools available
```

### Step 3: Test agent runner basic functionality
```bash
# Terminal 2
npx cns-runner --help
# Expected: Shows help with start/status/stop commands

npx cns-runner start
# Expected: "Starting CNS Agent Runner", "Agent Runner started successfully"
# Should show "Max concurrent agents: 3" and start polling every 10s
```

### Step 4: Create test task
```bash
# Terminal 3
node test-agent-execution.js --create-task
# Expected: Creates a mock agent task in the queue
```

### Step 5: Watch agent execution
In Terminal 2 (agent runner), you should see:
```
Processing pending tasks { count: 1, availableSlots: 3 }
Executing agent task { taskId: '...', agentType: 'integration-test-associate' }
```

## What Each Component Should Do

### CNS Server (Terminal 1)
- ✅ Starts MCP server on stdio transport  
- ✅ Shows available MCP tools (13+ tools)
- ✅ Handles task queuing via `launch_agent`
- ✅ Responds to `get_pending_tasks` requests

### Agent Runner (Terminal 2)  
- ✅ Connects to CNS server via MCP client
- ✅ Polls for pending tasks every 10 seconds
- ✅ Spawns `claude` processes with Task tool prompts
- ✅ Tracks running agents (max 3 concurrent)
- ✅ Handles agent completion and cleanup

### Expected Workflow
1. Task created → Queued in orchestration engine
2. Runner polls → Finds pending task  
3. Runner spawns → `claude --resume --input /tmp/prompt-file`
4. Claude executes → Task tool with specifications
5. Agent completes → Signals completion via hooks
6. Task removed → Queue cleaned up

## Debugging Commands

```bash
# Check if processes are running
ps aux | grep -E "(cns-server|cns-runner|claude)"

# Check pending tasks
echo '{}' | npx cns-client get_pending_tasks

# Check system status  
echo '{"include_health_checks":true}' | npx cns-client get_system_status

# Check workflows
echo '{"status":"active"}' | npx cns-client list_workflows
```

## Troubleshooting

### "CNS server not found" 
- Ensure `npm run build` completed successfully
- Check `dist/index.js` exists
- Try setting `CNS_SERVER_PATH=./dist/index.js`

### "Connection closed" errors
- Ensure CNS server is running in Terminal 1
- Server must be running before client/runner connects

### Tasks not executing
- Check Terminal 2 for agent runner polling logs
- Verify Claude Code is installed: `which claude`
- Check `/tmp/cns-agent-prompts/` for generated prompt files

### Agents spawn but don't complete  
- Check Claude Code is properly configured
- Monitor agent stdout/stderr in runner logs
- Verify hook scripts are properly set up in `~/.claude/hooks/`