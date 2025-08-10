# 🚀 CNS Quick Start - True Download and Go!

## Two-Command Setup

```bash
# 1. Install globally (works anywhere)
npm install -g cns-mcp-server

# 2. Initialize configuration  
cns-server init
```

**That's it!** Autonomous agents now work automatically whenever you use Claude Code.

## What You Just Got

✅ **MCP Server** - Provides 13+ tools to Claude Code  
✅ **Agent Runner** - Automatically executes queued agents  
✅ **Memory System** - Free local semantic search (no API keys)  
✅ **Workspace Manager** - Git worktree isolation for parallel work  
✅ **Orchestration Engine** - Handles agent-to-agent communication  

## Claude Code Integration

The `init` command shows you exactly what to copy into Claude Code settings. It looks like:

```json
{
  "mcpServers": {
    "cns": {
      "command": "npx",
      "args": ["-y", "cns-mcp-server"]
    }
  }
}
```

## Usage Patterns

### For Individual Users
```bash
npm install -g cns-mcp-server  # Install once
cns-server init                # Configure once  
# Just use Claude Code - agents work automatically!
```

### For Teams
```bash
# Each developer
npm install -g cns-mcp-server
cns-server init
# Share .cns/config.json if desired

# Then everyone just uses Claude Code normally
```

### For Development Projects
```bash
# In project directory
npm install cns-mcp-server
npx cns-server init
# Agents work automatically when using Claude Code
```

## Available Commands

| Command | Purpose | Use Case |
|---------|---------|----------|
| `cns-server init` | Setup configuration | Required once |
| `cns-server validate` | Check system health | Troubleshooting |
| `cns-server daemon` | Manual unified daemon | Advanced users |
| `cns-server start-mcp` | MCP server only | Debugging |

**Note**: Normal users don't need `daemon` - agents start automatically with Claude Code!

## Directory Structure (Auto-Created)

```
~/.cns/
├── config.json          # System configuration
├── data/
│   └── cns.db           # SQLite database
├── workspaces/          # Agent worktrees
└── logs/               # System logs
```

## Environment Variables (Optional)

```bash
export CNS_MAX_AGENTS=5              # Max concurrent agents (default: 3)
export CNS_POLL_INTERVAL=5           # Polling interval in seconds (default: 10)
export DATABASE_PATH=/custom/path    # Custom database location
```

## Success Verification

In Claude Code, try these MCP commands:
- `cns:get_system_status` - Should show "operational" with agent runner running
- `cns:health` - Full system health check
- `cns:workflows` - Shows active agent workflows

**If you see agent runner in the system status, autonomous agents are working!**

## Zero-Configuration Philosophy

- **No API keys required** - Uses free local Transformers.js embeddings
- **No external services** - Everything runs locally
- **No complex setup** - Three commands and you're running
- **No maintenance** - Automatic cleanup and resource management

The system is designed to work immediately after installation with sensible defaults, while allowing customization for advanced users.