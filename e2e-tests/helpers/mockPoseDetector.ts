/**
 * Mock Pose Detector Helpers for E2E Tests
 *
 * Provides utilities to set up mock pose detection for testing
 * without WebGL/TensorFlow dependencies.
 */

import type { Page } from '@playwright/test';
import type { PoseTrackFile } from '../../src/types/posetrack';
import { type FixtureName, loadFixture } from '../fixtures';

/**
 * Set up mock pose detector with fixture data
 *
 * This injects the mock pose detector into the app, which will be used
 * instead of the real TensorFlow model for pose extraction.
 *
 * @param page - Playwright page instance
 * @param fixtureName - Name of the fixture to load
 * @param frameDelayMs - Delay per frame to simulate extraction (default: 0 for fast tests)
 * @param sessionId - Optional unique session ID for parallel test isolation
 */
export async function setupMockPoseDetector(
  page: Page,
  fixtureName: FixtureName,
  frameDelayMs = 0,
  sessionId?: string
): Promise<void> {
  const fixture = await loadFixture(fixtureName);
  await setupMockPoseDetectorWithData(page, fixture, frameDelayMs, sessionId);
}

/**
 * Set up mock pose detector with raw pose track data
 *
 * @param page - Playwright page instance
 * @param poseTrack - The pose track data to use for mock detection
 * @param frameDelayMs - Delay per frame to simulate extraction (default: 0 for fast tests)
 * @param sessionId - Optional unique session ID for parallel test isolation
 */
export async function setupMockPoseDetectorWithData(
  page: Page,
  poseTrack: PoseTrackFile,
  frameDelayMs = 0,
  sessionId?: string
): Promise<void> {
  // Generate a random session ID if not provided (for parallel test isolation)
  const sid =
    sessionId || `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  await page.evaluate(
    ({ data, delay, sid }) => {
      // Access the test setup exposed on window
      const testSetup = (
        window as unknown as {
          __testSetup?: {
            setupMockPoseDetector: (
              poseTrack: unknown,
              delay: number,
              sessionId?: string
            ) => void;
          };
        }
      ).__testSetup;

      if (!testSetup) {
        throw new Error(
          'Test setup not found on window. Make sure the app is running in dev mode.'
        );
      }

      testSetup.setupMockPoseDetector(data, delay, sid);
    },
    { data: poseTrack, delay: frameDelayMs, sid }
  );
}

/**
 * Clear the mock pose detector
 *
 * @param page - Playwright page instance
 */
export async function clearMockPoseDetector(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testSetup = (
      window as unknown as {
        __testSetup?: {
          clearMockPoseDetector: () => void;
        };
      }
    ).__testSetup;

    if (testSetup) {
      testSetup.clearMockPoseDetector();
    }
  });
}

/**
 * Check if mock pose detector is available
 *
 * @param page - Playwright page instance
 */
export async function isMockPoseDetectorAvailable(
  page: Page
): Promise<boolean> {
  return page.evaluate(() => {
    return !!(window as unknown as { __testSetup?: unknown }).__testSetup;
  });
}
