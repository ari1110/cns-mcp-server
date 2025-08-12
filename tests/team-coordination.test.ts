/**
 * Team Coordination Tests - Validate role registry and duplicate prevention
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrchestrationEngine } from '../src/orchestration/engine.js';
import { Database } from '../src/database/index.js';
import { MemorySystem } from '../src/memory/index.js';
import { WorkspaceManager } from '../src/workspaces/index.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

describe('Team Coordination Tests', () => {
  let orchestration: OrchestrationEngine;
  let db: Database;
  let memory: MemorySystem;
  let workspaces: WorkspaceManager;
  let testDir: string;

  beforeEach(async () => {
    // Setup test directory
    testDir = join(tmpdir(), `cns-team-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Initialize components - Database expects config object
    db = new Database({ path: join(testDir, 'test.db') });
    await db.initialize();

    memory = new MemorySystem(db);
    // MemorySystem doesn't have initialize method

    workspaces = new WorkspaceManager(testDir);
    
    orchestration = new OrchestrationEngine(db, memory, workspaces);
    await orchestration.start();
  });

  afterEach(async () => {
    if (orchestration) {
      await orchestration.stop();
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Role Registry and Duplicate Prevention', () => {
    it('should prevent duplicate agent spawning', async () => {
      const workflowId = 'test-workflow-123';
      
      // First agent launch should succeed
      const result1 = await orchestration.launchAgent({
        agent_type: 'backend-developer',
        specifications: 'Implement authentication API',
        workflow_id: workflowId
      });
      
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.status).toBe('queued');
      expect(response1.agent_type).toBe('backend-developer');
      
      // Second launch with same role should be blocked
      const result2 = await orchestration.launchAgent({
        agent_type: 'backend-developer',
        specifications: 'Another backend task',
        workflow_id: workflowId
      });
      
      const response2 = JSON.parse(result2.content[0].text);
      expect(response2.status).toBe('duplicate_blocked');
      expect(response2.message).toContain('already exists in this workflow');
      expect(response2.existing_roles).toContain('backend-developer');
    });

    it('should allow different roles in same workflow', async () => {
      const workflowId = 'test-workflow-456';
      
      // Launch backend developer
      const backend = await orchestration.launchAgent({
        agent_type: 'backend-developer',
        specifications: 'Backend tasks',
        workflow_id: workflowId
      });
      
      const backendResponse = JSON.parse(backend.content[0].text);
      expect(backendResponse.status).toBe('queued');
      
      // Launch frontend developer - should succeed
      const frontend = await orchestration.launchAgent({
        agent_type: 'frontend-developer',
        specifications: 'Frontend tasks',
        workflow_id: workflowId
      });
      
      const frontendResponse = JSON.parse(frontend.content[0].text);
      expect(frontendResponse.status).toBe('queued');
      expect(frontendResponse.agent_type).toBe('frontend-developer');
      
      // Launch security specialist - should succeed
      const security = await orchestration.launchAgent({
        agent_type: 'security-specialist',
        specifications: 'Security audit',
        workflow_id: workflowId
      });
      
      const securityResponse = JSON.parse(security.content[0].text);
      expect(securityResponse.status).toBe('queued');
      expect(securityResponse.agent_type).toBe('security-specialist');
    });

    it('should track roles in system status', async () => {
      const workflowId = 'status-test-workflow';
      
      // Launch multiple agents
      await orchestration.launchAgent({
        agent_type: 'backend-developer',
        specifications: 'Backend',
        workflow_id: workflowId
      });
      
      await orchestration.launchAgent({
        agent_type: 'frontend-developer',
        specifications: 'Frontend',
        workflow_id: workflowId
      });
      
      await orchestration.launchAgent({
        agent_type: 'test-writer',
        specifications: 'Tests',
        workflow_id: workflowId
      });
      
      // Check system status
      const status = await orchestration.getSystemStatus();
      expect(status.active_roles_by_workflow).toBeDefined();
      expect(status.active_roles_by_workflow[workflowId]).toBeDefined();
      expect(status.active_roles_by_workflow[workflowId]).toContain('backend-developer');
      expect(status.active_roles_by_workflow[workflowId]).toContain('frontend-developer');
      expect(status.active_roles_by_workflow[workflowId]).toContain('test-writer');
      expect(status.active_roles_by_workflow[workflowId].length).toBe(3);
    });

    it('should clear role registry when workflow completes', async () => {
      const workflowId = 'cleanup-test-workflow';
      
      // Launch agents
      await orchestration.launchAgent({
        agent_type: 'backend-developer',
        specifications: 'Task',
        workflow_id: workflowId
      });
      
      await orchestration.launchAgent({
        agent_type: 'frontend-developer',
        specifications: 'Task',
        workflow_id: workflowId
      });
      
      // Verify roles are registered
      let status = await orchestration.getSystemStatus();
      expect(status.active_roles_by_workflow[workflowId]).toBeDefined();
      expect(status.active_roles_by_workflow[workflowId].length).toBe(2);
      
      // Complete workflow
      await orchestration.updateWorkflowStatus(workflowId, 'completed');
      
      // Verify role registry is cleared
      status = await orchestration.getSystemStatus();
      expect(status.active_roles_by_workflow[workflowId]).toBeUndefined();
    });

    it('should remove role from registry when agent completes', async () => {
      const workflowId = 'agent-complete-workflow';
      
      // Launch agents
      await orchestration.launchAgent({
        agent_type: 'backend-developer',
        specifications: 'Backend task',
        workflow_id: workflowId
      });
      
      await orchestration.launchAgent({
        agent_type: 'frontend-developer',
        specifications: 'Frontend task',
        workflow_id: workflowId
      });
      
      // Signal backend completion
      await orchestration.signalCompletion({
        agent_id: `backend-developer-${workflowId}-12345`,
        workflow_id: workflowId,
        result: 'Backend work complete'
      });
      
      // Check that backend is removed but frontend remains
      const status = await orchestration.getSystemStatus();
      expect(status.active_roles_by_workflow[workflowId]).toBeDefined();
      expect(status.active_roles_by_workflow[workflowId]).not.toContain('backend-developer');
      expect(status.active_roles_by_workflow[workflowId]).toContain('frontend-developer');
      expect(status.active_roles_by_workflow[workflowId].length).toBe(1);
    });
  });

  describe('Team Prompt Generation', () => {
    it('should generate manager prompts with coordination protocol', () => {
      const prompt = (orchestration as any).generateTaskPrompt(
        'team-manager',
        'Build authentication system',
        'test-workflow'
      );
      
      // Check for mandatory coordination protocol
      expect(prompt).toContain('MANDATORY COORDINATION PROTOCOL');
      expect(prompt).toContain('EVERY 5 MINUTES');
      expect(prompt).toContain('agent_heartbeat');
      expect(prompt).toContain('decision_log');
      expect(prompt).toContain('file_activity');
      
      // Check for team composition guidance
      expect(prompt).toContain('TEAM COMPOSITION FOR YOUR TASK');
      expect(prompt).toContain('backend-developer');
      expect(prompt).toContain('security-specialist');
      
      // Check for spawn rules
      expect(prompt).toContain('CRITICAL SPAWN RULES');
      expect(prompt).toContain('NEVER spawn duplicate roles');
      expect(prompt).toContain('CHECK FOR DUPLICATES FIRST');
    });

    it('should generate associate prompts with role descriptions', () => {
      const prompt = (orchestration as any).generateTaskPrompt(
        'backend-developer',
        'Implement API endpoints',
        'test-workflow'
      );
      
      // Check for coordination protocol
      expect(prompt).toContain('MANDATORY COORDINATION PROTOCOL');
      expect(prompt).toContain('agent_heartbeat');
      
      // Check for role description
      expect(prompt).toContain('YOUR SPECIALIZED ROLE');
      expect(prompt).toContain('Backend Development');
      expect(prompt).toContain('REST APIs');
      expect(prompt).toContain('Database integration');
      
      // Check for associate restrictions
      expect(prompt).toContain('ASSOCIATE AGENT MODE');
      expect(prompt).toContain('Do NOT use the Task tool');
      expect(prompt).not.toContain('launch_agent');
    });

    it('should recommend appropriate team composition based on task', () => {
      // Test authentication task
      let prompt = (orchestration as any).generateTaskPrompt(
        'team-manager',
        'Build secure authentication system with JWT',
        'auth-workflow'
      );
      
      expect(prompt).toContain('backend-developer');
      expect(prompt).toContain('security-specialist');
      expect(prompt).toContain('JWT implementation');
      
      // Test database task
      prompt = (orchestration as any).generateTaskPrompt(
        'team-manager',
        'Design database schema for e-commerce',
        'db-workflow'
      );
      
      expect(prompt).toContain('database-specialist');
      expect(prompt).toContain('Schema optimization');
      
      // Test frontend task
      prompt = (orchestration as any).generateTaskPrompt(
        'team-manager',
        'Create responsive user interface',
        'ui-workflow'
      );
      
      expect(prompt).toContain('frontend-developer');
      expect(prompt).toContain('ui-designer');
    });
  });

  describe('Workflow Integration', () => {
    it('should handle complete team workflow', async () => {
      const workflowId = 'integration-test';
      
      // Manager launches team
      const manager = await orchestration.launchAgent({
        agent_type: 'team-manager',
        specifications: 'Build authentication system',
        workflow_id: workflowId
      });
      
      expect(JSON.parse(manager.content[0].text).status).toBe('queued');
      
      // Manager spawns backend
      const backend = await orchestration.launchAgent({
        agent_type: 'backend-developer',
        specifications: 'Backend API',
        workflow_id: workflowId
      });
      
      expect(JSON.parse(backend.content[0].text).status).toBe('queued');
      
      // Manager spawns frontend
      const frontend = await orchestration.launchAgent({
        agent_type: 'frontend-developer',
        specifications: 'Login UI',
        workflow_id: workflowId
      });
      
      expect(JSON.parse(frontend.content[0].text).status).toBe('queued');
      
      // Attempt duplicate - should fail
      const duplicate = await orchestration.launchAgent({
        agent_type: 'backend-developer',
        specifications: 'Another backend',
        workflow_id: workflowId
      });
      
      expect(JSON.parse(duplicate.content[0].text).status).toBe('duplicate_blocked');
      
      // Check pending tasks
      const tasks = await orchestration.getPendingTasks();
      const tasksData = JSON.parse(tasks.content[0].text);
      
      // Should have 3 tasks (manager, backend, frontend)
      expect(tasksData.count).toBe(3);
      
      // Check system status shows all roles
      const status = await orchestration.getSystemStatus();
      expect(status.active_roles_by_workflow[workflowId]).toHaveLength(3);
      expect(status.active_roles_by_workflow[workflowId]).toContain('team-manager');
      expect(status.active_roles_by_workflow[workflowId]).toContain('backend-developer');
      expect(status.active_roles_by_workflow[workflowId]).toContain('frontend-developer');
    });
  });
});