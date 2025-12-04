/**
 * Test Setup Module
 *
 * Provides utilities for E2E testing without WebGL/TensorFlow dependencies.
 * Only loaded in development/test environments.
 *
 * Supports multiple concurrent tests by using session IDs to isolate mock detectors.
 */

import type { PoseTrackFile } from '../types/posetrack';
import {
  createMockPoseDetectorFactory,
  type PoseDetectorFactory,
} from './MockPoseDetector';

// Map of session IDs to mock detector factories (supports parallel tests)
const mockDetectorFactories = new Map<string, PoseDetectorFactory>();

// Current session ID (set by test before extraction starts)
let currentSessionId: string | undefined;

/**
 * Set up a mock pose detector using fixture data
 *
 * Called from E2E tests via page.evaluate() to inject mock data
 *
 * @param poseTrack - The fixture data to use
 * @param frameDelayMs - Delay per frame to simulate extraction timing (default: 0 for fast tests)
 * @param sessionId - Unique ID for this test session (allows parallel tests)
 */
export function setupMockPoseDetector(
  poseTrack: PoseTrackFile,
  frameDelayMs = 0,
  sessionId?: string
): void {
  const id = sessionId || 'default';
  const factory = createMockPoseDetectorFactory({
    poseTrack,
    frameDelayMs,
  });
  mockDetectorFactories.set(id, factory);
  currentSessionId = id;
  console.log(
    `[Test] Mock pose detector set up with ${poseTrack.frames.length} frames (session: ${id})`
  );
}

/**
 * Clear the mock pose detector for a session
 */
export function clearMockPoseDetector(sessionId?: string): void {
  const id = sessionId || currentSessionId || 'default';
  mockDetectorFactories.delete(id);
  if (currentSessionId === id) {
    currentSessionId = undefined;
  }
  console.log(`[Test] Mock pose detector cleared (session: ${id})`);
}

/**
 * Clear all mock pose detectors
 */
export function clearAllMockDetectors(): void {
  mockDetectorFactories.clear();
  currentSessionId = undefined;
  console.log('[Test] All mock pose detectors cleared');
}

/**
 * Set the current session ID (used when extraction starts)
 */
export function setCurrentSession(sessionId: string): void {
  currentSessionId = sessionId;
}

/**
 * Get the current mock detector factory (if set)
 * Uses the current session ID, or falls back to 'default'
 */
export function getMockDetectorFactory(): PoseDetectorFactory | undefined {
  const id = currentSessionId || 'default';
  return mockDetectorFactories.get(id);
}

/**
 * Get a mock detector factory by session ID
 */
export function getMockDetectorFactoryBySession(sessionId: string): PoseDetectorFactory | undefined {
  return mockDetectorFactories.get(sessionId);
}

// Expose to window for E2E tests (only in development)
// Check both Vite's DEV flag and MODE to ensure we're in dev mode
// @ts-expect-error Vite-specific import.meta.env
const isDev = import.meta.env?.DEV || import.meta.env?.MODE === 'development';
if (typeof window !== 'undefined' && isDev) {
  (window as unknown as { __testSetup: typeof testSetup }).__testSetup = {
    setupMockPoseDetector,
    clearMockPoseDetector,
    clearAllMockDetectors,
    setCurrentSession,
    getMockDetectorFactory,
    getMockDetectorFactoryBySession,
  };
  console.log('[Test] Test setup exposed on window.__testSetup');
}

const testSetup = {
  setupMockPoseDetector,
  clearMockPoseDetector,
  clearAllMockDetectors,
  setCurrentSession,
  getMockDetectorFactory,
  getMockDetectorFactoryBySession,
};

export default testSetup;
