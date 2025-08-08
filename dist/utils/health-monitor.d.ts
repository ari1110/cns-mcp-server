/**
 * Health monitoring and metrics collection
 */
interface HealthStatus {
    status: 'healthy' | 'unhealthy' | 'degraded';
    message?: string;
    metadata?: any;
}
export declare class HealthMonitor {
    private healthChecks;
    private metrics;
    constructor();
    addHealthCheck(name: string, check: () => Promise<HealthStatus>, timeout?: number): void;
    runAllHealthChecks(): Promise<{
        [key: string]: HealthStatus;
    }>;
    recordResponseTime(duration: number): void;
    recordSuccess(): void;
    recordError(): void;
    getMetrics(): {
        uptime: number;
        memory: NodeJS.MemoryUsage;
        responseTime: {
            average: number;
            recent: number[];
        };
        requests: {
            total: number;
            successful: number;
            failed: number;
            errorRate: number;
        };
        timestamp: number;
    };
    getSystemHealth(): Promise<{
        status: 'healthy' | 'unhealthy' | 'degraded';
        checks: {
            [key: string]: HealthStatus;
        };
        metrics: ReturnType<HealthMonitor['getMetrics']>;
        summary: string;
    }>;
    private updateSystemMetrics;
    private timeoutPromise;
}
export declare const healthMonitor: HealthMonitor;
export {};
//# sourceMappingURL=health-monitor.d.ts.map