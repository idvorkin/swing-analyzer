/**
 * VideoFileSkeletonSource tests — cache path, extraction path, completion
 * signaling, and stop() behavior. All collaborators are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoseTrackFile } from '../types/posetrack';
import type { SkeletonSourceState } from './SkeletonSource';
import { VideoFileSkeletonSource } from './VideoFileSkeletonSource';

vi.mock('../services/PoseExtractor', () => ({
  extractPosesFromVideo: vi.fn(),
}));
vi.mock('../services/PoseTrackService', () => ({
  loadPoseTrackFromStorage: vi.fn(),
  savePoseTrackToStorage: vi.fn(),
}));
vi.mock('../services/SessionRecorder', () => ({
  recordCacheLoad: vi.fn(),
}));
vi.mock('../utils/videoHash', () => ({
  computeQuickVideoHash: vi.fn().mockResolvedValue('hash-abc'),
}));
vi.mock('./PipelineFactory', () => ({
  buildSkeletonEventFromFrame: vi.fn().mockReturnValue({
    skeleton: {},
    poseEvent: { frameEvent: { videoTime: 0 } },
  }),
}));

import { extractPosesFromVideo } from '../services/PoseExtractor';
import {
  loadPoseTrackFromStorage,
  savePoseTrackToStorage,
} from '../services/PoseTrackService';
import { computeQuickVideoHash } from '../utils/videoHash';

function makeTrack(frameCount = 3): PoseTrackFile {
  return {
    metadata: {
      version: '1.0',
      model: 'blazepose',
      modelVersion: '1.0.0',
      sourceVideoHash: 'hash-abc',
      sourceVideoDuration: 1,
      extractedAt: new Date().toISOString(),
      frameCount,
      fps: 30,
      videoWidth: 640,
      videoHeight: 480,
    },
    frames: Array.from({ length: frameCount }, (_, i) => ({
      frameIndex: i,
      timestamp: i * 33,
      videoTime: i / 30,
      keypoints: [],
    })),
  } as PoseTrackFile;
}

function makeSource(): VideoFileSkeletonSource {
  return new VideoFileSkeletonSource({
    videoFile: new File(['x'], 'a.mp4', { type: 'video/mp4' }),
    videoElement: {} as HTMLVideoElement,
    canvasElement: {} as HTMLCanvasElement,
  });
}

const flushTimers = () => new Promise((r) => setTimeout(r, 0));

describe('VideoFileSkeletonSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(savePoseTrackToStorage).mockResolvedValue(undefined);
    // Re-set every test: the afterEach's vi.restoreAllMocks() resets non-spyOn
    // vi.fn() implementations (there's no "original" to restore to), so a
    // mockResolvedValue set only once inside the vi.mock() factory does not
    // survive past the first test.
    vi.mocked(computeQuickVideoHash).mockResolvedValue('hash-abc');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cache path ends with a typed batchComplete active state', async () => {
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(makeTrack());
    const source = makeSource();
    const states: SkeletonSourceState[] = [];
    source.state$.subscribe((s) => states.push(s));

    await source.start();
    await flushTimers();

    const last = states[states.length - 1];
    expect(last.type).toBe('active');
    expect(last).toMatchObject({ batchComplete: true, framesProcessed: 3 });
  });

  it('extraction path ALSO ends with batchComplete (was cache-only)', async () => {
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(null);
    vi.mocked(extractPosesFromVideo).mockResolvedValue({
      poseTrack: makeTrack(5),
    } as Awaited<ReturnType<typeof extractPosesFromVideo>>);
    const source = makeSource();
    const states: SkeletonSourceState[] = [];
    source.state$.subscribe((s) => states.push(s));

    await source.start();

    const last = states[states.length - 1];
    expect(last.type).toBe('active');
    expect(last).toMatchObject({ batchComplete: true, framesProcessed: 5 });
  });

  it('storage quota failure after successful extraction stays active', async () => {
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(null);
    vi.mocked(extractPosesFromVideo).mockResolvedValue({
      poseTrack: makeTrack(),
    } as Awaited<ReturnType<typeof extractPosesFromVideo>>);
    vi.mocked(savePoseTrackToStorage).mockRejectedValue(
      new Error('QuotaExceededError: storage full')
    );
    const source = makeSource();

    await expect(source.start()).resolves.toBeUndefined();
    expect(source.state.type).toBe('active');
  });

  it('stop() before the cached burst fires suppresses emissions', async () => {
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(makeTrack());
    const source = makeSource();
    const skeletons: unknown[] = [];
    source.skeletons$.subscribe((e) => skeletons.push(e));

    await source.start(); // schedules the setTimeout(0) burst
    source.stop(); // stop BEFORE the timer fires
    await flushTimers();

    expect(skeletons).toHaveLength(0);
    expect(source.state.type).toBe('idle');
  });
});
