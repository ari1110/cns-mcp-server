/**
 * Database layer - SQLite with schema management
 */
export declare class Database {
    private db;
    constructor(config?: any);
    initialize(): Promise<void>;
    run(sql: string, params?: any[]): Promise<any>;
    get(sql: string, params?: any[]): Promise<any>;
    all(sql: string, params?: any[]): Promise<any[]>;
}
//# sourceMappingURL=index.d.ts.map