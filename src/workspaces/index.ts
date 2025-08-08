/**
 * Workspace Manager - Git worktree management
 */

import { logger } from '../utils/logger.js';
import simpleGit from 'simple-git';
import { join } from 'path';
import { mkdir, access, constants, rmdir, stat } from 'fs/promises';

export class WorkspaceManager {
  private workspacesDir: string;
  private git: any;

  constructor(config: any) {
    this.workspacesDir = config?.workspaces_dir || '/tmp/cns-workspaces';
    this.git = simpleGit();
  }

  async create(args: { agent_id: string; base_ref?: string; resources?: any }) {
    logger.info('Creating workspace', args);
    
    const workspacePath = join(this.workspacesDir, args.agent_id);
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
      
      // Create git worktree
      await this.git.raw(['worktree', 'add', workspacePath, baseRef]);
      
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
      logger.error('Failed to create workspace', error);
      throw error;
    }
  }

  async cleanup(args: { agent_id: string; force?: boolean }) {
    logger.info('Cleaning up workspace', args);
    
    const workspacePath = join(this.workspacesDir, args.agent_id);
    
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
        await this.git.raw(['worktree', 'remove', workspacePath, args.force ? '--force' : '']);
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
    // TODO: Implement workspace statistics
    return { active_workspaces: 0, total_disk_usage: '0MB' };
  }

  private async validateGitRepository(): Promise<void> {
    try {
      await this.git.status();
    } catch (error) {
      throw new Error('Not in a git repository or git is not available');
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
}