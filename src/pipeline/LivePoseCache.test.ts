/**
 * Behavioral tests for LivePoseCache time lookup. The tolerance logic is
 * what keeps playback ahead of the extraction frontier from rendering the
 * last-extracted skeleton as if it were current — pin it directly rather
 * than only asserting call plumbing in VideoFileSkeletonSource.
 */
import { describe, expect, it } from 'vitest';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';
import { MEDIAPIPE_KEYPOINT_COUNT } from './KeypointAdapter';
import { LivePoseCache } from './LivePoseCache';

function makeFrame(videoTime: number, frameIndex: number): PoseTrackFrame {
  return {
    frameIndex,
    timestamp: frameIndex * 33,
    videoTime,
    keypoints: [],
  } as unknown as PoseTrackFrame;
}

function seededCache(times: number[]): LivePoseCache {
  const cache = new LivePoseCache('hash-test');
  times.forEach((t, i) => {
    cache.addFrame(makeFrame(t, i));
  });
  return cache;
}

describe('LivePoseCache.getFrame', () => {
  it('returns the exact frame when one exists at the requested time', () => {
    const cache = seededCache([0, 0.5, 1.0]);
    expect(cache.getFrame(0.5)?.videoTime).toBe(0.5);
  });

  it('without tolerance, returns the closest frame no matter how far (unlimited default)', () => {
    const cache = seededCache([0, 0.033, 0.066]);
    // 5s beyond the frontier — the unlimited default still matches. This
    // is the footgun the tolerance parameter exists to disarm; callers in
    // mid-extraction MUST pass a tolerance.
    expect(cache.getFrame(5.0)?.videoTime).toBe(0.066);
  });

  it('with tolerance, matches a nearby frame within the window', () => {
    const cache = seededCache([0, 0.033, 0.066]);
    expect(cache.getFrame(0.07, 0.1)?.videoTime).toBe(0.066);
  });

  it('with tolerance, rejects a closest frame beyond the window', () => {
    const cache = seededCache([0, 0.033, 0.066]);
    expect(cache.getFrame(5.0, 0.1)).toBeNull();
  });
});

describe('LivePoseCache.hasFrame', () => {
  it('agrees with getFrame when given the same tolerance', () => {
    const cache = seededCache([0, 0.033, 0.066]);
    // has(t) === (get(t) !== null) must hold for the same arguments —
    // a divergence here is an API contradiction waiting for a caller.
    expect(cache.hasFrame(5.0, 0.1)).toBe(false);
    expect(cache.hasFrame(0.07, 0.1)).toBe(true);
    expect(cache.hasFrame(5.0)).toBe(true); // unlimited default matches
  });
});

/**
 * Helpers for the fromPoseTrackFile validation tests.
 *
 * Keypoint count is what isMediaPipeFormat actually checks (see KeypointAdapter),
 * so we vary it to simulate MediaPipe-33 (33), legacy COCO-17 (17), and the
 * empty-frame case (no detected person -> []).
 */
function keypointFrame(
  videoTime: number,
  frameIndex: number,
  keypointCount: number
): PoseTrackFrame {
  return {
    frameIndex,
    timestamp: frameIndex * 33,
    videoTime,
    keypoints: Array.from({ length: keypointCount }, (_, i) => ({
      x: i,
      y: i,
      score: 0.9,
      name: `kp${i}`,
    })),
  } as unknown as PoseTrackFrame;
}

function trackWithFrames(frames: PoseTrackFrame[]): PoseTrackFile {
  return {
    metadata: {
      version: '1.0',
      model: 'blazepose',
      modelVersion: '1.0.0',
      sourceVideoHash: 'hash-repro',
      sourceVideoName: 'repro.mp4',
      sourceVideoDuration: 3,
      extractedAt: '2026-09-08T00:00:00.000Z',
      frameCount: frames.length,
      fps: 30,
      videoWidth: 1280,
      videoHeight: 720,
    } as unknown as PoseTrackFile['metadata'],
    frames,
  };
}

describe('LivePoseCache.fromPoseTrackFile keypoint validation', () => {
  it('throws on legacy COCO-17 frames when the first frame has keypoints', () => {
    const track = trackWithFrames([
      keypointFrame(0.0, 0, 17),
      keypointFrame(0.033, 1, 17),
    ]);
    expect(() => LivePoseCache.fromPoseTrackFile(track)).toThrowError(
      /Invalid keypoint format - expected 33 keypoints \(MediaPipe-33\), got 17/
    );
  });

  it(
    'throws on legacy COCO-17 frames even when frame 0 is empty (the bug: ' +
      'an empty first frame used to short-circuit the whole guard)',
    () => {
      const track = trackWithFrames([
        keypointFrame(0.0, 0, 0),
        keypointFrame(0.033, 1, 17),
        keypointFrame(0.066, 2, 17),
      ]);
      expect(() => LivePoseCache.fromPoseTrackFile(track)).toThrowError(
        /Invalid keypoint format - expected 33 keypoints \(MediaPipe-33\), got 17/
      );
    }
  );

  it('rejects based on the first non-empty frame, not just the first frame', () => {
    // First non-empty frame is COCO-17 at index 2 -> must throw.
    const track = trackWithFrames([
      keypointFrame(0.0, 0, 0),
      keypointFrame(0.033, 1, 0),
      keypointFrame(0.066, 2, 17),
    ]);
    expect(() => LivePoseCache.fromPoseTrackFile(track)).toThrowError(/got 17/);
  });

  it('loads a valid MediaPipe-33 track whose first frame is empty', () => {
    // This is the legitimate BlazePose shape: no person at t=0, then 33-kp
    // detections. The fix must NOT regress the happy path.
    const track = trackWithFrames([
      keypointFrame(0.0, 0, 0),
      keypointFrame(0.033, 1, MEDIAPIPE_KEYPOINT_COUNT),
      keypointFrame(0.066, 2, MEDIAPIPE_KEYPOINT_COUNT),
    ]);
    const cache = LivePoseCache.fromPoseTrackFile(track);
    expect(cache).toBeInstanceOf(LivePoseCache);
    expect(cache.getFrameCount()).toBe(3);
    expect(cache.getFrame(0.033)?.keypoints.length).toBe(
      MEDIAPIPE_KEYPOINT_COUNT
    );
    expect(cache.getFrame(0.0)?.keypoints.length).toBe(0);
  });

  it('loads a track whose frames are all empty (no detected person anywhere)', () => {
    // Nothing to validate against -> should load without throwing.
    const track = trackWithFrames([
      keypointFrame(0.0, 0, 0),
      keypointFrame(0.033, 1, 0),
    ]);
    const cache = LivePoseCache.fromPoseTrackFile(track);
    expect(cache.getFrameCount()).toBe(2);
  });

  it('rejects mixed COCO-17 + MediaPipe-33 (first non-empty sample wins)', () => {
    // A track that claims 33 later but opens with 17 is still legacy and
    // must be rejected at the first non-empty frame.
    const track = trackWithFrames([
      keypointFrame(0.0, 0, 0),
      keypointFrame(0.033, 1, 17),
      keypointFrame(0.066, 2, MEDIAPIPE_KEYPOINT_COUNT),
    ]);
    expect(() => LivePoseCache.fromPoseTrackFile(track)).toThrowError(/got 17/);
  });
});
