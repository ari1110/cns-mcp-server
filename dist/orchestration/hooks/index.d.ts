/**
 * Hook Handlers - Migrated from bash scripts to TypeScript
 * All orchestration logic that was in .claude/scripts/ now lives here
 */
import { OrchestrationEngine } from '../engine.js';
interface SubagentStopArgs {
    transcript_path: string;
    agent_type: string;
    workflow_id?: string;
    session_id?: string;
    cwd?: string;
}
interface PreToolUseArgs {
    tool_name: string;
    tool_input: any;
    session_id?: string;
    cwd?: string;
}
interface SessionStartArgs {
    session_id: string;
    session_type?: 'startup' | 'resume';
    cwd?: string;
    context?: any;
}
export declare class HookHandlers {
    private orchestration;
    constructor(orchestration: OrchestrationEngine);
    /**
     * Handle SubagentStop hook - Detects completion patterns and triggers next actions
     * Migrated from process-subagent-stop.sh
     */
    handleSubagentStop(args: SubagentStopArgs): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    /**
     * Handle PreToolUse hook - Can allow/deny tool usage
     * Migrated from process-task-hook-enhanced.sh
     */
    handlePreToolUse(args: PreToolUseArgs): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    /**
     * Handle SessionStart hook - Initialize orchestration context
     * Migrated from process-session-start-enhanced.sh
     */
    handleSessionStart(args: SessionStartArgs): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    private deriveAssociateType;
    private deriveManagerType;
    private getManagerSpecifications;
    private buildContextMessage;
}
export {};
//# sourceMappingURL=index.d.ts.map