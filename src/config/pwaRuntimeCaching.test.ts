// @vitest-environment node
/**
 * PWA runtimeCaching config
 *
 * Guards the Workbox runtime-caching routes declared in vite.config.ts. The
 * critical invariant: the TF.js BlazePose model origin (tfhub.dev) must be
 * matched by a CacheFirst runtime route so the installed PWA can load model
 * weights offline after the first visit (commit d6a92d3's offline promise).
 * The model.json + *.bin shards are fetched cross-origin at runtime and are
 * never bundled into dist/, so precache globPatterns/caps cannot reach them.
 */

import { describe, expect, it, vi } from 'vitest';
import type { RuntimeCaching } from 'workbox-build';

// vite.config.ts calls execSync('tailscale status …') at module-eval time.
// Stub the shell-out so importing the config is hermetic; vite.config wraps
// execSync in try/catch and returns [] on throw, so this is safe. We spread
// the real module so any transitive child_process consumer still resolves.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn(() => {
      throw new Error('blocked in test');
    }),
  };
});

const { pwaRuntimeCaching } = await import('../../vite.config');

function matchesUrl(entry: RuntimeCaching, url: string): boolean {
  return entry.urlPattern instanceof RegExp && entry.urlPattern.test(url);
}

describe('PWA runtimeCaching — TF.js model origin', () => {
  it('registers a CacheFirst route for https://tfhub.dev/...', () => {
    const tfhub = pwaRuntimeCaching.find((entry) =>
      matchesUrl(
        entry,
        'https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/detector/1'
      )
    );
    expect(tfhub).toBeDefined();
    expect(tfhub?.handler).toBe('CacheFirst');
  });

  it('uses a dedicated, named cache for the model weights', () => {
    const tfhub = pwaRuntimeCaching.find((entry) =>
      matchesUrl(
        entry,
        'https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/lite/2'
      )
    );
    expect(tfhub?.options?.cacheName).toBe('tfjs-models');
  });

  it('caches both the detector and the landmark model.json + *.bin shards', () => {
    const modelUrls = [
      'https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/detector/1/model.json',
      'https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/detector/1/group1-shard1of1.bin',
      'https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/lite/2/model.json',
      'https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/lite/2/group1-shard1of1.bin',
    ];
    for (const url of modelUrls) {
      const hit = pwaRuntimeCaching.some((entry) => matchesUrl(entry, url));
      expect(hit, `expected a runtimeCaching route to match ${url}`).toBe(true);
    }
  });

  it('keeps the model cache long-lived and bounded', () => {
    const tfhub = pwaRuntimeCaching.find((entry) =>
      matchesUrl(entry, 'https://tfhub.dev/')
    );
    expect(tfhub?.options?.expiration?.maxAgeSeconds).toBeGreaterThanOrEqual(
      60 * 60 * 24 * 365 // at least 1 year
    );
    // blaze detector + landmark (model.json + several shards each) plus
    // headroom for variant switches; 20 matches the documented intent.
    expect(tfhub?.options?.expiration?.maxEntries).toBeGreaterThanOrEqual(20);
  });

  it('accepts both normal 200s and opaque (0) cross-origin responses', () => {
    const tfhub = pwaRuntimeCaching.find((entry) =>
      matchesUrl(entry, 'https://tfhub.dev/')
    );
    expect(tfhub?.options?.cacheableResponse?.statuses).toContain(0);
    expect(tfhub?.options?.cacheableResponse?.statuses).toContain(200);
  });
});

describe('PWA runtimeCaching — no regression to existing routes', () => {
  it('still caches fonts.googleapis.com (CacheFirst, named cache)', () => {
    const fontsCss = pwaRuntimeCaching.find((entry) =>
      matchesUrl(entry, 'https://fonts.googleapis.com/css2?family=Inter')
    );
    expect(fontsCss).toBeDefined();
    expect(fontsCss?.handler).toBe('CacheFirst');
    expect(fontsCss?.options?.cacheName).toBe('google-fonts-cache');
  });

  it('still caches fonts.gstatic.com webfonts (CacheFirst, named cache)', () => {
    const fontFile = pwaRuntimeCaching.find((entry) =>
      matchesUrl(
        entry,
        'https://fonts.gstatic.com/s/inter/v12/UcCO3FwmK3nWFL.woff2'
      )
    );
    expect(fontFile).toBeDefined();
    expect(fontFile?.handler).toBe('CacheFirst');
    expect(fontFile?.options?.cacheName).toBe('google-fonts-webfonts');
  });

  it('every runtimeCaching entry is CacheFirst with a named cache, an expiration age, and a 200-cacheable response', () => {
    expect(pwaRuntimeCaching.length).toBeGreaterThanOrEqual(3);
    for (const entry of pwaRuntimeCaching) {
      expect(entry.handler).toBe('CacheFirst');
      expect(
        entry.options?.cacheName,
        'entry must name its cache'
      ).toBeTruthy();
      expect(
        entry.options?.expiration?.maxAgeSeconds,
        'entry must set an expiration age'
      ).toBeGreaterThan(0);
      expect(entry.options?.cacheableResponse?.statuses).toContain(200);
    }
  });
});
