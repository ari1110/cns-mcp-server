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
        embedding_provider?: string | undefined;
        embedding_dimension?: number | undefined;
        openai_api_key?: string | undefined;
        lancedb_path?: string | undefined;
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