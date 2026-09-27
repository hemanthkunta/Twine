import { WebSocket } from 'ws';
import { BaseService } from './base.service.js';
import { WSFrame } from '../types/protocol.js';

export class DashboardEventService extends BaseService {
  private static dashboardClients = new Set<WebSocket>();

  static addDashboardClient(socket: WebSocket): void {
    this.dashboardClients.add(socket);
  }

  static removeDashboardClient(socket: WebSocket): void {
    this.dashboardClients.delete(socket);
  }

  static broadcastDashboardEvent(eventType: string, payload: any): void {
    const frame: WSFrame<any> = {
      type: eventType,
      payload,
      timestamp: Date.now(),
    };
    const data = JSON.stringify(frame);
    for (const client of this.dashboardClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  static emitProjectHealthChange(healthData: any): void {
    this.broadcastDashboardEvent('dashboard:project_health_change', healthData);
  }

  static emitTestSuiteStatusUpdate(testData: any): void {
    this.broadcastDashboardEvent('dashboard:test_suite_status_update', testData);
  }

  static emitUserConnectionEvent(userId: string, connected: boolean): void {
    this.broadcastDashboardEvent('dashboard:user_connection_event', { userId, connected });
  }

  static emitMessageFlowMetricsUpdate(metricsData: any): void {
    this.broadcastDashboardEvent('dashboard:message_flow_metrics_update', metricsData);
  }

  static emitSecurityEventAlert(alertData: any): void {
    this.broadcastDashboardEvent('dashboard:security_event_alert', alertData);
  }

  static emitRecentActivityNotification(activityData: any): void {
    this.broadcastDashboardEvent('dashboard:recent_activity_notification', activityData);
  }

  static emitDashboardMetricsUpdate(metricsData: any): void {
    this.broadcastDashboardEvent('dashboard:metrics_update', metricsData);
  }
}
