# CNS MCP Server

**Autonomous Multi-Agent Orchestration for Claude Code**

[![NPM Version](https://img.shields.io/npm/v/cns-mcp-server.svg)](https://www.npmjs.com/package/cns-mcp-server)
[![Node Version](https://img.shields.io/node/v/cns-mcp-server.svg)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/cns-mcp-server.svg)](https://github.com/your-org/cns-mcp-server/blob/main/LICENSE)

Transform Claude Code from a single agent into an **autonomous multi-agent system** that orchestrates complex workflows automatically.

## 🚀 Quick Start

```bash
# Install globally
npm install -g cns-mcp-server

# Initialize system  
cns-server init

# Add to Claude Code (copy the configuration shown)
```

**That's it!** CNS is now orchestrating your Claude Code workflows.

## ✨ What You Get

### 🤖 Autonomous Agent Orchestration
- **Managers** create specifications → **CNS detects patterns** → **Associates** implement → **Managers** review
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
Direct control in Claude Code conversations:
- `/cns:status` - System overview
- `/cns:health` - Health diagnostics  
- `/cns:workflows` - Active workflows
- `/cns:search <query>` - Memory search
- `/cns:memories` - Recent memories
- `/cns:help` - Usage guide

## 📋 Installation

See **[INSTALLATION.md](./INSTALLATION.md)** for detailed setup instructions.

## 📚 Documentation

- **[Installation Guide](./INSTALLATION.md)** - Setup and configuration
- **[User Guide](./USER-GUIDE.md)** - Workflow examples and best practices  
- **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

## 🎯 Example: Authentication System

**You ask:**
> "Please implement a user authentication system"

**CNS orchestrates automatically:**

1. **Manager** creates specifications with JWT, bcrypt, session management
2. **CNS detects** "Task Assignment" → auto-launches Associate  
3. **Associate** implements complete auth system with tests
4. **CNS detects** "Implementation Complete" → auto-launches Manager review
5. **Manager** approves with "Approved for Integration"
6. **CNS** completes workflow, stores knowledge, cleans workspace

**Result:** Production-ready authentication system delivered through autonomous agent coordination.

## 🔧 Requirements

- **Node.js:** 18.0.0 or higher
- **RAM:** 2GB available memory
- **Storage:** 500MB for models and data
- **OS:** Windows, macOS, or Linux

## 🏥 Health Check

```bash
cns-server validate
```

Expected output:
```
🔍 Validating CNS MCP Server Configuration...
✓ Configuration file exists
✓ Using free local Transformers.js embeddings  
✅ Validation complete!
```

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/your-org/cns-mcp-server/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/cns-mcp-server/discussions)
- **Documentation:** [GitHub Wiki](https://github.com/your-org/cns-mcp-server/wiki)

## 📄 License

MIT - see [LICENSE](./LICENSE) file.

---

**Ready to transform your development workflow? Install CNS and watch autonomous agent orchestration in action! 🚀**