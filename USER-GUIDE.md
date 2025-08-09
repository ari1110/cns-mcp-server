# CNS MCP Server User Guide

## Table of Contents
- [Quick Start](#quick-start)
- [Using Slash Commands](#using-slash-commands)
- [Memory System](#memory-system)
- [Workflow Orchestration](#workflow-orchestration)
- [Workspace Management](#workspace-management)
- [Best Practices](#best-practices)

## Quick Start

After installation and configuration (see [INSTALLATION.md](INSTALLATION.md)), you can start using CNS commands in Claude Code conversations.

### Basic Commands

Type these commands directly in your Claude Code conversation:

- `/cns:status` - Check system status and active workflows
- `/cns:health` - View detailed health diagnostics
- `/cns:help` - Get command reference

## Using Slash Commands

### System Status Commands

#### `/cns:status`
Shows a quick overview of your CNS system:
- System uptime
- Active workflow count
- Memory statistics
- Current orchestration status

#### `/cns:health`
Provides detailed health checks:
- Database connectivity
- Memory system status
- Orchestration engine health
- Workspace availability

#### `/cns:workflows`
Lists all active workflows with:
- Workflow IDs
- Agent types
- Current status
- Pending tasks

### Memory Commands

#### `/cns:search <query>`
Search your semantic memory:
```
/cns:search authentication implementation
```
Returns relevant memories ranked by semantic similarity and recency.

#### `/cns:memories`
View recent memories and statistics:
- Total memory count
- Recent entries
- Memory types distribution

## Memory System

CNS uses a powerful semantic memory system with:
- **Free local embeddings** via Transformers.js
- **No API keys required**
- **Hybrid search** combining semantic and text matching

### How Memory Works

1. **Automatic Storage**: Important conversations and decisions are stored
2. **Semantic Search**: Find related information using natural language
3. **Context Preservation**: Maintains workflow context across sessions

### Memory Types

- **specifications**: Task requirements and specifications
- **completions**: Completed task summaries
- **decisions**: Architectural and design decisions
- **context**: General contextual information

## Workflow Orchestration

CNS orchestrates multi-agent workflows automatically:

### Workflow Lifecycle

1. **Task Assignment**: Manager agent assigns tasks
2. **Auto-Launch**: CNS launches associate agents
3. **Implementation**: Associates work in isolated workspaces
4. **Review Cycle**: Manager reviews completed work
5. **Integration**: Approved changes are integrated

### Workflow Patterns

#### Manager-Associate Pattern
```
Manager → CNS → Associate → Implementation → CNS → Manager → Review
```

#### Handoff Triggers
CNS watches for these completion markers:
- "Task Assignment" - Launches associate
- "Implementation Complete" - Returns to manager
- "Approved for Integration" - Completes workflow

## Workspace Management

Each agent gets an isolated Git worktree workspace:

### Workspace Features
- **Isolation**: No conflicts between parallel agents
- **Automatic Cleanup**: 5-minute cleanup after completion
- **Resource Management**: Prevents workspace proliferation

### Workspace Commands
Workspaces are managed automatically, but you can:
- View active workspaces in `/cns:status`
- Check workspace health via `/cns:health`

## Best Practices

### 1. Memory Management
- Use descriptive tags for better searchability
- Store key decisions and specifications
- Regularly search memory before starting new tasks

### 2. Workflow Organization
- Keep workflow specifications clear and atomic
- Use consistent completion markers
- Allow CNS to handle agent coordination

### 3. System Monitoring
- Check `/cns:health` if experiencing issues
- Monitor active workflows with `/cns:workflows`
- Review system status regularly

### 4. Performance Tips
- First memory search may be slower (model loading)
- Subsequent searches are fast (cached model)
- Keep memory queries specific for better results

## Advanced Usage

### Custom Workflows

You can signal workflow events programmatically:
```javascript
// Signal task completion
/cns:signal completion "Implementation Complete"

// Store custom memory
/cns:store "Decision: Using PostgreSQL for user data"
```

### Hook Integration

CNS integrates with Claude Code hooks:
- `subagent_stop` - Orchestration triggers
- `session_start` - System initialization
- `pre_tool_use` - Tool interception

### Environment Variables

Customize behavior with:
- `DATABASE_PATH` - Custom database location
- `EMBEDDING_MODEL` - Alternative embedding model
- `LOG_LEVEL` - Logging verbosity (debug/info/warn/error)

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.

## Getting Help

- Check system health: `/cns:health`
- View help: `/cns:help`
- Report issues: [GitHub Issues](https://github.com/ari1110/cns-mcp-server/issues)