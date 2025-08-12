/**
 * Orchestration Engine - Core orchestration logic
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as cron from 'node-cron';
import { Database } from '../database/index.js';
import { MemorySystem } from '../memory/index.js';
import { WorkspaceManager } from '../workspaces/index.js';
import { ScopeControlSystem } from './scope-control.js';
import { logger } from '../utils/logger.js';

interface Handoff {
  id: string;
  from: string;
  to: string;
  workflow_id: string;
  type: string;
  task_details?: string;
  created_at: Date;
  processed: boolean;
}

interface Workflow {
  id: string;
  name?: string;
  status: 'active' | 'completed' | 'failed' | 'stale' | 'approved' | 'initialized' | 'delegation' | 'awaiting_approval' | 'revision_required';
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
  public scopeControl: ScopeControlSystem;
  private roleRegistry: Map<string, Set<string>> = new Map(); // workflowId -> Set of agent roles

  constructor(
    private db: Database,
    private memory: MemorySystem,
    private workspaces: WorkspaceManager
  ) {
    super();
    this.scopeControl = new ScopeControlSystem();
    
    // Forward scope control events
    this.scopeControl.on('scope:violations', (data) => {
      this.emit('scope:violations', data);
    });
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
      `INSERT INTO handoffs (id, from_agent, to_agent, workflow_id, type, task_details, created_at, processed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, handoff.from, handoff.to, handoff.workflow_id, handoff.type, handoff.task_details, newHandoff.created_at.toISOString(), 0]
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
    const taskId = `${args.agent_type}-${workflowId}`;
    
    logger.info('🚀 MCP TOOL USED: launch_agent called', { 
      agent: args.agent_type, 
      workflow: workflowId,
      hasSpecifications: !!args.specifications,
      specificationsLength: args.specifications?.length || 0,
      specificationsPreview: args.specifications?.substring(0, 100) + '...' || 'NULL',
      calledBy: 'Manager Agent via MCP'
    });
    
    // 🚫 PREVENT DUPLICATE AGENT SPAWNING
    const workflowRoles = this.roleRegistry.get(workflowId) || new Set<string>();
    if (workflowRoles.has(args.agent_type)) {
      logger.warn('🚫 DUPLICATE AGENT BLOCKED', {
        workflowId,
        agentType: args.agent_type,
        existingRoles: Array.from(workflowRoles)
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'duplicate_blocked',
              workflow_id: workflowId,
              agent_type: args.agent_type,
              message: `Agent role '${args.agent_type}' already exists in this workflow`,
              existing_roles: Array.from(workflowRoles),
              recommendation: 'Check agent status with retrieve_memory before spawning'
            }, null, 2),
          },
        ],
      };
    }
    
    // Register the new role
    workflowRoles.add(args.agent_type);
    this.roleRegistry.set(workflowId, workflowRoles);
    
    // 🎯 SCOPE CONTROL: Register task and validate specifications
    const scopeResult = await this.scopeControl.registerTask(
      taskId,
      workflowId,
      args.agent_type,
      args.specifications
    );
    
    if (!scopeResult.success) {
      logger.warn('🚫 Task blocked by scope control', {
        taskId,
        violations: scopeResult.violations
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'blocked',
              workflow_id: workflowId,
              agent_type: args.agent_type,
              reason: 'Scope control violations',
              violations: scopeResult.violations,
              recommendations: scopeResult.violations.map(v => v.recommendedAction)
            }, null, 2),
          },
        ],
      };
    }
    
    // Log scope control warnings
    if (scopeResult.violations.length > 0) {
      logger.warn('⚠️ Scope control warnings for task', {
        taskId,
        violations: scopeResult.violations.map(v => v.message)
      });
    }
    
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
        scope_constraints: scopeResult.constraints
      },
    });
    
    // Create workspace if needed
    if (args.workspace_config) {
      await this.workspaces.create({
        agent_id: taskId,
        base_ref: args.workspace_config.base_ref || 'main',
        resources: args.workspace_config.resources,
      });
    }
    
    // Generate Task tool prompt with scope constraints
    const scopedSpecifications = this.scopeControl.generateScopedSpecifications(
      args.specifications, 
      scopeResult.constraints
    );
    const prompt = this.generateTaskPrompt(args.agent_type, scopedSpecifications, workflowId);
    
    // Queue for execution
    this.pendingTasks.push({
      type: 'launch_agent',
      agent_type: args.agent_type,
      workflow_id: workflowId,
      task_id: taskId,
      prompt,
      scope_constraints: scopeResult.constraints,
      created_at: new Date(),
    });
    
    // Emit event
    this.emit('agent:launched', { agent_type: args.agent_type, workflow_id: workflowId, task_id: taskId });
    
    logger.info('✅ Agent registered in role registry', {
      workflowId,
      agentType: args.agent_type,
      totalRolesInWorkflow: workflowRoles.size,
      allRoles: Array.from(workflowRoles)
    });
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'queued',
            workflow_id: workflowId,
            agent_type: args.agent_type,
            task_id: taskId,
            scope_constraints: {
              complexity: scopeResult.constraints.complexityThreshold,
              max_workspace_size: Math.round(scopeResult.constraints.maxWorkspaceSize / 1024 / 1024) + 'MB',
              max_execution_time: scopeResult.constraints.maxExecutionTime + ' minutes',
              max_team_size: scopeResult.constraints.maxTeamSize + ' agents'
            },
            violations: scopeResult.violations.length,
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
              prompt: t.prompt,
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
    
    // Remove completed task from pending queue
    this.pendingTasks = this.pendingTasks.filter(task => 
      !(task.workflow_id === args.workflow_id && task.type === 'launch_agent')
    );
    
    // Extract agent type from agent_id (format: agentType-workflowId-timestamp)
    // Handle agent types with hyphens (e.g., backend-developer)
    let agentType = args.agent_id;
    if (args.workflow_id && args.agent_id.includes(args.workflow_id)) {
      // Extract everything before the workflow ID
      const workflowIndex = args.agent_id.indexOf(args.workflow_id);
      agentType = args.agent_id.substring(0, workflowIndex - 1); // -1 to remove trailing hyphen
    }
    
    // Remove from role registry when agent completes
    if (args.workflow_id) {
      const workflowRoles = this.roleRegistry.get(args.workflow_id);
      if (workflowRoles) {
        workflowRoles.delete(agentType);
        logger.info('🗑️ Agent removed from role registry', {
          workflowId: args.workflow_id,
          agentType,
          remainingRoles: Array.from(workflowRoles)
        });
        
        // Only mark workflow as completed if ALL agents are done
        if (workflowRoles.size === 0) {
          logger.info('All agents completed, marking workflow as done', {
            workflowId: args.workflow_id
          });
          await this.updateWorkflowStatus(args.workflow_id, 'completed');
        }
      }
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
            tasks_removed: 1,
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
  
  async updateWorkflowStatus(workflowId: string, status: 'active' | 'completed' | 'failed' | 'stale' | 'approved' | 'initialized' | 'delegation' | 'awaiting_approval' | 'revision_required') {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = status;
      workflow.updated_at = new Date();
      
      await this.db.run(
        'UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?',
        [status, workflow.updated_at.toISOString(), workflowId]
      );
      
      // 🚫 CRITICAL FIX: Clean up pending tasks when workflow is stopped
      const stoppedStatuses = ['completed', 'failed', 'stale'];
      if (stoppedStatuses.includes(status)) {
        await this.cleanupPendingTasks(workflowId);
        
        // Also clean up role registry
        this.roleRegistry.delete(workflowId);
        logger.info('🗑️ Workflow role registry cleared', { workflowId });
      }
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

  async detectAndMarkStaleWorkflows(staleThresholdMinutes: number = 120) {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - staleThresholdMinutes * 60 * 1000);
    
    const staleWorkflows = await this.db.all(
      `SELECT * FROM workflows 
       WHERE status = 'active' 
       AND updated_at < ?`,
      [staleThreshold.toISOString()]
    );
    
    for (const workflow of staleWorkflows) {
      try {
        await this.updateWorkflowStatus(workflow.id, 'stale');
        logger.info(`Marked workflow ${workflow.id} as stale (inactive for ${staleThresholdMinutes} minutes)`);
      } catch (error) {
        logger.error(`Failed to mark workflow ${workflow.id} as stale:`, error);
      }
    }
    
    return staleWorkflows.length;
  }

  async cleanupOldStaleWorkflows(retentionDays: number = 7) {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    const result = await this.db.run(
      `DELETE FROM workflows 
       WHERE status = 'stale' 
       AND updated_at < ?`,
      [cutoffDate.toISOString()]
    );
    
    const deletedCount = result.changes || 0;
    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old stale workflows older than ${retentionDays} days`);
    }
    
    return deletedCount;
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
    
    // Get role registry status
    const roleRegistryStatus: any = {};
    for (const [workflowId, roles] of this.roleRegistry.entries()) {
      if (roles.size > 0) {
        roleRegistryStatus[workflowId] = Array.from(roles);
      }
    }
    
    return {
      status: 'operational',
      workflows: {
        total: workflowCount,
        active: activeWorkflows,
        pending_handoffs: pendingHandoffs,
      },
      pending_tasks: this.pendingTasks.length,
      active_roles_by_workflow: roleRegistryStatus,
      scope_control: {
        active_monitored_tasks: this.scopeControl.getActiveTasks().length,
        total_violations: this.scopeControl.getTotalViolations(),
        recent_auto_stops: this.scopeControl.getRecentAutoStops()
      }
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
    // Manager agents can spawn teams, associate agents are isolated
    const managerAgentTypes = [
      'team-manager', 'feature-team-lead', 'project-lead', 'tech-lead', 
      'release-manager', 'qa-manager', 'devops-manager', 'architect'
    ];
    
    const isManagerAgent = managerAgentTypes.some(managerType => 
      agentType.includes(managerType) || agentType.includes('manager') || agentType.includes('lead')
    );
    
    // Define team role specializations
    const roleSpecializations = this.getRoleSpecializations(specifications);

    if (isManagerAgent) {
      return `You are an autonomous ${agentType} agent working on workflow ${workflowId}.

Your task specifications:
${specifications}

🎯 TEAM COORDINATION MODE: You are a MANAGER agent with team coordination capabilities.

Your role: ${agentType}
Your objective: Complete the task according to specifications
Your environment: Full MCP tools access for team coordination

${this.generateMandatoryCoordinationProtocol()}

📋 TEAM COMPOSITION FOR YOUR TASK:
${roleSpecializations}

🚀 MANAGER EXECUTION PROTOCOL:
1. IMMEDIATELY store your team plan using store_memory (type: 'team_plan')
2. Analyze the task and determine required team roles
3. Check for already-spawned agents: retrieve_memory with type: 'agent_status'
4. Spawn ONLY missing roles using launch_agent (NO DUPLICATES)
5. Monitor team progress every 3 minutes via retrieve_memory
6. Coordinate handoffs between team members
7. Integrate final deliverables

⚠️ CRITICAL SPAWN RULES:
- NEVER spawn duplicate roles (check existing agents first)
- Use EXACT role names: backend-developer, frontend-developer, security-specialist, etc.
- Include role-specific specifications in launch_agent calls
- Maximum team size: ${roleSpecializations.split('\n').length} agents

AVAILABLE CNS TOOLS:
- launch_agent: Spawn specialized associate agents (CHECK FOR DUPLICATES FIRST)
- get_system_status: Monitor team performance and resource usage
- retrieve_memory: Check agent heartbeats and progress (EVERY 3 MINUTES)
- store_memory: Log all decisions and coordination (MANDATORY)

When finished, end your response with the appropriate completion marker:
- "Task Assignment" if you're delegating work to associate agents
- "Approved for Integration" if you're approving completed work
- "Review Required" if changes are needed

Begin your work now.`;
    } else {
      return `You are an autonomous ${agentType} agent working on workflow ${workflowId}.

Your task specifications:
${specifications}

⚡ ASSOCIATE AGENT MODE: You are a specialized associate agent.

Your role: ${agentType}
Your objective: Complete the task according to specifications
Your environment: Isolated execution (focus on your specific task)

${this.generateMandatoryCoordinationProtocol()}

🎯 YOUR SPECIALIZED ROLE:
${this.getRoleDescription(agentType)}

📋 ASSOCIATE EXECUTION PROTOCOL:
1. IMMEDIATELY store agent_status with 'initialized'
2. Retrieve team plan and related work: retrieve_memory for context
3. Store task_accepted with your understanding
4. Execute your specialized tasks
5. Store heartbeat EVERY 5 MINUTES (mandatory)
6. Log EVERY decision with rationale
7. Store milestone completions
8. Create handoffs for dependent roles
9. Store agent_complete before finishing

⚠️ COORDINATION REQUIREMENTS:
- Check for updates from related roles every 5 minutes
- Store progress percentage in every heartbeat
- Document all file changes and dependencies
- Mark handoff points clearly for next role

IMPORTANT: You are an associate agent working on a specific task. Do NOT use the Task tool or spawn other agents. Focus on completing your assigned work efficiently.

When finished, end your response with the appropriate completion marker:
- "Implementation Complete" if you've finished your assigned implementation
- "Review Required" if you need manager review

Begin your work now.`;
    }
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

  /**
   * Clean up pending tasks for a stopped workflow
   */
  private async cleanupPendingTasks(workflowId: string): Promise<void> {
    const beforeCount = this.pendingTasks.length;
    
    // Remove all pending tasks for this workflow
    this.pendingTasks = this.pendingTasks.filter(task => task.workflow_id !== workflowId);
    
    const removedCount = beforeCount - this.pendingTasks.length;
    if (removedCount > 0) {
      logger.info('🗑️ Cleaned up pending tasks for stopped workflow', {
        workflowId,
        removedTasks: removedCount,
        remainingTasks: this.pendingTasks.length
      });
    }
  }

  private generateMandatoryCoordinationProtocol(): string {
    return `
🔴 MANDATORY COORDINATION PROTOCOL - NON-COMPLIANCE = TERMINATION:

⏰ EVERY 5 MINUTES (MANDATORY):
store_memory({
  type: 'agent_heartbeat',
  content: {
    agent_role: YOUR_ROLE,
    workflow_id: WORKFLOW_ID,
    current_task: 'What you're working on',
    progress_percentage: 0-100,
    files_modified: [],
    status: 'active',
    timestamp: Date.now()
  }
})

📝 EVERY DECISION (MANDATORY):
store_memory({
  type: 'decision_log',
  content: {
    agent_role: YOUR_ROLE,
    decision: 'What you decided',
    rationale: 'Why you chose this',
    alternatives_considered: [],
    impact: 'Effect on project',
    timestamp: Date.now()
  }
})

📁 EVERY FILE OPERATION (MANDATORY):
store_memory({
  type: 'file_activity',
  content: {
    agent_role: YOUR_ROLE,
    action: 'created/modified',
    file_path: 'path/to/file',
    purpose: 'Why this file',
    integration_points: ['Who needs this'],
    timestamp: Date.now()
  }
})

🔧 EVERY DEPENDENCY (MANDATORY):
store_memory({
  type: 'dependency_added',
  content: {
    agent_role: YOUR_ROLE,
    package: 'package-name',
    version: 'version',
    reason: 'Why needed',
    timestamp: Date.now()
  }
})

⚠️ EVERY ISSUE (MANDATORY):
store_memory({
  type: 'issue_encountered',
  content: {
    agent_role: YOUR_ROLE,
    issue: 'What went wrong',
    severity: 'low/medium/high/critical',
    resolution: 'How you fixed it',
    impact_on_timeline: 'Delay amount',
    timestamp: Date.now()
  }
})

🤝 EVERY HANDOFF (MANDATORY):
store_memory({
  type: 'handoff',
  content: {
    from: YOUR_ROLE,
    to: TARGET_ROLE,
    artifact: 'What you're handing off',
    location: 'Where to find it',
    validation: 'How to verify it works',
    handoff_complete: true,
    timestamp: Date.now()
  }
})

✅ TASK COMPLETION (MANDATORY):
store_memory({
  type: 'agent_complete',
  content: {
    agent_role: YOUR_ROLE,
    final_status: 'success/failed',
    deliverables: [],
    issues_for_review: [],
    runtime: 'Duration',
    timestamp: Date.now()
  }
})

🔍 RETRIEVAL REQUIREMENTS:
- Check retrieve_memory EVERY 5 MINUTES for:
  - Team updates (new agents joined)
  - Handoffs ready for you
  - Manager instructions
  - Blocker resolutions

FAILURE TO MAINTAIN THIS PROTOCOL = IMMEDIATE TERMINATION`;
  }

  private getRoleSpecializations(specifications: string): string {
    const spec = specifications.toLowerCase();
    
    // Determine task complexity and recommend team
    if (spec.includes('authentication') || spec.includes('auth') || spec.includes('security')) {
      return `
Recommended Team Composition:
- backend-developer: API endpoints, JWT implementation, session management
- frontend-developer: Login UI, auth flows, token management
- security-specialist: Security audit, vulnerability assessment, best practices
- test-writer: Auth tests, security tests, integration tests
- code-reviewer: Architecture review, security review, best practices`;
    }
    
    if (spec.includes('database') || spec.includes('data model') || spec.includes('schema')) {
      return `
Recommended Team Composition:
- backend-developer: Data models, API integration, business logic
- database-specialist: Schema optimization, query performance, indexing
- test-writer: Database tests, data integrity tests
- code-reviewer: Schema review, query optimization review`;
    }
    
    if (spec.includes('frontend') || spec.includes('ui') || spec.includes('user interface')) {
      return `
Recommended Team Composition:
- frontend-developer: UI implementation, state management, API integration
- ui-designer: Design system, mockups, user experience
- qa-specialist: User testing, accessibility, cross-browser testing
- code-reviewer: Component architecture, performance review`;
    }
    
    if (spec.includes('api') || spec.includes('microservice') || spec.includes('backend')) {
      return `
Recommended Team Composition:
- backend-developer: API design, endpoint implementation, business logic
- database-specialist: Data layer, query optimization
- devops-specialist: Deployment, monitoring, scaling
- test-writer: API tests, integration tests, load tests
- code-reviewer: Architecture review, API design review`;
    }
    
    // Default team for general tasks
    return `
Recommended Team Composition:
- backend-developer: Server-side implementation
- frontend-developer: Client-side implementation
- test-writer: Test coverage
- code-reviewer: Quality assurance`;
  }

  private getRoleDescription(agentType: string): string {
    const roleDescriptions: Record<string, string> = {
      'backend-developer': `
SPECIALIZATION: Backend Development
RESPONSIBILITIES:
- Design and implement REST APIs
- Database integration and queries
- Authentication and authorization
- Business logic implementation
- Performance optimization
DELIVERABLES: Working API endpoints, database models, authentication system
HANDOFF TO: frontend-developer (API docs), test-writer (test targets)`,
      
      'frontend-developer': `
SPECIALIZATION: Frontend Development
RESPONSIBILITIES:
- User interface implementation
- State management
- API integration
- Responsive design
- User experience optimization
DELIVERABLES: Functional UI, integrated API calls, responsive layouts
DEPENDS ON: backend-developer (API endpoints)
HANDOFF TO: qa-specialist (UI testing), test-writer (component tests)`,
      
      'security-specialist': `
SPECIALIZATION: Security Analysis
RESPONSIBILITIES:
- Security audit and assessment
- Vulnerability identification
- Authentication system review
- Security best practices enforcement
- Compliance verification
DELIVERABLES: Security report, vulnerability fixes, auth improvements
COLLABORATES WITH: backend-developer, database-specialist
HANDOFF TO: code-reviewer (security verification)`,
      
      'database-specialist': `
SPECIALIZATION: Database Architecture
RESPONSIBILITIES:
- Schema design and optimization
- Query performance tuning
- Index optimization
- Data integrity constraints
- Migration strategies
DELIVERABLES: Optimized schema, efficient queries, migration scripts
COLLABORATES WITH: backend-developer
HANDOFF TO: test-writer (data tests)`,
      
      'test-writer': `
SPECIALIZATION: Test Implementation
RESPONSIBILITIES:
- Unit test implementation
- Integration test development
- Test coverage analysis
- Test automation setup
- Test documentation
DELIVERABLES: Comprehensive test suite, coverage reports
DEPENDS ON: backend-developer, frontend-developer
HANDOFF TO: qa-specialist (test results)`,
      
      'code-reviewer': `
SPECIALIZATION: Code Quality
RESPONSIBILITIES:
- Code quality assessment
- Architecture review
- Best practices enforcement
- Performance analysis
- Security review
DELIVERABLES: Review report, improvement recommendations
DEPENDS ON: All implementation complete
HANDOFF TO: team-manager (final review)`,
      
      'qa-specialist': `
SPECIALIZATION: Quality Assurance
RESPONSIBILITIES:
- Test strategy development
- User acceptance testing
- Bug identification
- Quality metrics
- Test automation
DELIVERABLES: QA report, bug list, quality metrics
DEPENDS ON: frontend-developer, backend-developer
HANDOFF TO: team-manager (quality report)`,
      
      'devops-specialist': `
SPECIALIZATION: DevOps & Infrastructure
RESPONSIBILITIES:
- CI/CD pipeline setup
- Deployment configuration
- Monitoring and logging
- Performance optimization
- Scaling strategies
DELIVERABLES: Deployment pipeline, monitoring dashboard
COLLABORATES WITH: backend-developer
HANDOFF TO: team-manager (deployment status)`,
      
      'ui-designer': `
SPECIALIZATION: UI/UX Design
RESPONSIBILITIES:
- User interface design
- Design system creation
- User experience optimization
- Accessibility compliance
- Visual consistency
DELIVERABLES: Design mockups, style guide, component library
HANDOFF TO: frontend-developer (design specs)`
    };
    
    return roleDescriptions[agentType] || `
SPECIALIZATION: ${agentType}
RESPONSIBILITIES: Complete assigned tasks for ${agentType} role
DELIVERABLES: Implementation based on specifications
COORDINATION: Follow team coordination protocol`;
  }
}