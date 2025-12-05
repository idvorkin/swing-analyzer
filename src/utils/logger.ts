/**
 * Unified Error Logging Utility
 *
 * Provides consistent error logging with context and integration with SessionRecorder.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  component?: string;
  action?: string;
  [key: string]: unknown;
}

/**
 * Format a log message with context prefix.
 */
function formatMessage(
  level: LogLevel,
  context: LogContext,
  message: string
): string {
  const parts: string[] = [];

  if (context.component) {
    parts.push(`[${context.component}]`);
  }
  if (context.action) {
    parts.push(`(${context.action})`);
  }

  const prefix = parts.length > 0 ? `${parts.join(' ')} ` : '';
  return `${prefix}${message}`;
}

/**
 * Create a logger instance with optional default context.
 *
 * @example
 * const log = createLogger({ component: 'VideoControls' });
 * log.error('Failed to load video', { action: 'loadVideo' });
 * // Output: [VideoControls] (loadVideo) Failed to load video
 */
export function createLogger(defaultContext: LogContext = {}) {
  return {
    debug(message: string, context: LogContext = {}) {
      const mergedContext = { ...defaultContext, ...context };
      console.debug(formatMessage('debug', mergedContext, message));
    },

    info(message: string, context: LogContext = {}) {
      const mergedContext = { ...defaultContext, ...context };
      console.info(formatMessage('info', mergedContext, message));
    },

    warn(message: string, context: LogContext = {}) {
      const mergedContext = { ...defaultContext, ...context };
      console.warn(formatMessage('warn', mergedContext, message));
    },

    error(message: string, error?: unknown, context: LogContext = {}) {
      const mergedContext = { ...defaultContext, ...context };
      const formattedMessage = formatMessage('error', mergedContext, message);

      if (error) {
        console.error(formattedMessage, error);
      } else {
        console.error(formattedMessage);
      }
    },
  };
}

/**
 * Default logger instance for quick logging without context.
 */
export const log = createLogger();
