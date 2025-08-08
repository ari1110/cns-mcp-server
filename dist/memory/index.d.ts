/**
 * Memory System - Semantic search and persistent storage
 */
import { Database } from '../database/index.js';
export declare class MemorySystem {
    private db;
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
        total_memories: any;
    }>;
}
//# sourceMappingURL=index.d.ts.map