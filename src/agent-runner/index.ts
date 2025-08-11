/**
 * Agent Runner - Spawns isolated Claude agents to execute tasks autonomously
 * Phase 1: Single agent isolation with spawn loop prevention
 */

import { spawn, ChildProcess } from 'child_process';
import { appendFileSync } from 'fs';
import { logger } from '../utils/logger.js';

interface PendingTask {
  type: string;
  agent_type: string;
  workflow_id: string;
  prompt: string;
  created_at: string;
}

interface RunningAgent {
  process: ChildProcess;
  taskId: string;
  workflowId: string;
  agentType: string;
  startTime: Date;
  workspacePath?: string; // Track workspace for cleanup
}

export class AgentRunner {
  private runningAgents: Map<string, RunningAgent> = new Map();
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private maxConcurrentAgents: number = 3; // Configurable via env
  
  constructor(private cnsServer: any) {
    // No CNSClient needed - we're INSIDE the CNS server!
    this.maxConcurrentAgents = parseInt(process.env.CNS_MAX_AGENTS || '3');
  }

  async start() {
    logger.info('Starting CNS Agent Runner', { 
      maxConcurrentAgents: this.maxConcurrentAgents 
    });
    
    // No client connection needed - we're internal!
    this.isRunning = true;
    
    // Start polling for pending tasks every 10 seconds
    this.pollInterval = setInterval(async () => {
      await this.processPendingTasks();
    }, 10000);
    
    // Initial poll
    await this.processPendingTasks();
    
    logger.info('CNS Agent Runner started successfully');
  }

  async stop() {
    logger.info('Stopping CNS Agent Runner');
    
    this.isRunning = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    // Gracefully stop running agents
    for (const [taskId, agent] of this.runningAgents) {
      logger.info('Terminating running agent', { taskId, agentType: agent.agentType });
      if (agent.process && !agent.process.killed) {
        agent.process.kill('SIGTERM');
      }
    }
    
    // No client to disconnect - we're internal
    logger.info('CNS Agent Runner stopped');
  }

  private async processPendingTasks() {
    if (!this.isRunning) return;
    
    try {
      // Check if we can run more agents
      const availableSlots = this.maxConcurrentAgents - this.runningAgents.size;
      if (availableSlots <= 0) {
        logger.debug('Max concurrent agents reached, skipping poll', {
          running: this.runningAgents.size,
          max: this.maxConcurrentAgents
        });
        return;
      }
      
      // Get pending tasks from orchestration engine
      const response = await this.cnsServer.orchestration.getPendingTasks();
      const tasksData = JSON.parse((response.content as any)[0].text);
      const pendingTasks: PendingTask[] = tasksData.tasks || [];
      
      if (pendingTasks.length === 0) {
        return; // No tasks to process
      }
      
      logger.info('Processing pending tasks', { 
        count: pendingTasks.length,
        availableSlots 
      });
      
      // Execute tasks up to available slots
      const tasksToExecute = pendingTasks.slice(0, availableSlots);
      
      for (const task of tasksToExecute) {
        await this.executeAgent(task);
      }
      
    } catch (error) {
      logger.error('Error processing pending tasks', { error });
    }
  }

  private async executeAgent(task: PendingTask) {
    const taskId = `${task.agent_type}-${task.workflow_id}-${Date.now()}`;
    let workspacePath: string | null = null;
    
    try {
      // Determine workspace strategy based on agent type
      const isManagerAgent = this.isManagerAgent(task.agent_type);
      const workspaceId = isManagerAgent ? task.workflow_id : `${task.workflow_id}-shared`;
      
      logger.info('🚀 Team Workspace Strategy:', {
        taskId,
        agentType: task.agent_type,
        workflowId: task.workflow_id,
        isManager: isManagerAgent,
        workspaceStrategy: isManagerAgent ? 'Create new workflow workspace' : 'Reuse existing workflow workspace'
      });
      
      // Step 1: Create or reuse workflow-based workspace
      const workspaceResponse = await this.cnsServer.workspaces.create({
        agent_id: workspaceId, // Use workflow ID as workspace identifier
        base_ref: 'main',
        resources: { 
          workflow_id: task.workflow_id,
          primary_agent: isManagerAgent ? task.agent_type : 'inherited',
          team_members: isManagerAgent ? [task.agent_type] : 'joining_existing'
        }
      });
      
      const workspaceData = JSON.parse((workspaceResponse.content as any)[0].text);
      workspacePath = workspaceData.workspace_path;
      
      if (!workspacePath) {
        throw new Error('Workspace creation returned invalid path');
      }
      
      logger.info('✅ Workspace created', { taskId, workspacePath });
      
      // Step 2: Prompt will be sent via stdin
      logger.info('🔍 DEBUG: About to spawn agent', {
        taskId,
        command: 'claude',
        args: ['--print', '--permission-mode', 'bypassPermissions'],
        cwd: workspacePath,
        promptLength: task.prompt.length
      });
      
      // Debug file logging
      const debugInfo = `[${new Date().toISOString()}] About to spawn: ${taskId}\n` +
                       `  Command: claude --print --permission-mode bypassPermissions\n` +
                       `  CWD: ${workspacePath}\n` +
                       `  Prompt length: ${task.prompt.length}\n\n`;
      appendFileSync('/home/ari1110/projects/cns-mcp-server/agent-debug.log', debugInfo);
      
      // Step 3: Spawn Claude Code process in isolated workspace
      const childProcess = spawn('claude', [
        '--print',
        '--permission-mode', 'bypassPermissions'
      ], {
        cwd: workspacePath,                         // CRITICAL: Run in isolated workspace
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Phase 1.5 Workspace Isolation
          PWD: workspacePath,                       // Ensure correct working directory
          CNS_MODE: 'isolated_agent',              // Tells Claude it's a worker
          CNS_WORKSPACE_PATH: workspacePath,       // Agent knows its workspace
          CNS_WORKFLOW_ID: task.workflow_id,       // Context for the agent
          CNS_AGENT_TYPE: task.agent_type,         // Role specification
          CNS_AGENT_ID: taskId,                    // Unique identifier
          // Team Coordination: Manager agents get MCP tools, associates isolated
          CNS_DISABLE_MCP_CNS: isManagerAgent ? 'false' : 'true',
          MCP_SERVERS_CONFIG: isManagerAgent ? JSON.stringify({
            cns: {
              command: 'node',
              args: ['/home/ari1110/projects/cns-mcp-server/dist/index.js']
            }
          }) : JSON.stringify({}), // Associates get no MCP servers
        }
      });
      
      logger.info('🔍 DEBUG: Spawn attempted', {
        taskId,
        pid: childProcess.pid,
        killed: childProcess.killed,
        connected: childProcess.connected
      });
      
      // Debug file logging for spawn result
      const spawnInfo = `[${new Date().toISOString()}] Spawn result: ${taskId}\n` +
                       `  PID: ${childProcess.pid}\n` +
                       `  Killed: ${childProcess.killed}\n` +
                       `  Connected: ${childProcess.connected}\n\n`;
      appendFileSync('/home/ari1110/projects/cns-mcp-server/agent-debug.log', spawnInfo);

      // Track running agent with workspace
      const runningAgent: RunningAgent = {
        process: childProcess,
        taskId,
        workflowId: task.workflow_id,
        agentType: task.agent_type,
        startTime: new Date(),
        workspacePath: workspacePath
      };
      
      this.runningAgents.set(taskId, runningAgent);
      
      // Handle process completion
      childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        this.handleAgentCompletion(taskId, code, signal);
      });
      
      childProcess.on('error', (error: Error) => {
        logger.error('Agent process error', { taskId, error });
        this.runningAgents.delete(taskId);
      });
      
      // Enhanced agent output logging for oversight
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data: Buffer) => {
          const output = data.toString().trim();
          logger.info(`📤 Agent ${taskId} stdout:`, output);
          
          // Log to oversight file for real-time monitoring
          appendFileSync('/home/ari1110/projects/cns-mcp-server/agent-oversight.log', 
            `[${new Date().toISOString()}] ${taskId} STDOUT: ${output}\n`);
        });
      }
      
      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data: Buffer) => {
          const output = data.toString().trim();
          logger.warn(`⚠️ Agent ${taskId} stderr:`, output);
          
          // Log to oversight file for real-time monitoring
          appendFileSync('/home/ari1110/projects/cns-mcp-server/agent-oversight.log', 
            `[${new Date().toISOString()}] ${taskId} STDERR: ${output}\n`);
        });
      }
      
      // Send prompt via stdin
      if (childProcess.stdin) {
        childProcess.stdin.write(task.prompt);
        childProcess.stdin.end();
      }
      
      logger.info('✅ Agent spawned successfully', { taskId, pid: childProcess.pid });
      
    } catch (error) {
      logger.error('Failed to spawn agent', {
        taskId,
        agentType: task.agent_type,
        error
      });
      
      // Cleanup workspace if it was created
      if (workspacePath) {
        try {
          await this.cnsServer.workspaces.cleanup({
            agent_id: taskId,
            force: true
          });
          logger.info('🧹 Workspace cleaned up after error', { taskId, workspacePath });
        } catch (cleanupError) {
          logger.error('Failed to cleanup workspace after error', { taskId, cleanupError });
        }
      }
    }
  }

  private async handleAgentCompletion(taskId: string, code: number | null, signal: NodeJS.Signals | null) {
    const agent = this.runningAgents.get(taskId);
    if (!agent) {
      logger.warn('🔍 DEBUG: handleAgentCompletion called for unknown agent', { taskId });
      return;
    }
    
    const duration = Date.now() - agent.startTime.getTime();
    
    logger.info('🏁 Agent completed', {
      taskId,
      agentType: agent.agentType,
      workflowId: agent.workflowId,
      exitCode: code,
      signal,
      duration: `${duration}ms`,
      workspacePath: agent.workspacePath
    });
    
    // Debug file logging for completion
    const completionInfo = `[${new Date().toISOString()}] Agent completed: ${taskId}\n` +
                          `  Exit code: ${code}\n` +
                          `  Signal: ${signal}\n` +
                          `  Duration: ${duration}ms\n` +
                          `  Workspace: ${agent.workspacePath}\n\n`;
    appendFileSync('/home/ari1110/projects/cns-mcp-server/agent-debug.log', completionInfo);
    
    // Remove from tracking
    this.runningAgents.delete(taskId);
    
    try {
      // Signal completion to orchestration engine
      await this.cnsServer.orchestration.signalCompletion({
        agent_id: taskId,
        workflow_id: agent.workflowId,
        result: code === 0 ? 'Agent completed successfully' : `Agent failed with code ${code}`,
        artifacts: []
      });
      
      logger.info('✅ Agent completion signaled to orchestration', { taskId });
      
      // Cleanup workspace after successful completion
      if (agent.workspacePath) {
        try {
          await this.cnsServer.workspaces.cleanup({
            agent_id: taskId,
            force: false // Gentle cleanup for successful completion
          });
          logger.info('🧹 Workspace cleaned up after completion', { 
            taskId, 
            workspacePath: agent.workspacePath 
          });
        } catch (cleanupError) {
          logger.error('Failed to cleanup workspace after completion', { taskId, cleanupError });
        }
      }
      
    } catch (error) {
      logger.error('Failed to signal agent completion', {
        taskId,
        error
      });
    }
  }


  private isManagerAgent(agentType: string): boolean {
    const managerAgentTypes = [
      'team-manager', 'feature-team-lead', 'project-lead', 'tech-lead', 
      'release-manager', 'qa-manager', 'devops-manager', 'architect'
    ];
    
    return managerAgentTypes.some(managerType => 
      agentType.includes(managerType) || agentType.includes('manager') || agentType.includes('lead')
    );
  }

  async stopWorkflow(workflowId: string, reason: string = 'Manual stop', force: boolean = false) {
    const agentsToStop = Array.from(this.runningAgents.values())
      .filter(agent => agent.workflowId === workflowId);
    
    if (agentsToStop.length === 0) {
      return {
        status: 'no_agents_found',
        workflow_id: workflowId,
        message: 'No running agents found for this workflow'
      };
    }
    
    logger.warn(`⏹️ Stopping workflow ${workflowId}: ${reason}`, { 
      agentsToStop: agentsToStop.length,
      force 
    });
    
    const stoppedAgents = [];
    
    for (const agent of agentsToStop) {
      try {
        if (agent.process && !agent.process.killed) {
          const signal = force ? 'SIGKILL' : 'SIGTERM';
          agent.process.kill(signal);
          
          stoppedAgents.push({
            taskId: agent.taskId,
            agentType: agent.agentType,
            runtime: Date.now() - agent.startTime.getTime(),
            signal: signal
          });
          
          // Remove from tracking
          this.runningAgents.delete(agent.taskId);
        }
      } catch (error) {
        logger.error(`Failed to stop agent ${agent.taskId}:`, error);
      }
    }
    
    return {
      status: 'workflow_stopped',
      workflow_id: workflowId,
      reason: reason,
      agents_stopped: stoppedAgents.length,
      stopped_agents: stoppedAgents,
      force: force
    };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      runningAgents: this.runningAgents.size,
      maxConcurrentAgents: this.maxConcurrentAgents,
      agents: Array.from(this.runningAgents.values()).map(agent => ({
        taskId: agent.taskId,
        agentType: agent.agentType,
        workflowId: agent.workflowId,
        runtime: Date.now() - agent.startTime.getTime()
      }))
    };
  }
}