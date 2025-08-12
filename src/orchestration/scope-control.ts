/**
 * Scope Control System - Prevents agent over-engineering and runaway development
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export interface ScopeConstraints {
  // Resource limits
  maxWorkspaceSize: number; // bytes
  maxExecutionTime: number; // minutes
  maxAgentCount: number;
  maxFileCount: number;
  maxDirectoryDepth: number;
  
  // Task scope limits
  maxSpecificationLength: number;
  prohibitedKeywords: string[];
  requiredCompletionCriteria: string[];
  
  // Team coordination limits
  maxTeamSize: number;
  maxDelegationDepth: number; // prevent recursive delegation
  maxConcurrentTasks: number;
  
  // Quality gates
  requiresApproval: boolean;
  autoStopOnOverengineering: boolean;
  complexityThreshold: 'simple' | 'moderate' | 'complex';
}

export interface ScopeViolation {
  type: 'resource' | 'task' | 'team' | 'quality';
  severity: 'warning' | 'critical' | 'blocking';
  message: string;
  metric: string;
  currentValue: number | string;
  threshold: number | string;
  recommendedAction: string;
}

export interface TaskScope {
  id: string;
  workflowId: string;
  agentType: string;
  specifications: string;
  constraints: ScopeConstraints;
  startTime: Date;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  successCriteria: string[];
  boundaries: string[];
}

export class ScopeControlSystem extends EventEmitter {
  private activeTasks: Map<string, TaskScope> = new Map();
  private violationHistory: Map<string, ScopeViolation[]> = new Map();
  private defaultConstraints: ScopeConstraints;
  
  constructor() {
    super();
    
    // Define sensible defaults based on our over-engineering experience
    this.defaultConstraints = {
      // Resource limits (based on our 595MB → 2MB lesson)
      maxWorkspaceSize: 10 * 1024 * 1024, // 10MB max workspace
      maxExecutionTime: 15, // 15 minutes max execution
      maxAgentCount: 3, // Maximum 3 agents per team
      maxFileCount: 50, // Maximum 50 files created
      maxDirectoryDepth: 4, // Maximum 4 directory levels
      
      // Task scope limits
      maxSpecificationLength: 2000, // 2KB max specifications
      prohibitedKeywords: [
        'comprehensive', 'enterprise-grade', 'production-ready', 'scalable',
        'microservices', 'distributed', 'full-stack', 'complete system',
        'authentication system', 'user management', 'advanced features'
      ],
      requiredCompletionCriteria: [
        'specific deliverable defined',
        'clear success criteria',
        'bounded scope'
      ],
      
      // Team coordination limits
      maxTeamSize: 3, // Manager + 2 associates maximum
      maxDelegationDepth: 2, // Manager → Associate → (no further delegation)
      maxConcurrentTasks: 2, // Maximum 2 concurrent tasks
      
      // Quality gates
      requiresApproval: false,
      autoStopOnOverengineering: true,
      complexityThreshold: 'moderate'
    };
  }

  /**
   * Analyze and classify task complexity
   */
  analyzeTaskComplexity(specifications: string, agentType: string): 'simple' | 'moderate' | 'complex' {
    const spec = specifications.toLowerCase();
    
    // Simple indicators
    const simpleKeywords = [
      'fix', 'update', 'add comment', 'rename', 'format', 'lint',
      'single file', 'quick', 'minor', 'small change', 'typo'
    ];
    
    // Complex indicators
    const complexKeywords = [
      'system', 'architecture', 'framework', 'database', 'api', 'auth',
      'complete', 'full', 'comprehensive', 'enterprise', 'scalable',
      'microservice', 'distributed', 'production', 'deployment'
    ];
    
    // Team manager agents default to higher complexity
    const isManagerAgent = agentType.includes('manager') || agentType.includes('lead');
    
    const complexMatches = complexKeywords.filter(keyword => spec.includes(keyword)).length;
    const simpleMatches = simpleKeywords.filter(keyword => spec.includes(keyword)).length;
    
    // More specific classification logic
    if (simpleMatches > 0 && complexMatches === 0 && !isManagerAgent) {
      return 'simple';
    } else if (complexMatches >= 2 || isManagerAgent) {
      return 'complex';
    } else {
      return 'moderate';
    }
  }

  /**
   * Create scope constraints based on task complexity
   */
  createConstraints(complexity: 'simple' | 'moderate' | 'complex', _agentType: string): ScopeConstraints {
    const baseConstraints = { ...this.defaultConstraints };
    
    switch (complexity) {
      case 'simple':
        return {
          ...baseConstraints,
          maxWorkspaceSize: 1 * 1024 * 1024, // 1MB
          maxExecutionTime: 5, // 5 minutes
          maxAgentCount: 1, // Single agent only
          maxFileCount: 10,
          maxTeamSize: 1,
          complexityThreshold: 'simple'
        };
        
      case 'moderate':
        return {
          ...baseConstraints,
          maxWorkspaceSize: 5 * 1024 * 1024, // 5MB
          maxExecutionTime: 10, // 10 minutes
          maxAgentCount: 2,
          maxFileCount: 25,
          maxTeamSize: 2,
          complexityThreshold: 'moderate'
        };
        
      case 'complex':
        // Even complex tasks should have limits to prevent runaway development
        return {
          ...baseConstraints,
          maxWorkspaceSize: 15 * 1024 * 1024, // 15MB
          maxExecutionTime: 20, // 20 minutes
          maxAgentCount: 4, // Allow slightly larger teams
          maxFileCount: 75,
          maxTeamSize: 4,
          requiresApproval: true, // Complex tasks require approval
          complexityThreshold: 'complex'
        };
    }
  }

  /**
   * Validate task specifications against scope constraints
   */
  validateTaskSpecifications(specifications: string, constraints: ScopeConstraints): ScopeViolation[] {
    const violations: ScopeViolation[] = [];
    const spec = specifications.toLowerCase();
    
    // Check specification length
    if (specifications.length > constraints.maxSpecificationLength) {
      violations.push({
        type: 'task',
        severity: 'warning',
        message: 'Task specifications are overly complex',
        metric: 'specification_length',
        currentValue: specifications.length,
        threshold: constraints.maxSpecificationLength,
        recommendedAction: 'Break down into smaller, more focused tasks'
      });
    }
    
    // Check for prohibited keywords that indicate over-engineering
    const foundProhibited = constraints.prohibitedKeywords.filter(keyword => 
      spec.includes(keyword)
    );
    
    if (foundProhibited.length > 0) {
      violations.push({
        type: 'task',
        severity: 'critical',
        message: `Task contains over-engineering indicators: ${foundProhibited.join(', ')}`,
        metric: 'prohibited_keywords',
        currentValue: foundProhibited.join(', '),
        threshold: '0 prohibited keywords',
        recommendedAction: 'Simplify task scope and focus on specific, bounded deliverables'
      });
    }
    
    // Check for missing success criteria (more lenient for well-formed tasks)
    const hasCriteria = constraints.requiredCompletionCriteria.some(criteria => 
      spec.includes(criteria.toLowerCase())
    ) || 
    spec.includes('deliverable') || 
    spec.includes('specific') ||
    spec.includes('bounded') ||
    spec.includes('tests') ||
    spec.includes('function') ||
    spec.includes('component') ||
    (spec.includes('for') && spec.includes('the')); // "tests for the function"
    
    if (!hasCriteria) {
      violations.push({
        type: 'task',
        severity: 'warning',
        message: 'Task lacks clear success criteria or bounded scope',
        metric: 'completion_criteria',
        currentValue: 'missing',
        threshold: 'defined criteria required',
        recommendedAction: 'Add specific deliverables and clear completion criteria'
      });
    }
    
    return violations;
  }

  /**
   * Monitor resource usage during task execution
   */
  async monitorResourceUsage(taskId: string, workspaceStats: any): Promise<ScopeViolation[]> {
    const task = this.activeTasks.get(taskId);
    if (!task) return [];
    
    const violations: ScopeViolation[] = [];
    const constraints = task.constraints;
    
    // Check workspace size
    if (workspaceStats.totalSize > constraints.maxWorkspaceSize) {
      violations.push({
        type: 'resource',
        severity: 'critical',
        message: 'Workspace size exceeded limit',
        metric: 'workspace_size',
        currentValue: workspaceStats.totalSize,
        threshold: constraints.maxWorkspaceSize,
        recommendedAction: 'Remove unnecessary files or reduce scope'
      });
    }
    
    // Check execution time
    const executionMinutes = (Date.now() - task.startTime.getTime()) / (1000 * 60);
    if (executionMinutes > constraints.maxExecutionTime) {
      violations.push({
        type: 'resource',
        severity: 'critical',
        message: 'Execution time exceeded limit',
        metric: 'execution_time',
        currentValue: Math.round(executionMinutes),
        threshold: constraints.maxExecutionTime,
        recommendedAction: 'Stop task and reassess scope'
      });
    }
    
    // Check file count
    if (workspaceStats.fileCount > constraints.maxFileCount) {
      violations.push({
        type: 'resource',
        severity: 'warning',
        message: 'File count exceeded recommended limit',
        metric: 'file_count',
        currentValue: workspaceStats.fileCount,
        threshold: constraints.maxFileCount,
        recommendedAction: 'Consider if all files are necessary for the task'
      });
    }
    
    return violations;
  }

  /**
   * Monitor team coordination and prevent over-delegation
   */
  async monitorTeamCoordination(workflowId: string, teamStats: any): Promise<ScopeViolation[]> {
    const workflowTasks = Array.from(this.activeTasks.values()).filter(
      task => task.workflowId === workflowId
    );
    
    if (workflowTasks.length === 0) return [];
    
    const violations: ScopeViolation[] = [];
    const constraints = workflowTasks[0].constraints; // Use first task's constraints
    
    // Check team size
    if (teamStats.activeAgents > constraints.maxTeamSize) {
      violations.push({
        type: 'team',
        severity: 'critical',
        message: 'Team size exceeded limit',
        metric: 'team_size',
        currentValue: teamStats.activeAgents,
        threshold: constraints.maxTeamSize,
        recommendedAction: 'Stop spawning new agents and focus existing team'
      });
    }
    
    // Check concurrent tasks
    if (teamStats.concurrentTasks > constraints.maxConcurrentTasks) {
      violations.push({
        type: 'team',
        severity: 'warning',
        message: 'Too many concurrent tasks',
        metric: 'concurrent_tasks',
        currentValue: teamStats.concurrentTasks,
        threshold: constraints.maxConcurrentTasks,
        recommendedAction: 'Complete existing tasks before starting new ones'
      });
    }
    
    return violations;
  }

  /**
   * Detect over-engineering patterns in agent behavior
   */
  detectOverEngineering(_taskId: string, agentLogs: string[]): ScopeViolation[] {
    const violations: ScopeViolation[] = [];
    const logText = agentLogs.join(' ').toLowerCase();
    
    // Pattern 1: Creating excessive infrastructure
    const infrastructureKeywords = [
      'framework', 'architecture', 'microservice', 'api gateway',
      'load balancer', 'database schema', 'authentication system',
      'user management', 'role-based access', 'middleware'
    ];
    
    const infrastructureCount = infrastructureKeywords.filter(keyword => 
      logText.includes(keyword)
    ).length;
    
    if (infrastructureCount >= 3) {
      violations.push({
        type: 'quality',
        severity: 'critical',
        message: 'Agent is building excessive infrastructure',
        metric: 'infrastructure_complexity',
        currentValue: infrastructureCount,
        threshold: 2,
        recommendedAction: 'Focus on minimal viable implementation'
      });
    }
    
    // Pattern 2: Creating too many components
    const componentPatterns = [
      /created? \d+ (components?|files?|modules?)/gi,
      /implementing \d+ (features?|endpoints?|services?)/gi,
      /building (complete|full|comprehensive) (system|solution)/gi
    ];
    
    const componentMatches = componentPatterns.flatMap(pattern => 
      logText.match(pattern) || []
    );
    
    if (componentMatches.length >= 2) {
      violations.push({
        type: 'quality',
        severity: 'warning',
        message: 'Agent is creating excessive components',
        metric: 'component_count',
        currentValue: componentMatches.length,
        threshold: 1,
        recommendedAction: 'Simplify to essential components only'
      });
    }
    
    return violations;
  }

  /**
   * Register a new task with scope control
   */
  async registerTask(
    taskId: string,
    workflowId: string,
    agentType: string,
    specifications: string
  ): Promise<{ success: boolean; violations: ScopeViolation[]; constraints: ScopeConstraints }> {
    
    // Analyze task complexity
    const complexity = this.analyzeTaskComplexity(specifications, agentType);
    
    // Create appropriate constraints
    const constraints = this.createConstraints(complexity, agentType);
    
    // Validate specifications
    const violations = this.validateTaskSpecifications(specifications, constraints);
    
    // Check if task should be blocked
    const blockingViolations = violations.filter(v => v.severity === 'blocking');
    if (blockingViolations.length > 0) {
      return { success: false, violations, constraints };
    }
    
    // Create task scope
    const taskScope: TaskScope = {
      id: taskId,
      workflowId,
      agentType,
      specifications,
      constraints,
      startTime: new Date(),
      estimatedComplexity: complexity,
      successCriteria: this.extractSuccessCriteria(specifications),
      boundaries: this.extractBoundaries(specifications)
    };
    
    this.activeTasks.set(taskId, taskScope);
    this.violationHistory.set(taskId, violations);
    
    logger.info('🎯 Task registered with scope control', {
      taskId,
      complexity,
      constraints: {
        maxWorkspaceSize: constraints.maxWorkspaceSize,
        maxExecutionTime: constraints.maxExecutionTime,
        maxTeamSize: constraints.maxTeamSize
      },
      violations: violations.length
    });
    
    // Emit warnings for non-blocking violations
    if (violations.length > 0) {
      this.emit('scope:violations', { taskId, violations });
    }
    
    return { success: true, violations, constraints };
  }

  /**
   * Check if task should be automatically stopped
   */
  async shouldAutoStop(taskId: string, currentStats: any): Promise<{ shouldStop: boolean; reason: string }> {
    const task = this.activeTasks.get(taskId);
    if (!task) return { shouldStop: false, reason: '' };
    
    if (!task.constraints.autoStopOnOverengineering) {
      return { shouldStop: false, reason: '' };
    }
    
    // Check for critical resource violations
    const resourceViolations = await this.monitorResourceUsage(taskId, currentStats);
    const criticalResourceViolations = resourceViolations.filter(v => v.severity === 'critical');
    
    if (criticalResourceViolations.length > 0) {
      return { 
        shouldStop: true, 
        reason: `Critical resource violations: ${criticalResourceViolations.map(v => v.message).join(', ')}` 
      };
    }
    
    // Check for over-engineering patterns
    const overEngineeringViolations = this.detectOverEngineering(taskId, currentStats.agentLogs || []);
    const criticalQualityViolations = overEngineeringViolations.filter(v => v.severity === 'critical');
    
    if (criticalQualityViolations.length > 0) {
      return { 
        shouldStop: true, 
        reason: `Over-engineering detected: ${criticalQualityViolations.map(v => v.message).join(', ')}` 
      };
    }
    
    return { shouldStop: false, reason: '' };
  }

  /**
   * Generate improved task specifications with scope constraints
   */
  generateScopedSpecifications(originalSpecs: string, constraints: ScopeConstraints): string {
    return `${originalSpecs}

🎯 SCOPE CONSTRAINTS:
- Maximum workspace size: ${Math.round(constraints.maxWorkspaceSize / 1024 / 1024)}MB
- Maximum execution time: ${constraints.maxExecutionTime} minutes
- Maximum team size: ${constraints.maxTeamSize} agents
- Focus on specific, bounded deliverables
- Avoid over-engineering and excessive complexity

⚠️ AUTO-STOP CONDITIONS:
- Workspace size exceeds limit
- Execution time exceeds limit
- Over-engineering patterns detected
- Scope creep beyond boundaries

✅ SUCCESS CRITERIA:
- Complete the specific task as defined
- Stay within resource constraints
- Deliver minimal viable solution
- Document clear completion markers`;
  }

  /**
   * Get task status and violations
   */
  getTaskStatus(taskId: string) {
    const task = this.activeTasks.get(taskId);
    const violations = this.violationHistory.get(taskId) || [];
    
    if (!task) {
      return { found: false };
    }
    
    const executionMinutes = (Date.now() - task.startTime.getTime()) / (1000 * 60);
    
    return {
      found: true,
      task,
      violations,
      executionTime: Math.round(executionMinutes),
      status: violations.some(v => v.severity === 'critical') ? 'at_risk' : 'healthy'
    };
  }

  /**
   * Complete a task and remove from active monitoring
   */
  completeTask(taskId: string) {
    const task = this.activeTasks.get(taskId);
    if (task) {
      const executionMinutes = (Date.now() - task.startTime.getTime()) / (1000 * 60);
      logger.info('🎯 Task completed with scope control', {
        taskId,
        executionTime: Math.round(executionMinutes),
        complexity: task.estimatedComplexity
      });
      
      this.activeTasks.delete(taskId);
      // Keep violation history for analysis
    }
  }

  /**
   * Get all active tasks being monitored
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Get total number of violations across all tasks
   */
  getTotalViolations() {
    let total = 0;
    for (const violations of this.violationHistory.values()) {
      total += violations.length;
    }
    return total;
  }

  /**
   * Get recent auto-stops (mock for now - could be enhanced with actual tracking)
   */
  getRecentAutoStops() {
    // This would be enhanced to track actual auto-stops
    return [];
  }

  /**
   * Get comprehensive scope control status
   */
  getStatus() {
    const activeTasks = this.getActiveTasks();
    const totalViolations = this.getTotalViolations();
    
    return {
      active_tasks: activeTasks.length,
      total_violations: totalViolations,
      tasks_by_complexity: {
        simple: activeTasks.filter(t => t.estimatedComplexity === 'simple').length,
        moderate: activeTasks.filter(t => t.estimatedComplexity === 'moderate').length,
        complex: activeTasks.filter(t => t.estimatedComplexity === 'complex').length
      },
      recent_violations: Array.from(this.violationHistory.entries()).slice(-5),
      auto_stop_enabled_tasks: activeTasks.filter(t => t.constraints.autoStopOnOverengineering).length
    };
  }

  /**
   * Helper methods
   */
  private extractSuccessCriteria(specifications: string): string[] {
    const criteria: string[] = [];
    const lines = specifications.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('success') || 
          line.toLowerCase().includes('complete') ||
          line.toLowerCase().includes('deliver')) {
        criteria.push(line.trim());
      }
    }
    
    return criteria.length > 0 ? criteria : ['Complete the specified task'];
  }

  private extractBoundaries(specifications: string): string[] {
    const boundaries: string[] = [];
    const spec = specifications.toLowerCase();
    
    if (spec.includes('only') || spec.includes('just') || spec.includes('simple')) {
      boundaries.push('Minimal scope implementation');
    }
    
    if (spec.includes('single') || spec.includes('one')) {
      boundaries.push('Single component focus');
    }
    
    return boundaries.length > 0 ? boundaries : ['Stay within specified requirements'];
  }
}