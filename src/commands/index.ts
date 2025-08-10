import { MemorySystem } from '../memory/index.js';
import { WorkspaceManager } from '../workspaces/index.js';
import { OrchestrationEngine } from '../orchestration/engine.js';
import { HealthMonitor } from '../utils/health-monitor.js';
import { Database } from '../database/index.js';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface CommandResult {
  content: string;
  mimeType: string;
}

export class CNSCommands {
  private memorySystem: MemorySystem;
  private orchestrationEngine: OrchestrationEngine;
  private healthMonitor: HealthMonitor;

  constructor(db: Database, memory: MemorySystem, workspaces: WorkspaceManager, orchestrationEngine?: OrchestrationEngine) {
    this.memorySystem = memory;
    this.orchestrationEngine = orchestrationEngine || new OrchestrationEngine(db, memory, workspaces);
    this.healthMonitor = new HealthMonitor();
  }

  async getStatus(): Promise<CommandResult> {
    try {
      const workflows = await this.orchestrationEngine.getActiveWorkflows();
      const memoryStats = await this.memorySystem.getStats();
      
      const status = workflows.length > 0 ? '🟡 Active' : '🟢 Idle';
      const uptime = this.getUptime();

      const content = `# 🚀 CNS System Status

| Component | Status | Details |
|-----------|--------|---------|
| **System** | ${status} | Uptime: ${uptime} |
| **Workflows** | ${workflows.length} active | Total managed |
| **Memory** | ${memoryStats.total_memories} memories | Provider: ${memoryStats.embedding_provider} |

## Active Workflows
${workflows.length === 0 ? '*No active workflows*' : 
workflows.map((w: any) => `**${w.id}** - ${w.agent_type} (${w.status})`).join('\n')}`;

      return { content, mimeType: 'text/markdown' };
    } catch (error) {
      return {
        content: `# ❌ System Status Error\n\n\`\`\`\n${(error as Error).message}\n\`\`\``,
        mimeType: 'text/markdown'
      };
    }
  }

  async getHealth(): Promise<CommandResult> {
    try {
      const health = await this.healthMonitor.getSystemHealth();
      const memoryStats = await this.memorySystem.getStats();
      
      const overallStatus = health.status === 'healthy' ? '🟢 Healthy' : '🟡 Issues Detected';

      const content = `# 🏥 CNS System Health

**Overall Status:** ${overallStatus}

## Health Checks
${Object.entries(health.checks).map(([name, status]) => {
  const icon = status.status === 'healthy' ? '✅' : status.status === 'degraded' ? '⚠️' : '❌';
  return `- ${icon} **${name}**: ${status.status}`;
}).join('\n')}

## System Metrics
- Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
- Response Time: ${health.metrics.responseTime.average}ms average
- Embedding Provider: ${memoryStats.embedding_provider}`;

      return { content, mimeType: 'text/markdown' };
    } catch (error) {
      return {
        content: `# ❌ Health Check Error\n\n\`\`\`\n${(error as Error).message}\n\`\`\``,
        mimeType: 'text/markdown'
      };
    }
  }

  async getWorkflows(): Promise<CommandResult> {
    try {
      const workflows = await this.orchestrationEngine.getActiveWorkflows();

      const content = `# 🔄 CNS Workflows

**Summary:** ${workflows.length} active workflows

## Active Workflows
${workflows.length === 0 ? '*No active workflows*' :
workflows.map((w: any) => `
### ${w.id}
- **Status:** ${w.status}
- **Agent:** ${w.agent_type}
- **Created:** ${new Date(w.created_at).toLocaleString()}
- **Specs:** ${w.specifications?.substring(0, 100)}${w.specifications?.length > 100 ? '...' : ''}
`).join('\n')}`;

      return { content, mimeType: 'text/markdown' };
    } catch (error) {
      return {
        content: `# ❌ Workflows Error\n\n\`\`\`\n${(error as Error).message}\n\`\`\``,
        mimeType: 'text/markdown'
      };
    }
  }

  async searchMemories(query: string): Promise<CommandResult> {
    try {
      if (!query || query.trim().length === 0) {
        return {
          content: '# 🔍 Memory Search\n\n**Error:** Please provide a search query.\n\n**Usage:** `/cns:search <your query>`',
          mimeType: 'text/markdown'
        };
      }

      const results = await this.memorySystem.retrieve({
        query: query.trim(),
        limit: 5,
        searchMode: 'hybrid'
      });

      const content = `# 🔍 Memory Search Results

**Query:** "${query}"
**Found:** ${results.content?.[0]?.text ? JSON.parse(results.content[0].text).count : 0} memories

${results.content?.[0]?.text ? 
  JSON.parse(results.content[0].text).results.map((memory: any, index: number) => `
## ${index + 1}. ${memory.type}
**Content:** ${memory.content.substring(0, 200)}${memory.content.length > 200 ? '...' : ''}
**Tags:** ${memory.tags?.join(', ') || 'None'}
**Created:** ${new Date(memory.created_at).toLocaleDateString()}
`).join('\n') : '*No memories found*'}`;

      return { content, mimeType: 'text/markdown' };
    } catch (error) {
      return {
        content: `# ❌ Search Error\n\n\`\`\`\n${(error as Error).message}\n\`\`\``,
        mimeType: 'text/markdown'
      };
    }
  }

  async getMemories(): Promise<CommandResult> {
    try {
      const stats = await this.memorySystem.getStats();

      const content = `# 🧠 CNS Memory System

**Total Memories:** ${stats.total_memories}
**Vector Memories:** ${stats.vector_memories}
**Embedding Provider:** ${stats.embedding_provider}

## Memory Statistics
- Total stored memories: ${stats.total_memories}
- Vector embeddings: ${stats.vector_memories}
- Provider: ${stats.embedding_provider || 'None'}`;

      return { content, mimeType: 'text/markdown' };
    } catch (error) {
      return {
        content: `# ❌ Memory System Error\n\n\`\`\`\n${(error as Error).message}\n\`\`\``,
        mimeType: 'text/markdown'
      };
    }
  }

  async getHelp(): Promise<CommandResult> {
    const content = `# 📚 CNS Slash Commands

## System Commands
- \`/cns:status\` - Quick system overview
- \`/cns:health\` - Detailed health diagnostics
- \`/cns:workflows\` - View active workflows

## Memory Commands
- \`/cns:search <query>\` - Search memories
- \`/cns:memories\` - View memory statistics

## Information Commands
- \`/cns:help\` - Show this help guide
- \`/cns:about\` - Version and system information

**Ready to transform your development workflow! 🚀**`;

    return { content, mimeType: 'text/markdown' };
  }

  async getAbout(): Promise<CommandResult> {
    let version = 'unknown';
    
    try {
      const packagePath = join(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      version = pkg.version;
    } catch {
      // Version unavailable
    }

    const content = `# ℹ️ About CNS MCP Server

**Version:** ${version}
**Name:** Central Nervous System MCP Server
**Description:** Autonomous Multi-Agent Orchestration for Claude Code

## Features
- 🤖 Autonomous agent orchestration
- 🧠 Free local semantic memory
- 🏗️ Git worktree workspace isolation
- 🎛️ Direct control via slash commands

**Transforming development workflows! 🌟**`;

    return { content, mimeType: 'text/markdown' };
  }

  private getUptime(): string {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}