import pino from 'pino';

let loggerInstance: pino.Logger | null = null;

/**
 * Initialize the logger with the given config.
 * Call this once at the start of the application.
 * @param config Object with logLevel and environment properties
 */
export function initLogger(config: { logLevel?: string; environment?: string }) {
  loggerInstance = pino({
    level: config.logLevel || 'info',
    transport:
      config.environment !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
            },
          }
        : undefined,
  });
}

/**
 * Get the current logger instance.
 * Throws if logger has not been initialized.
 */
export function getLogger() {
  if (loggerInstance === null) {
    // Fallback to a default logger to prevent crashes during early imports
    loggerInstance = pino({ level: 'info' });
  }
  return loggerInstance;
}

/**
 * Create a logger with the given bindings (e.g., for a specific service).
 */
export function createLogger(bindings: Record<string, unknown>) {
  return getLogger().child(bindings);
}