/**
 * Memory System - Semantic search and persistent storage
 */
import { Database } from '../database/index.js';
import { EmbeddingProvider } from './embedding-providers.js';
export declare class MemorySystem {
    private db;
    private lanceDb;
    private memoryTable;
    private embeddingProvider;
    private embeddingDimension;
    constructor(db: Database);
    store(args: any): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    retrieve(args: any): Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    getStats(): Promise<{
        vector_memories: number;
        embedding_provider: string | null;
        total_memories: any;
    }>;
    private initializeLanceDB;
    private initializeEmbeddingProvider;
    setEmbeddingProvider(provider: EmbeddingProvider): void;
    getEmbeddingProvider(): EmbeddingProvider | null;
    private performSemanticSearch;
    private performTextSearch;
    private combineSearchResults;
}
//# sourceMappingURL=index.d.ts.map