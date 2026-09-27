export class MetricsService {
  private static httpRequestsTotal: Map<string, number> = new Map();
  private static wsActiveConnections = 0;
  private static wsMessagesReceivedTotal = 0;
  private static wsMessagesSentTotal = 0;
  private static eventLoopLagMs = 0;

  static init() {
    // Monitor event loop lag
    let lastTime = Date.now();
    setInterval(() => {
      const now = Date.now();
      const delta = now - lastTime - 1000;
      this.eventLoopLagMs = Math.max(0, delta);
      lastTime = now;
    }, 1000).unref();
  }

  static recordHttpRequest(method: string, rawPath: string, statusCode: number) {
    if (this.httpRequestsTotal.size > 500) {
      this.httpRequestsTotal.clear();
    }
    const normalizedPath = (rawPath || '/')
      .replace(/\/(usr|msg|chat|grp|sess|cm|pol|blk)_[a-zA-Z0-9_-]+/g, '/:id')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .slice(0, 100);
    const key = `${method}:${normalizedPath}:${statusCode}`;
    this.httpRequestsTotal.set(key, (this.httpRequestsTotal.get(key) || 0) + 1);
  }

  static incrementWsConnections() {
    this.wsActiveConnections += 1;
  }

  static decrementWsConnections() {
    this.wsActiveConnections = Math.max(0, this.wsActiveConnections - 1);
  }

  static recordWsMessageReceived() {
    this.wsMessagesReceivedTotal += 1;
  }

  static recordWsMessageSent() {
    this.wsMessagesSentTotal += 1;
  }

  static getMetricsText(): string {
    const mem = process.memoryUsage();
    let text = `# HELP aerogram_http_requests_total Total number of HTTP requests\n`;
    text += `# TYPE aerogram_http_requests_total counter\n`;
    for (const [k, count] of this.httpRequestsTotal.entries()) {
      const [method, path, status] = k.split(':');
      text += `aerogram_http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}\n`;
    }

    text += `\n# HELP aerogram_ws_active_connections Number of active WebSocket client connections\n`;
    text += `# TYPE aerogram_ws_active_connections gauge\n`;
    text += `aerogram_ws_active_connections ${this.wsActiveConnections}\n`;

    text += `\n# HELP aerogram_ws_messages_received_total Total WebSocket frames received\n`;
    text += `# TYPE aerogram_ws_messages_received_total counter\n`;
    text += `aerogram_ws_messages_received_total ${this.wsMessagesReceivedTotal}\n`;

    text += `\n# HELP aerogram_ws_messages_sent_total Total WebSocket frames dispatched\n`;
    text += `# TYPE aerogram_ws_messages_sent_total counter\n`;
    text += `aerogram_ws_messages_sent_total ${this.wsMessagesSentTotal}\n`;

    text += `\n# HELP aerogram_process_heap_used_bytes Heap memory in use\n`;
    text += `# TYPE aerogram_process_heap_used_bytes gauge\n`;
    text += `aerogram_process_heap_used_bytes ${mem.heapUsed}\n`;

    text += `\n# HELP aerogram_event_loop_lag_ms Event loop lag in milliseconds\n`;
    text += `# TYPE aerogram_event_loop_lag_ms gauge\n`;
    text += `aerogram_event_loop_lag_ms ${this.eventLoopLagMs}\n`;

    return text;
  }
}

MetricsService.init();
