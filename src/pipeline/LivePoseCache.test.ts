/**
 * Behavioral tests for LivePoseCache time lookup. The tolerance logic is
 * what keeps playback ahead of the extraction frontier from rendering the
 * last-extracted skeleton as if it were current — pin it directly rather
 * than only asserting call plumbing in VideoFileSkeletonSource.
 */
import { describe, expect, it } from 'vitest';
import type { PoseTrackFrame } from '../types/posetrack';
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
