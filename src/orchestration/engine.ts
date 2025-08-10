/**
 * Orchestration Engine - Core orchestration logic
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as cron from 'node-cron';
import { Database } from '../database/index.js';
import { MemorySystem } from '../memory/index.js';
import { WorkspaceManager } from '../workspaces/index.js';
import { logger } from '../utils/logger.js';

interface Handoff {
  id: string;
  from: string;
  to: string;
  workflow_id: string;
  type: string;
  created_at: Date;
  processed: boolean;
}

interface Workflow {
  id: string;
  name?: string;
  status: string;
  agent_type?: string;
  agent_role?: string;
  specifications?: string;
  created_at: Date;
  updated_at: Date;
}

interface LaunchAgentArgs {
  agent_type: string;
  specifications: string;
  workflow_id?: string;
  workspace_config?: any;
}

export class OrchestrationEngine extends EventEmitter {
  private workflows: Map<string, Workflow> = new Map();
  private handoffs: Map<string, Handoff> = new Map();
  private pendingTasks: any[] = [];
  private cleanupScheduler: cron.ScheduledTask | null = null;

  constructor(
    private db: Database,
    private memory: MemorySystem,
    private workspaces: WorkspaceManager
  ) {
    super();
  }

  async start() {
    logger.info('Starting orchestration engine');
    
    // Load existing workflows from database
    await this.loadWorkflows();
    
    // Start cleanup scheduler (runs every 5 minutes)
    this.cleanupScheduler = cron.schedule('*/5 * * * *', async () => {
      await this.processScheduledCleanups();
    });
    
    // Start event processor
    this.startEventProcessor();
  }

  async stop() {
    if (this.cleanupScheduler) {
      this.cleanupScheduler.stop();
    }
  }

  /**
   * Create a handoff between agents
   */
  async createHandoff(handoff: Omit<Handoff, 'id' | 'created_at' | 'processed'>) {
    const id = uuidv4();
    const newHandoff: Handoff = {
      ...handoff,
      id,
      created_at: new Date(),
      processed: false,
    };
    
    this.handoffs.set(id, newHandoff);
    
    // Store in database
    await this.db.run(
      `INSERT INTO handoffs (id, from_agent, to_agent, workflow_id, type, created_at, processed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, handoff.from, handoff.to, handoff.workflow_id, handoff.type, newHandoff.created_at.toISOString(), 0]
    );
    
    // Emit event for processing
    this.emit('handoff:created', newHandoff);
    
    logger.info('Handoff created', { handoff: newHandoff });
    
    return newHandoff;
  }

  /**
   * Launch an agent with specifications
   */
  async launchAgent(args: LaunchAgentArgs) {
    const workflowId = args.workflow_id || uuidv4();
    
    logger.info('Launching agent', { agent: args.agent_type, workflow: workflowId });
    
    // Create or update workflow
    const workflow: Workflow = {
      id: workflowId,
      status: 'active',
      agent_type: args.agent_type,
      specifications: args.specifications,
      created_at: new Date(),
      updated_at: new Date(),
    };
    
    this.workflows.set(workflowId, workflow);
    
    // Store in database
    await this.db.run(
      `INSERT OR REPLACE INTO workflows (id, status, agent_type, specifications, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [workflowId, workflow.status, args.agent_type, args.specifications, 
       workflow.created_at.toISOString(), workflow.updated_at.toISOString()]
    );
    
    // Store specifications in memory for retrieval
    await this.memory.store({
      content: args.specifications,
      type: 'specifications',
      tags: ['workflow', args.agent_type],
      workflow_id: workflowId,
      metadata: {
        agent_type: args.agent_type,
        created_at: new Date().toISOString(),
      },
    });
    
    // Create workspace if needed
    if (args.workspace_config) {
      await this.workspaces.create({
        agent_id: `${args.agent_type}-${workflowId}`,
        base_ref: args.workspace_config.base_ref || 'main',
        resources: args.workspace_config.resources,
      });
    }
    
    // Generate Task tool prompt
    const prompt = this.generateTaskPrompt(args.agent_type, args.specifications, workflowId);
    
    // Queue for execution
    this.pendingTasks.push({
      type: 'launch_agent',
      agent_type: args.agent_type,
      workflow_id: workflowId,
      prompt,
      created_at: new Date(),
    });
    
    // Emit event
    this.emit('agent:launched', { agent_type: args.agent_type, workflow_id: workflowId });
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'queued',
            workflow_id: workflowId,
            agent_type: args.agent_type,
            prompt_preview: prompt.substring(0, 200) + '...',
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Get pending tasks
   */
  async getPendingTasks(filters?: { priority?: string; agent_type?: string }) {
    let tasks = [...this.pendingTasks];
    
    if (filters?.agent_type) {
      tasks = tasks.filter(t => t.agent_type === filters.agent_type);
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: tasks.length,
            tasks: tasks.map(t => ({
              type: t.type,
              agent_type: t.agent_type,
              workflow_id: t.workflow_id,
              created_at: t.created_at,
            })),
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Signal task completion
   */
  async signalCompletion(args: { agent_id: string; workflow_id?: string; result: string; artifacts?: any[] }) {
    logger.info('Agent signaled completion', { agent: args.agent_id });
    
    // Update workflow status
    if (args.workflow_id) {
      await this.updateWorkflowStatus(args.workflow_id, 'completed');
    }
    
    // Store result in memory
    await this.memory.store({
      content: args.result,
      type: 'completion',
      tags: ['result', args.agent_id],
      workflow_id: args.workflow_id,
      metadata: {
        agent_id: args.agent_id,
        artifacts: args.artifacts,
        completed_at: new Date().toISOString(),
      },
    });
    
    // Emit completion event
    this.emit('agent:completed', { agent_id: args.agent_id, workflow_id: args.workflow_id });
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'recorded',
            agent_id: args.agent_id,
            workflow_id: args.workflow_id,
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Process pending events (called by hooks)
   */
  async processPendingEvents() {
    const unprocessedHandoffs = Array.from(this.handoffs.values()).filter(h => !h.processed);
    
    for (const handoff of unprocessedHandoffs) {
      logger.info('Processing handoff', { handoff });
      
      // Mark as processed
      handoff.processed = true;
      await this.db.run('UPDATE handoffs SET processed = 1 WHERE id = ?', [handoff.id]);
      
      // Trigger appropriate action based on handoff type
      if (handoff.type === 'task_assignment' && handoff.to.includes('associate')) {
        // Auto-launch associate
        await this.launchAgent({
          agent_type: handoff.to,
          specifications: await this.getWorkflowSpecifications(handoff.workflow_id),
          workflow_id: handoff.workflow_id,
        });
      }
    }
  }

  /**
   * Helper methods
   */
  
  async updateWorkflowStatus(workflowId: string, status: string) {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = status;
      workflow.updated_at = new Date();
      
      await this.db.run(
        'UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?',
        [status, workflow.updated_at.toISOString(), workflowId]
      );
    }
  }

  async getWorkflowStatus(workflowId: string) {
    const workflow = this.workflows.get(workflowId);
    let workflowData = workflow;
    
    if (!workflow) {
      // Try to load from database
      const row = await this.db.get('SELECT * FROM workflows WHERE id = ?', [workflowId]);
      if (row) {
        workflowData = row;
      }
    }
    
    if (!workflowData) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Workflow not found' }, null, 2),
          },
        ],
      };
    }
    
    // Get handoff history for this workflow
    try {
      const handoffs = await this.db.all(
        'SELECT * FROM handoffs WHERE workflow_id = ? ORDER BY created_at ASC',
        [workflowId]
      );
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              workflow: workflowData,
              handoff_history: {
                count: handoffs.length,
                handoffs: handoffs
              }
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.warn('Failed to load handoff history for workflow', { error, workflowId });
      
      // Return workflow data without handoffs if handoff query fails
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              workflow: workflowData,
              handoff_history: {
                error: 'Failed to load handoff history'
              }
            }, null, 2),
          },
        ],
      };
    }
  }

  async getActiveWorkflows() {
    return Array.from(this.workflows.values()).filter(w => w.status === 'active');
  }

  async listWorkflows(options: { 
    status?: string; 
    agent_type?: string; 
    limit?: number; 
    offset?: number; 
  } = {}) {
    const { status, agent_type, limit = 50, offset = 0 } = options;
    
    let query = 'SELECT * FROM workflows';
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (agent_type) {
      conditions.push('agent_type = ?');
      params.push(agent_type);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    try {
      const rows = await this.db.all(query, params);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              count: rows.length,
              workflows: rows,
              filters: { status, agent_type },
              pagination: { limit, offset }
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to list workflows', { error, options });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to list workflows',
              message: error instanceof Error ? error.message : 'Unknown error'
            }, null, 2),
          },
        ],
      };
    }
  }

  async getWorkflowHandoffs(workflowId: string, includeProcessed: boolean = true) {
    let query = 'SELECT * FROM handoffs WHERE workflow_id = ?';
    const params = [workflowId];
    
    if (!includeProcessed) {
      query += ' AND processed = 0';
    }
    
    query += ' ORDER BY created_at ASC';
    
    try {
      const handoffs = await this.db.all(query, params);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              workflow_id: workflowId,
              count: handoffs.length,
              handoffs: handoffs,
              include_processed: includeProcessed
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to get workflow handoffs', { error, workflowId });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to get workflow handoffs',
              workflow_id: workflowId,
              message: error instanceof Error ? error.message : 'Unknown error'
            }, null, 2),
          },
        ],
      };
    }
  }

  async getWorkflowSpecifications(workflowId: string): Promise<string> {
    const memories = await this.memory.retrieve({
      query: `workflow specifications ${workflowId}`,
      filters: { workflow_id: workflowId, type: 'specifications' },
      limit: 1,
    });
    
    if (memories.content && memories.content.length > 0) {
      const result = JSON.parse(memories.content[0].text);
      return result.results?.[0]?.content || 'Implement based on requirements';
    }
    
    return 'Implement based on project requirements';
  }

  async createWorkflowContext(context: any) {
    const workflowId = context.workflow_id;
    
    const workflow: Workflow = {
      id: workflowId,
      status: 'initialized',
      agent_type: context.agent_type,
      agent_role: context.agent_role,
      created_at: new Date(),
      updated_at: new Date(),
    };
    
    this.workflows.set(workflowId, workflow);
    
    await this.db.run(
      `INSERT OR REPLACE INTO workflows (id, status, agent_type, agent_role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [workflowId, workflow.status, context.agent_type, context.agent_role,
       workflow.created_at.toISOString(), workflow.updated_at.toISOString()]
    );
  }

  async createWorktree(workflowId: string, agentType: string): Promise<boolean> {
    try {
      await this.workspaces.create({
        agent_id: `${agentType}-${workflowId}`,
        base_ref: 'main',
      });
      return true;
    } catch (error) {
      logger.error('Failed to create worktree', error);
      return false;
    }
  }

  async scheduleWorkspaceCleanup(workflowId: string, delayMinutes: number) {
    const cleanupTime = new Date(Date.now() + delayMinutes * 60 * 1000);
    
    await this.db.run(
      'INSERT INTO cleanup_schedule (workflow_id, scheduled_for) VALUES (?, ?)',
      [workflowId, cleanupTime.toISOString()]
    );
    
    logger.info(`Scheduled cleanup for workflow ${workflowId} at ${cleanupTime}`);
  }

  async processScheduledCleanups() {
    const now = new Date();
    
    const scheduled = await this.db.all(
      'SELECT * FROM cleanup_schedule WHERE scheduled_for <= ? AND processed = 0',
      [now.toISOString()]
    );
    
    for (const item of scheduled) {
      try {
        await this.workspaces.cleanup({
          agent_id: item.workflow_id,
          force: false,
        });
        
        await this.db.run(
          'UPDATE cleanup_schedule SET processed = 1 WHERE id = ?',
          [item.id]
        );
        
        logger.info(`Cleaned up workspace for workflow ${item.workflow_id}`);
      } catch (error) {
        logger.error(`Failed to cleanup workspace ${item.workflow_id}`, error);
      }
    }
  }

  async trackToolUsage(usage: { tool_name: string; session_id?: string; timestamp: Date }) {
    await this.db.run(
      'INSERT INTO tool_usage (tool_name, session_id, timestamp) VALUES (?, ?, ?)',
      [usage.tool_name, usage.session_id, usage.timestamp.toISOString()]
    );
  }

  async getSystemStatus() {
    const workflowCount = this.workflows.size;
    const activeWorkflows = Array.from(this.workflows.values()).filter(w => w.status === 'active').length;
    const pendingHandoffs = Array.from(this.handoffs.values()).filter(h => !h.processed).length;
    
    return {
      status: 'operational',
      workflows: {
        total: workflowCount,
        active: activeWorkflows,
        pending_handoffs: pendingHandoffs,
      },
      pending_tasks: this.pendingTasks.length,
    };
  }

  async getStats() {
    return {
      workflows: this.workflows.size,
      handoffs: this.handoffs.size,
      pending_tasks: this.pendingTasks.length,
      active_workflows: Array.from(this.workflows.values()).filter(w => w.status === 'active').length,
    };
  }

  private generateTaskPrompt(agentType: string, specifications: string, workflowId: string): string {
    return `
Execute Task tool with:
- subagent_type: "${agentType}"
- description: "Autonomous task for workflow ${workflowId}"
- prompt: |
    You are ${agentType} executing an autonomous task.
    
    Specifications:
    ${specifications}
    
    Complete your task according to the specifications and end with the appropriate marker:
    - "Implementation Complete" if you're an associate finishing implementation
    - "Task Assignment" if you're a manager delegating to an associate
    - "Approved for Integration" if you're a manager approving work
    - "Review Required" if changes are needed
`;
  }

  private async loadWorkflows() {
    const rows = await this.db.all("SELECT * FROM workflows WHERE status != 'completed'");
    
    for (const row of rows) {
      this.workflows.set(row.id, {
        id: row.id,
        name: row.name,
        status: row.status,
        agent_type: row.agent_type,
        agent_role: row.agent_role,
        specifications: row.specifications,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      });
    }
    
    logger.info(`Loaded ${this.workflows.size} workflows from database`);
  }

  private startEventProcessor() {
    // Process events every 5 seconds
    setInterval(async () => {
      await this.processPendingEvents();
    }, 5000);
  }
}