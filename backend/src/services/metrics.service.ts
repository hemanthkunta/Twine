export class MetricsService {
  private static httpRequestsTotal: Map<string, number> = new Map();
  private static wsActiveConnections = 0;
  private static wsMessagesReceivedTotal = 0;
  private static wsMessagesSentTotal = 0;
  private static eventLoopLagMs = 0;
  private static e2eMessagesEncryptedTotal = 0;
  private static e2eMessagesDecryptedTotal = 0;
  private static e2eKeyExchangesTotal = 0;
  private static e2eActiveSessions = 0;
  private static e2eEncryptionErrorsTotal = 0;
  private static e2eDecryptionErrorsTotal = 0;

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

  static recordE2eMessageEncrypted() {
    this.e2eMessagesEncryptedTotal += 1;
  }

  static recordE2eMessageDecrypted() {
    this.e2eMessagesDecryptedTotal += 1;
  }

  static recordE2eKeyExchange() {
    this.e2eKeyExchangesTotal += 1;
  }

  static setE2eActiveSessions(count: number) {
    this.e2eActiveSessions = count;
  }

  static recordE2eEncryptionError() {
    this.e2eEncryptionErrorsTotal += 1;
  }

  static recordE2eDecryptionError() {
    this.e2eDecryptionErrorsTotal += 1;
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

    // E2E Encryption Metrics
    text += `\n# HELP aerogram_e2e_messages_encrypted_total Total number of E2E messages encrypted\n`;
    text += `# TYPE aerogram_e2e_messages_encrypted_total counter\n`;
    text += `aerogram_e2e_messages_encrypted_total ${this.e2eMessagesEncryptedTotal}\n`;

    text += `\n# HELP aerogram_e2e_messages_decrypted_total Total number of E2E messages decrypted\n`;
    text += `# TYPE aerogram_e2e_messages_decrypted_total counter\n`;
    text += `aerogram_e2e_messages_decrypted_total ${this.e2eMessagesDecryptedTotal}\n`;

    text += `\n# HELP aerogram_e2e_key_exchanges_total Total number of E2E key exchanges\n`;
    text += `# TYPE aerogram_e2e_key_exchanges_total counter\n`;
    text += `aerogram_e2e_key_exchanges_total ${this.e2eKeyExchangesTotal}\n`;

    text += `\n# HELP aerogram_e2e_active_sessions Number of active E2E sessions\n`;
    text += `# TYPE aerogram_e2e_active_sessions gauge\n`;
    text += `aerogram_e2e_active_sessions ${this.e2eActiveSessions}\n`;

    text += `\n# HELP aerogram_e2e_encryption_errors_total Total number of E2E encryption errors\n`;
    text += `# TYPE aerogram_e2e_encryption_errors_total counter\n`;
    text += `aerogram_e2e_encryption_errors_total ${this.e2eEncryptionErrorsTotal}\n`;

    text += `\n# HELP aerogram_e2e_decryption_errors_total Total number of E2E decryption errors\n`;
    text += `# TYPE aerogram_e2e_decryption_errors_total counter\n`;
    text += `aerogram_e2e_decryption_errors_total ${this.e2eDecryptionErrorsTotal}\n`;

    return text;
  }
}

