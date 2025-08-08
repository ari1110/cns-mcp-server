/**
 * Configuration management with validation
 */

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';

dotenvConfig();

const configSchema = z.object({
  database: z.object({
    path: z.string().min(1, 'Database path cannot be empty'),
  }),
  workspaces: z.object({
    workspaces_dir: z.string().min(1, 'Workspaces directory cannot be empty'),
  }),
  memory: z.object({
    embedding_model: z.string().min(1, 'Embedding model cannot be empty'),
    embedding_provider: z.string().optional(),
    embedding_dimension: z.number().int().positive().optional(),
    openai_api_key: z.string().optional(),
  }),
  orchestration: z.object({
    max_concurrent_workflows: z.number().int().positive('Max workflows must be positive'),
    cleanup_interval_minutes: z.number().int().positive('Cleanup interval must be positive'),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
    file: z.string().min(1, 'Log file path cannot be empty'),
  }),
});

function parseIntWithDefault(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function validateConfig() {
  // Auto-detect CNS directory in user's home (download-and-go principle)
  const cnsDir = join(homedir(), '.cns');
  
  const rawConfig = {
    database: {
      path: process.env.DATABASE_PATH || join(cnsDir, 'data', 'cns.db'),
    },
    workspaces: {
      workspaces_dir: process.env.WORKSPACES_DIR || join(cnsDir, 'workspaces'),
    },
    memory: {
      embedding_model: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
      embedding_provider: process.env.EMBEDDING_PROVIDER || 'transformers',
      embedding_dimension: parseIntWithDefault(process.env.EMBEDDING_DIMENSION, 384),
      openai_api_key: process.env.OPENAI_API_KEY,
    },
    orchestration: {
      max_concurrent_workflows: parseIntWithDefault(process.env.MAX_WORKFLOWS, 10),
      cleanup_interval_minutes: parseIntWithDefault(process.env.CLEANUP_INTERVAL_MINUTES, 5),
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      file: process.env.LOG_FILE || join(cnsDir, 'logs', 'cns.log'),
    },
  };

  try {
    const validatedConfig = configSchema.parse(rawConfig);
    logger.info('Configuration validated successfully', {
      database_path: validatedConfig.database.path,
      workspaces_dir: validatedConfig.workspaces.workspaces_dir,
      max_workflows: validatedConfig.orchestration.max_concurrent_workflows,
      log_level: validatedConfig.logging.level,
    });
    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      
      logger.error('Configuration validation failed', { errors: errorMessages });
      throw new Error(`Invalid configuration: ${errorMessages}`);
    }
    throw error;
  }
}

export const config = validateConfig();

export type Config = typeof config;