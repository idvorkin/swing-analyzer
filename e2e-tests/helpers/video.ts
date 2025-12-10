/**
 * Video Helpers for E2E Tests
 *
 * Provides utilities for video playback control in tests.
 */

import type { Page } from '@playwright/test';

/**
 * Generate a unique test ID for cache isolation.
 * Each test run gets a unique ID so cached poses don't collide.
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Set a test ID that will be appended to videos to create unique hashes.
 * This allows parallel tests to avoid cache collisions while still testing
 * the cache mechanism itself.
 *
 * Call this before loading any video in your test.
 *
 * @param page - Playwright page instance
 * @param testId - Unique identifier for this test run
 */
export async function setVideoTestId(page: Page, testId: string): Promise<void> {
  await page.evaluate((id) => {
    (window as any).__VIDEO_TEST_ID__ = id;
  }, testId);
}

/**
 * Clear the video test ID (use cached poses normally)
 *
 * @param page - Playwright page instance
 */
export async function clearVideoTestId(page: Page): Promise<void> {
  await page.evaluate(() => {
    delete (window as any).__VIDEO_TEST_ID__;
  });
}

/**
 * Load the hardcoded sample video (kettlebell swing)
 *
 * The MediaSelectorDialog opens automatically when no video is loaded.
 * This function clicks on the "Kettlebell Swing" sample video card.
 *
 * @param page - Playwright page instance
 */
export async function loadHardcodedVideo(page: Page): Promise<void> {
  await clickSwingSampleButton(page);
}

/**
 * Click the Kettlebell Swing sample video button in the MediaSelectorDialog.
 * Waits for the dialog to be visible if needed, then clicks the button.
 *
 * @param page - Playwright page instance
 */
export async function clickSwingSampleButton(page: Page): Promise<void> {
  // Wait for the media selector dialog to be visible
  await page.waitForSelector('.media-dialog', { timeout: 5000 });

  // Click on the Kettlebell Swing sample video card
  await page.click('button:has-text("Kettlebell Swing")');

  // Wait for video to load (dialog closes and video appears)
  // Use #video to be specific (there may be multiple video elements)
  await page.waitForSelector('#video', { timeout: 15000 });

  // Wait for video src to be populated
  await page.waitForFunction(
    () => {
      const video = document.querySelector('#video') as HTMLVideoElement;
      return video && video.src && video.src.startsWith('blob:');
    },
    { timeout: 15000 }
  );
}

/**
 * Click the Pistol Squat sample video button in the MediaSelectorDialog.
 * Waits for the dialog to be visible if needed, then clicks the button.
 *
 * @param page - Playwright page instance
 */
export async function clickPistolSampleButton(page: Page): Promise<void> {
  // Wait for the media selector dialog to be visible
  await page.waitForSelector('.media-dialog', { timeout: 5000 });

  // Click on the Pistol Squat sample video card
  await page.click('button:has-text("Pistol Squat")');

  // Wait for video to load (dialog closes and video appears)
  // Use #video to be specific (there may be multiple video elements)
  await page.waitForSelector('#video', { timeout: 15000 });

  // Wait for video src to be populated
  await page.waitForFunction(
    () => {
      const video = document.querySelector('#video') as HTMLVideoElement;
      return video && video.src && video.src.startsWith('blob:');
    },
    { timeout: 15000 }
  );
}

/**
 * Open the MediaSelectorDialog (via the header button)
 * Used when a video is already loaded and you want to switch.
 *
 * @param page - Playwright page instance
 */
export async function openMediaSelectorDialog(page: Page): Promise<void> {
  await page.click('button[aria-label="Load different video"]');
  await page.waitForSelector('.media-dialog', { timeout: 5000 });
}

/**
 * Load the hardcoded video and wait for it to be playing
 *
 * @param page - Playwright page instance
 */
export async function loadHardcodedVideoAndPlay(page: Page): Promise<void> {
  await loadHardcodedVideo(page);

  // Click play button to start playback (video no longer auto-plays)
  await page.click('#play-pause-btn');

  // Wait for video to start playing
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video');
      return video && !video.paused && video.readyState >= 3;
    },
    { timeout: 10000 }
  );
}

/**
 * Play the video to completion
 *
 * @param page - Playwright page instance
 * @param options - Options for playback
 */
export async function playVideoToEnd(
  page: Page,
  options: { playbackRate?: number; timeout?: number } = {}
): Promise<void> {
  const { playbackRate = 4, timeout = 30000 } = options;

  // Speed up playback for tests
  await page.evaluate((rate) => {
    const video = document.querySelector('video');
    if (video) {
      video.playbackRate = rate;
    }
  }, playbackRate);

  // Ensure video is playing
  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video && video.paused) {
      video.play();
    }
  });

  // Wait for video to end
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video');
      return video && video.ended;
    },
    { timeout }
  );
}

/**
 * Seek video to a specific time
 *
 * @param page - Playwright page instance
 * @param time - Time in seconds to seek to
 */
export async function seekToTime(page: Page, time: number): Promise<void> {
  await page.evaluate((t) => {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = t;
    }
  }, time);

  // Wait for seek to complete
  await page.waitForFunction(
    (targetTime) => {
      const video = document.querySelector('video');
      return video && Math.abs(video.currentTime - targetTime) < 0.1;
    },
    time,
    { timeout: 5000 }
  );
}

/**
 * Pause the video
 *
 * @param page - Playwright page instance
 */
export async function pauseVideo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video) {
      video.pause();
    }
  });
}

/**
 * Play the video
 *
 * @param page - Playwright page instance
 */
export async function playVideo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video) {
      video.play();
    }
  });
}

/**
 * Get the current video state
 *
 * @param page - Playwright page instance
 */
export async function getVideoState(page: Page): Promise<{
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  readyState: number;
}> {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    if (!video) {
      return {
        currentTime: 0,
        duration: 0,
        paused: true,
        ended: false,
        readyState: 0,
      };
    }
    return {
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      ended: video.ended,
      readyState: video.readyState,
    };
  });
}

/**
 * Wait for the model to be ready
 *
 * @param page - Playwright page instance
 * @param timeout - Timeout in milliseconds
 */
export async function waitForModelReady(
  page: Page,
  timeout: number = 15000
): Promise<void> {
  await page.waitForSelector('.status-indicator:has-text("Ready")', {
    timeout,
  });
}

/**
 * Wait for pose track to load from cache
 *
 * @param page - Playwright page instance
 * @param timeout - Timeout in milliseconds
 */
export async function waitForCachedPoseTrack(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  // Look for cache indicator or "Ready" status with cached data
  await page.waitForFunction(
    () => {
      const statusBar = document.querySelector('.posetrack-status');
      return (
        statusBar?.textContent?.includes('cached') ||
        statusBar?.textContent?.includes('ready')
      );
    },
    { timeout }
  );
}

/**
 * Click the stop button
 *
 * @param page - Playwright page instance
 */
export async function stopVideo(page: Page): Promise<void> {
  await page.click('#stop-btn');
}

/**
 * Click the play/pause button
 *
 * @param page - Playwright page instance
 */
export async function togglePlayPause(page: Page): Promise<void> {
  await page.click('#play-pause-btn');
}
