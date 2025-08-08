/**
 * Health monitoring and metrics collection
 */

import { logger } from './logger.js';

interface HealthCheck {
  name: string;
  check: () => Promise<HealthStatus>;
  timeout: number;
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  metadata?: any;
}

interface Metrics {
  responseTime: number[];
  errorCount: number;
  successCount: number;
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
  timestamp: number;
}

export class HealthMonitor {
  private healthChecks: Map<string, HealthCheck> = new Map();
  private metrics: Metrics = {
    responseTime: [],
    errorCount: 0,
    successCount: 0,
    memoryUsage: process.memoryUsage(),
    uptime: 0,
    timestamp: Date.now(),
  };

  constructor() {
    // Update metrics periodically
    setInterval(() => {
      this.updateSystemMetrics();
    }, 30000); // Every 30 seconds
  }

  addHealthCheck(name: string, check: () => Promise<HealthStatus>, timeout = 5000) {
    this.healthChecks.set(name, { name, check, timeout });
    logger.info(`Added health check: ${name}`);
  }

  async runAllHealthChecks(): Promise<{ [key: string]: HealthStatus }> {
    const results: { [key: string]: HealthStatus } = {};

    for (const [name, healthCheck] of this.healthChecks) {
      try {
        const startTime = Date.now();
        const result = await Promise.race([
          healthCheck.check(),
          this.timeoutPromise(healthCheck.timeout)
        ]);
        
        const duration = Date.now() - startTime;
        results[name] = {
          ...result,
          metadata: {
            ...result.metadata,
            checkDuration: duration,
          }
        };

      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Health check failed',
          metadata: { error }
        };
        logger.error(`Health check failed: ${name}`, { error });
      }
    }

    return results;
  }

  recordResponseTime(duration: number) {
    this.metrics.responseTime.push(duration);
    
    // Keep only last 100 response times
    if (this.metrics.responseTime.length > 100) {
      this.metrics.responseTime.shift();
    }
  }

  recordSuccess() {
    this.metrics.successCount++;
  }

  recordError() {
    this.metrics.errorCount++;
  }

  getMetrics() {
    this.updateSystemMetrics();
    
    const avgResponseTime = this.metrics.responseTime.length > 0 
      ? this.metrics.responseTime.reduce((sum, time) => sum + time, 0) / this.metrics.responseTime.length
      : 0;

    const totalRequests = this.metrics.successCount + this.metrics.errorCount;
    const errorRate = totalRequests > 0 ? this.metrics.errorCount / totalRequests : 0;

    return {
      uptime: this.metrics.uptime,
      memory: this.metrics.memoryUsage,
      responseTime: {
        average: Math.round(avgResponseTime),
        recent: this.metrics.responseTime.slice(-10),
      },
      requests: {
        total: totalRequests,
        successful: this.metrics.successCount,
        failed: this.metrics.errorCount,
        errorRate: Math.round(errorRate * 100) / 100,
      },
      timestamp: this.metrics.timestamp,
    };
  }

  async getSystemHealth(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    checks: { [key: string]: HealthStatus };
    metrics: ReturnType<HealthMonitor['getMetrics']>;
    summary: string;
  }> {
    const checks = await this.runAllHealthChecks();
    const metrics = this.getMetrics();

    // Determine overall health
    const checkResults = Object.values(checks);
    const hasUnhealthy = checkResults.some(check => check.status === 'unhealthy');
    const hasDegraded = checkResults.some(check => check.status === 'degraded');
    
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (hasUnhealthy) {
      overallStatus = 'unhealthy';
    } else if (hasDegraded) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const healthyCount = checkResults.filter(check => check.status === 'healthy').length;
    const totalCount = checkResults.length;
    
    const summary = `${healthyCount}/${totalCount} health checks passing. ` +
      `Error rate: ${(metrics.requests.errorRate * 100).toFixed(1)}%. ` +
      `Avg response time: ${metrics.responseTime.average}ms.`;

    return {
      status: overallStatus,
      checks,
      metrics,
      summary,
    };
  }

  private updateSystemMetrics() {
    this.metrics.memoryUsage = process.memoryUsage();
    this.metrics.uptime = process.uptime();
    this.metrics.timestamp = Date.now();
  }

  private timeoutPromise(timeout: number): Promise<HealthStatus> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout after ${timeout}ms`));
      }, timeout);
    });
  }
}

// Global health monitor instance
export const healthMonitor = new HealthMonitor();