# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Run
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run dev` - Start development server with file watching
- `npm start` - Run the built server from dist/
- `npm test` - Run tests with Vitest
- `npm run lint` - Run ESLint on src/ directory

### Client
- `npm run build && npx cns-client` - Build and run the CNS client
- The compiled client binary is at `dist/client/index.js`

## Architecture Overview

CNS (Central Nervous System) is an autonomous multi-agent orchestration system designed specifically for Claude Code. The system replaces bash scripts with a centralized TypeScript MCP server that handles agent coordination, memory management, and workspace isolation.

### Core Components

#### MCP Server (`src/index.ts`)
- Main entry point exposing 13+ MCP tools for Claude Code integration
- Handles hook events, memory operations, orchestration, and system status
- Uses stdio transport for Claude Code communication

#### Orchestration Engine (`src/orchestration/engine.ts`)
- Event-driven workflow management with handoffs between agents
- Automatically launches associate agents when managers complete tasks
- Workflow tracking with database persistence and 5-minute cleanup scheduling
- Generates Task tool prompts for autonomous agent execution

#### Memory System (`src/memory/index.ts`)
- Semantic search with embedding support (planned)
- Stores specifications, completions, and workflow history
- Database-backed with tags and metadata for retrieval

#### Workspace Manager (`src/workspaces/index.ts`)
- Git worktree-based isolation for parallel agent workspaces
- Automatic cleanup scheduling and resource management

#### Hook Handlers (`src/orchestration/hooks/index.ts`)
- Replaces heavy bash scripts with thin wrappers
- Processes SubagentStop, PreToolUse, and SessionStart events
- Triggers autonomous workflows based on agent completion markers

### Database Schema
The SQLite database (`cns.db`) stores:
- `workflows` - Active agent workflows and specifications
- `handoffs` - Inter-agent communication and task delegation
- `memories` - Semantic memory with search capabilities
- `cleanup_schedule` - Automated workspace cleanup
- `tool_usage` - Tool usage tracking for analytics

### Agent Workflow Pattern
1. Manager agent receives task and creates specifications
2. CNS detects "Task Assignment" completion marker
3. CNS auto-launches associate agent with workspace isolation
4. Associate completes implementation and signals "Implementation Complete"
5. CNS auto-launches manager for review cycle
6. Manager approves with "Approved for Integration" or requests changes

### Hook Integration
Replace bash scripts in `.claude/hooks/` with 2-line wrappers:
```bash
#!/bin/bash
npx cns-client handle_subagent_stop "$@"
```

### MCP Tools Available
- `handle_subagent_stop`, `handle_pre_tool_use`, `handle_session_start` - Hook handlers
- `store_memory`, `retrieve_memory` - Memory operations
- `launch_agent`, `get_pending_tasks`, `signal_completion` - Orchestration
- `create_workspace`, `cleanup_workspace` - Workspace management
- `get_system_status`, `get_workflow_status` - System monitoring

## Configuration

### Claude Code Settings
Add to Claude Code MCP servers configuration:
```json
{
  "mcpServers": {
    "cns": {
      "command": "node",
      "args": ["/home/ari1110/projects/cns-mcp-server/dist/index.js"]
    }
  }
}
```

### Environment
- Uses ES modules with TypeScript compilation to ES2022
- Winston logging to `cns.log`
- LanceDB for vector embeddings (planned)
- Redis support for distributed operations (planned)