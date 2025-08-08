#!/usr/bin/env node
/**
 * CNS (Central Nervous System) MCP Server
 * Autonomous Multi-Agent Orchestration for Claude Code
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { HookHandlers } from './orchestration/hooks/index.js';
import { MemorySystem } from './memory/index.js';
import { WorkspaceManager } from './workspaces/index.js';
import { OrchestrationEngine } from './orchestration/engine.js';
import { logger } from './utils/logger.js';
import { Database } from './database/index.js';
import { config } from './config/index.js';
import { CNSError, gracefulShutdown } from './utils/error-handler.js';
import { healthMonitor } from './utils/health-monitor.js';

export class CNSMCPServer {
  private server: Server;
  private hookHandlers: HookHandlers;
  private memory: MemorySystem;
  private workspaces: WorkspaceManager;
  private orchestration: OrchestrationEngine;
  private db: Database;

  constructor() {
    this.server = new Server(
      {
        name: 'cns-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Initialize subsystems
    this.db = new Database(config.database);
    this.memory = new MemorySystem(this.db);
    this.workspaces = new WorkspaceManager(config.workspaces);
    this.orchestration = new OrchestrationEngine(this.db, this.memory, this.workspaces);
    this.hookHandlers = new HookHandlers(this.orchestration);

    this.setupHandlers();
    this.setupHealthChecks();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Hook Handlers (receive events from Claude Code hooks)
        {
          name: 'handle_subagent_stop',
          description: 'Handle SubagentStop hook event from Claude Code',
          inputSchema: {
            type: 'object',
            properties: {
              transcript_path: { type: 'string' },
              agent_type: { type: 'string' },
              workflow_id: { type: 'string' },
              session_id: { type: 'string' },
              cwd: { type: 'string' },
            },
            required: ['transcript_path', 'agent_type'],
          },
        },
        {
          name: 'handle_pre_tool_use',
          description: 'Handle PreToolUse hook event from Claude Code',
          inputSchema: {
            type: 'object',
            properties: {
              tool_name: { type: 'string' },
              tool_input: { type: 'object' },
              session_id: { type: 'string' },
              cwd: { type: 'string' },
            },
            required: ['tool_name', 'tool_input'],
          },
        },
        {
          name: 'handle_session_start',
          description: 'Handle SessionStart hook event from Claude Code',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string' },
              session_type: { type: 'string', enum: ['startup', 'resume'] },
              cwd: { type: 'string' },
              context: { type: 'object' },
            },
            required: ['session_id'],
          },
        },

        // Memory Operations
        {
          name: 'store_memory',
          description: 'Store information in the memory system',
          inputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              type: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              workflow_id: { type: 'string' },
              metadata: { type: 'object' },
            },
            required: ['content', 'type'],
          },
        },
        {
          name: 'retrieve_memory',
          description: 'Retrieve memories using semantic search',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              filters: { type: 'object' },
              limit: { type: 'number' },
              threshold: { type: 'number' },
            },
            required: ['query'],
          },
        },

        // Orchestration Operations
        {
          name: 'launch_agent',
          description: 'Launch a new agent with specifications',
          inputSchema: {
            type: 'object',
            properties: {
              agent_type: { type: 'string' },
              specifications: { type: 'string' },
              workflow_id: { type: 'string' },
              workspace_config: { type: 'object' },
            },
            required: ['agent_type', 'specifications'],
          },
        },
        {
          name: 'get_pending_tasks',
          description: 'Get all pending tasks in the orchestration queue',
          inputSchema: {
            type: 'object',
            properties: {
              priority: { type: 'string' },
              agent_type: { type: 'string' },
            },
          },
        },
        {
          name: 'signal_completion',
          description: 'Signal that an agent has completed its task',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              workflow_id: { type: 'string' },
              result: { type: 'string' },
              artifacts: { type: 'array' },
            },
            required: ['agent_id', 'result'],
          },
        },

        // Workspace Management
        {
          name: 'create_workspace',
          description: 'Create an isolated workspace for an agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              base_ref: { type: 'string' },
              resources: { type: 'object' },
            },
            required: ['agent_id'],
          },
        },
        {
          name: 'cleanup_workspace',
          description: 'Clean up an agent workspace',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              force: { type: 'boolean' },
            },
            required: ['agent_id'],
          },
        },

        // System Operations
        {
          name: 'get_system_status',
          description: 'Get comprehensive system status with health checks and metrics',
          inputSchema: {
            type: 'object',
            properties: {
              include_metrics: { type: 'boolean', default: true },
              include_health_checks: { type: 'boolean', default: true },
            },
          },
        },
        {
          name: 'get_workflow_status',
          description: 'Get status of a specific workflow',
          inputSchema: {
            type: 'object',
            properties: {
              workflow_id: { type: 'string' },
            },
            required: ['workflow_id'],
          },
        },
        {
          name: 'get_system_health',
          description: 'Get detailed system health information',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'cns://status',
          name: 'System Status',
          description: 'Current CNS system status',
          mimeType: 'application/json',
        },
        {
          uri: 'cns://workflows',
          name: 'Active Workflows',
          description: 'List of active workflows',
          mimeType: 'application/json',
        },
        {
          uri: 'cns://memory/stats',
          name: 'Memory Statistics',
          description: 'Memory system statistics',
          mimeType: 'application/json',
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();
      
      logger.info(`Tool called: ${name}`, { args });

      try {
        // Validate args exist
        if (!args) {
          throw new Error(`Missing arguments for tool ${name}`);
        }

        switch (name) {
          // Hook handlers
          case 'handle_subagent_stop':
            return await this.hookHandlers.handleSubagentStop(args as any);
          case 'handle_pre_tool_use':
            return await this.hookHandlers.handlePreToolUse(args as any);
          case 'handle_session_start':
            return await this.hookHandlers.handleSessionStart(args as any);

          // Memory operations
          case 'store_memory':
            return await this.memory.store(args);
          case 'retrieve_memory':
            return await this.memory.retrieve(args);

          // Orchestration operations
          case 'launch_agent':
            return await this.orchestration.launchAgent(args as any);
          case 'get_pending_tasks':
            return await this.orchestration.getPendingTasks();
          case 'signal_completion':
            return await this.orchestration.signalCompletion(args as any);

          // Workspace operations
          case 'create_workspace':
            return await this.workspaces.create(args as any);
          case 'cleanup_workspace':
            return await this.workspaces.cleanup(args as any);

          // System operations
          case 'get_system_status':
            return await this.getSystemStatus(args as any);
          case 'get_workflow_status':
            return await this.orchestration.getWorkflowStatus((args as any).workflow_id);
          case 'get_system_health':
            return await this.getSystemHealth();

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        healthMonitor.recordError();
        healthMonitor.recordResponseTime(duration);
        
        logger.error(`Tool error: ${name}`, { tool: name, args, error, duration });
        
        if (error instanceof CNSError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: error.message,
                  code: error.code,
                  retryable: error.retryable,
                  tool: name,
                  context: error.context,
                }),
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                code: 'TOOL_EXECUTION_ERROR',
                retryable: true,
                tool: name,
              }),
            },
          ],
        };
      } finally {
        const duration = Date.now() - startTime;
        healthMonitor.recordSuccess();
        healthMonitor.recordResponseTime(duration);
      }
    });

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case 'cns://status':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(await this.getSystemStatus(), null, 2),
              },
            ],
          };

        case 'cns://workflows':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(await this.orchestration.getActiveWorkflows(), null, 2),
              },
            ],
          };

        case 'cns://memory/stats':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(await this.memory.getStats(), null, 2),
              },
            ],
          };

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });
  }

  private async getSystemStatus(options: { include_metrics?: boolean; include_health_checks?: boolean } = {}) {
    const includeMetrics = options.include_metrics !== false;
    const includeHealthChecks = options.include_health_checks !== false;

    const [memoryStats, workflowStats, workspaceStats] = await Promise.all([
      this.memory.getStats(),
      this.orchestration.getStats(),
      this.workspaces.getStats(),
    ]);

    const status = {
      status: 'operational',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: memoryStats,
      workflows: workflowStats,
      workspaces: workspaceStats,
      timestamp: new Date().toISOString(),
    };

    if (includeMetrics) {
      (status as any).metrics = healthMonitor.getMetrics();
    }

    if (includeHealthChecks) {
      (status as any).health_checks = await healthMonitor.runAllHealthChecks();
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  private async getSystemHealth() {
    const health = await healthMonitor.getSystemHealth();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(health, null, 2),
        },
      ],
    };
  }

  private setupHealthChecks() {
    // Database health check
    healthMonitor.addHealthCheck('database', async () => {
      try {
        await this.db.get('SELECT 1');
        return { status: 'healthy', message: 'Database connection successful' };
      } catch (error) {
        return { 
          status: 'unhealthy', 
          message: 'Database connection failed',
          metadata: { error: error instanceof Error ? error.message : error }
        };
      }
    });

    // Memory system health check
    healthMonitor.addHealthCheck('memory_system', async () => {
      try {
        const stats = await this.memory.getStats();
        return { 
          status: 'healthy', 
          message: 'Memory system operational',
          metadata: { total_memories: stats.total_memories }
        };
      } catch (error) {
        return { 
          status: 'unhealthy', 
          message: 'Memory system check failed',
          metadata: { error: error instanceof Error ? error.message : error }
        };
      }
    });

    // Orchestration engine health check
    healthMonitor.addHealthCheck('orchestration', async () => {
      try {
        const stats = await this.orchestration.getStats();
        const hasHighWorkflowCount = stats.workflows > 100;
        
        return { 
          status: hasHighWorkflowCount ? 'degraded' : 'healthy',
          message: hasHighWorkflowCount 
            ? 'High workflow count detected' 
            : 'Orchestration engine operational',
          metadata: stats
        };
      } catch (error) {
        return { 
          status: 'unhealthy', 
          message: 'Orchestration engine check failed',
          metadata: { error: error instanceof Error ? error.message : error }
        };
      }
    });

    // Workspace manager health check
    healthMonitor.addHealthCheck('workspaces', async () => {
      try {
        const stats = await this.workspaces.getStats();
        return { 
          status: 'healthy', 
          message: 'Workspace manager operational',
          metadata: stats
        };
      } catch (error) {
        return { 
          status: 'unhealthy', 
          message: 'Workspace manager check failed',
          metadata: { error: error instanceof Error ? error.message : error }
        };
      }
    });
  }

  async run() {
    logger.info('Starting CNS MCP Server...');
    
    try {
      // Initialize database
      await this.db.initialize();
      logger.info('Database initialized successfully');
      
      // Start orchestration engine
      await this.orchestration.start();
      logger.info('Orchestration engine started successfully');
      
      // Connect to stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('CNS MCP Server running on stdio');
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('Failed to start CNS MCP Server', { error });
      throw error;
    }
  }

  private setupGracefulShutdown() {
    gracefulShutdown(async () => {
      logger.info('Shutting down CNS MCP Server...');
      
      // Stop orchestration engine
      if (this.orchestration) {
        await this.orchestration.stop();
        logger.info('Orchestration engine stopped');
      }
      
      // Close database connections if method exists
      if (this.db && typeof (this.db as any).close === 'function') {
        await (this.db as any).close();
        logger.info('Database connections closed');
      }
      
      logger.info('CNS MCP Server shutdown complete');
    });
  }
}

// Create and run the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new CNSMCPServer();
  server.run().catch((error) => {
    logger.error('Server error:', error);
    process.exit(1);
  });
}