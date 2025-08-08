/**
 * Memory System - Semantic search and persistent storage
 */
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { CNSError } from '../utils/error-handler.js';
import * as lancedb from '@lancedb/lancedb';
import { Schema, Field, FixedSizeList, Float32, Utf8, List } from 'apache-arrow';
import { createEmbeddingProvider } from './embedding-providers.js';
export class MemorySystem {
    db;
    lanceDb;
    memoryTable;
    embeddingProvider = null;
    embeddingDimension = 1536; // OpenAI text-embedding-3-small dimension
    constructor(db) {
        this.db = db;
        this.initializeLanceDB();
        this.initializeEmbeddingProvider();
    }
    async store(args) {
        logger.info('Storing memory', args);
        try {
            const memoryId = `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const createdAt = new Date().toISOString();
            // Generate embedding if provider is available
            let embedding = null;
            if (this.embeddingProvider) {
                try {
                    embedding = await this.embeddingProvider.generateEmbedding(args.content);
                }
                catch (error) {
                    logger.warn('Failed to generate embedding, falling back to text search only', { error });
                }
            }
            // Store in SQLite for metadata and text search
            await this.db.run('INSERT INTO memories (id, content, type, tags, workflow_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [memoryId, args.content, args.type, JSON.stringify(args.tags), args.workflow_id,
                JSON.stringify(args.metadata), createdAt]);
            // Store in LanceDB for vector search if embedding is available
            if (embedding && this.memoryTable) {
                const vectorRecord = {
                    id: memoryId,
                    content: args.content,
                    type: args.type,
                    tags: args.tags || [],
                    workflow_id: args.workflow_id,
                    metadata: args.metadata || {},
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
        }
        catch (error) {
            logger.error('Failed to store memory', { error, args });
            throw new CNSError('Memory storage failed', 'MEMORY_STORE_ERROR', { error: error instanceof Error ? error.message : error });
        }
    }
    async retrieve(args) {
        logger.info('Retrieving memory', args);
        const query = args.query;
        const limit = args.limit || 10;
        const threshold = args.threshold || 0.7;
        const filters = args.filters || {};
        const searchMode = args.search_mode || 'hybrid'; // 'semantic', 'text', 'hybrid'
        try {
            let semanticResults = [];
            let textResults = [];
            let finalResults = [];
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
            }
            else if (searchMode === 'semantic') {
                finalResults = semanticResults.slice(0, limit);
            }
            else if (searchMode === 'text') {
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
        }
        catch (error) {
            logger.error('Memory retrieval failed', { error, query });
            throw new CNSError('Memory retrieval failed', 'MEMORY_RETRIEVE_ERROR', { error: error instanceof Error ? error.message : error });
        }
    }
    async getStats() {
        const count = await this.db.get('SELECT COUNT(*) as count FROM memories');
        let vectorStats = { vector_memories: 0, embedding_provider: null };
        if (this.memoryTable) {
            try {
                const vectorCount = await this.memoryTable.countRows();
                vectorStats = {
                    vector_memories: vectorCount,
                    embedding_provider: this.embeddingProvider ? 'configured' : 'none'
                };
            }
            catch (error) {
                logger.warn('Failed to get vector database stats', { error });
            }
        }
        return {
            total_memories: count?.count || 0,
            ...vectorStats
        };
    }
    async initializeLanceDB() {
        try {
            // Connect to LanceDB
            this.lanceDb = await lancedb.connect('./data/lancedb');
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
            }
            catch {
                // Table doesn't exist, create it
                this.memoryTable = await this.lanceDb.createEmptyTable('memories', schema);
                logger.info('Created new LanceDB memory table');
            }
        }
        catch (error) {
            // Log specific error details for debugging
            if (error instanceof Error) {
                logger.warn('Failed to initialize LanceDB, vector search will be disabled', {
                    error: error.message,
                    stack: error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
                });
            }
            else {
                logger.warn('Failed to initialize LanceDB, vector search will be disabled', { error });
            }
            this.lanceDb = null;
            this.memoryTable = null;
        }
    }
    initializeEmbeddingProvider() {
        try {
            this.embeddingProvider = createEmbeddingProvider(config.memory);
            if (this.embeddingProvider) {
                logger.info('Embedding provider initialized', {
                    provider: this.embeddingProvider.getName(),
                    dimension: this.embeddingProvider.getDimension()
                });
            }
        }
        catch (error) {
            logger.warn('Failed to initialize embedding provider', { error });
            this.embeddingProvider = null;
        }
    }
    setEmbeddingProvider(provider) {
        this.embeddingProvider = provider;
        logger.info('Embedding provider configured for memory system');
    }
    getEmbeddingProvider() {
        return this.embeddingProvider;
    }
    async performSemanticSearch(query, limit, threshold, filters) {
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
                .filter((result) => result._distance <= (1 - threshold)) // LanceDB uses distance, convert from similarity
                .map((result) => ({
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
        }
        catch (error) {
            logger.warn('Semantic search failed, falling back to text search', { error });
            return [];
        }
    }
    async performTextSearch(query, limit, filters) {
        try {
            let sql = 'SELECT * FROM memories WHERE content LIKE ?';
            let params = [`%${query}%`];
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
            return results.map((result) => ({
                ...result,
                tags: result.tags ? JSON.parse(result.tags) : [],
                metadata: result.metadata ? JSON.parse(result.metadata) : {},
                search_method: 'text'
            }));
        }
        catch (error) {
            logger.error('Text search failed', { error });
            return [];
        }
    }
    combineSearchResults(semanticResults, textResults, limit) {
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
            }
            else {
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
            const { rank_boost, ...cleanResult } = result;
            return cleanResult;
        });
    }
}
//# sourceMappingURL=index.js.map