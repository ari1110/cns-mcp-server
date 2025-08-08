/**
 * Orchestration Engine - Core orchestration logic
 */
import { EventEmitter } from 'events';
import { Database } from '../database/index.js';
import { MemorySystem } from '../memory/index.js';
import { WorkspaceManager } from '../workspaces/index.js';
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
export declare class OrchestrationEngine extends EventEmitter {
    private db;
    private memory;
    private workspaces;
    private workflows;
    private handoffs;
    private pendingTasks;
    private cleanupScheduler;
    constructor(db: Database, memory: MemorySystem, workspaces: WorkspaceManager);
    start(): Promise<void>;
    stop(): Promise<void>;
    /**
     * Create a handoff between agents
     */
    createHandoff(handoff: Omit<Handoff, 'id' | 'created_at' | 'processed'>): Promise<Handoff>;
    /**
     * Launch an agent with specifications
     */
    launchAgent(args: LaunchAgentArgs): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    /**
     * Get pending tasks
     */
    getPendingTasks(filters?: {
        priority?: string;
        agent_type?: string;
    }): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    /**
     * Signal task completion
     */
    signalCompletion(args: {
        agent_id: string;
        workflow_id?: string;
        result: string;
        artifacts?: any[];
    }): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    /**
     * Process pending events (called by hooks)
     */
    processPendingEvents(): Promise<void>;
    /**
     * Helper methods
     */
    updateWorkflowStatus(workflowId: string, status: string): Promise<void>;
    getWorkflowStatus(workflowId: string): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    getActiveWorkflows(): Promise<Workflow[]>;
    getWorkflowSpecifications(workflowId: string): Promise<string>;
    createWorkflowContext(context: any): Promise<void>;
    createWorktree(workflowId: string, agentType: string): Promise<boolean>;
    scheduleWorkspaceCleanup(workflowId: string, delayMinutes: number): Promise<void>;
    processScheduledCleanups(): Promise<void>;
    trackToolUsage(usage: {
        tool_name: string;
        session_id?: string;
        timestamp: Date;
    }): Promise<void>;
    getSystemStatus(): Promise<{
        status: string;
        workflows: {
            total: number;
            active: number;
            pending_handoffs: number;
        };
        pending_tasks: number;
    }>;
    getStats(): Promise<{
        workflows: number;
        handoffs: number;
        pending_tasks: number;
        active_workflows: number;
    }>;
    private generateTaskPrompt;
    private loadWorkflows;
    private startEventProcessor;
}
export {};
//# sourceMappingURL=engine.d.ts.map