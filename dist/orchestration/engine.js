/**
 * Orchestration Engine - Core orchestration logic
 */
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as cron from 'node-cron';
import { logger } from '../utils/logger.js';
export class OrchestrationEngine extends EventEmitter {
    db;
    memory;
    workspaces;
    workflows = new Map();
    handoffs = new Map();
    pendingTasks = [];
    cleanupScheduler = null;
    constructor(db, memory, workspaces) {
        super();
        this.db = db;
        this.memory = memory;
        this.workspaces = workspaces;
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
    async createHandoff(handoff) {
        const id = uuidv4();
        const newHandoff = {
            ...handoff,
            id,
            created_at: new Date(),
            processed: false,
        };
        this.handoffs.set(id, newHandoff);
        // Store in database
        await this.db.run(`INSERT INTO handoffs (id, from_agent, to_agent, workflow_id, type, created_at, processed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, handoff.from, handoff.to, handoff.workflow_id, handoff.type, newHandoff.created_at.toISOString(), 0]);
        // Emit event for processing
        this.emit('handoff:created', newHandoff);
        logger.info('Handoff created', { handoff: newHandoff });
        return newHandoff;
    }
    /**
     * Launch an agent with specifications
     */
    async launchAgent(args) {
        const workflowId = args.workflow_id || uuidv4();
        logger.info('Launching agent', { agent: args.agent_type, workflow: workflowId });
        // Create or update workflow
        const workflow = {
            id: workflowId,
            status: 'active',
            agent_type: args.agent_type,
            specifications: args.specifications,
            created_at: new Date(),
            updated_at: new Date(),
        };
        this.workflows.set(workflowId, workflow);
        // Store in database
        await this.db.run(`INSERT OR REPLACE INTO workflows (id, status, agent_type, specifications, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`, [workflowId, workflow.status, args.agent_type, args.specifications,
            workflow.created_at.toISOString(), workflow.updated_at.toISOString()]);
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
    async getPendingTasks(filters) {
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
    async signalCompletion(args) {
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
    async updateWorkflowStatus(workflowId, status) {
        const workflow = this.workflows.get(workflowId);
        if (workflow) {
            workflow.status = status;
            workflow.updated_at = new Date();
            await this.db.run('UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?', [status, workflow.updated_at.toISOString(), workflowId]);
        }
    }
    async getWorkflowStatus(workflowId) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            // Try to load from database
            const row = await this.db.get('SELECT * FROM workflows WHERE id = ?', [workflowId]);
            if (row) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(row, null, 2),
                        },
                    ],
                };
            }
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(workflow || { error: 'Workflow not found' }, null, 2),
                },
            ],
        };
    }
    async getActiveWorkflows() {
        return Array.from(this.workflows.values()).filter(w => w.status === 'active');
    }
    async getWorkflowSpecifications(workflowId) {
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
    async createWorkflowContext(context) {
        const workflowId = context.workflow_id;
        const workflow = {
            id: workflowId,
            status: 'initialized',
            agent_type: context.agent_type,
            agent_role: context.agent_role,
            created_at: new Date(),
            updated_at: new Date(),
        };
        this.workflows.set(workflowId, workflow);
        await this.db.run(`INSERT OR REPLACE INTO workflows (id, status, agent_type, agent_role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`, [workflowId, workflow.status, context.agent_type, context.agent_role,
            workflow.created_at.toISOString(), workflow.updated_at.toISOString()]);
    }
    async createWorktree(workflowId, agentType) {
        try {
            await this.workspaces.create({
                agent_id: `${agentType}-${workflowId}`,
                base_ref: 'main',
            });
            return true;
        }
        catch (error) {
            logger.error('Failed to create worktree', error);
            return false;
        }
    }
    async scheduleWorkspaceCleanup(workflowId, delayMinutes) {
        const cleanupTime = new Date(Date.now() + delayMinutes * 60 * 1000);
        await this.db.run('INSERT INTO cleanup_schedule (workflow_id, scheduled_for) VALUES (?, ?)', [workflowId, cleanupTime.toISOString()]);
        logger.info(`Scheduled cleanup for workflow ${workflowId} at ${cleanupTime}`);
    }
    async processScheduledCleanups() {
        const now = new Date();
        const scheduled = await this.db.all('SELECT * FROM cleanup_schedule WHERE scheduled_for <= ? AND processed = 0', [now.toISOString()]);
        for (const item of scheduled) {
            try {
                await this.workspaces.cleanup({
                    agent_id: item.workflow_id,
                    force: false,
                });
                await this.db.run('UPDATE cleanup_schedule SET processed = 1 WHERE id = ?', [item.id]);
                logger.info(`Cleaned up workspace for workflow ${item.workflow_id}`);
            }
            catch (error) {
                logger.error(`Failed to cleanup workspace ${item.workflow_id}`, error);
            }
        }
    }
    async trackToolUsage(usage) {
        await this.db.run('INSERT INTO tool_usage (tool_name, session_id, timestamp) VALUES (?, ?, ?)', [usage.tool_name, usage.session_id, usage.timestamp.toISOString()]);
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
    generateTaskPrompt(agentType, specifications, workflowId) {
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
    async loadWorkflows() {
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
    startEventProcessor() {
        // Process events every 5 seconds
        setInterval(async () => {
            await this.processPendingEvents();
        }, 5000);
    }
}
//# sourceMappingURL=engine.js.map