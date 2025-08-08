/**
 * Integration tests for workspace management functionality
 * Tests the workspace manager without creating actual git worktrees
 */

import { describe, test, expect } from 'vitest';
import { WorkspaceManager } from '../src/workspaces/index.js';

describe('WorkspaceManager Integration Tests', () => {
  const workspaceManager = new WorkspaceManager({
    workspaces_dir: '/tmp/cns-test-workspaces'
  });

  test('should sanitize agent IDs properly', () => {
    const testCases = [
      { input: 'test/agent@with#special$chars!', expected: 'test_agent_with_special_chars_' },
      { input: '..hidden-file', expected: 'hidden-file' },
      { input: 'normal-agent-123', expected: 'normal-agent-123' },
      { input: 'a'.repeat(150), expected: 'a'.repeat(100) }, // Length limiting
    ];

    testCases.forEach(({ input, expected }) => {
      // Access the private method through reflection for testing
      const sanitized = (workspaceManager as any).sanitizePathComponent(input);
      expect(sanitized).toBe(expected);
    });
  });

  test('should handle workspace statistics gracefully when no git repo exists', async () => {
    // This should not throw even if we're not in a git repository
    const stats = await workspaceManager.getStats();
    
    expect(stats).toBeDefined();
    expect(typeof stats.active_worktrees).toBe('number');
    expect(typeof stats.local_workspaces).toBe('number');
    expect(typeof stats.total_disk_usage).toBe('string');
    expect(stats.workspaces_dir).toBe('/tmp/cns-test-workspaces');
  });

  test('should validate configuration properly', () => {
    const manager1 = new WorkspaceManager({
      workspaces_dir: '/custom/path'
    });
    expect((manager1 as any).workspacesDir).toBe('/custom/path');

    const manager2 = new WorkspaceManager({});
    expect((manager2 as any).workspacesDir).toBe('/tmp/cns-workspaces');

    const manager3 = new WorkspaceManager(null);
    expect((manager3 as any).workspacesDir).toBe('/tmp/cns-workspaces');
  });

  test('should handle cleanup of non-existent workspace gracefully', async () => {
    const result = await workspaceManager.cleanup({
      agent_id: 'non-existent-agent-12345'
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.status).toBe('not_found');
    expect(response.agent_id).toBe('non-existent-agent-12345');
  });
});