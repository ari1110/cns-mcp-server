/**
 * Agent Runner - Executes queued agent tasks by spawning Claude Code processes
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { CNSClient } from '../client/index.js';
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
}

export class AgentRunner {
  private runningAgents: Map<string, RunningAgent> = new Map();
  private client: CNSClient;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private maxConcurrentAgents: number = 3; // Configurable via env
  
  constructor() {
    this.client = new CNSClient();
    this.maxConcurrentAgents = parseInt(process.env.CNS_MAX_AGENTS || '3');
  }

  async start() {
    logger.info('Starting CNS Agent Runner', { 
      maxConcurrentAgents: this.maxConcurrentAgents 
    });
    
    await this.client.connect();
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
      agent.process.kill('SIGTERM');
    }
    
    await this.client.disconnect();
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
      const response = await this.client.callTool('get_pending_tasks', {});
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
    
    try {
      logger.info('Executing agent task', {
        taskId,
        agentType: task.agent_type,
        workflowId: task.workflow_id
      });
      
      // Create temporary prompt file
      const promptFile = await this.createPromptFile(task.prompt, taskId);
      
      // Spawn Claude Code process with Task tool prompt
      const childProcess = spawn('claude', [
        '--resume',
        '--input', promptFile
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CNS_WORKFLOW_ID: task.workflow_id,
          CNS_AGENT_TYPE: task.agent_type
        }
      });
      
      // Track running agent
      const runningAgent: RunningAgent = {
        process: childProcess,
        taskId,
        workflowId: task.workflow_id,
        agentType: task.agent_type,
        startTime: new Date()
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
      
      // Optional: Log agent output for debugging
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data: Buffer) => {
          logger.debug('Agent stdout', { taskId, data: data.toString() });
        });
      }
      
      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data: Buffer) => {
          logger.debug('Agent stderr', { taskId, data: data.toString() });
        });
      }
      
    } catch (error) {
      logger.error('Failed to execute agent task', {
        taskId,
        agentType: task.agent_type,
        error
      });
    }
  }

  private async handleAgentCompletion(taskId: string, code: number | null, signal: NodeJS.Signals | null) {
    const agent = this.runningAgents.get(taskId);
    if (!agent) return;
    
    const duration = Date.now() - agent.startTime.getTime();
    
    logger.info('Agent completed', {
      taskId,
      agentType: agent.agentType,
      workflowId: agent.workflowId,
      exitCode: code,
      signal,
      duration: `${duration}ms`
    });
    
    // Remove from tracking
    this.runningAgents.delete(taskId);
    
    try {
      // Signal completion to orchestration engine
      await this.client.callTool('signal_completion', {
        agent_id: taskId,
        workflow_id: agent.workflowId,
        result: code === 0 ? 'Agent completed successfully' : `Agent failed with code ${code}`,
        artifacts: []
      });
      
      // Remove completed task from pending queue
      await this.removeCompletedTask(agent.workflowId, agent.agentType);
      
    } catch (error) {
      logger.error('Failed to signal agent completion', {
        taskId,
        error
      });
    }
  }

  private async createPromptFile(prompt: string, taskId: string): Promise<string> {
    const tempDir = join(tmpdir(), 'cns-agent-prompts');
    await mkdir(tempDir, { recursive: true });
    
    const promptFile = join(tempDir, `${taskId}.txt`);
    await writeFile(promptFile, prompt, 'utf-8');
    
    return promptFile;
  }

  private async removeCompletedTask(workflowId: string, agentType: string) {
    // This will need to be implemented in the orchestration engine
    // For now, we rely on the engine's internal cleanup logic
    logger.debug('Task completion signaled', { workflowId, agentType });
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