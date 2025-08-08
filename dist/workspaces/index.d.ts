/**
 * Workspace Manager - Git worktree management
 */
export declare class WorkspaceManager {
    private workspacesDir;
    private git;
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
        active_worktrees: number;
        local_workspaces: number;
        total_disk_usage: string;
        workspaces_dir: string;
        worktrees: {
            path: any;
            branch: any;
            commit: any;
        }[];
        error?: undefined;
    } | {
        active_worktrees: number;
        local_workspaces: number;
        total_disk_usage: string;
        error: string;
        workspaces_dir?: undefined;
        worktrees?: undefined;
    }>;
    private validateGitRepository;
    private ensureWorkspacesDirectory;
    private forceCleanupWorkspace;
    private parseWorktreeList;
    private calculateDiskUsage;
    private calculateDirectorySize;
    private formatBytes;
    private sanitizePathComponent;
    private validateBaseRef;
    private verifyWorkspaceCreated;
}
//# sourceMappingURL=index.d.ts.map