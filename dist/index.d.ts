#!/usr/bin/env node
/**
 * CNS (Central Nervous System) MCP Server
 * Autonomous Multi-Agent Orchestration for Claude Code
 */
export declare class CNSMCPServer {
    private server;
    private hookHandlers;
    private memory;
    private workspaces;
    private orchestration;
    private db;
    private commands;
    constructor();
    private setupHandlers;
    private getSystemStatus;
    private getSystemHealth;
    private setupHealthChecks;
    private ensureDirectoryStructure;
    run(): Promise<void>;
    private validateEmbeddingProvider;
    private setupGracefulShutdown;
}
//# sourceMappingURL=index.d.ts.map