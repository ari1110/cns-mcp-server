/**
 * Embedding providers for semantic search
 */
export interface EmbeddingProvider {
    generateEmbedding(text: string): Promise<number[]>;
    getDimension(): number;
    getName(): string;
}
/**
 * OpenAI Embedding Provider
 * Uses OpenAI's text-embedding-3-small model
 */
export declare class OpenAIEmbeddingProvider implements EmbeddingProvider {
    private apiKey;
    private model;
    private dimension;
    private baseUrl;
    constructor(apiKey: string, model?: string, dimension?: number, baseUrl?: string);
    getDimension(): number;
    getName(): string;
    generateEmbedding(text: string): Promise<number[]>;
}
/**
 * Mock Embedding Provider for testing
 * Generates random embeddings for development/testing
 */
export declare class MockEmbeddingProvider implements EmbeddingProvider {
    private dimension;
    constructor(dimension?: number);
    getDimension(): number;
    getName(): string;
    generateEmbedding(text: string): Promise<number[]>;
    private simpleHash;
}
/**
 * Factory function to create embedding provider based on configuration
 */
export declare function createEmbeddingProvider(config: any): EmbeddingProvider | null;
//# sourceMappingURL=embedding-providers.d.ts.map