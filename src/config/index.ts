/**
 * Configuration management
 */

import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  database: {
    path: process.env.DATABASE_PATH || './cns.db',
  },
  workspaces: {
    workspaces_dir: process.env.WORKSPACES_DIR || '/tmp/cns-workspaces',
  },
  memory: {
    embedding_model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  },
  orchestration: {
    max_concurrent_workflows: parseInt(process.env.MAX_WORKFLOWS || '10'),
  },
};