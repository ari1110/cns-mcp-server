/**
 * Hook Handlers - Migrated from bash scripts to TypeScript
 * All orchestration logic that was in .claude/scripts/ now lives here
 */
import { logger } from '../../utils/logger.js';
import { readFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
export class HookHandlers {
    orchestration;
    constructor(orchestration) {
        this.orchestration = orchestration;
    }
    /**
     * Handle SubagentStop hook - Detects completion patterns and triggers next actions
     * Migrated from process-subagent-stop.sh
     */
    async handleSubagentStop(args) {
        logger.info('SubagentStop hook triggered', args);
        try {
            // Read transcript to detect patterns
            const transcript = await readFile(args.transcript_path, 'utf-8');
            // Detect workflow patterns (from our bash script logic)
            const patterns = {
                taskAssignment: transcript.includes('Task Assignment'),
                implementationComplete: transcript.includes('Implementation Complete'),
                reviewRequired: transcript.includes('Review Required'),
                approvedForIntegration: transcript.includes('Approved for Integration'),
            };
            let workflowStatus = 'completed';
            let nextAction = 'none';
            let orchestrationGuidance = '';
            // Process based on detected patterns
            if (patterns.taskAssignment) {
                logger.info('TASK ASSIGNMENT DETECTED - Creating handoff');
                // Extract associate type
                const associateType = this.deriveAssociateType(args.agent_type);
                // Create handoff in orchestration engine
                await this.orchestration.createHandoff({
                    from: args.agent_type,
                    to: associateType,
                    workflow_id: args.workflow_id || uuidv4(),
                    type: 'task_assignment',
                });
                workflowStatus = 'delegation';
                nextAction = 'associate_implementation';
                orchestrationGuidance = 'Manager has delegated tasks. Auto-launching associate...';
                // AUTO-TRIGGER: Launch associate immediately
                await this.orchestration.launchAgent({
                    agent_type: associateType,
                    specifications: await this.getManagerSpecifications(args.workflow_id),
                    workflow_id: args.workflow_id,
                });
            }
            else if (patterns.implementationComplete) {
                logger.info('IMPLEMENTATION COMPLETE - Auto-triggering manager review');
                const managerType = this.deriveManagerType(args.agent_type);
                await this.orchestration.createHandoff({
                    from: args.agent_type,
                    to: managerType,
                    workflow_id: args.workflow_id || uuidv4(),
                    type: 'review_request',
                });
                workflowStatus = 'awaiting_approval';
                nextAction = 'manager_review';
                orchestrationGuidance = 'Associate completed. Auto-launching manager review...';
                // AUTO-TRIGGER: Launch manager review
                await this.orchestration.launchAgent({
                    agent_type: managerType,
                    specifications: 'Review associate implementation',
                    workflow_id: args.workflow_id,
                });
            }
            else if (patterns.approvedForIntegration) {
                logger.info('APPROVED FOR INTEGRATION - Queuing for orchestrator review');
                await this.orchestration.createHandoff({
                    from: args.agent_type,
                    to: 'orchestrator',
                    workflow_id: args.workflow_id || uuidv4(),
                    type: 'integration_ready',
                });
                workflowStatus = 'approved';
                nextAction = 'orchestrator_integration';
                orchestrationGuidance = 'Manager approved. Ready for final integration.';
                // Schedule workspace cleanup
                if (args.workflow_id) {
                    await this.orchestration.scheduleWorkspaceCleanup(args.workflow_id, 15);
                }
            }
            else if (patterns.reviewRequired) {
                logger.info('REVIEW REQUIRED - Creating revision cycle');
                const associateType = this.deriveAssociateType(args.agent_type);
                await this.orchestration.createHandoff({
                    from: args.agent_type,
                    to: associateType,
                    workflow_id: args.workflow_id || uuidv4(),
                    type: 'revision_request',
                });
                workflowStatus = 'revision_required';
                nextAction = 'associate_revision';
                orchestrationGuidance = 'Manager requested changes. Auto-launching associate for revisions...';
                // AUTO-TRIGGER: Launch associate for revisions
                await this.orchestration.launchAgent({
                    agent_type: associateType,
                    specifications: 'Address manager feedback',
                    workflow_id: args.workflow_id,
                });
            }
            // Update workflow state
            if (args.workflow_id) {
                await this.orchestration.updateWorkflowStatus(args.workflow_id, workflowStatus);
            }
            // Process any pending events
            await this.orchestration.processPendingEvents();
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            status: 'success',
                            workflow_status: workflowStatus,
                            next_action: nextAction,
                            guidance: orchestrationGuidance,
                            patterns_detected: patterns,
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error('SubagentStop handler error:', error);
            throw error;
        }
    }
    /**
     * Handle PreToolUse hook - Can allow/deny tool usage
     * Migrated from process-task-hook-enhanced.sh
     */
    async handlePreToolUse(args) {
        logger.info('PreToolUse hook triggered', args);
        // Track tool usage
        await this.orchestration.trackToolUsage({
            tool_name: args.tool_name,
            session_id: args.session_id,
            timestamp: new Date(),
        });
        // Special handling for Task tool
        if (args.tool_name === 'Task') {
            const agentType = args.tool_input?.subagent_type;
            if (agentType) {
                // Determine if this is a manager or associate
                const role = agentType.includes('manager') ? 'manager' :
                    agentType.includes('associate') ? 'associate' : 'specialist';
                // Create workflow context
                const workflowId = `${agentType}-${Date.now()}`;
                await this.orchestration.createWorkflowContext({
                    workflow_id: workflowId,
                    agent_type: agentType,
                    agent_role: role,
                    task_description: args.tool_input?.description,
                });
                // Create worktree for manager tasks
                if (role === 'manager') {
                    const worktreeCreated = await this.orchestration.createWorktree(workflowId, agentType);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    status: 'success',
                                    message: `Task tool prepared for ${agentType}`,
                                    workflow_id: workflowId,
                                    worktree: worktreeCreated ? 'created' : 'skipped',
                                    guidance: `Manager launched: ${agentType} - Strategic planning phase active`,
                                }, null, 2),
                            },
                        ],
                    };
                }
            }
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        status: 'success',
                        message: 'Tool usage allowed',
                    }),
                },
            ],
        };
    }
    /**
     * Handle SessionStart hook - Initialize orchestration context
     * Migrated from process-session-start-enhanced.sh
     */
    async handleSessionStart(args) {
        logger.info('SessionStart hook triggered', args);
        // Process scheduled cleanups
        await this.orchestration.processScheduledCleanups();
        // Get system status
        const systemStatus = await this.orchestration.getSystemStatus();
        // Get active workflows
        const activeWorkflows = await this.orchestration.getActiveWorkflows();
        // Build context message
        const contextMessage = this.buildContextMessage(systemStatus, activeWorkflows);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        status: 'success',
                        session_type: args.session_type || 'startup',
                        context: contextMessage,
                        system_status: systemStatus,
                        active_workflows: activeWorkflows.length,
                    }, null, 2),
                },
            ],
        };
    }
    // Helper methods
    deriveAssociateType(managerType) {
        if (managerType.includes('-manager')) {
            return managerType.replace('-manager', '-associate');
        }
        return `${managerType}-associate`;
    }
    deriveManagerType(associateType) {
        if (associateType.includes('-associate')) {
            return associateType.replace('-associate', '-manager');
        }
        return `${associateType}-manager`;
    }
    async getManagerSpecifications(workflowId) {
        if (!workflowId) {
            return 'Implement based on project requirements';
        }
        // Retrieve specifications from memory/database
        const specs = await this.orchestration.getWorkflowSpecifications(workflowId);
        return specs || 'Implement based on manager requirements';
    }
    buildContextMessage(status, workflows) {
        const workflowSummary = workflows.length > 0
            ? `${workflows.length} active workflows`
            : 'No active workflows';
        const pendingTasks = workflows.filter(w => w.status === 'pending').length;
        const taskInfo = pendingTasks > 0 ? ` | ${pendingTasks} pending tasks` : '';
        return `🚀 CNS Orchestration Status: ${workflowSummary}${taskInfo} | System: ${status.status}`;
    }
}
//# sourceMappingURL=index.js.map