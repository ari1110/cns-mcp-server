/**
 * Embedding providers for semantic search
 */
import { logger } from '../utils/logger.js';
import { CNSError } from '../utils/error-handler.js';
import { pipeline, env } from '@xenova/transformers';
import { homedir } from 'os';
import { join } from 'path';
/**
 * OpenAI Embedding Provider
 * Uses OpenAI's text-embedding-3-small model
 */
export class OpenAIEmbeddingProvider {
    apiKey;
    model;
    dimension;
    baseUrl;
    constructor(apiKey, model = 'text-embedding-3-small', dimension = 1536, baseUrl = 'https://api.openai.com/v1') {
        this.apiKey = apiKey;
        this.model = model;
        this.dimension = dimension;
        this.baseUrl = baseUrl;
    }
    getDimension() {
        return this.dimension;
    }
    getName() {
        return `OpenAI-${this.model}`;
    }
    async generateEmbedding(text) {
        if (!text.trim()) {
            throw new CNSError('Text cannot be empty for embedding generation', 'EMPTY_TEXT', {}, false);
        }
        try {
            const response = await fetch(`${this.baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: text,
                    model: this.model,
                    dimensions: this.dimension
                }),
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenAI API error: ${response.status} - ${error}`);
            }
            const data = await response.json();
            if (!data.data?.[0]?.embedding) {
                throw new Error('Invalid response format from OpenAI API');
            }
            const embedding = data.data[0].embedding;
            if (embedding.length !== this.dimension) {
                throw new Error(`Expected embedding dimension ${this.dimension}, got ${embedding.length}`);
            }
            logger.info('Generated embedding via OpenAI', {
                model: this.model,
                textLength: text.length,
                embeddingDimension: embedding.length
            });
            return embedding;
        }
        catch (error) {
            logger.error('Failed to generate embedding via OpenAI', { error, textPreview: text.substring(0, 100) });
            throw new CNSError('OpenAI embedding generation failed', 'OPENAI_EMBEDDING_ERROR', { error: error instanceof Error ? error.message : error }, true // Retryable
            );
        }
    }
}
/**
 * Mock Embedding Provider for testing
 * Generates random embeddings for development/testing
 */
export class MockEmbeddingProvider {
    dimension;
    constructor(dimension = 1536) {
        this.dimension = dimension;
    }
    getDimension() {
        return this.dimension;
    }
    getName() {
        return 'Mock-Provider';
    }
    async generateEmbedding(text) {
        if (!text.trim()) {
            throw new CNSError('Text cannot be empty for embedding generation', 'EMPTY_TEXT', {}, false);
        }
        // Generate deterministic "embedding" based on text content for consistency in testing
        const hash = this.simpleHash(text);
        const embedding = Array.from({ length: this.dimension }, (_, i) => {
            return Math.sin(hash + i) * Math.cos(hash * i * 0.1);
        });
        // Normalize to unit vector
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        const normalizedEmbedding = embedding.map(val => val / magnitude);
        logger.info('Generated mock embedding', {
            textLength: text.length,
            embeddingDimension: normalizedEmbedding.length
        });
        return normalizedEmbedding;
    }
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash) / 1000000; // Normalize
    }
}
/**
 * Transformers.js Embedding Provider
 * Uses local models for free, offline embeddings
 */
export class TransformersEmbeddingProvider {
    pipeline = null;
    model;
    dimension;
    initPromise = null;
    constructor(model = 'Xenova/all-MiniLM-L6-v2', dimension = 384) {
        this.model = model;
        this.dimension = dimension;
        // Set model cache directory to ~/.cns/models/
        const cnsDir = join(homedir(), '.cns', 'models');
        env.cacheDir = cnsDir;
        logger.info('Transformers.js embedding provider initialized', {
            model: this.model,
            dimension: this.dimension,
            cachePath: cnsDir
        });
    }
    async initialize() {
        if (this.pipeline)
            return;
        if (!this.initPromise) {
            this.initPromise = this._doInitialize();
        }
        await this.initPromise;
    }
    async _doInitialize() {
        try {
            logger.info('Loading Transformers.js model...', { model: this.model });
            // Create the pipeline - model will be downloaded on first use
            this.pipeline = await pipeline('feature-extraction', this.model, {
                quantized: true, // Use quantized model for smaller size and faster inference
            });
            logger.info('Transformers.js model loaded successfully', { model: this.model });
        }
        catch (error) {
            logger.error('Failed to load Transformers.js model', {
                model: this.model,
                error: error instanceof Error ? error.message : error
            });
            throw new CNSError('Failed to initialize Transformers.js model', 'TRANSFORMERS_INIT_ERROR', { model: this.model, error: error instanceof Error ? error.message : error });
        }
    }
    getDimension() {
        return this.dimension;
    }
    getName() {
        return `Transformers-${this.model.split('/').pop()}`;
    }
    async generateEmbedding(text) {
        if (!text.trim()) {
            throw new CNSError('Text cannot be empty for embedding generation', 'EMPTY_TEXT', {}, false);
        }
        await this.initialize();
        try {
            // Generate embeddings using the pipeline
            const output = await this.pipeline(text, {
                pooling: 'mean',
                normalize: true
            });
            // Convert tensor to array
            const embedding = Array.from(output.data);
            if (embedding.length !== this.dimension) {
                logger.warn(`Expected dimension ${this.dimension}, got ${embedding.length}. Using actual dimension.`);
            }
            logger.debug('Generated embedding via Transformers.js', {
                model: this.model,
                textLength: text.length,
                embeddingDimension: embedding.length
            });
            return embedding;
        }
        catch (error) {
            logger.error('Failed to generate embedding via Transformers.js', {
                error,
                textPreview: text.substring(0, 100)
            });
            throw new CNSError('Transformers.js embedding generation failed', 'TRANSFORMERS_EMBEDDING_ERROR', { error: error instanceof Error ? error.message : error }, true // Retryable
            );
        }
    }
}
/**
 * Factory function to create embedding provider based on configuration
 */
export function createEmbeddingProvider(config) {
    const providerType = config.embedding_provider || process.env.EMBEDDING_PROVIDER || 'transformers';
    switch (providerType.toLowerCase()) {
        case 'transformers':
            logger.info('Using Transformers.js embedding provider (free, local)');
            return new TransformersEmbeddingProvider(config.embedding_model || process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2', config.embedding_dimension || parseInt(process.env.EMBEDDING_DIMENSION || '384'));
        case 'openai':
            const apiKey = config.openai_api_key || process.env.OPENAI_API_KEY;
            if (!apiKey) {
                logger.warn('OpenAI API key not found, falling back to Transformers.js');
                return new TransformersEmbeddingProvider();
            }
            return new OpenAIEmbeddingProvider(apiKey, config.embedding_model || process.env.EMBEDDING_MODEL || 'text-embedding-3-small', config.embedding_dimension || parseInt(process.env.EMBEDDING_DIMENSION || '1536'));
        case 'mock':
            logger.info('Using mock embedding provider for development/testing');
            return new MockEmbeddingProvider(config.embedding_dimension || parseInt(process.env.EMBEDDING_DIMENSION || '384'));
        case 'none':
            logger.info('No embedding provider configured, semantic search disabled');
            return null;
        default:
            logger.info('Unknown provider type, using Transformers.js as default');
            return new TransformersEmbeddingProvider();
    }
}
//# sourceMappingURL=embedding-providers.js.map