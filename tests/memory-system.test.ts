/**
 * Tests for memory system including semantic search, text search, and hybrid functionality
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { rm } from 'fs/promises';
import { Database } from '../src/database/index.js';
import { MemorySystem } from '../src/memory/index.js';
import { MockEmbeddingProvider, OpenAIEmbeddingProvider } from '../src/memory/embedding-providers.js';

describe('Memory System Tests', () => {
  let database: Database;
  let memorySystem: MemorySystem;

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await rm('./test-cns.db');
    } catch {
      // Database doesn't exist
    }

    // Initialize fresh database and memory system
    database = new Database({ path: './test-cns.db' });
    await database.initialize();
    memorySystem = new MemorySystem(database);
  });

  describe('Basic Storage and Retrieval', () => {
    test('should store memory successfully', async () => {
      const result = await memorySystem.store({
        content: 'This is a test memory about machine learning algorithms',
        type: 'knowledge',
        tags: ['ml', 'algorithms', 'test'],
        workflow_id: 'test-workflow-1',
        metadata: { importance: 'high', source: 'test' }
      });

      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('stored');
      expect(response.id).toMatch(/^memory_\d+_[a-z0-9]+$/);
      expect(response.content_preview).toBe('This is a test memory about machine learning algorithms');
      expect(response.vector_stored).toBe(false); // No embedding provider configured
    });

    test('should retrieve memories using text search', async () => {
      // Store multiple memories
      await memorySystem.store({
        content: 'Python is a great programming language for data science',
        type: 'knowledge',
        tags: ['python', 'programming'],
        workflow_id: 'workflow-1'
      });

      await memorySystem.store({
        content: 'JavaScript is excellent for web development',
        type: 'knowledge', 
        tags: ['javascript', 'web'],
        workflow_id: 'workflow-2'
      });

      // Search for Python content (search for exact word that exists)
      const result = await memorySystem.retrieve({
        query: 'Python',
        limit: 10
      });

      const response = JSON.parse(result.content[0].text);
      
      expect(response.results).toBeInstanceOf(Array);
      expect(response.count).toBeGreaterThan(0);
      expect(response.search_methods.text).toBe(true);
      expect(response.search_methods.semantic).toBe(false);
      expect(response.search_methods.embedding_provider).toBe(null);

      // Should find the Python memory
      const pythonMemory = response.results.find((r: any) => r.content.includes('Python'));
      expect(pythonMemory).toBeDefined();
      expect(pythonMemory.search_method).toBe('text');
    });

    test('should filter memories by type and workflow', async () => {
      // Store memories with different types and workflows
      await memorySystem.store({
        content: 'Specification for user authentication',
        type: 'specification',
        workflow_id: 'auth-workflow'
      });

      await memorySystem.store({
        content: 'Implementation of login function completed',
        type: 'completion',
        workflow_id: 'auth-workflow'
      });

      await memorySystem.store({
        content: 'Different workflow specification',
        type: 'specification',
        workflow_id: 'other-workflow'
      });

      // Filter by type
      const typeResult = await memorySystem.retrieve({
        query: 'specification',
        filters: { type: 'specification' }
      });

      const typeResponse = JSON.parse(typeResult.content[0].text);
      expect(typeResponse.results.every((r: any) => r.type === 'specification')).toBe(true);

      // Filter by workflow
      const workflowResult = await memorySystem.retrieve({
        query: 'auth',
        filters: { workflow_id: 'auth-workflow' }
      });

      const workflowResponse = JSON.parse(workflowResult.content[0].text);
      expect(workflowResponse.results.every((r: any) => r.workflow_id === 'auth-workflow')).toBe(true);
    });
  });

  describe('Embedding Provider Integration', () => {
    test('should work with mock embedding provider', async () => {
      // Set up mock embedding provider
      const mockProvider = new MockEmbeddingProvider(128); // Smaller dimension for testing
      memorySystem.setEmbeddingProvider(mockProvider);

      expect(memorySystem.getEmbeddingProvider()).toBe(mockProvider);

      // Store memory with embeddings
      const result = await memorySystem.store({
        content: 'Test content for semantic search with machine learning concepts',
        type: 'knowledge',
        tags: ['test', 'ml']
      });

      const response = JSON.parse(result.content[0].text);
      // LanceDB should not be available in test environment, but embedding provider is set
      expect(typeof response.vector_stored).toBe('boolean');
    });

    test('should handle embedding generation errors gracefully', async () => {
      // Create a mock provider that throws errors
      const errorProvider = {
        generateEmbedding: async () => { throw new Error('API Error'); },
        getDimension: () => 1536,
        getName: () => 'Error Provider'
      };

      memorySystem.setEmbeddingProvider(errorProvider);

      // Should still store successfully, just without embeddings
      const result = await memorySystem.store({
        content: 'This should store even if embedding fails',
        type: 'test'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('stored');
      expect(response.vector_stored).toBe(false);
    });
  });

  describe('Search Modes', () => {
    beforeEach(async () => {
      // Store test data
      await memorySystem.store({
        content: 'Machine learning algorithms for data analysis',
        type: 'knowledge',
        tags: ['ml', 'data']
      });

      await memorySystem.store({
        content: 'Web development with modern JavaScript frameworks',
        type: 'knowledge', 
        tags: ['web', 'js']
      });
    });

    test('should support text search mode', async () => {
      const result = await memorySystem.retrieve({
        query: 'machine learning',
        search_mode: 'text'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.search_config.mode).toBe('text');
      expect(response.search_methods.text).toBe(true);
      expect(response.search_methods.semantic).toBe(false);
    });

    test('should support semantic search mode (falls back to text)', async () => {
      const result = await memorySystem.retrieve({
        query: 'artificial intelligence',
        search_mode: 'semantic'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.search_config.mode).toBe('semantic');
      // Without LanceDB configured, should have no semantic results
      expect(response.search_methods.semantic).toBe(false);
      expect(response.results).toBeInstanceOf(Array);
    });

    test('should support hybrid search mode', async () => {
      const result = await memorySystem.retrieve({
        query: 'development',
        search_mode: 'hybrid'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.search_config.mode).toBe('hybrid');
      expect(response.search_methods.text).toBe(true);
      expect(response.results).toBeInstanceOf(Array);
    });

    test('should respect limit and threshold parameters', async () => {
      const result = await memorySystem.retrieve({
        query: 'test',
        limit: 1,
        threshold: 0.8
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.search_config.limit).toBe(1);
      expect(response.search_config.threshold).toBe(0.8);
      expect(response.results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Statistics and Health', () => {
    test('should provide accurate memory statistics', async () => {
      const initialStats = await memorySystem.getStats();
      expect(initialStats.total_memories).toBe(0);

      // Store some memories
      await memorySystem.store({ content: 'Test 1', type: 'test' });
      await memorySystem.store({ content: 'Test 2', type: 'test' });

      const updatedStats = await memorySystem.getStats();
      expect(updatedStats.total_memories).toBe(2);
      expect(updatedStats.vector_memories).toBe(0); // No LanceDB
      expect(updatedStats.embedding_provider).toBe(null);
    });

    test('should handle edge cases gracefully', async () => {
      // Empty query
      const emptyResult = await memorySystem.retrieve({ query: '' });
      const emptyResponse = JSON.parse(emptyResult.content[0].text);
      expect(emptyResponse.results).toBeInstanceOf(Array);

      // Very long query
      const longQuery = 'a'.repeat(1000);
      const longResult = await memorySystem.retrieve({ query: longQuery });
      const longResponse = JSON.parse(longResult.content[0].text);
      expect(longResponse.search_config.query_length).toBe(1000);

      // Invalid limit
      const invalidResult = await memorySystem.retrieve({ 
        query: 'test', 
        limit: -1 
      });
      const invalidResponse = JSON.parse(invalidResult.content[0].text);
      expect(invalidResponse.results).toBeInstanceOf(Array);
    });
  });
});

describe('Embedding Providers', () => {
  describe('MockEmbeddingProvider', () => {
    test('should generate consistent embeddings', async () => {
      const provider = new MockEmbeddingProvider(64);
      
      expect(provider.getName()).toBe('Mock-Provider');
      expect(provider.getDimension()).toBe(64);

      const embedding1 = await provider.generateEmbedding('test text');
      const embedding2 = await provider.generateEmbedding('test text');
      const embedding3 = await provider.generateEmbedding('different text');

      expect(embedding1.length).toBe(64);
      expect(embedding2.length).toBe(64);
      expect(embedding3.length).toBe(64);

      // Same text should produce same embedding
      expect(embedding1).toEqual(embedding2);
      
      // Different text should produce different embedding
      expect(embedding1).not.toEqual(embedding3);

      // Embeddings should be normalized (approximately unit length)
      const magnitude = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1.0, 2);
    });

    test('should handle empty text', async () => {
      const provider = new MockEmbeddingProvider();
      
      await expect(provider.generateEmbedding('')).rejects.toThrow('Text cannot be empty');
      await expect(provider.generateEmbedding('   ')).rejects.toThrow('Text cannot be empty');
    });
  });

  describe('OpenAIEmbeddingProvider', () => {
    test('should configure properly', () => {
      const provider = new OpenAIEmbeddingProvider('test-key', 'test-model', 512);
      
      expect(provider.getName()).toBe('OpenAI-test-model');
      expect(provider.getDimension()).toBe(512);
    });

    test('should handle missing API key', async () => {
      const provider = new OpenAIEmbeddingProvider('', 'text-embedding-3-small');
      
      // This would fail in real scenario due to missing API key
      await expect(provider.generateEmbedding('test')).rejects.toThrow();
    });
  });
});