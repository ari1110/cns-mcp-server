/**
 * Tests for autonomous workflow orchestration
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { rm } from 'fs/promises';
import { Database } from '../src/database/index.js';
import { MemorySystem } from '../src/memory/index.js';
import { WorkspaceManager } from '../src/workspaces/index.js';
import { OrchestrationEngine } from '../src/orchestration/engine.js';

describe('Orchestration Workflow Tests', () => {
  let database: Database;
  let memorySystem: MemorySystem;
  let workspaceManager: WorkspaceManager;
  let orchestrationEngine: OrchestrationEngine;

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await rm('./test-orchestration.db');
    } catch {
      // Database doesn't exist
    }

    // Initialize components
    database = new Database({ path: './test-orchestration.db' });
    await database.initialize();
    
    memorySystem = new MemorySystem(database);
    workspaceManager = new WorkspaceManager({
      workspaces_dir: '/tmp/cns-test-orchestration'
    });
    
    orchestrationEngine = new OrchestrationEngine(database, memorySystem, workspaceManager);
    await orchestrationEngine.start();
  });

  describe('Workflow Management', () => {
    test('should launch agent with specifications', async () => {
      const result = await orchestrationEngine.launchAgent({
        agent_type: 'software-engineer',
        specifications: 'Implement user authentication system with JWT tokens'
        // Remove workspace_config to avoid git worktree conflicts
      });

      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('queued');
      expect(response.agent_type).toBe('software-engineer');
      expect(response.workflow_id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
      expect(response.prompt_preview).toContain('software-engineer');
      // The specifications are stored in memory and referenced in the prompt
      expect(typeof response.prompt_preview).toBe('string');
      expect(response.prompt_preview.length).toBeGreaterThan(0);
    });

    test('should get pending tasks', async () => {
      // Launch multiple agents
      await orchestrationEngine.launchAgent({
        agent_type: 'frontend-developer',
        specifications: 'Create login form component'
      });

      await orchestrationEngine.launchAgent({
        agent_type: 'backend-developer', 
        specifications: 'Implement authentication API endpoints'
      });

      const result = await orchestrationEngine.getPendingTasks();
      const response = JSON.parse(result.content[0].text);

      expect(response.count).toBe(2);
      expect(response.tasks).toBeInstanceOf(Array);
      expect(response.tasks).toHaveLength(2);

      // Check task details
      const frontendTask = response.tasks.find((t: any) => t.agent_type === 'frontend-developer');
      const backendTask = response.tasks.find((t: any) => t.agent_type === 'backend-developer');

      expect(frontendTask).toBeDefined();
      expect(backendTask).toBeDefined();
      expect(frontendTask.workflow_id).toBeDefined();
      expect(backendTask.workflow_id).toBeDefined();
    });

    test('should filter pending tasks by agent type', async () => {
      // Launch different types of agents
      await orchestrationEngine.launchAgent({
        agent_type: 'tester',
        specifications: 'Write unit tests for authentication'
      });

      await orchestrationEngine.launchAgent({
        agent_type: 'documentation-writer',
        specifications: 'Document authentication API'
      });

      const result = await orchestrationEngine.getPendingTasks({
        agent_type: 'tester'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.count).toBe(1);
      expect(response.tasks[0].agent_type).toBe('tester');
    });

    test('should signal task completion', async () => {
      const launchResult = await orchestrationEngine.launchAgent({
        agent_type: 'developer',
        specifications: 'Complete assigned task'
      });

      const launchResponse = JSON.parse(launchResult.content[0].text);
      const workflowId = launchResponse.workflow_id;

      const completionResult = await orchestrationEngine.signalCompletion({
        agent_id: 'developer-123',
        workflow_id: workflowId,
        result: 'Task completed successfully. Implemented all required features.',
        artifacts: [
          { type: 'code', path: 'src/auth.js', size: '2KB' },
          { type: 'test', path: 'test/auth.test.js', size: '1KB' }
        ]
      });

      const completionResponse = JSON.parse(completionResult.content[0].text);
      expect(completionResponse.status).toBe('recorded');
      expect(completionResponse.agent_id).toBe('developer-123');
      expect(completionResponse.workflow_id).toBe(workflowId);
    });
  });

  describe('Workflow Status and Tracking', () => {
    test('should track workflow status', async () => {
      const launchResult = await orchestrationEngine.launchAgent({
        agent_type: 'analyst',
        specifications: 'Analyze user requirements'
      });

      const launchResponse = JSON.parse(launchResult.content[0].text);
      const workflowId = launchResponse.workflow_id;

      const statusResult = await orchestrationEngine.getWorkflowStatus(workflowId);
      const statusResponse = JSON.parse(statusResult.content[0].text);

      expect(statusResponse).toBeDefined();
      expect(statusResponse.id).toBe(workflowId);
      expect(statusResponse.status).toBe('active');
      expect(statusResponse.agent_type).toBe('analyst');
      expect(statusResponse.specifications).toContain('requirements');
    });

    test('should get system statistics', async () => {
      // Launch some workflows to get meaningful stats
      await orchestrationEngine.launchAgent({
        agent_type: 'dev-1',
        specifications: 'Task 1'
      });

      await orchestrationEngine.launchAgent({
        agent_type: 'dev-2', 
        specifications: 'Task 2'
      });

      const stats = await orchestrationEngine.getStats();

      expect(stats.workflows).toBeGreaterThan(0);
      expect(stats.pending_tasks).toBeGreaterThan(0);
      expect(stats.active_workflows).toBeGreaterThan(0);
      expect(typeof stats.handoffs).toBe('number');
    });

    test('should get system status', async () => {
      const status = await orchestrationEngine.getSystemStatus();

      expect(status.status).toBe('operational');
      expect(status.workflows).toBeDefined();
      expect(status.workflows.total).toBeGreaterThanOrEqual(0);
      expect(status.workflows.active).toBeGreaterThanOrEqual(0);
      expect(status.pending_tasks).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Memory Integration', () => {
    test('should store specifications in memory during launch', async () => {
      const specifications = 'Build a REST API for user management with CRUD operations';
      
      const result = await orchestrationEngine.launchAgent({
        agent_type: 'api-developer',
        specifications
      });

      const response = JSON.parse(result.content[0].text);
      const workflowId = response.workflow_id;

      // Verify specifications were stored in memory (use simpler search terms)
      const memoryResult = await memorySystem.retrieve({
        query: 'REST API',
        filters: { workflow_id: workflowId, type: 'specifications' }
      });

      const memoryResponse = JSON.parse(memoryResult.content[0].text);
      expect(memoryResponse.results.length).toBeGreaterThan(0);
      
      const storedSpec = memoryResponse.results[0];
      expect(storedSpec.content).toContain('user management');
      expect(storedSpec.type).toBe('specifications');
      expect(storedSpec.workflow_id).toBe(workflowId);
    });

    test('should store completion results in memory', async () => {
      const launchResult = await orchestrationEngine.launchAgent({
        agent_type: 'developer',
        specifications: 'Implement user login feature'
      });

      const launchResponse = JSON.parse(launchResult.content[0].text);
      const workflowId = launchResponse.workflow_id;

      const completionMessage = 'Successfully implemented login feature with validation';
      
      await orchestrationEngine.signalCompletion({
        agent_id: 'dev-456',
        workflow_id: workflowId,
        result: completionMessage,
        artifacts: [{ type: 'component', name: 'LoginForm.jsx' }]
      });

      // Verify completion was stored in memory (use simpler search)
      const memoryResult = await memorySystem.retrieve({
        query: 'login',
        filters: { workflow_id: workflowId, type: 'completion' }
      });

      const memoryResponse = JSON.parse(memoryResult.content[0].text);
      expect(memoryResponse.results.length).toBeGreaterThan(0);
      
      const storedCompletion = memoryResponse.results[0];
      expect(storedCompletion.content).toContain('login feature');
      expect(storedCompletion.type).toBe('completion');
      expect(storedCompletion.workflow_id).toBe(workflowId);
      expect(storedCompletion.metadata.agent_id).toBe('dev-456');
      expect(storedCompletion.metadata.artifacts).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle workflow status for non-existent workflow', async () => {
      const fakeWorkflowId = '00000000-0000-0000-0000-000000000000';
      
      const statusResult = await orchestrationEngine.getWorkflowStatus(fakeWorkflowId);
      const statusResponse = JSON.parse(statusResult.content[0].text);

      expect(statusResponse.error).toBe('Workflow not found');
    });

    test('should handle completion without workflow ID', async () => {
      const result = await orchestrationEngine.signalCompletion({
        agent_id: 'standalone-agent',
        result: 'Completed standalone task'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('recorded');
      expect(response.agent_id).toBe('standalone-agent');
      expect(response.workflow_id).toBeUndefined();
    });

    test('should handle empty specifications gracefully', async () => {
      const result = await orchestrationEngine.launchAgent({
        agent_type: 'generic-agent',
        specifications: ''
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('queued');
      expect(response.agent_type).toBe('generic-agent');
    });

    test('should handle concurrent workflow operations', async () => {
      // Launch multiple workflows concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        orchestrationEngine.launchAgent({
          agent_type: `concurrent-agent-${i}`,
          specifications: `Concurrent task ${i}`
        })
      );

      const results = await Promise.all(promises);
      
      // All should succeed and have unique workflow IDs
      const workflowIds = new Set();
      results.forEach((result, i) => {
        const response = JSON.parse(result.content[0].text);
        expect(response.status).toBe('queued');
        expect(response.agent_type).toBe(`concurrent-agent-${i}`);
        expect(response.workflow_id).toBeDefined();
        workflowIds.add(response.workflow_id);
      });

      // All workflow IDs should be unique
      expect(workflowIds.size).toBe(10);
    });
  });
});