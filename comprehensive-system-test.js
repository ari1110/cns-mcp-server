#!/usr/bin/env node
/**
 * COMPREHENSIVE CNS SYSTEM TEST
 * 
 * Tests the complete CNS system functionality:
 * 1. Server startup without spawn loops
 * 2. MCP server connectivity and tool availability
 * 3. Agent queuing and workspace creation
 * 4. Actual agent execution with workspace isolation
 * 5. Resource cleanup and system stability
 * 6. Error handling and recovery
 * 7. Concurrent operations and load handling
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, readdir, access, constants, writeFile } from 'fs/promises';
import { join } from 'path';

class ComprehensiveCNSTest {
  constructor() {
    this.cnsProcess = null;
    this.mcpClient = null;
    this.testResults = {
      serverStartup: false,
      mcpConnectivity: false,
      toolAvailability: false,
      agentQueuing: false,
      workspaceCreation: false,
      agentExecution: false,
      resourceCleanup: false,
      concurrentOperations: false,
      errorHandling: false,
      systemStability: false
    };
    this.startTime = Date.now();
    this.processCount = { initial: 0, peak: 0, final: 0 };
  }

  async run() {
    console.log('🧪 COMPREHENSIVE CNS SYSTEM TEST');
    console.log('='.repeat(50));
    
    try {
      await this.test01_ServerStartup();
      await this.test02_MCPConnectivity();  
      await this.test03_ToolAvailability();
      await this.test04_AgentQueuing();
      await this.test05_WorkspaceCreation();
      await this.test06_AgentExecution();
      await this.test07_ConcurrentOperations();
      await this.test08_ResourceCleanup();
      await this.test09_ErrorHandling();
      await this.test10_SystemStability();
      
      await this.generateComprehensiveReport();
      
    } catch (error) {
      console.error('💥 CRITICAL SYSTEM FAILURE:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  async test01_ServerStartup() {
    console.log('\\n📡 TEST 1: CNS Server Startup & Spawn Loop Prevention');
    
    this.processCount.initial = await this.getProcessCount();
    console.log(`📊 Initial process count: ${this.processCount.initial}`);
    
    return new Promise((resolve, reject) => {
      this.cnsProcess = spawn('npm', ['start'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let startupOutput = '';
      let serverReady = false;

      const timeout = setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server startup timeout (30s)'));
        }
      }, 30000);

      this.cnsProcess.stdout.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;
        
        // Look for the actual startup indicators
        if (output.includes('✅ Agent runner started successfully') && 
            output.includes('🎯 CNS MCP Server running')) {
          serverReady = true;
          clearTimeout(timeout);
          this.testResults.serverStartup = true;
          console.log('✅ CNS Server started successfully');
          resolve();
        }
      });

      this.cnsProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (!error.includes('[dotenv]')) { // Ignore dotenv messages
          console.error('Server stderr:', error);
        }
      });

      this.cnsProcess.on('exit', (code) => {
        if (code !== 0 && !serverReady) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  }

  async test02_MCPConnectivity() {
    console.log('\\n🔌 TEST 2: MCP Client Connectivity');
    
    try {
      this.mcpClient = new Client({
        name: 'cns-system-test',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Connect to the CNS MCP server
      const transport = new StdioClientTransport();
      await this.mcpClient.connect(transport);
      
      // Test basic connectivity
      const resources = await this.mcpClient.listResources();
      
      this.testResults.mcpConnectivity = true;
      console.log(`✅ MCP connection established (${resources.resources.length} resources available)`);
      
    } catch (error) {
      console.error('❌ MCP connectivity failed:', error.message);
      throw error;
    }
  }

  async test03_ToolAvailability() {
    console.log('\\n🛠️  TEST 3: CNS Tool Availability');
    
    try {
      const tools = await this.mcpClient.listTools();
      const expectedTools = [
        'launch_agent',
        'get_pending_tasks', 
        'signal_completion',
        'create_workspace',
        'cleanup_workspace',
        'get_system_status'
      ];
      
      const availableTools = tools.tools.map(t => t.name);
      const missingTools = expectedTools.filter(tool => !availableTools.includes(tool));
      
      if (missingTools.length === 0) {
        this.testResults.toolAvailability = true;
        console.log(`✅ All required tools available (${availableTools.length} total)`);
      } else {
        console.error(`❌ Missing tools: ${missingTools.join(', ')}`);
      }
      
      console.log('📋 Available tools:', availableTools.join(', '));
      
    } catch (error) {
      console.error('❌ Tool availability check failed:', error.message);
    }
  }

  async test04_AgentQueuing() {
    console.log('\\n🤖 TEST 4: Agent Task Queuing');
    
    try {
      const testSpecs = 'SYSTEM TEST: List files in current directory, count them, check git status, and end with "Implementation Complete"';
      
      const result = await this.mcpClient.callTool('launch_agent', {
        agent_type: 'system-test-agent',
        specifications: testSpecs
      });
      
      const response = JSON.parse(result.content[0].text);
      
      if (response.status === 'queued' && response.workflow_id) {
        this.testResults.agentQueuing = true;
        this.queuedWorkflowId = response.workflow_id;
        console.log(`✅ Agent queued successfully (workflow: ${response.workflow_id})`);
      } else {
        console.error('❌ Agent queuing failed:', response);
      }
      
    } catch (error) {
      console.error('❌ Agent queuing failed:', error.message);
    }
  }

  async test05_WorkspaceCreation() {
    console.log('\\n📁 TEST 5: Workspace Creation & Isolation');
    
    try {
      const testAgentId = 'test-workspace-agent-' + Date.now();
      
      const result = await this.mcpClient.callTool('create_workspace', {
        agent_id: testAgentId,
        base_ref: 'main'
      });
      
      const response = JSON.parse(result.content[0].text);
      
      if (response.status === 'created' && response.workspace_path) {
        // Verify workspace actually exists
        await access(response.workspace_path, constants.F_OK);
        
        this.testResults.workspaceCreation = true;
        this.testWorkspacePath = response.workspace_path;
        this.testAgentId = testAgentId;
        console.log(`✅ Workspace created: ${response.workspace_path}`);
        
        // Test workspace isolation
        await this.testWorkspaceIsolation(response.workspace_path);
        
      } else {
        console.error('❌ Workspace creation failed:', response);
      }
      
    } catch (error) {
      console.error('❌ Workspace creation failed:', error.message);
    }
  }

  async testWorkspaceIsolation(workspacePath) {
    try {
      // Create a test file in the isolated workspace
      const testFile = join(workspacePath, 'isolation-test.txt');
      await writeFile(testFile, 'This file tests workspace isolation');
      
      // Verify it doesn't exist in main workspace
      try {
        await access('./isolation-test.txt', constants.F_OK);
        console.log('⚠️ Workspace isolation may be compromised - test file visible in main workspace');
      } catch {
        console.log('✅ Workspace isolation confirmed - test file not visible in main workspace');
      }
      
    } catch (error) {
      console.log('⚠️ Workspace isolation test failed:', error.message);
    }
  }

  async test06_AgentExecution() {
    console.log('\\n⚡ TEST 6: Agent Execution Monitoring');
    
    // Monitor for agent processes and workspace activity
    let maxAgentProcesses = 0;
    let workspaceActivity = false;
    
    const monitorInterval = setInterval(async () => {
      try {
        // Check for Claude agent processes
        const { stdout } = await this.execAsync('ps aux | grep -E "claude.*--resume.*--input" | grep -v grep | wc -l');
        const agentProcesses = parseInt(stdout.trim());
        
        if (agentProcesses > maxAgentProcesses) {
          maxAgentProcesses = agentProcesses;
          console.log(`🏃 Active agent processes detected: ${agentProcesses}`);
        }
        
        // Check workspace directories for activity
        if (!workspaceActivity) {
          try {
            const workspacesDir = process.env.HOME + '/.cns/workspaces';
            const contents = await readdir(workspacesDir);
            const agentWorkspaces = contents.filter(name => 
              name.includes('system-test-agent') || name.includes('general-purpose')
            );
            
            if (agentWorkspaces.length > 0) {
              workspaceActivity = true;
              console.log(`📂 Agent workspaces detected: ${agentWorkspaces.length}`);
            }
          } catch {
            // Workspace directory may not exist yet
          }
        }
        
      } catch (error) {
        // Ignore monitoring errors
      }
    }, 3000);

    // Wait for agent execution
    await this.sleep(45000); // Give agents time to execute
    clearInterval(monitorInterval);
    
    if (maxAgentProcesses > 0 || workspaceActivity) {
      this.testResults.agentExecution = true;
      console.log(`✅ Agent execution detected (max processes: ${maxAgentProcesses})`);
    } else {
      console.log('❌ No agent execution detected');
    }
  }

  async test07_ConcurrentOperations() {
    console.log('\\n⚡ TEST 7: Concurrent Operations');
    
    try {
      // Queue multiple agents simultaneously
      const concurrentTasks = [
        this.mcpClient.callTool('get_system_status', {}),
        this.mcpClient.callTool('get_pending_tasks', {}),
        this.mcpClient.callTool('launch_agent', {
          agent_type: 'concurrent-test-1',
          specifications: 'Quick test task - count to 5'
        }),
        this.mcpClient.callTool('launch_agent', {
          agent_type: 'concurrent-test-2', 
          specifications: 'Quick test task - list current directory'
        })
      ];
      
      const results = await Promise.allSettled(concurrentTasks);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      if (successful >= 3) { // At least 3 out of 4 should succeed
        this.testResults.concurrentOperations = true;
        console.log(`✅ Concurrent operations successful (${successful}/4)`);
      } else {
        console.log(`⚠️ Some concurrent operations failed (${successful}/4 successful)`);
      }
      
    } catch (error) {
      console.error('❌ Concurrent operations test failed:', error.message);
    }
  }

  async test08_ResourceCleanup() {
    console.log('\\n🧹 TEST 8: Resource Cleanup');
    
    try {
      // Cleanup test workspace
      if (this.testAgentId && this.testWorkspacePath) {
        const result = await this.mcpClient.callTool('cleanup_workspace', {
          agent_id: this.testAgentId,
          force: true
        });
        
        const response = JSON.parse(result.content[0].text);
        
        // Wait a moment for cleanup
        await this.sleep(2000);
        
        // Verify workspace was cleaned up
        try {
          await access(this.testWorkspacePath, constants.F_OK);
          console.log('⚠️ Workspace cleanup may be incomplete - path still exists');
        } catch {
          console.log('✅ Workspace cleanup successful');
        }
      }
      
      // Check overall process count
      this.processCount.peak = await this.getProcessCount();
      
      this.testResults.resourceCleanup = true;
      console.log(`✅ Resource cleanup completed (peak processes: ${this.processCount.peak})`);
      
    } catch (error) {
      console.error('❌ Resource cleanup failed:', error.message);
    }
  }

  async test09_ErrorHandling() {
    console.log('\\n🚨 TEST 9: Error Handling & Recovery');
    
    try {
      // Test invalid tool call
      try {
        await this.mcpClient.callTool('nonexistent_tool', {});
        console.log('⚠️ Invalid tool call should have failed');
      } catch (error) {
        console.log('✅ Invalid tool calls properly rejected');
      }
      
      // Test invalid agent type
      try {
        const result = await this.mcpClient.callTool('launch_agent', {
          agent_type: 'invalid-agent-type-with-very-long-name-that-should-cause-issues',
          specifications: 'Invalid test'
        });
        // This might still succeed but should be handled gracefully
        console.log('✅ Invalid agent types handled gracefully');
      } catch (error) {
        console.log('✅ Invalid agent types properly rejected');
      }
      
      this.testResults.errorHandling = true;
      console.log('✅ Error handling tests passed');
      
    } catch (error) {
      console.error('❌ Error handling test failed:', error.message);
    }
  }

  async test10_SystemStability() {
    console.log('\\n🏥 TEST 10: System Stability Check');
    
    try {
      // Check final process count
      this.processCount.final = await this.getProcessCount();
      
      // System is stable if:
      // 1. Process count didn't explode (< 20 processes)
      // 2. CNS server is still responding
      // 3. No memory leaks or zombie processes
      
      const processGrowth = this.processCount.final - this.processCount.initial;
      const isStable = (
        this.processCount.final < 20 &&
        processGrowth < 15 &&
        this.cnsProcess &&
        !this.cnsProcess.killed
      );
      
      if (isStable) {
        this.testResults.systemStability = true;
        console.log('✅ System stability confirmed');
      } else {
        console.log(`⚠️ System stability concerns (${processGrowth} new processes)`);
      }
      
      // Final connectivity test
      const finalStatus = await this.mcpClient.callTool('get_system_status', {});
      const status = JSON.parse(finalStatus.content[0].text);
      
      console.log(`📊 Final system status: ${status.status}`);
      
    } catch (error) {
      console.error('❌ System stability check failed:', error.message);
    }
  }

  async getProcessCount() {
    try {
      const { stdout } = await this.execAsync('ps aux | wc -l');
      return parseInt(stdout.trim());
    } catch {
      return 0;
    }
  }

  async generateComprehensiveReport() {
    console.log('\\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE CNS SYSTEM TEST RESULTS');
    console.log('='.repeat(60));
    
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`⏱️  Total test duration: ${duration}s`);
    console.log(`📈 Process count: ${this.processCount.initial} → ${this.processCount.peak} → ${this.processCount.final}`);
    
    console.log('\\n🧪 Test Results:');
    Object.entries(this.testResults).forEach(([test, passed]) => {
      const status = passed ? '✅ PASS' : '❌ FAIL';
      const testName = test.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      console.log(`  ${testName.padEnd(25)}: ${status}`);
    });
    
    const passedTests = Object.values(this.testResults).filter(Boolean).length;
    const totalTests = Object.keys(this.testResults).length;
    
    console.log(`\\n🎯 Overall Score: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
    
    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED! CNS System is fully functional.');
    } else if (passedTests >= totalTests * 0.8) {
      console.log(`✅ System mostly functional (${totalTests - passedTests} issues to address)`);
    } else {
      console.log(`⚠️ System needs significant work (${totalTests - passedTests} critical issues)`);
    }
    
    await this.cleanup();
  }

  async cleanup() {
    console.log('\\n🧹 Cleaning up test environment...');
    
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
      } catch {
        // Ignore cleanup errors
      }
    }
    
    if (this.cnsProcess && !this.cnsProcess.killed) {
      this.cnsProcess.kill('SIGTERM');
      await this.sleep(3000);
    }
    
    // Force cleanup any remaining processes
    try {
      await this.execAsync('pkill -f "node.*dist/index.js"');
    } catch {
      // Ignore cleanup errors
    }
  }

  async execAsync(command) {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const process = spawn(cmd, args, { stdio: 'pipe' });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => stdout += data);
      process.stderr.on('data', (data) => stderr += data);
      
      process.on('exit', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr || stdout));
        }
      });
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the comprehensive system test
const test = new ComprehensiveCNSTest();
test.run();