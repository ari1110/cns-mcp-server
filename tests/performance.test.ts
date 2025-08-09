/**
 * Performance and load testing for CNS MCP Server components
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { rm } from 'fs/promises';
import { Database } from '../src/database/index.js';
import { MemorySystem } from '../src/memory/index.js';
import { OrchestrationEngine } from '../src/orchestration/engine.js';
import { WorkspaceManager } from '../src/workspaces/index.js';
import { MockEmbeddingProvider } from '../src/memory/embedding-providers.js';

describe('Performance Tests', () => {
  let database: Database;
  let memorySystem: MemorySystem;
  let orchestrationEngine: OrchestrationEngine;
  let workspaceManager: WorkspaceManager;

  beforeEach(async () => {
    // Set unique LanceDB path for this test
    const testId = Math.random().toString(36).substring(2, 11);
    process.env.LANCEDB_PATH = `./test-lancedb-performance-${testId}`;
    
    // Clean up
    try {
      await rm('./test-performance.db');
    } catch {}

    // Initialize components
    database = new Database({ path: './test-performance.db' });
    await database.initialize();
    
    memorySystem = new MemorySystem(database);
    workspaceManager = new WorkspaceManager({
      workspaces_dir: '/tmp/cns-perf-test'
    });
    
    orchestrationEngine = new OrchestrationEngine(database, memorySystem, workspaceManager);
    await orchestrationEngine.start();
  });

  describe('Memory System Performance', () => {
    test('should handle bulk memory storage efficiently', async () => {
      const startTime = Date.now();
      const testData: Array<{
        content: string;
        type: string;
        tags: string[];
        metadata: {
          index: number;
          category: string;
          timestamp: string;
        };
      }> = [];
      const batchSize = 100;

      // Generate test data
      for (let i = 0; i < batchSize; i++) {
        testData.push({
          content: `Test memory item ${i} with various content about software development, testing, and performance optimization techniques. This is item number ${i} in our performance test suite.`,
          type: 'test-data',
          tags: ['performance', 'test', `batch-${Math.floor(i / 10)}`],
          metadata: { 
            index: i, 
            category: i % 5 === 0 ? 'important' : 'regular',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Store all memories
      const storePromises = testData.map(data => memorySystem.store(data));
      await Promise.all(storePromises);

      const storageTime = Date.now() - startTime;
      const avgTimePerItem = storageTime / batchSize;

      console.log(`Stored ${batchSize} memories in ${storageTime}ms (${avgTimePerItem.toFixed(2)}ms per item)`);

      // Performance expectations (adjust based on environment)
      expect(storageTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(avgTimePerItem).toBeLessThan(50); // Should be less than 50ms per item
      
      // Verify all were stored
      const stats = await memorySystem.getStats();
      expect(stats.total_memories).toBe(batchSize);
    });

    test('should handle concurrent memory retrieval efficiently', async () => {
      // Store test data first
      const testQueries = [
        'software development',
        'performance optimization',
        'testing techniques',
        'database operations',
        'concurrent processing'
      ];

      // Store relevant data for each query
      for (const query of testQueries) {
        await memorySystem.store({
          content: `Content related to ${query} and various implementation details`,
          type: 'reference',
          tags: query.split(' ')
        });
      }

      const startTime = Date.now();
      const concurrentSearches = 50;

      // Perform concurrent searches
      const searchPromises = Array.from({ length: concurrentSearches }, (_, i) => {
        const query = testQueries[i % testQueries.length];
        return memorySystem.retrieve({ query, limit: 5 });
      });

      const results = await Promise.all(searchPromises);
      const searchTime = Date.now() - startTime;
      const avgSearchTime = searchTime / concurrentSearches;

      console.log(`Completed ${concurrentSearches} concurrent searches in ${searchTime}ms (${avgSearchTime.toFixed(2)}ms per search)`);

      // Performance expectations
      expect(searchTime).toBeLessThan(2000); // All searches within 2 seconds
      expect(avgSearchTime).toBeLessThan(40); // Average search under 40ms
      
      // Verify all searches completed successfully
      results.forEach(result => {
        const response = JSON.parse(result.content[0].text);
        expect(response.results).toBeInstanceOf(Array);
      });
    });

    test('should handle memory system with embedding provider efficiently', async () => {
      // Set up mock embedding provider
      const mockProvider = new MockEmbeddingProvider(512); // Smaller dimension for speed
      memorySystem.setEmbeddingProvider(mockProvider);

      const startTime = Date.now();
      const itemCount = 20; // Fewer items since embeddings are slower

      // Store data with embeddings
      const storePromises = Array.from({ length: itemCount }, (_, i) => 
        memorySystem.store({
          content: `Embedding test content ${i} about artificial intelligence and machine learning applications`,
          type: 'ai-content',
          tags: ['ai', 'ml', `item-${i}`]
        })
      );

      await Promise.all(storePromises);
      const embeddingTime = Date.now() - startTime;
      const avgEmbeddingTime = embeddingTime / itemCount;

      console.log(`Stored ${itemCount} items with embeddings in ${embeddingTime}ms (${avgEmbeddingTime.toFixed(2)}ms per item)`);

      // Performance expectations for embedding operations
      expect(embeddingTime).toBeLessThan(3000); // Should complete within 3 seconds
      expect(avgEmbeddingTime).toBeLessThan(150); // Under 150ms per item with embedding
    });
  });

  describe('Orchestration Engine Performance', () => {
    test('should handle high volume workflow creation', async () => {
      const startTime = Date.now();
      const workflowCount = 100;

      // Create many workflows concurrently
      const launchPromises = Array.from({ length: workflowCount }, (_, i) =>
        orchestrationEngine.launchAgent({
          agent_type: `perf-agent-${i}`,
          specifications: `Performance test workflow ${i} with detailed specifications`
        })
      );

      const results = await Promise.all(launchPromises);
      const creationTime = Date.now() - startTime;
      const avgCreationTime = creationTime / workflowCount;

      console.log(`Created ${workflowCount} workflows in ${creationTime}ms (${avgCreationTime.toFixed(2)}ms per workflow)`);

      // Performance expectations
      expect(creationTime).toBeLessThan(10000); // Within 10 seconds
      expect(avgCreationTime).toBeLessThan(100); // Under 100ms per workflow

      // Verify all workflows were created successfully
      results.forEach((result, i) => {
        const response = JSON.parse(result.content[0].text);
        expect(response.status).toBe('queued');
        expect(response.agent_type).toBe(`perf-agent-${i}`);
      });

      // Check system stats
      const stats = await orchestrationEngine.getStats();
      expect(stats.workflows).toBeGreaterThanOrEqual(workflowCount);
      expect(stats.pending_tasks).toBeGreaterThanOrEqual(workflowCount);
    });

    test('should handle concurrent completions efficiently', async () => {
      // First create some workflows
      const workflowResults = await Promise.all([
        orchestrationEngine.launchAgent({
          agent_type: 'completion-test-1',
          specifications: 'Test completion performance'
        }),
        orchestrationEngine.launchAgent({
          agent_type: 'completion-test-2', 
          specifications: 'Test completion performance'
        }),
        orchestrationEngine.launchAgent({
          agent_type: 'completion-test-3',
          specifications: 'Test completion performance'
        })
      ]);

      const workflowIds = workflowResults.map(result => 
        JSON.parse(result.content[0].text).workflow_id
      );

      const startTime = Date.now();
      const completionCount = 50;

      // Perform many concurrent completions
      const completionPromises = Array.from({ length: completionCount }, (_, i) =>
        orchestrationEngine.signalCompletion({
          agent_id: `completion-agent-${i}`,
          workflow_id: workflowIds[i % workflowIds.length],
          result: `Completion result ${i} with detailed information about task completion`,
          artifacts: [
            { type: 'file', name: `output-${i}.json`, size: '1KB' }
          ]
        })
      );

      const completionResults = await Promise.all(completionPromises);
      const completionTime = Date.now() - startTime;
      const avgCompletionTime = completionTime / completionCount;

      console.log(`Processed ${completionCount} completions in ${completionTime}ms (${avgCompletionTime.toFixed(2)}ms per completion)`);

      // Performance expectations
      expect(completionTime).toBeLessThan(5000); // Within 5 seconds
      expect(avgCompletionTime).toBeLessThan(100); // Under 100ms per completion

      // Verify all completions were recorded
      completionResults.forEach(result => {
        const response = JSON.parse(result.content[0].text);
        expect(response.status).toBe('recorded');
      });
    });
  });

  describe('Database Performance', () => {
    test('should handle high volume database operations', async () => {
      const startTime = Date.now();
      const operationCount = 100; // Reduced for reliable test performance

      // Perform many database writes
      const writePromises = Array.from({ length: operationCount }, (_, i) =>
        database.run(
          'INSERT INTO memories (id, content, type, tags, created_at) VALUES (?, ?, ?, ?, ?)',
          [
            `perf-memory-${i}`,
            `Performance test content ${i}`,
            'performance-test',
            JSON.stringify(['perf', `batch-${Math.floor(i / 50)}`]),
            new Date().toISOString()
          ]
        )
      );

      await Promise.all(writePromises);
      const writeTime = Date.now() - startTime;

      // Perform many database reads
      const readStartTime = Date.now();
      const readPromises = Array.from({ length: operationCount }, (_, i) =>
        database.get(
          'SELECT * FROM memories WHERE id = ?',
          [`perf-memory-${i}`]
        )
      );

      const readResults = await Promise.all(readPromises);
      const readTime = Date.now() - readStartTime;

      console.log(`Database: ${operationCount} writes in ${writeTime}ms, ${operationCount} reads in ${readTime}ms`);

      // Performance expectations (adjusted for test environment)
      expect(writeTime).toBeLessThan(3000); // Writes within 3 seconds (100 operations)
      expect(readTime).toBeLessThan(1000); // Reads within 1 second

      // Verify operations succeeded
      expect(readResults.filter(r => r !== undefined)).toHaveLength(operationCount);
    });

    test('should maintain performance under memory pressure', async () => {
      const startTime = Date.now();
      let operationsCompleted = 0;

      // Simulate mixed workload for 2 seconds
      const endTime = startTime + 2000;
      const operations: Promise<any>[] = [];

      while (Date.now() < endTime) {
        // Mix of different operations
        operations.push(
          memorySystem.store({
            content: `Memory pressure test ${operationsCompleted}`,
            type: 'pressure-test'
          }),
          orchestrationEngine.launchAgent({
            agent_type: 'pressure-agent',
            specifications: 'Handle memory pressure'
          }),
          database.get('SELECT COUNT(*) as count FROM memories')
        );
        
        operationsCompleted += 3;
        
        // Add small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const results = await Promise.all(operations);
      const totalTime = Date.now() - startTime;
      const opsPerSecond = operationsCompleted / (totalTime / 1000);

      console.log(`Memory pressure test: ${operationsCompleted} operations in ${totalTime}ms (${opsPerSecond.toFixed(2)} ops/sec)`);

      // Performance expectations under pressure
      expect(opsPerSecond).toBeGreaterThan(10); // At least 10 ops per second
      expect(results.filter(r => r !== undefined)).toHaveLength(operationsCompleted);
    });
  });

  describe('System Resource Usage', () => {
    test('should monitor memory usage during operations', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform memory-intensive operations
      await Promise.all([
        // Large memory store operations
        ...Array.from({ length: 50 }, (_, i) => 
          memorySystem.store({
            content: 'x'.repeat(1000) + ` Memory usage test ${i}`, // 1KB+ content
            type: 'large-content',
            tags: Array.from({ length: 10 }, (_, j) => `tag-${j}`)
          })
        ),
        
        // Multiple workflow operations
        ...Array.from({ length: 20 }, (_, i) =>
          orchestrationEngine.launchAgent({
            agent_type: `memory-test-${i}`,
            specifications: 'x'.repeat(500) + ` Large specification ${i}`
          })
        )
      ]);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      console.log(`Memory usage increased by ${memoryIncreaseMB.toFixed(2)}MB`);

      // Memory usage expectations (should not grow excessively)
      expect(memoryIncreaseMB).toBeLessThan(100); // Should not use more than 100MB additional
      expect(finalMemory.heapUsed).toBeLessThan(500 * 1024 * 1024); // Total under 500MB
    });

    test('should handle cleanup efficiently', async () => {
      // Create some test data that would need cleanup
      const workspaceIds: string[] = [];
      
      for (let i = 0; i < 5; i++) {
        const result = await orchestrationEngine.launchAgent({
          agent_type: `cleanup-test-${i}`,
          specifications: 'Test cleanup performance'
        });
        const response = JSON.parse(result.content[0].text);
        workspaceIds.push(response.workflow_id);
      }

      const startTime = Date.now();
      
      // Trigger cleanup operations (simulate what would happen in scheduled cleanup)
      await Promise.all([
        orchestrationEngine.processScheduledCleanups(),
        ...workspaceIds.map(id => 
          workspaceManager.cleanup({ agent_id: id })
            .catch(() => {}) // Ignore cleanup errors in test
        )
      ]);

      const cleanupTime = Date.now() - startTime;
      
      console.log(`Cleanup operations completed in ${cleanupTime}ms`);
      
      // Cleanup should be fast
      expect(cleanupTime).toBeLessThan(1000); // Under 1 second
    });
  });
});