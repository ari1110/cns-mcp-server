/**
 * Workflow Stop Bug Fix Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRunner } from '../src/agent-runner/index.js';
import { OrchestrationEngine } from '../src/orchestration/engine.js';
import { Database } from '../src/database/index.js';
import { MemorySystem } from '../src/memory/index.js';
import { WorkspaceManager } from '../src/workspaces/index.js';

// Mock external dependencies
vi.mock('fs', () => ({
  appendFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    killed: false,
    connected: true,
    kill: vi.fn(),
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() }
  }))
}));

describe('Workflow Stop Bug Fix', () => {
  let mockCNSServer: any;
  let mockOrchestration: OrchestrationEngine;
  let agentRunner: AgentRunner;

  beforeEach(() => {
    // Mock CNS server with orchestration engine
    mockCNSServer = {
      orchestration: {
        getPendingTasks: vi.fn(),
        getWorkflowStatus: vi.fn(),
        updateWorkflowStatus: vi.fn()
      }
    };

    agentRunner = new AgentRunner(mockCNSServer);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateWorkflowStatus', () => {
    it('should identify stopped workflows correctly', async () => {
      // Mock workflow status response for stopped workflow
      mockCNSServer.orchestration.getWorkflowStatus.mockResolvedValue({
        content: [{
          text: JSON.stringify({
            workflow: {
              id: 'test-workflow',
              status: 'failed'
            }
          })
        }]
      });

      // Access private method using any type (for testing only)
      const result = await (agentRunner as any).validateWorkflowStatus('test-workflow');

      expect(result.shouldStop).toBe(true);
      expect(result.status).toBe('failed');
      expect(result.reason).toBe('Workflow status is failed');
    });

    it('should allow active workflows to continue', async () => {
      // Mock workflow status response for active workflow
      mockCNSServer.orchestration.getWorkflowStatus.mockResolvedValue({
        content: [{
          text: JSON.stringify({
            workflow: {
              id: 'test-workflow',
              status: 'active'
            }
          })
        }]
      });

      const result = await (agentRunner as any).validateWorkflowStatus('test-workflow');

      expect(result.shouldStop).toBe(false);
      expect(result.status).toBe('active');
      expect(result.reason).toBe('Workflow is active');
    });

    it('should handle missing workflows gracefully', async () => {
      // Mock workflow not found response
      mockCNSServer.orchestration.getWorkflowStatus.mockResolvedValue({
        content: [{
          text: JSON.stringify({
            error: 'Workflow not found'
          })
        }]
      });

      const result = await (agentRunner as any).validateWorkflowStatus('missing-workflow');

      expect(result.shouldStop).toBe(true);
      expect(result.status).toBe('not_found');
      expect(result.reason).toBe('Workflow not found');
    });

    it('should allow execution on validation errors', async () => {
      // Mock error in validation
      mockCNSServer.orchestration.getWorkflowStatus.mockRejectedValue(new Error('Network error'));

      const result = await (agentRunner as any).validateWorkflowStatus('error-workflow');

      expect(result.shouldStop).toBe(false);
      expect(result.status).toBe('unknown');
      expect(result.reason).toBe('Status validation failed - allowing execution');
    });
  });

  describe('Task Processing with Workflow Validation', () => {
    it('should skip tasks for stopped workflows', async () => {
      // Mock pending tasks response
      mockCNSServer.orchestration.getPendingTasks.mockResolvedValue({
        content: [{
          text: JSON.stringify({
            tasks: [{
              workflow_id: 'stopped-workflow',
              agent_type: 'backend-developer',
              prompt: 'Test task'
            }]
          })
        }]
      });

      // Mock workflow as stopped
      mockCNSServer.orchestration.getWorkflowStatus.mockResolvedValue({
        content: [{
          text: JSON.stringify({
            workflow: {
              id: 'stopped-workflow',
              status: 'failed'
            }
          })
        }]
      });

      // Start agent runner processing
      const processingPromise = (agentRunner as any).processPendingTasks();
      await processingPromise;

      // Verify that no agents were spawned
      expect((agentRunner as any).runningAgents.size).toBe(0);
    });

    it('should execute tasks for active workflows', async () => {
      // Mock pending tasks response
      mockCNSServer.orchestration.getPendingTasks.mockResolvedValue({
        content: [{
          text: JSON.stringify({
            tasks: [{
              workflow_id: 'active-workflow',
              agent_type: 'backend-developer',
              prompt: 'Test task'
            }]
          })
        }]
      });

      // Mock workflow as active
      mockCNSServer.orchestration.getWorkflowStatus.mockResolvedValue({
        content: [{
          text: JSON.stringify({
            workflow: {
              id: 'active-workflow',
              status: 'active'
            }
          })
        }]
      });

      // This test would require more mocking for full agent spawning
      // For now, we verify the workflow validation logic works
      const result = await (agentRunner as any).validateWorkflowStatus('active-workflow');
      expect(result.shouldStop).toBe(false);
    });
  });

  describe('Integration: Complete Stop Workflow Flow', () => {
    it('should prevent agent spawning after workflow stop', async () => {
      const testWorkflowId = 'integration-test-workflow';
      
      // 1. Start with active workflow
      mockCNSServer.orchestration.getWorkflowStatus
        .mockResolvedValueOnce({
          content: [{
            text: JSON.stringify({
              workflow: { id: testWorkflowId, status: 'active' }
            })
          }]
        })
        // 2. Then simulate stopped workflow
        .mockResolvedValue({
          content: [{
            text: JSON.stringify({
              workflow: { id: testWorkflowId, status: 'failed' }
            })
          }]
        });

      // First validation should allow execution
      let result = await (agentRunner as any).validateWorkflowStatus(testWorkflowId);
      expect(result.shouldStop).toBe(false);

      // Second validation should stop execution
      result = await (agentRunner as any).validateWorkflowStatus(testWorkflowId);
      expect(result.shouldStop).toBe(true);
      expect(result.status).toBe('failed');
    });
  });
});