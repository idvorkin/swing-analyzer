# E2E Testing Plan for Swing Analyzer

## Overview

This document outlines the comprehensive E2E testing strategy for Swing Analyzer using Playwright. The testing approach uses **pre-extracted pose data fixtures** to enable fast, deterministic, and reliable tests without requiring ML model inference.

## Core Testing Strategy

### Why Use Pose Fixtures?

1. **Speed**: No ML model loading (~5-10s) or inference (~30ms/frame)
2. **Determinism**: Same pose data produces same results every time
3. **Reliability**: No WebGL/TensorFlow failures in CI environments
4. **Isolation**: Tests focus on app logic, not ML accuracy

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      E2E Test Suite                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │ Test Helper │   │ Pose        │   │ IndexedDB       │   │
│  │ Functions   │   │ Fixtures    │   │ Seeding         │   │
│  └─────────────┘   └─────────────┘   └─────────────────┘   │
│         │                 │                   │             │
│         └─────────────────┴───────────────────┘             │
│                           │                                  │
│                   ┌───────▼───────┐                         │
│                   │ Playwright    │                         │
│                   │ Browser       │                         │
│                   └───────┬───────┘                         │
│                           │                                  │
│                   ┌───────▼───────┐                         │
│                   │ Swing Analyzer│                         │
│                   │ App           │                         │
│                   └───────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Mock Pose Detector Architecture

E2E tests can run in two modes:

### Mode 1: Pre-Seeded IndexedDB (Cached Poses)

For tests where poses are already "extracted":

- Seed IndexedDB with pose fixture before test
- App finds cached poses, skips extraction
- Uses `CachedPoseSkeletonTransformer` for playback

### Mode 2: Mock Pose Detector (Simulated Extraction)

For tests that exercise the extraction flow:

- Replace real ML detector with `MockPoseDetector`
- Mock detector returns poses from a fixture file
- Simulates realistic extraction timing with FPS delay

```
┌─────────────────────────────────────────────────────────────┐
│                    Real Extraction Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Video Frame ──► TensorFlow ──► Keypoints ──► Pipeline      │
│                   (30-100ms)                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Mock Extraction Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Video Frame ──► MockPoseDetector ──► Keypoints ──► Pipeline│
│                   (configurable delay)                        │
│                   └─ reads from fixture                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### MockPoseDetector Implementation

```typescript
// src/services/MockPoseDetector.ts

export interface MockPoseDetectorOptions {
  /** Pre-extracted pose data to return */
  poseTrack: PoseTrackFile;
  /** Delay per frame to simulate ML inference (ms) */
  frameDelayMs?: number; // Default: 0 (instant)
}

export function createMockPoseDetector(options: MockPoseDetectorOptions): PoseDetector {
  const { poseTrack, frameDelayMs = 0 } = options;
  let frameIndex = 0;

  return {
    async estimatePoses(_image: unknown): Promise<Pose[]> {
      // Simulate ML inference time
      if (frameDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, frameDelayMs));
      }

      // Return pre-computed pose from fixture
      const frame = poseTrack.frames[frameIndex % poseTrack.frames.length];
      frameIndex++;

      return frame.keypoints.length > 0 ? [{ keypoints: frame.keypoints }] : [];
    },

    dispose(): void {},
    reset(): void {
      frameIndex = 0;
    },
  };
}
```

### FPS Delay Simulation

The `frameDelayMs` parameter is critical for realistic testing:

| Scenario       | frameDelayMs | Simulated FPS | Use Case         |
| -------------- | ------------ | ------------- | ---------------- |
| Instant        | 0            | ∞             | Fast unit tests  |
| Fast device    | 33           | ~30 FPS       | High-end desktop |
| Typical device | 67           | ~15 FPS       | Average laptop   |
| Slow device    | 100          | ~10 FPS       | Mobile/low-end   |

**Why simulate FPS delay?**

1. **Timing bugs**: UI that depends on extraction pacing (filmstrip, progress bars)
2. **Race conditions**: Code that assumes extraction takes time
3. **User experience**: See what users actually experience
4. **Realistic reps**: Reps appear at realistic intervals during "extraction"

### Streaming During Extraction

When extraction runs (real or mock), frames stream through the pipeline:

```
Extraction starts
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  Frame 1 extracted ──► FormProcessor ──► RepProcessor │
│      (67ms delay)                                     │
│  Frame 2 extracted ──► FormProcessor ──► RepProcessor │
│      (67ms delay)                                     │
│  ...                                                  │
│  Frame N: Rep detected! ──► Filmstrip updates         │
│      (67ms delay)                                     │
│  ...                                                  │
└──────────────────────────────────────────────────────┘
    │
    ▼
Extraction complete
```

At 15 FPS simulation, a 60-second video with 10 reps:

- Total extraction time: ~4 seconds (60s video ÷ 15 FPS)
- First rep appears: ~0.4 seconds (after ~6 frames)
- User sees thumbnails appearing progressively

### E2E Test Example: Filmstrip During Extraction

```typescript
test('filmstrip populates during extraction', async ({ page }) => {
  // Configure mock detector with realistic timing
  await page.evaluate(() => {
    window.__MOCK_POSE_DETECTOR_CONFIG__ = {
      frameDelayMs: 67, // Simulate 15 FPS extraction
    };
  });

  await page.goto('/');
  await page.click('#load-hardcoded-btn');

  // Wait for first rep to appear (not instant!)
  await expect(page.locator('.filmstrip-thumbnail')).toBeVisible({
    timeout: 5000,
  });

  // More thumbnails should appear over time
  await page.waitForTimeout(2000);
  const count = await page.locator('.filmstrip-thumbnail').count();
  expect(count).toBeGreaterThan(1);
});
```

### Playback vs Extraction FPS

Two different FPS concepts:

| Context                                      | What it controls          | Default     |
| -------------------------------------------- | ------------------------- | ----------- |
| `MockPoseDetector.frameDelayMs`              | Extraction speed          | 0 (instant) |
| `CachedPoseSkeletonTransformer.simulatedFps` | Playback speed from cache | 15 FPS      |

**Extraction FPS**: How fast poses are "detected" during the extraction phase.

**Playback FPS**: How fast cached poses are fed to the pipeline during video playback (after extraction).

## Test Categories

### 1. Smoke Tests (< 30 seconds)

Quick validation that core functionality works.

```typescript
test.describe('@smoke', () => {
  test('app loads and displays UI', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Swing Analyzer');
  });

  test('sample video loads', async ({ page }) => {
    await page.goto('/');
    await page.click('#load-hardcoded-btn');
    await expect(page.locator('video')).toHaveAttribute('src', /swing-sample/);
  });
});
```

### 2. Pose Track Integration Tests

Tests using pre-seeded IndexedDB with pose fixtures.

```typescript
test.describe('Pose Analysis with Fixtures', () => {
  test.beforeEach(async ({ page }) => {
    // Seed IndexedDB with test pose data
    await seedPoseTrackFixture(page, 'swing-sample-poses');
  });

  test('displays spine angle from pose data', async ({ page }) => {
    await page.goto('/');
    await loadVideoWithCachedPoses(page);

    // Should show angle from fixture, not live detection
    await expect(page.locator('#spine-angle')).toHaveText(/\d+°/);
  });

  test('detects reps from pose sequence', async ({ page }) => {
    await page.goto('/');
    await loadVideoWithCachedPoses(page);

    // Play through video with fixture poses
    await page.waitForTimeout(5000);

    await expect(page.locator('#rep-counter')).not.toHaveText('0');
  });
});
```

### 3. Rep Detection Tests

Validate rep counting logic with controlled pose sequences.

```typescript
test.describe('Rep Detection', () => {
  test('counts complete rep cycle', async ({ page }) => {
    // Fixture has exactly 1 complete rep
    await seedPoseTrackFixture(page, 'single-rep');
    await page.goto('/');

    await playVideoToEnd(page);

    await expect(page.locator('#rep-counter')).toHaveText('1');
  });

  test('counts multiple reps', async ({ page }) => {
    // Fixture has exactly 3 complete reps
    await seedPoseTrackFixture(page, 'three-reps');
    await page.goto('/');

    await playVideoToEnd(page);

    await expect(page.locator('#rep-counter')).toHaveText('3');
  });

  test('handles incomplete rep at end', async ({ page }) => {
    // Fixture has 2 complete reps + partial
    await seedPoseTrackFixture(page, 'partial-rep');
    await page.goto('/');

    await playVideoToEnd(page);

    // Should only count complete reps
    await expect(page.locator('#rep-counter')).toHaveText('2');
  });
});
```

### 4. Form Checkpoint Tests

Validate checkpoint capture at key swing positions.

```typescript
test.describe('Form Checkpoints', () => {
  test('captures 4 checkpoints per rep', async ({ page }) => {
    await seedPoseTrackFixture(page, 'single-rep');
    await page.goto('/');

    await playVideoToEnd(page);

    const checkpoints = page.locator('#checkpoint-grid-container canvas');
    await expect(checkpoints).toHaveCount(4);
  });

  test('shows top position checkpoint', async ({ page }) => {
    await seedPoseTrackFixture(page, 'top-position-only');
    await page.goto('/');

    await playVideoToEnd(page);

    await expect(page.locator('[data-checkpoint="top"]')).toBeVisible();
  });
});
```

### 5. PoseTrack Storage Tests

Test IndexedDB persistence and retrieval.

```typescript
test.describe('Pose Track Storage', () => {
  test('saves pose track to IndexedDB', async ({ page }) => {
    await page.goto('/');
    await loadVideoAndExtractPoses(page);

    // Save to storage
    await page.click('#save-posetrack-btn');

    // Verify saved
    const stored = await getPoseTrackFromDB(page);
    expect(stored).not.toBeNull();
  });

  test('loads cached pose track on video reload', async ({ page }) => {
    await seedPoseTrackFixture(page, 'swing-sample-poses');
    await page.goto('/');

    await loadHardcodedVideo(page);

    // Should show "from cache" indicator
    await expect(page.locator('.posetrack-status')).toContainText('cached');
  });
});
```

### 6. Pose Studio Page Tests

Test the debug/power-user page.

```typescript
test.describe('Pose Studio Page', () => {
  test('lists saved pose tracks', async ({ page }) => {
    await seedPoseTrackFixture(page, 'swing-sample-poses');
    await page.goto('/poses');

    await expect(page.locator('.pose-track-list')).toContainText('swing-sample');
  });

  test('allows downloading pose track', async ({ page }) => {
    await seedPoseTrackFixture(page, 'swing-sample-poses');
    await page.goto('/poses');

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-action="download"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.posetrack.json');
  });
});
```

## Pose Fixture Files

### Directory Structure

```
e2e-tests/
├── fixtures/
│   ├── poses/
│   │   ├── swing-sample.posetrack.json      # Matches hardcoded video
│   │   ├── single-rep.posetrack.json        # One complete rep
│   │   ├── three-reps.posetrack.json        # Three complete reps
│   │   ├── partial-rep.posetrack.json       # 2 complete + 1 partial
│   │   ├── top-position-only.posetrack.json # Just top position frames
│   │   └── poor-detection.posetrack.json    # Low confidence scores
│   └── index.ts                              # Fixture exports
├── helpers/
│   ├── indexeddb.ts                          # IndexedDB seeding helpers
│   ├── posetrack.ts                          # Pose track utilities
│   └── video.ts                              # Video playback helpers
└── swing-analyzer.spec.ts                    # Main test file
```

### Fixture Format

Each fixture follows the `PoseTrackFile` schema:

```json
{
  "metadata": {
    "version": "1.0",
    "model": "blazepose",
    "modelVersion": "4.0.0",
    "sourceVideoHash": "<sha256-of-swing-sample.mp4>",
    "sourceVideoName": "swing-sample.mp4",
    "sourceVideoDuration": 10.5,
    "extractedAt": "2024-01-15T10:30:00.000Z",
    "frameCount": 315,
    "fps": 30,
    "videoWidth": 1920,
    "videoHeight": 1080
  },
  "frames": [
    {
      "frameIndex": 0,
      "timestamp": 0,
      "videoTime": 0,
      "keypoints": [...],
      "score": 0.95,
      "angles": {
        "spineAngle": 15.5,
        "armToSpineAngle": 45.2,
        "armToVerticalAngle": 120.0
      }
    }
  ]
}
```

## Test Helpers

### IndexedDB Seeding

```typescript
// e2e-tests/helpers/indexeddb.ts

export async function seedPoseTrackFixture(page: Page, fixtureName: string): Promise<void> {
  const fixture = await loadFixture(fixtureName);

  await page.evaluate(async (data) => {
    const DB_NAME = 'swing-analyzer-posetracks';
    const STORE_NAME = 'posetracks';

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'videoHash' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        store.put({
          videoHash: data.metadata.sourceVideoHash,
          poseTrack: data,
          model: data.metadata.model,
          createdAt: data.metadata.extractedAt,
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };

      request.onerror = () => reject(request.error);
    });
  }, fixture);
}

export async function clearPoseTrackDB(page: Page): Promise<void> {
  await page.evaluate(async () => {
    return new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('swing-analyzer-posetracks');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve(); // Ignore errors
    });
  });
}
```

### Video Playback Helpers

```typescript
// e2e-tests/helpers/video.ts

export async function loadHardcodedVideo(page: Page): Promise<void> {
  await page.click('#load-hardcoded-btn');
  await page.waitForSelector('.status-indicator:has-text("loaded")');
}

export async function playVideoToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video) {
      video.playbackRate = 4; // Speed up for tests
    }
  });

  await page.waitForFunction(
    () => {
      const video = document.querySelector('video');
      return video && video.ended;
    },
    { timeout: 30000 }
  );
}

export async function seekToTime(page: Page, time: number): Promise<void> {
  await page.evaluate((t) => {
    const video = document.querySelector('video');
    if (video) video.currentTime = t;
  }, time);
}
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm test

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

### Test Tagging

```typescript
// Run only smoke tests
// npx playwright test --grep @smoke

// Run only pose fixture tests
// npx playwright test --grep @pose-fixture

// Skip slow tests in CI
// npx playwright test --grep-invert @slow
```

## Advanced Patterns

### 1. Flaky Test Handling

```typescript
// Retry flaky tests
test('pose detection with timeout', async ({ page }) => {
  test.setTimeout(60000);
  // ...
});

// Mark known flaky tests
test.fixme('unstable WebGL test', async ({ page }) => {
  // Skip until fixed
});
```

### 2. Visual Regression

```typescript
test('checkpoint grid screenshot', async ({ page }) => {
  await seedPoseTrackFixture(page, 'single-rep');
  await page.goto('/');
  await playVideoToEnd(page);

  await expect(page.locator('#checkpoint-grid-container')).toHaveScreenshot('checkpoint-grid.png');
});
```

### 3. Performance Testing

```typescript
test('loads cached pose track under 100ms', async ({ page }) => {
  await seedPoseTrackFixture(page, 'swing-sample-poses');

  const startTime = Date.now();
  await page.goto('/');
  await loadHardcodedVideo(page);
  const loadTime = Date.now() - startTime;

  expect(loadTime).toBeLessThan(100);
});
```

## Fixture Generation

### Creating Pose Fixtures from Real Videos

```bash
# 1. Run the app locally
npm run dev

# 2. Load a video and extract poses
# 3. Navigate to /poses page
# 4. Download the .posetrack.json file
# 5. Copy to e2e-tests/fixtures/poses/
```

### Generating Synthetic Fixtures

Use the test helpers from unit tests:

```typescript
// Generate standing pose keypoints
function createStandingKeypoints(): PoseKeypoint[] {
  return [
    { x: 100, y: 20, score: 0.9 }, // nose
    { x: 95, y: 15, score: 0.9 }, // left_eye
    // ... (17 COCO keypoints)
  ];
}

// Generate a complete rep sequence
function createRepSequence(frameCount: number = 90): PoseTrackFrame[] {
  const frames = [];
  // Top position -> Connect -> Bottom -> Release
  // Each phase is ~22 frames at 30fps
  for (let i = 0; i < frameCount; i++) {
    const phase = getPhaseAtFrame(i, frameCount);
    frames.push(createFrameForPhase(i, phase));
  }
  return frames;
}
```

## Test Commands

```bash
# Run all e2e tests
npm test

# Run with UI for debugging
npm run test:ui

# Run specific test file
npx playwright test swing-analyzer.spec.ts

# Run tests with video recording
npx playwright test --video on

# Debug a specific test
npm run test:debug
```

## Known Limitations

1. **ML Model Tests**: Tests requiring actual ML inference should be tagged `@slow` and run separately
2. **WebGL**: Some CI environments may not support WebGL; use fixtures to avoid
3. **Video Playback**: Headless browsers may have limited video codec support
4. **Timing**: Video playback timing can vary; use generous timeouts

## Future Improvements

- [ ] Add visual regression baseline images
- [ ] Implement mobile viewport tests
- [ ] Add accessibility (a11y) tests
- [ ] Create performance benchmark suite
- [ ] Add cross-browser testing (Firefox, Safari)
