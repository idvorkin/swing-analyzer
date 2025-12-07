/**
 * Video Route Helpers for E2E Tests
 *
 * Intercepts remote video requests and serves local files for faster tests.
 */

import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { seedPoseTrackFixture } from './indexeddb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to public/videos relative to this file
const VIDEOS_DIR = path.join(__dirname, '../../public/videos');

// GitHub URLs that we intercept - matches any .webm from form-analyzer-samples
const GITHUB_VIDEO_PATTERN =
  /raw\.githubusercontent\.com\/.*form-analyzer-samples.*\.webm/;

/**
 * Set up route interception to serve the short 4-rep test video
 * instead of fetching from GitHub.
 *
 * This significantly speeds up E2E tests by:
 * 1. Avoiding network latency to GitHub
 * 2. Using a shorter video (5.5s instead of 26s)
 *
 * @param page - Playwright page instance
 */
export async function useShortTestVideo(page: Page): Promise<void> {
  const shortVideoPath = path.join(VIDEOS_DIR, 'swing-sample-4reps.webm');

  if (!fs.existsSync(shortVideoPath)) {
    throw new Error(
      `Short test video not found at ${shortVideoPath}. ` +
        'Run scripts/find_tops.py to create it.'
    );
  }

  await page.route(GITHUB_VIDEO_PATTERN, async (route) => {
    const videoBuffer = fs.readFileSync(shortVideoPath);
    await route.fulfill({
      status: 200,
      contentType: 'video/webm',
      body: videoBuffer,
    });
  });
}

/**
 * Set up route interception to serve local video files
 * for any request to /videos/*
 *
 * @param page - Playwright page instance
 */
export async function serveLocalVideos(page: Page): Promise<void> {
  await page.route('**/videos/**', async (route, request) => {
    const url = new URL(request.url());
    const filename = path.basename(url.pathname);
    const localPath = path.join(VIDEOS_DIR, filename);

    if (fs.existsSync(localPath)) {
      const videoBuffer = fs.readFileSync(localPath);
      await route.fulfill({
        status: 200,
        contentType: 'video/webm',
        body: videoBuffer,
      });
    } else {
      // Fall back to actual request
      await route.continue();
    }
  });
}

/**
 * Combined setup for fast E2E tests:
 * 1. Intercepts GitHub video URL → serves local 4-rep video
 * 2. Seeds matching posetrack fixture with correct hash
 *
 * This reduces test time from ~1.5 min to ~5-10 seconds per test.
 *
 * @param page - Playwright page instance
 */
export async function setupFastTestVideo(page: Page): Promise<void> {
  await useShortTestVideo(page);
  await seedPoseTrackFixture(page, 'swing-sample-4reps');
}

/**
 * Set up route interception to serve the igor-1h-swing video
 * (the current default sample video) instead of fetching from GitHub.
 *
 * Use this with the 'igor-1h-swing' fixture for realistic tests
 * that match the actual production video.
 *
 * @param page - Playwright page instance
 */
export async function useIgorTestVideo(page: Page): Promise<void> {
  const igorVideoPath = path.join(VIDEOS_DIR, 'igor-1h-swing.webm');

  if (!fs.existsSync(igorVideoPath)) {
    throw new Error(
      `Igor test video not found at ${igorVideoPath}. ` +
        'Copy igor-1h-swing.webm to public/videos/'
    );
  }

  await page.route(GITHUB_VIDEO_PATTERN, async (route) => {
    const videoBuffer = fs.readFileSync(igorVideoPath);
    await route.fulfill({
      status: 200,
      contentType: 'video/webm',
      body: videoBuffer,
    });
  });
}

/**
 * Combined setup for realistic tests with igor-1h-swing:
 * 1. Intercepts GitHub video URL → serves local igor-1h-swing video
 * 2. Seeds matching posetrack fixture with correct hash
 *
 * @param page - Playwright page instance
 */
export async function setupIgorTestVideo(page: Page): Promise<void> {
  await useIgorTestVideo(page);
  await seedPoseTrackFixture(page, 'igor-1h-swing');
}
