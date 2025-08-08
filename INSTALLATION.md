# CNS Installation & Setup Guide

**CNS (Central Nervous System)** - Autonomous Multi-Agent Orchestration for Claude Code

## 🚀 Quick Start (2 minutes)

### Step 1: Install CNS
```bash
# Global installation (recommended)
npm install -g cns-mcp-server

# Verify installation
cns-server --version
```

### Step 2: Initialize CNS
```bash
# Create configuration and directories
cns-server init
```

**This automatically:**
- ✅ Creates `~/.cns/` directory structure
- ✅ Generates configuration files
- ✅ Sets up free local embeddings (Transformers.js)
- ✅ **Displays Claude Code configuration** (copy this!)

### Step 3: Configure Claude Code

Copy the configuration shown after `cns-server init` and add it to Claude Code:

**Desktop App:** `~/.claude/claude_desktop_config.json`
**VS Code:** Claude Code extension settings

Example configuration:
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

### Step 4: Restart Claude Code

**That's it!** CNS is now integrated and ready for autonomous orchestration.

---

## ✨ What You Get

### 🤖 Autonomous Agent Orchestration
- **Manager agents** create specifications → **CNS detects patterns** → **Associates** implement → **Managers** review
- **Zero manual intervention** - workflows happen automatically
- **Pattern recognition** detects "Task Assignment", "Implementation Complete", "Approved for Integration"

### 🧠 Free Semantic Memory
- **Zero API costs** - uses Transformers.js locally
- **Hybrid search** - semantic + text matching  
- **384-dimensional embeddings** with automatic storage

### 🏗️ Workspace Isolation
- **Git worktrees** for parallel development
- **Branch-based isolation** per workflow
- **Automatic cleanup** after completion

### 🎛️ Slash Commands
Access CNS directly in conversations:
- `/cns:status` - System overview
- `/cns:health` - Health diagnostics  
- `/cns:workflows` - Active workflows
- `/cns:search <query>` - Memory search
- `/cns:memories` - Recent memories
- `/cns:help` - Usage guide

---

## 🔧 System Requirements

### Minimum Requirements
- **Node.js:** 18.0.0 or higher
- **RAM:** 2GB available memory
- **Storage:** 500MB for models and data
- **OS:** Windows, macOS, or Linux

### Recommended Requirements  
- **Node.js:** 20.0.0 or higher
- **RAM:** 4GB available memory
- **Storage:** 2GB for models and workspace data
- **Git:** For workspace isolation features

---

## 🏥 Health Check

Validate your installation:

```bash
# Quick validation
cns-server validate

# Detailed health check
cns-server validate --verbose
```

Expected output:
```
🔍 Validating CNS MCP Server Configuration...
✓ Configuration file exists
✓ Using free local Transformers.js embeddings
✅ Validation complete!
```

**Happy orchestrating! 🚀**