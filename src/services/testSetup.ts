/**
 * Test Setup Module
 *
 * Provides utilities for E2E testing without WebGL/TensorFlow dependencies.
 * Only loaded in development/test environments.
 */

import type { PoseTrackFile } from '../types/posetrack';
import {
  createMockPoseDetectorFactory,
  type PoseDetectorFactory,
} from './MockPoseDetector';

// Global test state
let mockDetectorFactory: PoseDetectorFactory | undefined;

/**
 * Set up a mock pose detector using fixture data
 *
 * Called from E2E tests via page.evaluate() to inject mock data
 */
export function setupMockPoseDetector(
  poseTrack: PoseTrackFile,
  frameDelayMs = 10
): void {
  mockDetectorFactory = createMockPoseDetectorFactory({
    poseTrack,
    frameDelayMs,
  });
  console.log(
    `[Test] Mock pose detector set up with ${poseTrack.frames.length} frames`
  );
}

/**
 * Clear the mock pose detector
 */
export function clearMockPoseDetector(): void {
  mockDetectorFactory = undefined;
  console.log('[Test] Mock pose detector cleared');
}

/**
 * Get the current mock detector factory (if set)
 */
export function getMockDetectorFactory(): PoseDetectorFactory | undefined {
  return mockDetectorFactory;
}

// Expose to window for E2E tests (only in development)
// Check both Vite's DEV flag and MODE to ensure we're in dev mode
// @ts-expect-error Vite-specific import.meta.env
const isDev = import.meta.env?.DEV || import.meta.env?.MODE === 'development';
if (typeof window !== 'undefined' && isDev) {
  (window as unknown as { __testSetup: typeof testSetup }).__testSetup = {
    setupMockPoseDetector,
    clearMockPoseDetector,
    getMockDetectorFactory,
  };
  console.log('[Test] Test setup exposed on window.__testSetup');
}

const testSetup = {
  setupMockPoseDetector,
  clearMockPoseDetector,
  getMockDetectorFactory,
};

export default testSetup;
