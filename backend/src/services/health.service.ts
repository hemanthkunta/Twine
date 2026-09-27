import { BaseService } from './base.service.js';
import { DashboardEventService } from './dashboardEventService.js';
import { checkDbHealth } from '../db/index.js';
import { getLogger } from './logger.service.js';

const logger = getLogger();

export class HealthService extends BaseService {
  private static monitoringInterval: NodeJS.Timeout | null = null;
  private static lastBackendStatus: boolean = true; // Assume healthy initially
  private static lastDatabaseStatus: boolean = true; // Assume healthy initially
  private static readonly MONITORING_INTERVAL_MS = 5000; // Check every 5 seconds

  static start(): void {
    if (this.monitoringInterval !== null) {
      logger.warn('[HealthService] Monitoring already started');
      return;
    }

    logger.info('[HealthService] Starting health monitoring');

    // Perform initial check
    this.checkAndEmitHealthStatus();

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.checkAndEmitHealthStatus();
    }, this.MONITORING_INTERVAL_MS).unref();
  }

  static stop(): void {
    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('[HealthService] Health monitoring stopped');
    }
  }

  private static checkAndEmitHealthStatus(): void {
    try {
      // Backend status - if we're running this code, backend is healthy
      const backendStatus = true;

      // Database status
      const databaseStatus = checkDbHealth();

      // Check if status has changed
      const backendChanged = backendStatus !== this.lastBackendStatus;
      const databaseChanged = databaseStatus !== this.lastDatabaseStatus;

      if (backendChanged || databaseChanged) {
        this.lastBackendStatus = backendStatus;
        this.lastDatabaseStatus = databaseStatus;

        // Emit project health change event
        const healthData = {
          backend: backendStatus ? 'ok' : 'error',
          database: databaseStatus ? 'connected' : 'disconnected',
          timestamp: Date.now()
        };

        DashboardEventService.broadcastDashboardEvent('dashboard:project_health_change', healthData);

        logger.info(`[HealthService] Health status changed - backend: ${backendStatus ? 'ok' : 'error'}, database: ${databaseStatus ? 'connected' : 'disconnected'}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[HealthService] Error checking health status: ${errorMessage}`);

      // Emit error status
      const healthData = {
        backend: 'error',
        database: 'error',
        timestamp: Date.now()
      };

      DashboardEventService.broadcastDashboardEvent('dashboard:project_health_change', healthData);
    }
  }
}