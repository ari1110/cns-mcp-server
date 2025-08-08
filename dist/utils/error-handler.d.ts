/**
 * Enhanced error handling utilities
 */
export declare class CNSError extends Error {
    readonly code: string;
    readonly context?: any;
    readonly retryable: boolean;
    constructor(message: string, code: string, context?: any, retryable?: boolean);
}
export declare class RetryableOperation {
    private maxAttempts;
    private baseDelay;
    constructor(maxAttempts?: number, baseDelay?: number);
    execute<T>(operation: () => Promise<T>, operationName: string, context?: any): Promise<T>;
    private sleep;
}
export declare function withErrorHandling<T extends any[], R>(fn: (...args: T) => Promise<R>, operationName: string): (...args: T) => Promise<R>;
export declare function createCircuitBreaker(threshold?: number, timeout?: number, monitorName?: string): {
    execute<T>(operation: () => Promise<T>): Promise<T>;
    getState(): {
        state: "CLOSED" | "OPEN" | "HALF_OPEN";
        failureCount: number;
        lastFailureTime: number;
    };
};
export declare function gracefulShutdown(cleanup: () => Promise<void>, timeoutMs?: number): void;
//# sourceMappingURL=error-handler.d.ts.map