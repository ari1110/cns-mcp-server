/**
 * End-to-end tests for workspace management (git worktree functionality)
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import simpleGit from 'simple-git';
import { WorkspaceManager } from '../src/workspaces/index.js';

describe('WorkspaceManager E2E Tests', () => {
  const testDir = '/tmp/cns-test-workspace';
  const workspacesDir = join(testDir, 'workspaces');
  let workspaceManager: WorkspaceManager;
  let git: any;

  beforeEach(async () => {
    // Clean up any existing test directory
    try {
      await rm(testDir, { recursive: true });
    } catch {
      // Directory doesn't exist
    }

    // Create test directory
    await mkdir(testDir, { recursive: true });
    
    // Initialize git repository
    git = simpleGit(testDir);
    await git.init(['--initial-branch=main']);
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    
    // Create initial commit
    await git.raw(['commit', '--allow-empty', '-m', 'Initial commit']);
    
    // Create a test branch
    await git.checkoutLocalBranch('feature-test');
    await git.raw(['commit', '--allow-empty', '-m', 'Feature branch commit']);
    await git.checkout('main');
    
    // Initialize workspace manager
    workspaceManager = new WorkspaceManager({
      workspaces_dir: workspacesDir
    });

    // Change to test directory for git operations
    process.chdir(testDir);
  });

  afterEach(async () => {
    try {
      // Clean up git worktrees
      const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      const lines = worktreeList.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('worktree ') && line.includes('workspaces')) {
          const path = line.substring(9);
          try {
            await git.raw(['worktree', 'remove', path, '--force']);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
      
      // Clean up test directory
      await rm(testDir, { recursive: true });
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  });

  test('should create git worktree successfully', async () => {
    const result = await workspaceManager.create({
      agent_id: 'test-agent-1',
      base_ref: 'main'
    });

    const response = JSON.parse(result.content[0].text);
    
    expect(response.status).toBe('created');
    expect(response.agent_id).toBe('test-agent-1');
    expect(response.base_ref).toBe('main');
    expect(response.workspace_path).toContain('test-agent-1');

    // Verify worktree was actually created
    const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
    expect(worktreeList).toContain('test-agent-1');
  });

  test('should create worktree from feature branch', async () => {
    const result = await workspaceManager.create({
      agent_id: 'test-agent-2',
      base_ref: 'feature-test'
    });

    const response = JSON.parse(result.content[0].text);
    
    expect(response.status).toBe('created');
    expect(response.base_ref).toBe('feature-test');

    // Verify worktree is on correct branch
    const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
    expect(worktreeList).toContain('test-agent-2');
  });

  test('should handle duplicate workspace creation gracefully', async () => {
    // Create first workspace
    await workspaceManager.create({
      agent_id: 'duplicate-test',
      base_ref: 'main'
    });

    // Try to create duplicate
    const result = await workspaceManager.create({
      agent_id: 'duplicate-test',
      base_ref: 'main'
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.status).toBe('exists');
    expect(response.agent_id).toBe('duplicate-test');
  });

  test('should cleanup workspace successfully', async () => {
    // Create workspace first
    await workspaceManager.create({
      agent_id: 'cleanup-test',
      base_ref: 'main'
    });

    // Verify it exists
    let worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
    expect(worktreeList).toContain('cleanup-test');

    // Clean it up
    const result = await workspaceManager.cleanup({
      agent_id: 'cleanup-test'
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.status).toBe('cleaned');
    expect(response.agent_id).toBe('cleanup-test');

    // Verify it's gone
    worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
    expect(worktreeList).not.toContain('cleanup-test');
  });

  test('should handle cleanup of non-existent workspace', async () => {
    const result = await workspaceManager.cleanup({
      agent_id: 'non-existent'
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.status).toBe('not_found');
    expect(response.agent_id).toBe('non-existent');
  });

  test('should force cleanup stuck workspace', async () => {
    // Create workspace
    await workspaceManager.create({
      agent_id: 'force-cleanup-test',
      base_ref: 'main'
    });

    // Force cleanup (simulates stuck workspace)
    const result = await workspaceManager.cleanup({
      agent_id: 'force-cleanup-test',
      force: true
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.status).toBe('cleaned');
    expect(response.force).toBe(true);
  });

  test('should get accurate workspace statistics', async () => {
    // Create multiple workspaces
    await workspaceManager.create({ agent_id: 'stats-test-1', base_ref: 'main' });
    await workspaceManager.create({ agent_id: 'stats-test-2', base_ref: 'feature-test' });

    const stats = await workspaceManager.getStats();

    expect(stats.active_worktrees).toBeGreaterThanOrEqual(2);
    expect(stats.local_workspaces).toBeGreaterThanOrEqual(2);
    expect(stats.workspaces_dir).toBe(workspacesDir);
    expect(stats.worktrees).toBeInstanceOf(Array);
    expect(stats.worktrees.length).toBeGreaterThanOrEqual(2);
    
    // Verify worktree details
    const testWorktree = stats.worktrees.find(w => w.path.includes('stats-test-1'));
    expect(testWorktree).toBeDefined();
    expect(testWorktree.branch).toBeDefined();
  });

  test('should sanitize agent IDs properly', async () => {
    const result = await workspaceManager.create({
      agent_id: 'test/agent@with#special$chars!',
      base_ref: 'main'
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.status).toBe('created');
    
    // Verify sanitized path doesn't contain dangerous characters
    expect(response.workspace_path).not.toContain('/');
    expect(response.workspace_path).not.toContain('@');
    expect(response.workspace_path).not.toContain('#');
    expect(response.workspace_path).not.toContain('$');
    expect(response.workspace_path).not.toContain('!');
  });

  test('should validate base reference exists', async () => {
    await expect(workspaceManager.create({
      agent_id: 'invalid-ref-test',
      base_ref: 'non-existent-branch'
    })).rejects.toThrow(/Base reference.*does not exist/);
  });

  test('should handle concurrent workspace operations', async () => {
    // Create multiple workspaces concurrently
    const promises = Array.from({ length: 5 }, (_, i) =>
      workspaceManager.create({
        agent_id: `concurrent-test-${i}`,
        base_ref: 'main'
      })
    );

    const results = await Promise.all(promises);
    
    // All should succeed
    results.forEach((result, i) => {
      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('created');
      expect(response.agent_id).toBe(`concurrent-test-${i}`);
    });

    // Clean up concurrently
    const cleanupPromises = Array.from({ length: 5 }, (_, i) =>
      workspaceManager.cleanup({
        agent_id: `concurrent-test-${i}`
      })
    );

    const cleanupResults = await Promise.all(cleanupPromises);
    
    // All cleanup should succeed
    cleanupResults.forEach((result, i) => {
      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('cleaned');
    });
  });
});