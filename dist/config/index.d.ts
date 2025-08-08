/**
 * Configuration management with validation
 */
export declare const config: {
    database: {
        path: string;
    };
    workspaces: {
        workspaces_dir: string;
    };
    memory: {
        embedding_model: string;
    };
    orchestration: {
        max_concurrent_workflows: number;
        cleanup_interval_minutes: number;
    };
    logging: {
        level: "info" | "error" | "warn" | "debug";
        file: string;
    };
};
export type Config = typeof config;
//# sourceMappingURL=index.d.ts.map