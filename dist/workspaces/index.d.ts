/**
 * Workspace Manager - Git worktree management
 */
export declare class WorkspaceManager {
    private workspacesDir;
    constructor(config: any);
    create(args: {
        agent_id: string;
        base_ref?: string;
        resources?: any;
    }): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    cleanup(args: {
        agent_id: string;
        force?: boolean;
    }): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    getStats(): Promise<{
        active_workspaces: number;
        total_disk_usage: string;
    }>;
}
//# sourceMappingURL=index.d.ts.map