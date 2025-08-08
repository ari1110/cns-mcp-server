/**
 * Enhanced error handling utilities
 */

import { logger } from './logger.js';

export class CNSError extends Error {
  public readonly code: string;
  public readonly context?: any;
  public readonly retryable: boolean;

  constructor(message: string, code: string, context?: any, retryable = false) {
    super(message);
    this.name = 'CNSError';
    this.code = code;
    this.context = context;
    this.retryable = retryable;
  }
}

export class RetryableOperation {
  private maxAttempts: number;
  private baseDelay: number;

  constructor(maxAttempts = 3, baseDelay = 1000) {
    this.maxAttempts = maxAttempts;
    this.baseDelay = baseDelay;
  }

  async execute<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: any
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        logger.info(`Executing ${operationName}`, { attempt, context });
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        const isRetryable = error instanceof CNSError ? error.retryable : true;
        
        if (attempt === this.maxAttempts || !isRetryable) {
          logger.error(`${operationName} failed after ${attempt} attempts`, {
            error: lastError,
            context,
            finalAttempt: true
          });
          throw lastError;
        }

        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`${operationName} failed, retrying`, {
          attempt,
          nextRetryIn: delay,
          error: lastError.message,
          context
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function withErrorHandling<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  operationName: string
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof CNSError) {
        logger.error(`CNS operation failed: ${operationName}`, {
          code: error.code,
          context: error.context,
          retryable: error.retryable,
          message: error.message
        });
        throw error;
      }

      if (error instanceof Error) {
        logger.error(`Unexpected error in ${operationName}`, {
          message: error.message,
          stack: error.stack
        });
        throw new CNSError(
          `${operationName} failed: ${error.message}`,
          'UNEXPECTED_ERROR',
          { originalError: error.message }
        );
      }

      logger.error(`Unknown error in ${operationName}`, { error });
      throw new CNSError(
        `${operationName} failed with unknown error`,
        'UNKNOWN_ERROR',
        { error }
      );
    }
  };
}

export function createCircuitBreaker(
  threshold = 5,
  timeout = 60000,
  monitorName = 'operation'
) {
  let failureCount = 0;
  let lastFailureTime = 0;
  let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  return {
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      if (state === 'OPEN') {
        if (Date.now() - lastFailureTime > timeout) {
          state = 'HALF_OPEN';
          logger.info(`Circuit breaker for ${monitorName} moving to HALF_OPEN`);
        } else {
          throw new CNSError(
            `Circuit breaker for ${monitorName} is OPEN`,
            'CIRCUIT_BREAKER_OPEN',
            { failureCount, lastFailureTime },
            false
          );
        }
      }

      try {
        const result = await operation();
        
        if (state === 'HALF_OPEN') {
          state = 'CLOSED';
          failureCount = 0;
          logger.info(`Circuit breaker for ${monitorName} reset to CLOSED`);
        }
        
        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = Date.now();

        if (failureCount >= threshold) {
          state = 'OPEN';
          logger.error(`Circuit breaker for ${monitorName} opened`, {
            failureCount,
            threshold,
            error
          });
        }

        throw error;
      }
    },

    getState() {
      return { state, failureCount, lastFailureTime };
    }
  };
}

export function gracefulShutdown(
  cleanup: () => Promise<void>,
  timeoutMs = 30000
): void {
  const signals = ['SIGTERM', 'SIGINT'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, initiating graceful shutdown`);
      
      const shutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, timeoutMs);

      try {
        await cleanup();
        logger.info('Graceful shutdown completed');
        clearTimeout(shutdownTimeout);
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error });
        clearTimeout(shutdownTimeout);
        process.exit(1);
      }
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason, promise });
    process.exit(1);
  });
}