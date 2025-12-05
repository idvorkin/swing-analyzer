/**
 * Logger Utility Tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, log } from './logger';

describe('logger', () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('logs messages with component context', () => {
      const logger = createLogger({ component: 'TestComponent' });
      logger.info('Test message');

      expect(consoleSpy.info).toHaveBeenCalledWith('[TestComponent] Test message');
    });

    it('logs messages with action context', () => {
      const logger = createLogger({ component: 'TestComponent' });
      logger.warn('Warning message', { action: 'doSomething' });

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[TestComponent] (doSomething) Warning message'
      );
    });

    it('logs errors with error object', () => {
      const logger = createLogger({ component: 'TestComponent' });
      const error = new Error('Test error');
      logger.error('Something failed', error);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[TestComponent] Something failed',
        error
      );
    });

    it('logs errors without error object', () => {
      const logger = createLogger({ component: 'TestComponent' });
      logger.error('Something failed');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[TestComponent] Something failed'
      );
    });

    it('merges default and per-call context', () => {
      const logger = createLogger({ component: 'DefaultComponent' });
      logger.info('Message', { action: 'action1' });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        '[DefaultComponent] (action1) Message'
      );
    });

    it('overrides default context with per-call context', () => {
      const logger = createLogger({ component: 'DefaultComponent' });
      logger.info('Message', { component: 'OverrideComponent' });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        '[OverrideComponent] Message'
      );
    });
  });

  describe('default log instance', () => {
    it('logs without context', () => {
      log.info('Plain message');
      expect(consoleSpy.info).toHaveBeenCalledWith('Plain message');
    });

    it('logs with inline context', () => {
      log.warn('Warning', { component: 'InlineComponent' });
      expect(consoleSpy.warn).toHaveBeenCalledWith('[InlineComponent] Warning');
    });
  });

  describe('all log levels', () => {
    it('logs debug messages', () => {
      const logger = createLogger({ component: 'Test' });
      logger.debug('Debug message');
      expect(consoleSpy.debug).toHaveBeenCalledWith('[Test] Debug message');
    });

    it('logs info messages', () => {
      const logger = createLogger({ component: 'Test' });
      logger.info('Info message');
      expect(consoleSpy.info).toHaveBeenCalledWith('[Test] Info message');
    });

    it('logs warn messages', () => {
      const logger = createLogger({ component: 'Test' });
      logger.warn('Warn message');
      expect(consoleSpy.warn).toHaveBeenCalledWith('[Test] Warn message');
    });

    it('logs error messages', () => {
      const logger = createLogger({ component: 'Test' });
      logger.error('Error message');
      expect(consoleSpy.error).toHaveBeenCalledWith('[Test] Error message');
    });
  });
});
