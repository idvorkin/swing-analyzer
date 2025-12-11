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
import {
  type PoseTrackStorageMode,
  savePoseTrackToStorage,
  setPoseTrackStorageMode as setStorageMode,
} from './PoseTrackService';

// Map of session IDs to mock detector factories (supports parallel tests)
const mockDetectorFactories = new Map<string, PoseDetectorFactory>();

// Session ID is stored on window (per-tab) to support parallel tests
// Each browser tab has its own window, so tests are isolated
declare global {
  interface Window {
    __mockSessionId?: string;
  }
}

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
  // Store session ID on window (per-tab isolation for parallel tests)
  if (typeof window !== 'undefined') {
    window.__mockSessionId = id;
  }
  console.log(
    `[Test] Mock pose detector set up with ${poseTrack.frames.length} frames (session: ${id})`
  );
}

/**
 * Clear the mock pose detector for a session
 */
export function clearMockPoseDetector(sessionId?: string): void {
  const id =
    sessionId ||
    (typeof window !== 'undefined' ? window.__mockSessionId : undefined) ||
    'default';
  mockDetectorFactories.delete(id);
  // Clear session ID from window if it matches
  if (typeof window !== 'undefined' && window.__mockSessionId === id) {
    window.__mockSessionId = undefined;
  }
  console.log(`[Test] Mock pose detector cleared (session: ${id})`);
}

/**
 * Clear all mock pose detectors
 */
export function clearAllMockDetectors(): void {
  mockDetectorFactories.clear();
  if (typeof window !== 'undefined') {
    window.__mockSessionId = undefined;
  }
  console.log('[Test] All mock pose detectors cleared');
}

/**
 * Set the current session ID (used when extraction starts)
 */
export function setCurrentSession(sessionId: string): void {
  if (typeof window !== 'undefined') {
    window.__mockSessionId = sessionId;
  }
}

/**
 * Get the current mock detector factory (if set)
 * Uses the session ID from window (per-tab), or falls back to 'default'
 */
export function getMockDetectorFactory(): PoseDetectorFactory | undefined {
  const id =
    (typeof window !== 'undefined' ? window.__mockSessionId : undefined) ||
    'default';
  return mockDetectorFactories.get(id);
}

/**
 * Get a mock detector factory by session ID
 */
export function getMockDetectorFactoryBySession(
  sessionId: string
): PoseDetectorFactory | undefined {
  return mockDetectorFactories.get(sessionId);
}

/**
 * Set the storage mode for pose tracks
 * - 'memory': Session-only storage (default, cleared on reload)
 * - 'indexeddb': Persistent storage across page loads
 */
export function setPoseTrackStorageMode(mode: PoseTrackStorageMode): void {
  setStorageMode(mode);
  console.log(`[Test] Pose track storage mode set to: ${mode}`);
}

/**
 * Seed a pose track into storage (respects current storage mode)
 */
export async function seedPoseTrack(poseTrack: PoseTrackFile): Promise<void> {
  await savePoseTrackToStorage(poseTrack);
  console.log(
    `[Test] Seeded pose track: ${poseTrack.metadata.sourceVideoHash}`
  );
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
    setPoseTrackStorageMode,
    seedPoseTrack,
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
  setPoseTrackStorageMode,
  seedPoseTrack,
};

export default testSetup;
