/**
 * Workspace Manager - Git worktree management
 */

import { logger } from '../utils/logger.js';
import simpleGit from 'simple-git';
import { join } from 'path';
import { mkdir, access, constants, rmdir, stat, readdir } from 'fs/promises';
import { CNSError } from '../utils/error-handler.js';

export class WorkspaceManager {
  private workspacesDir: string;
  private git: any;

  constructor(config: any) {
    this.workspacesDir = config?.workspaces_dir || '/tmp/cns-workspaces';
    // Allow git context to be overridden (for testing)
    this.git = config?.git || simpleGit();
  }

  async create(args: { agent_id: string; base_ref?: string; resources?: any }) {
    logger.info('Creating workspace', args);
    
    // Sanitize agent_id for safe path usage
    const sanitizedAgentId = this.sanitizePathComponent(args.agent_id);
    const workspacePath = join(this.workspacesDir, sanitizedAgentId);
    const baseRef = args.base_ref || 'main';
    
    try {
      // Validate we're in a git repository
      await this.validateGitRepository();
      
      // Ensure workspaces directory exists
      await this.ensureWorkspacesDirectory();
      
      // Check if workspace already exists
      try {
        await access(workspacePath, constants.F_OK);
        logger.warn(`Workspace already exists: ${workspacePath}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ 
              status: 'exists', 
              workspace_path: workspacePath,
              agent_id: args.agent_id 
            }),
          }],
        };
      } catch {
        // Workspace doesn't exist, continue with creation
      }
      
      // Validate base reference exists
      await this.validateBaseRef(baseRef);
      
      // Create git worktree (detached to avoid branch conflicts)
      await this.git.raw(['worktree', 'add', '--detach', workspacePath, baseRef]);
      
      // Verify workspace was created successfully
      await this.verifyWorkspaceCreated(workspacePath);
      
      logger.info(`Created worktree: ${workspacePath} from ${baseRef}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            status: 'created', 
            workspace_path: workspacePath,
            agent_id: args.agent_id,
            base_ref: baseRef
          }),
        }],
      };
    } catch (error) {
      logger.error('Failed to create workspace', { agent_id: args.agent_id, baseRef, error });
      
      // Attempt cleanup if creation partially succeeded
      try {
        await access(workspacePath, constants.F_OK);
        logger.info('Attempting cleanup after failed creation');
        await this.forceCleanupWorkspace(workspacePath);
      } catch {
        // No cleanup needed
      }
      
      if (error instanceof Error) {
        throw new Error(`Workspace creation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async cleanup(args: { agent_id: string; force?: boolean }) {
    logger.info('Cleaning up workspace', args);
    
    // Sanitize agent_id for safe path usage
    const sanitizedAgentId = this.sanitizePathComponent(args.agent_id);
    const workspacePath = join(this.workspacesDir, sanitizedAgentId);
    
    try {
      // Check if workspace exists
      try {
        await access(workspacePath, constants.F_OK);
      } catch {
        logger.warn(`Workspace does not exist: ${workspacePath}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ 
              status: 'not_found', 
              agent_id: args.agent_id,
              workspace_path: workspacePath
            }),
          }],
        };
      }

      // Remove git worktree
      try {
        const removeArgs = ['worktree', 'remove', workspacePath];
        if (args.force) {
          removeArgs.push('--force');
        }
        await this.git.raw(removeArgs);
      } catch (error: any) {
        // If worktree remove fails but force is requested, try manual cleanup
        if (args.force) {
          logger.warn(`Git worktree remove failed, attempting manual cleanup: ${error.message}`);
          await this.forceCleanupWorkspace(workspacePath);
        } else {
          throw new Error(`Failed to remove worktree: ${error.message}`);
        }
      }

      logger.info(`Cleaned up workspace: ${workspacePath}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            status: 'cleaned', 
            agent_id: args.agent_id,
            workspace_path: workspacePath,
            force: args.force || false
          }),
        }],
      };
    } catch (error) {
      logger.error('Failed to cleanup workspace', error);
      throw error;
    }
  }

  async getStats() {
    try {
      // Get active worktrees from git
      const worktreeList = await this.git.raw(['worktree', 'list', '--porcelain']);
      const activeWorktrees = this.parseWorktreeList(worktreeList);
      
      // Calculate disk usage for workspace directory
      const diskUsage = await this.calculateDiskUsage();
      
      // Count workspaces in our workspace directory
      let localWorkspaces = 0;
      try {
        await access(this.workspacesDir, constants.F_OK);
        const workspaceEntries = await readdir(this.workspacesDir);
        localWorkspaces = workspaceEntries.length;
      } catch {
        // Workspaces directory doesn't exist
      }
      
      return {
        active_worktrees: activeWorktrees.length,
        local_workspaces: localWorkspaces,
        total_disk_usage: this.formatBytes(diskUsage),
        workspaces_dir: this.workspacesDir,
        worktrees: activeWorktrees.map(w => ({
          path: w.worktree,
          branch: w.branch,
          commit: w.HEAD
        }))
      };
    } catch (error) {
      logger.error('Failed to get workspace statistics', error);
      return { 
        active_worktrees: 0, 
        local_workspaces: 0,
        total_disk_usage: '0B',
        error: 'Failed to collect statistics'
      };
    }
  }

  async listAll() {
    try {
      // Get active worktrees from git
      const worktreeList = await this.git.raw(['worktree', 'list', '--porcelain']);
      const activeWorktrees = this.parseWorktreeList(worktreeList);
      
      // Get workspace directory contents
      let localWorkspaces: string[] = [];
      try {
        await access(this.workspacesDir, constants.F_OK);
        localWorkspaces = await readdir(this.workspacesDir);
      } catch {
        // Workspaces directory doesn't exist
      }
      
      // Calculate disk usage
      const diskUsage = await this.calculateDiskUsage();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: {
                active_worktrees: activeWorktrees.length,
                local_workspaces: localWorkspaces.length,
                total_disk_usage: this.formatBytes(diskUsage),
                workspaces_dir: this.workspacesDir,
              },
              worktrees: activeWorktrees.map(w => ({
                path: w.worktree,
                branch: w.branch,
                commit: w.HEAD,
                bare: w.bare
              })),
              local_workspace_dirs: localWorkspaces
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to list workspaces', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to list workspaces',
              message: error instanceof Error ? error.message : 'Unknown error'
            }, null, 2),
          },
        ],
      };
    }
  }

  private async validateGitRepository(): Promise<void> {
    try {
      await this.git.status();
    } catch (error) {
      throw new CNSError(
        'Not in a git repository or git is not available',
        'GIT_REPOSITORY_INVALID',
        { error: error instanceof Error ? error.message : error },
        false
      );
    }
  }

  private async ensureWorkspacesDirectory(): Promise<void> {
    try {
      await access(this.workspacesDir, constants.F_OK);
    } catch {
      await mkdir(this.workspacesDir, { recursive: true });
      logger.info(`Created workspaces directory: ${this.workspacesDir}`);
    }
  }

  private async forceCleanupWorkspace(workspacePath: string): Promise<void> {
    try {
      // First try to prune worktrees to clean up any stale references
      await this.git.raw(['worktree', 'prune']);
      
      // Then manually remove the directory if it still exists
      try {
        await access(workspacePath, constants.F_OK);
        await rmdir(workspacePath, { recursive: true });
        logger.info(`Manually removed workspace directory: ${workspacePath}`);
      } catch {
        // Directory doesn't exist or already removed
      }
    } catch (error) {
      logger.error(`Force cleanup failed for ${workspacePath}`, error);
      throw error;
    }
  }

  private parseWorktreeList(worktreeOutput: string): any[] {
    const worktrees: any[] = [];
    const lines = worktreeOutput.split('\n').filter(line => line.trim());
    
    let currentWorktree: any = {};
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (Object.keys(currentWorktree).length > 0) {
          worktrees.push(currentWorktree);
        }
        currentWorktree = { worktree: line.substring(9) };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.HEAD = line.substring(5);
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring(7);
      } else if (line === 'bare') {
        currentWorktree.bare = true;
      }
    }
    
    if (Object.keys(currentWorktree).length > 0) {
      worktrees.push(currentWorktree);
    }
    
    return worktrees;
  }

  private async calculateDiskUsage(): Promise<number> {
    try {
      await access(this.workspacesDir, constants.F_OK);
      return await this.calculateDirectorySize(this.workspacesDir);
    } catch {
      return 0;
    }
  }

  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          totalSize += await this.calculateDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const stats = await stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
    
    return totalSize;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  }

  private sanitizePathComponent(component: string): string {
    // Remove dangerous characters and normalize
    return component
      .replace(/[^a-zA-Z0-9\-_\.]/g, '_') // Replace invalid chars with underscore
      .replace(/^\.+/, '') // Remove leading dots
      .substring(0, 100) // Limit length
      .trim();
  }

  private async validateBaseRef(baseRef: string): Promise<void> {
    try {
      // Check if the reference exists
      await this.git.raw(['show-ref', '--verify', `refs/heads/${baseRef}`]);
    } catch {
      // Try as a commit hash or tag
      try {
        await this.git.raw(['rev-parse', '--verify', baseRef]);
      } catch {
        throw new Error(`Base reference '${baseRef}' does not exist`);
      }
    }
  }

  private async verifyWorkspaceCreated(workspacePath: string): Promise<void> {
    try {
      await access(workspacePath, constants.F_OK);
      
      // Verify it's a git repository
      const workspaceGit = simpleGit(workspacePath);
      await workspaceGit.status();
    } catch {
      throw new Error(`Workspace verification failed: ${workspacePath} is not accessible or not a git repository`);
    }
  }
}