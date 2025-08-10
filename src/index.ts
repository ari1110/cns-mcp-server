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
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
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
import { CNSCommands } from './commands/index.js';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export class CNSMCPServer {
  private server: Server;
  private hookHandlers: HookHandlers;
  private memory: MemorySystem;
  private workspaces: WorkspaceManager;
  private orchestration: OrchestrationEngine;
  private db: Database;
  private commands: CNSCommands;

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
          prompts: {},
        },
      }
    );

    // Initialize subsystems
    this.db = new Database(config.database);
    this.memory = new MemorySystem(this.db);
    this.workspaces = new WorkspaceManager(config.workspaces);
    this.orchestration = new OrchestrationEngine(this.db, this.memory, this.workspaces);
    this.hookHandlers = new HookHandlers(this.orchestration);
    this.commands = new CNSCommands(this.db, this.memory, this.workspaces, this.orchestration);

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
          description: 'Retrieve memories using semantic search, text search, or hybrid approach',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              filters: { type: 'object' },
              limit: { type: 'number', default: 10 },
              threshold: { type: 'number', default: 0.7 },
              search_mode: { 
                type: 'string', 
                enum: ['semantic', 'text', 'hybrid'],
                default: 'hybrid',
                description: 'Search strategy: semantic (vector), text (SQL LIKE), or hybrid (both combined)'
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'list_memories',
          description: 'Browse and list memories with optional filtering',
          inputSchema: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Filter by memory type' },
              workflow_id: { type: 'string', description: 'Filter by workflow ID' },
              limit: { type: 'number', default: 20, description: 'Maximum number of memories to return' },
              offset: { type: 'number', default: 0, description: 'Number of memories to skip for pagination' },
              order_by: { type: 'string', enum: ['created_at', 'type'], default: 'created_at', description: 'Field to order by' },
              order: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC', description: 'Sort order' },
            },
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
        {
          name: 'list_workspaces',
          description: 'List all active workspaces with details',
          inputSchema: {
            type: 'object',
            properties: {},
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
          name: 'list_workflows',
          description: 'List all workflows with optional filtering',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', description: 'Filter by workflow status (active, completed, failed, etc.)' },
              agent_type: { type: 'string', description: 'Filter by agent type' },
              limit: { type: 'number', default: 50, description: 'Maximum number of workflows to return' },
              offset: { type: 'number', default: 0, description: 'Number of workflows to skip for pagination' },
            },
          },
        },
        {
          name: 'get_workflow_handoffs',
          description: 'Get handoff history for a specific workflow for debugging agent coordination',
          inputSchema: {
            type: 'object',
            properties: {
              workflow_id: { type: 'string' },
              include_processed: { type: 'boolean', default: true, description: 'Include processed handoffs' },
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
        {
          name: 'validate_embedding_provider',
          description: 'Test and validate the embedding provider configuration',
          inputSchema: {
            type: 'object',
            properties: {
              test_text: {
                type: 'string',
                default: 'Test embedding generation',
                description: 'Text to use for embedding test'
              }
            },
          },
        },
        {
          name: 'detect_stale_workflows',
          description: 'Detect and mark workflows as stale after a timeout period',
          inputSchema: {
            type: 'object',
            properties: {
              threshold_minutes: {
                type: 'number',
                default: 120,
                description: 'Minutes after which an active workflow is considered stale'
              }
            },
          },
        },
        {
          name: 'cleanup_stale_workflows',
          description: 'Remove old stale workflows from the database',
          inputSchema: {
            type: 'object',
            properties: {
              retention_days: {
                type: 'number',
                default: 7,
                description: 'Days to keep stale workflows before deletion'
              }
            },
          },
        },
      ],
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        // Legacy JSON resources
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

        // Slash Commands (appear as /cns:command in Claude Code)
        {
          uri: 'cns:status',
          name: '/cns:status',
          description: '🚀 Quick system overview with active workflows',
          mimeType: 'text/markdown',
        },
        {
          uri: 'cns:health',
          name: '/cns:health', 
          description: '🏥 Detailed health check and system diagnostics',
          mimeType: 'text/markdown',
        },
        {
          uri: 'cns:workflows',
          name: '/cns:workflows',
          description: '🔄 View all active workflows and pending tasks',
          mimeType: 'text/markdown',
        },
        {
          uri: 'cns:search',
          name: '/cns:search',
          description: '🔍 Search memories using semantic + text search',
          mimeType: 'text/markdown',
        },
        {
          uri: 'cns:memories', 
          name: '/cns:memories',
          description: '🧠 View recent memories and system statistics',
          mimeType: 'text/markdown',
        },
        {
          uri: 'cns:help',
          name: '/cns:help',
          description: '📚 Available CNS commands and usage guide',
          mimeType: 'text/markdown',
        },
        {
          uri: 'cns:about',
          name: '/cns:about',
          description: 'ℹ️ CNS version and system information',
          mimeType: 'text/markdown',
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
          case 'list_memories':
            return await this.memory.listMemories(args as any);

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
          case 'list_workspaces':
            return await this.workspaces.listAll();

          // System operations
          case 'get_system_status':
            return await this.getSystemStatus(args as any);
          case 'get_workflow_status':
            return await this.orchestration.getWorkflowStatus((args as any).workflow_id);
          case 'list_workflows':
            return await this.orchestration.listWorkflows(args as any);
          case 'get_workflow_handoffs':
            return await this.orchestration.getWorkflowHandoffs((args as any).workflow_id, (args as any).include_processed);
          case 'get_system_health':
            return await this.getSystemHealth();
          case 'validate_embedding_provider':
            return await this.validateEmbeddingProvider(args as any);
          case 'detect_stale_workflows':
            return await this.detectStaleWorkflows(args as any);
          case 'cleanup_stale_workflows':
            return await this.cleanupStaleWorkflows(args as any);

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

        // Slash Commands - /cns:command
        case 'cns:status': {
          const result = await this.commands.getStatus();
          return {
            contents: [{
              uri,
              mimeType: result.mimeType || 'text/markdown',
              text: result.content,
            }],
          };
        }

        case 'cns:health': {
          const result = await this.commands.getHealth();
          return {
            contents: [{
              uri,
              mimeType: result.mimeType || 'text/markdown', 
              text: result.content,
            }],
          };
        }

        case 'cns:workflows': {
          const result = await this.commands.getWorkflows();
          return {
            contents: [{
              uri,
              mimeType: result.mimeType || 'text/markdown',
              text: result.content,
            }],
          };
        }

        case 'cns:memories': {
          const result = await this.commands.getMemories();
          return {
            contents: [{
              uri,
              mimeType: result.mimeType || 'text/markdown',
              text: result.content,
            }],
          };
        }

        case 'cns:help': {
          const result = await this.commands.getHelp();
          return {
            contents: [{
              uri,
              mimeType: result.mimeType || 'text/markdown',
              text: result.content,
            }],
          };
        }

        case 'cns:about': {
          const result = await this.commands.getAbout();
          return {
            contents: [{
              uri,
              mimeType: result.mimeType || 'text/markdown',
              text: result.content,
            }],
          };
        }

        default:
          // Handle parameterized commands like /cns:search <query>
          if (uri.startsWith('cns:search')) {
            const query = uri.replace('cns:search', '').replace(/^[:\s]+/, '').trim();
            const result = await this.commands.searchMemories(query);
            return {
              contents: [{
                uri,
                mimeType: result.mimeType || 'text/markdown',
                text: result.content,
              }],
            };
          }

          throw new Error(`Unknown resource: ${uri}`);
      }
    });

    // List available prompts (these become slash commands in Claude Code)
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: 'status',
          description: '🚀 Show CNS system status',
          arguments: [],
        },
        {
          name: 'health',
          description: '🏥 Run health diagnostics',
          arguments: [],
        },
        {
          name: 'workflows',
          description: '🔄 List active workflows',
          arguments: [],
        },
        {
          name: 'search',
          description: '🔍 Search memories',
          arguments: [
            {
              name: 'query',
              description: 'Search query',
              required: true,
            },
          ],
        },
        {
          name: 'memories',
          description: '🧠 Show memory statistics',
          arguments: [],
        },
        {
          name: 'help',
          description: '📚 Show CNS help',
          arguments: [],
        },
      ],
    }));

    // Get a specific prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'status':
          return {
            description: '🚀 Show CNS system status',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Show me the current CNS system status',
                },
              },
            ],
          };

        case 'health':
          return {
            description: '🏥 Run health diagnostics',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Run a complete health check on the CNS system',
                },
              },
            ],
          };

        case 'workflows':
          return {
            description: '🔄 List active workflows',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Show me all active CNS workflows and pending tasks',
                },
              },
            ],
          };

        case 'search':
          const query = args?.query || '';
          return {
            description: '🔍 Search memories',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: query ? `Search CNS memories for: ${query}` : 'Search CNS memories',
                },
              },
            ],
          };

        case 'memories':
          return {
            description: '🧠 Show memory statistics',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Show me CNS memory statistics and recent memories',
                },
              },
            ],
          };

        case 'help':
          return {
            description: '📚 Show CNS help',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Show me help for the CNS system and available commands',
                },
              },
            ],
          };

        default:
          throw new Error(`Unknown prompt: ${name}`);
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

  private async ensureDirectoryStructure() {
    // Create CNS directories automatically for download-and-go experience
    const dirsToCreate = [
      dirname(config.database.path),           // ~/.cns/data/
      config.workspaces.workspaces_dir,       // ~/.cns/workspaces/
      dirname(config.logging.file),           // ~/.cns/logs/
      dirname(config.logging.file.replace('logs', 'models'))  // ~/.cns/models/
    ];

    for (const dir of dirsToCreate) {
      try {
        await mkdir(dir, { recursive: true });
      } catch (error) {
        // Ignore if directory already exists
        if ((error as any).code !== 'EEXIST') {
          logger.warn(`Failed to create directory ${dir}:`, error);
        }
      }
    }
    logger.info('Directory structure ensured');
  }

  async run() {
    logger.info('Starting CNS MCP Server...');
    
    try {
      // Auto-create CNS directory structure (download-and-go)
      await this.ensureDirectoryStructure();
      
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

  private async validateEmbeddingProvider(args: { test_text?: string }) {
    const testText = args.test_text || 'Test embedding generation for validation';
    
    try {
      const provider = this.memory.getEmbeddingProvider();
      
      if (!provider) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'no_provider',
              message: 'No embedding provider configured',
              recommendation: 'Set EMBEDDING_PROVIDER=transformers for free local embeddings'
            })
          }]
        };
      }
      
      logger.info('Validating embedding provider', { 
        provider: provider.getName(),
        testText: testText.substring(0, 50) 
      });
      
      const startTime = Date.now();
      const embedding = await provider.generateEmbedding(testText);
      const duration = Date.now() - startTime;
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'success',
            provider: provider.getName(),
            dimension: provider.getDimension(),
            generation_time_ms: duration,
            embedding_sample: embedding.slice(0, 5).map(v => v.toFixed(4)),
            test_text: testText,
            message: `Embedding provider is working correctly`
          })
        }]
      };
      
    } catch (error) {
      logger.error('Embedding provider validation failed', { error });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            recommendation: error instanceof Error && error.message.includes('OpenAI') 
              ? 'Check OPENAI_API_KEY or switch to EMBEDDING_PROVIDER=transformers'
              : 'Check embedding provider configuration'
          })
        }]
      };
    }
  }

  private async detectStaleWorkflows(args: { threshold_minutes?: number }) {
    const thresholdMinutes = args.threshold_minutes ?? 120;
    
    try {
      const staleCount = await this.orchestration.detectAndMarkStaleWorkflows(thresholdMinutes);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'success',
            stale_workflows_found: staleCount,
            threshold_minutes: thresholdMinutes,
            message: staleCount > 0 
              ? `Marked ${staleCount} workflows as stale` 
              : 'No stale workflows found'
          })
        }]
      };
    } catch (error) {
      logger.error('Failed to detect stale workflows', { error });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to detect stale workflows'
          })
        }]
      };
    }
  }

  private async cleanupStaleWorkflows(args: { retention_days?: number }) {
    const retentionDays = args.retention_days ?? 7;
    
    try {
      const deletedCount = await this.orchestration.cleanupOldStaleWorkflows(retentionDays);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'success',
            deleted_workflows: deletedCount,
            retention_days: retentionDays,
            message: deletedCount > 0 
              ? `Deleted ${deletedCount} old stale workflows` 
              : 'No old stale workflows to cleanup'
          })
        }]
      };
    } catch (error) {
      logger.error('Failed to cleanup stale workflows', { error });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to cleanup stale workflows'
          })
        }]
      };
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

// Create and run the server (handles npm/npx execution)
if (import.meta.url === `file://${process.argv[1]}` || 
    import.meta.url.endsWith('/index.js') ||
    process.argv[1]?.endsWith('/cns-mcp-server')) {
  const server = new CNSMCPServer();
  server.run().catch((error) => {
    logger.error('Server error:', error);
    process.exit(1);
  });
}