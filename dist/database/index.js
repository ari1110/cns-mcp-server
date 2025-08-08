/**
 * Database layer - SQLite with schema management
 */
import BetterSqlite3 from 'better-sqlite3';
import { logger } from '../utils/logger.js';
export class Database {
    db;
    constructor(config) {
        const dbPath = config?.path || './cns.db';
        this.db = new BetterSqlite3(dbPath);
    }
    async initialize() {
        logger.info('Initializing database');
        // Create tables
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT,
        status TEXT,
        agent_type TEXT,
        agent_role TEXT,
        specifications TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      
      CREATE TABLE IF NOT EXISTS handoffs (
        id TEXT PRIMARY KEY,
        from_agent TEXT,
        to_agent TEXT,
        workflow_id TEXT,
        type TEXT,
        created_at TEXT,
        processed INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT,
        type TEXT,
        tags TEXT,
        workflow_id TEXT,
        metadata TEXT,
        created_at TEXT
      );
      
      CREATE TABLE IF NOT EXISTS cleanup_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT,
        scheduled_for TEXT,
        processed INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS tool_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT,
        session_id TEXT,
        timestamp TEXT
      );
    `);
        logger.info('Database initialized');
    }
    async run(sql, params) {
        return this.db.prepare(sql).run(params || []);
    }
    async get(sql, params) {
        return this.db.prepare(sql).get(params || []);
    }
    async all(sql, params) {
        return this.db.prepare(sql).all(params || []);
    }
}
//# sourceMappingURL=index.js.map