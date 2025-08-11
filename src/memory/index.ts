/**
 * Memory System - Semantic search and persistent storage
 */

import { Database } from '../database/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { CNSError } from '../utils/error-handler.js';
import * as lancedb from '@lancedb/lancedb';
import { Schema, Field, FixedSizeList, Float32, Utf8, List } from 'apache-arrow';
import { EmbeddingProvider, createEmbeddingProvider } from './embedding-providers.js';

interface MemoryRecord {
  id: string;
  content: string;
  type: string;
  tags: string[];
  workflow_id?: string;
  metadata: any;
  embedding?: number[];
  created_at: string;
}


export class MemorySystem {
  private lanceDb: any;
  private memoryTable: any;
  private embeddingProvider: EmbeddingProvider | null = null;
  private embeddingDimension = 384; // Default for Transformers.js all-MiniLM-L6-v2

  constructor(private db: Database) {
    this.initializeLanceDB();
    this.initializeEmbeddingProvider();
  }

  async store(args: any) {
    logger.info('Storing memory', args);
    
    try {
      const memoryId = `memory_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const createdAt = new Date().toISOString();
      
      // Generate embedding if provider is available
      let embedding: number[] | null = null;
      if (this.embeddingProvider) {
        try {
          embedding = await this.embeddingProvider.generateEmbedding(args.content);
        } catch (error) {
          logger.warn('Failed to generate embedding, falling back to text search only', { error });
        }
      }
      
      // Store in SQLite for metadata and text search
      await this.db.run(
        'INSERT INTO memories (id, content, type, tags, workflow_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [memoryId, args.content, args.type, JSON.stringify(args.tags), args.workflow_id, 
         JSON.stringify(args.metadata), createdAt]
      );
      
      // Store in LanceDB for vector search if embedding is available
      if (embedding && this.memoryTable) {
        const vectorRecord: MemoryRecord = {
          id: memoryId,
          content: args.content,
          type: args.type,
          tags: args.tags || [],
          workflow_id: args.workflow_id,
          metadata: JSON.stringify(args.metadata || {}), // Serialize to JSON string
          embedding,
          created_at: createdAt
        };
        
        await this.memoryTable.add([vectorRecord]);
        logger.info('Stored memory in vector database', { id: memoryId });
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            status: 'stored', 
            id: memoryId,
            content_preview: args.content.substring(0, 100),
            vector_stored: !!embedding 
          }),
        }],
      };
    } catch (error) {
      logger.error('Failed to store memory', { error, args });
      throw new CNSError(
        'Memory storage failed',
        'MEMORY_STORE_ERROR',
        { error: error instanceof Error ? error.message : error }
      );
    }
  }

  async retrieve(args: any) {
    logger.info('Retrieving memory', args);
    
    const query = args.query;
    const limit = args.limit || 10;
    const threshold = args.threshold || 0.7;
    const filters = args.filters || {};
    const searchMode = args.search_mode || 'hybrid'; // 'semantic', 'text', 'hybrid'
    
    try {
      let semanticResults: any[] = [];
      let textResults: any[] = [];
      let finalResults: any[] = [];
      
      // Execute searches based on mode
      if (searchMode === 'semantic' || searchMode === 'hybrid') {
        if (this.embeddingProvider && this.memoryTable && query.trim()) {
          semanticResults = await this.performSemanticSearch(query, limit, threshold, filters);
          logger.info('Semantic search completed', { results: semanticResults.length });
        }
      }
      
      if (searchMode === 'text' || searchMode === 'hybrid') {
        textResults = await this.performTextSearch(query, limit, filters);
        logger.info('Text search completed', { results: textResults.length });
      }
      
      // Combine results based on mode
      if (searchMode === 'hybrid') {
        finalResults = this.combineSearchResults(semanticResults, textResults, limit);
      } else if (searchMode === 'semantic') {
        finalResults = semanticResults.slice(0, limit);
      } else if (searchMode === 'text') {
        finalResults = textResults.slice(0, limit);
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            results: finalResults,
            count: finalResults.length,
            search_config: {
              mode: searchMode,
              threshold: threshold,
              limit: limit,
              query_length: query.length
            },
            search_methods: {
              semantic: semanticResults.length > 0,
              text: textResults.length > 0,
              embedding_provider: this.embeddingProvider?.getName() || null,
              hybrid_results: finalResults.filter(r => r.search_method === 'hybrid').length
            }
          }),
        }],
      };
      
    } catch (error) {
      logger.error('Memory retrieval failed', { error, query });
      throw new CNSError(
        'Memory retrieval failed',
        'MEMORY_RETRIEVE_ERROR',
        { error: error instanceof Error ? error.message : error }
      );
    }
  }

  async getStats() {
    const count = await this.db.get('SELECT COUNT(*) as count FROM memories');
    
    let vectorStats = { vector_memories: 0, embedding_provider: null as string | null };
    // Only count vector memories if there's an active embedding provider
    if (this.memoryTable && this.embeddingProvider) {
      try {
        const vectorCount = await this.memoryTable.countRows();
        vectorStats = {
          vector_memories: vectorCount,
          embedding_provider: this.embeddingProvider.getName()
        };
      } catch (error) {
        logger.warn('Failed to get vector database stats', { error });
      }
    } else {
      vectorStats.embedding_provider = this.embeddingProvider ? this.embeddingProvider.getName() : 'none';
    }
    
    return { 
      total_memories: count?.count || 0,
      ...vectorStats
    };
  }

  async listMemories(options: {
    type?: string;
    workflow_id?: string;
    limit?: number;
    offset?: number;
    order_by?: 'created_at' | 'type';
    order?: 'ASC' | 'DESC';
  } = {}) {
    const {
      type,
      workflow_id,
      limit = 20,
      offset = 0,
      order_by = 'created_at',
      order = 'DESC'
    } = options;

    let query = 'SELECT * FROM memories';
    const conditions: string[] = [];
    const params: any[] = [];

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (workflow_id) {
      conditions.push('workflow_id = ?');
      params.push(workflow_id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY ${order_by} ${order} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    try {
      const memories = await this.db.all(query, params);
      
      // Parse tags JSON for each memory
      const parsedMemories = memories.map((memory: any) => ({
        ...memory,
        tags: memory.tags ? JSON.parse(memory.tags) : [],
        metadata: memory.metadata ? JSON.parse(memory.metadata) : {}
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              count: memories.length,
              memories: parsedMemories,
              filters: { type, workflow_id },
              pagination: { limit, offset, order_by, order }
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to list memories', { error, options });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to list memories',
              message: error instanceof Error ? error.message : 'Unknown error'
            }, null, 2),
          },
        ],
      };
    }
  }

  private async initializeLanceDB() {
    try {
      // Connect to LanceDB using configured path
      const lancedbPath = config.memory.lancedb_path || './data/lancedb';
      this.lanceDb = await lancedb.connect(lancedbPath);
      
      // Define proper Apache Arrow schema for memory table
      const schema = new Schema([
        new Field('id', new Utf8(), false),
        new Field('content', new Utf8(), false),
        new Field('type', new Utf8(), false),
        new Field('tags', new List(new Field('item', new Utf8(), true)), true), // Array of strings
        new Field('workflow_id', new Utf8(), true), // Nullable
        new Field('metadata', new Utf8(), true), // JSON string, nullable
        new Field('embedding', new FixedSizeList(this.embeddingDimension, new Field('item', new Float32(), true)), true), // Vector, nullable
        new Field('created_at', new Utf8(), false)
      ]);
      
      // Create or open memory table
      try {
        this.memoryTable = await this.lanceDb.openTable('memories');
        logger.info('Opened existing LanceDB memory table');
      } catch {
        // Table doesn't exist, create it
        this.memoryTable = await this.lanceDb.createEmptyTable('memories', schema);
        logger.info('Created new LanceDB memory table');
      }
      
    } catch (error) {
      // Log specific error details for debugging
      if (error instanceof Error) {
        logger.warn('Failed to initialize LanceDB, vector search will be disabled', { 
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
        });
      } else {
        logger.warn('Failed to initialize LanceDB, vector search will be disabled', { error });
      }
      this.lanceDb = null;
      this.memoryTable = null;
    }
  }

  private initializeEmbeddingProvider() {
    try {
      this.embeddingProvider = createEmbeddingProvider(config.memory);
      if (this.embeddingProvider) {
        // Update dimension based on the actual provider
        this.embeddingDimension = this.embeddingProvider.getDimension();
        logger.info('Embedding provider initialized', { 
          provider: this.embeddingProvider.getName(),
          dimension: this.embeddingProvider.getDimension()
        });
      }
    } catch (error) {
      logger.warn('Failed to initialize embedding provider', { error });
      this.embeddingProvider = null;
    }
  }

  public setEmbeddingProvider(provider: EmbeddingProvider) {
    this.embeddingProvider = provider;
    logger.info('Embedding provider configured for memory system');
  }

  public getEmbeddingProvider(): EmbeddingProvider | null {
    return this.embeddingProvider;
  }

  private async performSemanticSearch(
    query: string, 
    limit: number, 
    threshold: number, 
    filters: any
  ): Promise<any[]> {
    if (!this.embeddingProvider || !this.memoryTable) {
      return [];
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
      
      // Perform vector search in LanceDB
      let searchQuery = this.memoryTable.search(queryEmbedding).limit(limit * 2); // Get more for filtering
      
      // Apply filters if provided
      if (filters.type) {
        searchQuery = searchQuery.where(`type = '${filters.type}'`);
      }
      if (filters.workflow_id) {
        searchQuery = searchQuery.where(`workflow_id = '${filters.workflow_id}'`);
      }
      
      const vectorResults = await searchQuery.toArray();
      
      // Filter by similarity threshold and format results
      const filteredResults = vectorResults
        .filter((result: any) => result._distance <= (1 - threshold)) // LanceDB uses distance, convert from similarity
        .map((result: any) => ({
          id: result.id,
          content: result.content,
          type: result.type,
          tags: result.tags,
          workflow_id: result.workflow_id,
          metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata,
          created_at: result.created_at,
          similarity: 1 - result._distance,
          search_method: 'semantic'
        }))
        .slice(0, limit);

      return filteredResults;

    } catch (error) {
      logger.warn('Semantic search failed, falling back to text search', { error });
      return [];
    }
  }

  private async performTextSearch(query: string, limit: number, filters: any): Promise<any[]> {
    try {
      let sql = 'SELECT * FROM memories WHERE content LIKE ?';
      const params: any[] = [`%${query}%`];
      
      // Apply filters
      if (filters.type) {
        sql += ' AND type = ?';
        params.push(filters.type);
      }
      if (filters.workflow_id) {
        sql += ' AND workflow_id = ?';
        params.push(filters.workflow_id);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);
      
      const results = await this.db.all(sql, params);
      
      return results.map((result: any) => ({
        ...result,
        tags: result.tags ? JSON.parse(result.tags) : [],
        metadata: result.metadata ? JSON.parse(result.metadata) : {},
        search_method: 'text'
      }));
      
    } catch (error) {
      logger.error('Text search failed', { error });
      return [];
    }
  }

  private combineSearchResults(semanticResults: any[], textResults: any[], limit: number): any[] {
    // Create a map to track unique results by ID
    const resultMap = new Map();
    
    // Add semantic results first (higher priority)
    semanticResults.forEach(result => {
      resultMap.set(result.id, { ...result, rank_boost: 1.0 });
    });
    
    // Add text results, but don't override semantic results
    textResults.forEach(result => {
      if (!resultMap.has(result.id)) {
        resultMap.set(result.id, { ...result, rank_boost: 0.5 });
      } else {
        // Mark that this result was found in both searches
        const existing = resultMap.get(result.id);
        existing.search_method = 'hybrid';
        existing.rank_boost += 0.3;
      }
    });
    
    // Convert to array and sort by relevance
    const combinedResults = Array.from(resultMap.values())
      .sort((a, b) => {
        // Sort by similarity (if available) and rank boost
        const aScore = (a.similarity || 0.5) * a.rank_boost;
        const bScore = (b.similarity || 0.5) * b.rank_boost;
        return bScore - aScore;
      })
      .slice(0, limit);
    
    // Clean up temporary fields
    return combinedResults.map(result => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { rank_boost, ...cleanResult } = result;
      return cleanResult;
    });
  }
}