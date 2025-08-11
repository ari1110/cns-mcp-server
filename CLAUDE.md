# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 DEPLOYMENT STRATEGY: Download-and-Go Architecture

**CRITICAL**: This project is designed for **universal deployment** - any user, any environment, zero configuration. All code decisions must support this deployment model.

### Target Users & Installation Methods
1. **Global NPM Install**: `npm install -g cns-mcp-server` (primary method)
2. **Local NPM Install**: `npm install cns-mcp-server` (team/project installs)
3. **Direct Download**: Git clone or zip download (developers)
4. **Package Manager**: Via NPM registry (future)

### Path Resolution Requirements
- **NO hardcoded paths** - All paths must be dynamically resolved
- **Multiple fallback methods** - Support all installation scenarios
- **Environment overrides** - Allow user customization via env vars
- **Graceful error handling** - Clear messages when paths cannot be resolved

### Code Pattern for Path Resolution
```typescript
// ✅ CORRECT - Dynamic resolution with fallbacks
async function findPath(): Promise<string> {
  if (process.env.CUSTOM_PATH) return process.env.CUSTOM_PATH;
  try { return require.resolve('package/path'); } catch {}
  // Try multiple relative path candidates...
}

// ❌ WRONG - Hardcoded paths
const path = '/home/user/specific/path';
const path = join(__dirname, '../../hardcoded/structure');
```

This architecture influences:
- CLI client/server path resolution
- Hook script generation  
- Configuration file templates
- Documentation and examples

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
- **Free semantic search** via Transformers.js (Xenova/all-MiniLM-L6-v2)
- **No API keys required** - 100% local embeddings
- LanceDB vector storage with SQLite metadata
- Stores specifications, completions, and workflow history with search

#### Workspace Manager (`src/workspaces/index.ts`)
- Git worktree-based isolation for parallel agent workspaces
- Automatic cleanup scheduling and resource management

#### Hook Handlers (`src/orchestration/hooks/index.ts`)
- **Dynamic CLI integration** - Works with any installation method
- Processes SubagentStop, PreToolUse, and SessionStart events
- Triggers autonomous workflows based on agent completion markers
- Auto-generated hook scripts with proper path resolution

### Database Schema
The SQLite database (`cns.db`) stores:
- `workflows` - Active agent workflows and specifications
- `handoffs` - Inter-agent communication and task delegation
- `memories` - Semantic memory with search capabilities
- `cleanup_schedule` - Automated workspace cleanup
- `tool_usage` - Tool usage tracking for analytics

### Integrated Agent Runner (v1.2.0+)
**Invisible Integration** - No hooks or manual triggers required:

1. **Automatic Polling**: Agent runner polls for queued tasks every 10 seconds
2. **Direct Execution**: Spawns `claude --resume --input <prompt>` processes automatically
3. **Concurrency Management**: Runs up to 3 agents simultaneously (configurable via `CNS_MAX_AGENTS`)
4. **Task Lifecycle**: Handles spawning, monitoring, completion signaling, and cleanup
5. **Zero Configuration**: Starts automatically with MCP server - no setup required

### Agent Execution Flow
```typescript
// Agent queued via launch_agent tool
await orchestration.launchAgent({ agent_type: 'general-purpose', specifications: 'task' });

// Agent runner automatically detects and executes (within 10 seconds)
spawn('claude', ['--resume', '--input', promptFile]);

// Completion automatically signaled back to orchestration
await client.callTool('signal_completion', { agent_id, result });
```

**Download-and-Go**: Simply install and run - agents execute automatically when tasks are queued.

#### Team Coordination Features (v1.2.3+):
- **Manager-Associate Architecture**: Team managers spawn specialized associate agents
- **MCP Tool Differentiation**: Managers get full MCP access, associates work in isolation
- **Shared Memory Coordination**: Agents communicate via semantic memory system
- **Workspace Strategies**: Individual or shared worktrees based on team requirements

### MCP Tools Available (18+ tools)
- **Hook Handlers**: `handle_subagent_stop`, `handle_pre_tool_use`, `handle_session_start`
- **Memory Operations**: `store_memory`, `retrieve_memory`, `list_memories`
- **Agent Orchestration**: `launch_agent`, `get_pending_tasks`, `signal_completion`
- **Workspace Management**: `create_workspace`, `cleanup_workspace`, `list_workspaces`
- **System Monitoring**: `get_system_status`, `get_workflow_status`, `get_system_health`
- **Workflow Control**: `stop_workflow`, `pause_workflow`, `emergency_stop_agents`
- **Advanced Operations**: `detect_stale_workflows`, `cleanup_stale_workflows`, `validate_embedding_provider`

## Installation & Configuration

### Quick Start (Download-and-Go)
```bash
# 1. Install globally
npm install -g cns-mcp-server

# 2. Initialize configuration
cns-server init

# 3. Copy the generated Claude Code configuration (shown after init)
# 4. Hook scripts are created automatically in ~/.claude/hooks/
```

### Claude Code Settings  
**Auto-generated by `cns-server init`** - example output:
```json
{
  "mcpServers": {
    "cns": {
      "command": "npx",
      "args": ["-y", "cns-mcp-server"],
      "env": {
        "DATABASE_PATH": "/home/user/.cns/data/cns.db",
        "EMBEDDING_PROVIDER": "transformers",
        "EMBEDDING_MODEL": "Xenova/all-MiniLM-L6-v2"
      }
    }
  }
}
```

### Environment & Path Resolution
- **ES modules** with TypeScript compilation to ES2022
- **Dynamic path resolution** - supports all installation methods
- **Free embeddings** via Transformers.js (no API keys)
- **LanceDB + SQLite** for vector storage and metadata
- **Automatic setup** creates ~/.cns/ directory structure

### Environment Variables
- `CNS_SERVER_PATH` - Override server location
- `CNS_CLIENT_PATH` - Override client location  
- `DATABASE_PATH` - Custom database location
- `EMBEDDING_PROVIDER` - `transformers` (default) | `openai` | `none`
- `CNS_MAX_AGENTS` - Max concurrent agents (default: 3)
- `CNS_LOG_LEVEL` - Logging verbosity (info, debug, warn, error)

## 🚀 Production Deployment & CI/CD

### NPM Package Status
- **Published Package**: `cns-mcp-server` on NPM registry
- **Current Version**: v1.2.3 (latest stable with team coordination)
- **Installation**: `npm install -g cns-mcp-server`
- **Production Ready**: Global deployment tested and validated

### Automated CI/CD Pipeline
The repository includes comprehensive GitHub Actions workflows:

#### Test Pipeline (`.github/workflows/test.yml`)
- **Triggers**: Push to main, pull requests
- **Node Versions**: 18, 20, 22 (LTS support)
- **Tests**: Unit tests, integration tests, performance tests
- **Linting**: ESLint with TypeScript support
- **Race Condition Prevention**: LanceDB path isolation per test

#### Publish Pipeline (`.github/workflows/publish.yml`)
- **Triggers**: Git tags (v*.*.*)
- **Automated Steps**:
  1. Run full test suite
  2. Build production artifacts
  3. Sync package.json version with git tag
  4. Publish to NPM registry
  5. Create GitHub release

### Version Management
```bash
# Create new release
git tag v1.2.4
git push origin v1.2.4
# → Automatically triggers NPM publish + GitHub release
```

### Recent Major Releases
- **v1.2.3**: Team coordination validation, CI/CD fixes, global deployment
- **v1.2.2**: Enhanced resource management, granular workflow control
- **v1.2.1**: MCP path resolution fixes, workspace isolation improvements
- **v1.2.0**: Integrated agent runner, invisible agent execution

### Performance & Testing Strategy
- **Functional Correctness**: Tests focus on what works, not timing
- **CI-Friendly**: No time-based assertions (unreliable in CI)
- **Concurrent Safety**: Race condition prevention for parallel tests
- **Memory Monitoring**: Resource usage tracking
- **Cross-Platform**: Tested on multiple Node.js versions

## 📁 Repository Structure & Maintenance

### Clean Repository Philosophy
- **Source Only**: Only essential source code and documentation
- **No Build Artifacts**: `dist/` excluded from version control
- **No Runtime Data**: Database files, logs, caches excluded
- **Professional Appearance**: Clean, navigable public repository

### File Organization
```
├── src/                 # TypeScript source code
├── tests/               # Test suites
├── .github/workflows/   # CI/CD automation
├── docs/               # User documentation
├── package.json        # NPM configuration
└── README.md          # Project overview
```

### Excluded from Repository (.gitignore)
- Build artifacts (`dist/`, `*.tgz`)
- Runtime data (`*.db`, `*.log`, `data/`)
- Development cache (`node_modules/`, `.cache/`)
- IDE files (`.vscode/`, `.idea/`)
- Test databases (`test-*.db`)
- LanceDB data (`**/data/lancedb/`)

### Development Workflow
1. **Local Development**: Work in `src/`, test with `npm test`
2. **Git Tags**: Create version tags for releases
3. **Automated Publishing**: CI/CD handles NPM and GitHub releases
4. **Repository Hygiene**: `.gitignore` prevents unwanted files

## 🤝 Team Coordination & Multi-Agent Architecture (v1.2.3+)

### Team-Based Agent Coordination
**VALIDATED**: Team managers can successfully spawn and coordinate associate agents using MCP tools.

#### Coordination Architecture:
- **Manager Agents**: Have full MCP tool access (`launch_agent`, `store_memory`, etc.)
- **Associate Agents**: Work in isolated environments without MCP access
- **Shared Workspaces**: Team members collaborate in shared git worktrees
- **Memory-Based Communication**: Agents coordinate via shared memory system
- **Global Path Resolution**: `npx -y cns-mcp-server` works in all workspace contexts

#### Team Coordination Flow:
```typescript
// 1. Launch team manager
launch_agent({ agent_type: 'team-manager', specifications: 'Create auth system with frontend, backend, security specialist' })

// 2. Manager spawns associates
manager.launch_agent({ agent_type: 'frontend-developer', specifications: 'Build login UI...' })
manager.launch_agent({ agent_type: 'backend-developer', specifications: 'Build JWT API...' })
manager.launch_agent({ agent_type: 'security-specialist', specifications: 'Security audit...' })

// 3. Team coordination via shared memory
manager.store_memory({ type: 'architecture_design', content: '...' })
associate.retrieve_memory({ query: 'architecture design' })
```

#### Workspace Isolation Strategy:
- **Detached Worktrees**: Each agent gets isolated git worktree from main branch
- **Shared Team Workspaces**: Associates can join existing manager workspaces
- **Resource Management**: Automatic cleanup with process termination
- **Concurrent Safety**: Multiple agents can work simultaneously without conflicts

### Enhanced Monitoring & Control (v1.2.3+)

#### Granular Workflow Control:
- **Individual Workflow Stop**: Stop specific teams without affecting others
- **Emergency Stop**: Kill all running agents immediately
- **Workflow Pause/Resume**: Temporarily halt workflows
- **Process Monitoring**: Track Claude/Node.js processes with PID monitoring
- **Resource Tracking**: Memory usage, disk usage, process count monitoring

#### System Health Monitoring:
- **Real-time Metrics**: Response times, request success rates, memory usage
- **Health Checks**: Database, memory system, orchestration engine, workspace manager
- **Agent Runner Status**: Active agents, capacity utilization, agent lifecycle tracking
- **Resource Limits**: Configurable concurrent agent limits, workspace cleanup scheduling

### Production Deployment Validation (v1.2.3)

#### Global Installation Testing:
✅ **NPM Global Install**: `npm install -g cns-mcp-server` tested across environments  
✅ **Path Resolution**: `npx -y cns-mcp-server` works in isolated agent workspaces  
✅ **Team Coordination**: Manager agents successfully spawn 8+ associate agents  
✅ **CI/CD Pipeline**: Automated testing, linting, and NPM publication  
✅ **Resource Efficiency**: 2MB workspace usage, <300MB memory, clean process management  

#### Validated Use Cases:
- ✅ Single agent execution and monitoring
- ✅ Team-based multi-agent coordination
- ✅ Complex project development (authentication systems, full-stack applications)
- ✅ Global NPM deployment and workspace isolation
- ✅ Process lifecycle management and cleanup

## 🧪 Testing Philosophy & Strategy

### Test Categories
- **Unit Tests**: Individual component functionality
- **Integration Tests**: Multi-component workflows and agent coordination
- **Performance Tests**: System behavior under load, concurrent agent execution
- **Workspace Tests**: Git worktree isolation and cleanup
- **Team Coordination Tests**: Multi-agent workflows and MCP tool usage
- **Production Tests**: Global installation, path resolution, resource management

### CI/CD Test Strategy
- **Functional Correctness**: Tests focus on what works, not timing
- **CI-Friendly**: No time-based assertions (unreliable in CI)
- **Concurrent Safety**: Race condition prevention for parallel tests
- **Resource Conscious**: Memory and performance monitoring
- **Cross-Platform**: Tested on Node.js 18, 20, 22
- **Production Simulation**: Global installation testing, detached worktree validation

### Known Limitations & Considerations
- **Agent Scope Control**: Team managers may over-engineer solutions without clear boundaries
- **Resource Monitoring**: Real-time agent interaction dashboard not yet implemented
- **Complex Project Risk**: Large teams (8+ agents) can create excessive complexity
- **Prompt Engineering**: Manager agents need careful specification to prevent runaway development