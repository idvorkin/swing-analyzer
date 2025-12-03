/**
 * Video Helpers for E2E Tests
 *
 * Provides utilities for video playback control in tests.
 */

import type { Page } from '@playwright/test';

/**
 * Load the hardcoded sample video
 *
 * @param page - Playwright page instance
 */
export async function loadHardcodedVideo(page: Page): Promise<void> {
  await page.click('#load-hardcoded-btn');
  await page.waitForSelector(
    '.status-indicator:has-text("Video loaded")',
    {
      timeout: 15000,
    }
  );
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
