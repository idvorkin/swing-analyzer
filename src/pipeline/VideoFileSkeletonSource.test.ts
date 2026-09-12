/**
 * VideoFileSkeletonSource tests — cache path, extraction path, completion
 * signaling, and stop() behavior. All collaborators are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoseTrackFile } from '../types/posetrack';
import type { LivePoseCache } from './LivePoseCache';
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
  recordPoseTrackPersistFailure: vi.fn(),
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
import { recordPoseTrackPersistFailure } from '../services/SessionRecorder';
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

/**
 * Build a track with explicit per-frame keypoint counts, simulating the real
 * movenet-era (COCO-17) vs BlazePose (MediaPipe-33) extraction shapes. The
 * existing makeTrack() uses empty keypoints for every frame; this helper
 * produces the bypass shape (empty frame 0 + N-keypoint later frames) the
 * storage-load cache-hit path can actually receive from a stale record.
 */
function makeTrackWithKeypoints(
  keypointCounts: number[],
  model = 'blazepose'
): PoseTrackFile {
  return {
    metadata: {
      version: '1.0',
      model,
      modelVersion: '1.0.0',
      sourceVideoHash: 'hash-abc',
      sourceVideoDuration: 1,
      extractedAt: new Date().toISOString(),
      frameCount: keypointCounts.length,
      fps: 30,
      videoWidth: 640,
      videoHeight: 480,
    },
    frames: Array.from({ length: keypointCounts.length }, (_, i) => ({
      frameIndex: i,
      timestamp: i * 33,
      videoTime: i / 30,
      keypoints: Array.from({ length: keypointCounts[i] }, (_, k) => ({
        x: k,
        y: k,
        score: 0.9,
        name: `kp${k}`,
      })),
    })),
  } as unknown as PoseTrackFile;
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

  it('cache path ends with an active state carrying the atomic batch payload', async () => {
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(makeTrack());
    const source = makeSource();
    const states: SkeletonSourceState[] = [];
    source.state$.subscribe((s) => states.push(s));

    await source.start();
    await flushTimers();

    const last = states[states.length - 1];
    expect(last.type).toBe('active');
    expect(last).toMatchObject({ batch: { framesProcessed: 3 } });
  });

  it('extraction path ALSO ends with a batch payload (was cache-only)', async () => {
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
    expect(last).toMatchObject({ batch: { framesProcessed: 5 } });
  });

  it('storage quota failure still completes the batch, and discloses the failure', async () => {
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(null);
    vi.mocked(extractPosesFromVideo).mockResolvedValue({
      poseTrack: makeTrack(),
    } as Awaited<ReturnType<typeof extractPosesFromVideo>>);
    vi.mocked(savePoseTrackToStorage).mockRejectedValue(
      new Error('QuotaExceededError: storage full')
    );
    const source = makeSource();
    const states: SkeletonSourceState[] = [];
    source.state$.subscribe((s) => states.push(s));

    await expect(source.start()).resolves.toBeUndefined();

    // The session completes normally (frames are live in memory)...
    const last = states[states.length - 1];
    expect(last.type).toBe('active');
    expect(last).toMatchObject({
      batch: { framesProcessed: 3, persistFailed: true },
    });
    // ...and the failure is recorded, not just console.warn'd: next load
    // silently re-extracts, so the session log must say why.
    expect(recordPoseTrackPersistFailure).toHaveBeenCalledWith(
      expect.objectContaining({ videoHash: 'hash-abc' })
    );
  });

  it('getSkeletonAtTime rejects far-from-frontier lookups while extraction is incomplete', async () => {
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(makeTrack(3));
    const source = makeSource();
    await source.start();
    await flushTimers();

    // Frames exist at 0, 1/30, 2/30 s. Far beyond the frontier:
    // complete cache → closest-match is fine; the incomplete case is the
    // one that must NOT match (that's the stale-skeleton-ahead-of-the-
    // extraction-frontier bug). Assert the BEHAVIOR through the real
    // LivePoseCache, not just the plumbed arguments.
    const cache = source.getLiveCache();
    expect(cache).not.toBeNull();
    const incomplete = vi
      .spyOn(cache as LivePoseCache, 'isExtractionComplete')
      .mockReturnValue(false);

    expect(source.getSkeletonAtTime(5.0)).toBeNull();
    expect(source.getSkeletonAtTime(0.05)).not.toBeNull(); // near frontier

    incomplete.mockReturnValue(true);
    expect(source.getSkeletonAtTime(5.0)).not.toBeNull(); // complete → closest
  });

  it('hasSkeletonAtTime agrees with getSkeletonAtTime during incomplete extraction', async () => {
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(makeTrack(3));
    const source = makeSource();
    await source.start();
    await flushTimers();

    const cache = source.getLiveCache();
    vi.spyOn(cache as LivePoseCache, 'isExtractionComplete').mockReturnValue(
      false
    );

    // has(t) must not claim a frame that get(t) refuses to return.
    expect(source.getSkeletonAtTime(5.0)).toBeNull();
    expect(source.hasSkeletonAtTime(5.0)).toBe(false);
  });

  it('restarting the same instance cancels the previous pending cached burst', async () => {
    // start() #1 schedules its burst (3 frames), then start() #2 begins
    // before that macrotask fires. #2 resets the stopped flag, so a plain
    // boolean would let #1's stale burst pass the guard and emit the OLD
    // track's frames (plus a spurious batch state) into the new session.
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(makeTrack(3));
    const source = makeSource();
    const skeletons: unknown[] = [];
    source.skeletons$.subscribe((e) => skeletons.push(e));

    await source.start(); // burst #1 pending
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(makeTrack(5));
    await source.start(); // burst #2 pending, stopped flag reset
    await flushTimers();

    expect(skeletons).toHaveLength(5); // only the new track's frames
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

  it('cache-hit path rejects a legacy movenet record (empty frame 0 + 17-kp later)', async () => {
    // The storage-load route has no keypoint-count gate upstream of
    // fromPoseTrackFile (PoseTrackService.validatePoseTrack only runs on the
    // file-import route), so this is the only guard. An empty frames[0] used
    // to short-circuit it; the fix validates the first non-empty frame.
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(
      makeTrackWithKeypoints([0, 17, 17], 'movenet-lightning')
    );
    const source = makeSource();
    const skeletons: unknown[] = [];
    source.skeletons$.subscribe((e) => skeletons.push(e));
    const states: SkeletonSourceState[] = [];
    source.state$.subscribe((s) => states.push(s));

    await expect(source.start()).rejects.toThrow(
      /Invalid keypoint format - expected 33 keypoints \(MediaPipe-33\), got 17/
    );
    await flushTimers();

    // The throw happens before the cached-burst setTimeout is scheduled,
    // so no skeleton is ever emitted on the misindexed track.
    expect(skeletons).toHaveLength(0);
    // The source surfaces the rejection as an error state.
    expect(states[states.length - 1].type).toBe('error');
  });

  it('cache-hit path still plays a valid BlazePose-33 record with an empty frame 0', async () => {
    // Regression guard for the legitimate shape: no person in shot at t=0
    // (empty frame 0), then 33-keypoint detections. The fix must not turn
    // this into a false rejection.
    vi.mocked(loadPoseTrackFromStorage).mockResolvedValue(
      makeTrackWithKeypoints([0, 33, 33], 'blazepose')
    );
    const source = makeSource();
    const skeletons: unknown[] = [];
    source.skeletons$.subscribe((e) => skeletons.push(e));
    const states: SkeletonSourceState[] = [];
    source.state$.subscribe((s) => states.push(s));

    await source.start();
    await flushTimers();

    // All three cached frames (incl. the empty frame 0) are emitted; the
    // batch completes with an active state. buildSkeletonEventFromFrame is
    // mocked, so the keypoint count of the emitted events isn't visible here,
    // but the burst firing at all confirms the cache was loaded.
    expect(skeletons).toHaveLength(3);
    expect(states[states.length - 1]).toMatchObject({
      type: 'active',
      batch: { framesProcessed: 3 },
    });
  });
});
