/**
 * InputSession + real VideoFileSkeletonSource mid-extraction abort
 *
 * Integration test proving the causal link: abort → real source emits late
 * → session delivers late (the bug) / session isolated (the fix).
 *
 * Wires a REAL VideoFileSkeletonSource (not mocked) through a real
 * InputSession.startVideoFile(). extractPosesFromVideo is mocked with a
 * controllable deferred that faithfully mirrors the real abort-check
 * structure: top-of-loop signal check, the signal NOT forwarded to the
 * per-iteration await, and unguarded onFrameExtracted/onProgress callbacks.
 *
 * This closes the gap the unit tests leave open: it proves the real source
 * emits late after stop(), and that the fix (unsubscribing in stop()) keeps
 * those late emissions out of the session.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputSessionState } from './InputSession';
import { InputSession } from './InputSession';
import type { SkeletonEvent } from './PipelineInterfaces';

/**
 * Hoisted harness shared between the (hoisted) extractPosesFromVideo mock
 * factory and the test body. The mock awaits estimatePromise (which the
 * test resolves to simulate the in-flight estimatePoses completing after
 * abort), then fires the unguarded callbacks and loops to the top-of-loop
 * abort check.
 */
const harness = vi.hoisted(() => ({
  /** Resolves the in-flight estimatePoses await inside the mock loop. */
  resolveEstimate: (() => {}) as () => void,
  /** The promise the mock awaits; reset per-test in beforeEach. */
  estimatePromise: null as Promise<void> | null,
}));

vi.mock('../services/PoseExtractor', () => ({
  extractPosesFromVideo: vi.fn(async (_file, options) => {
    const totalFrames = 100;
    let frameIndex = 0;
    while (frameIndex < totalFrames) {
      // Top-of-loop abort check — mirrors real extractPosesFromVideo.
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      // The signal is NOT forwarded to this await — mirrors real
      // estimatePoses/seekToTime, so an in-flight iteration completes
      // after abort.
      await harness.estimatePromise;
      // Unguarded callbacks fire after the await completes — these are
      // the late emissions that leak through if stop() doesn't unsubscribe.
      const frame = {
        frameIndex,
        timestamp: frameIndex * 33,
        videoTime: frameIndex / 30,
        keypoints: [],
        score: 0.5,
      };
      options.onFrameExtracted?.(frame);
      options.onProgress?.({
        currentFrame: frameIndex + 1,
        totalFrames,
        percentage: ((frameIndex + 1) / totalFrames) * 100,
        currentTime: (frameIndex + 1) / 30,
        totalDuration: 100 / 30,
      });
      frameIndex++;
    }
    return {
      poseTrack: { metadata: {}, frames: [] },
      extractionTimeMs: 0,
      extractionFps: 0,
    };
  }),
}));

vi.mock('../services/PoseTrackService', () => ({
  loadPoseTrackFromStorage: vi.fn().mockResolvedValue(null),
  savePoseTrackToStorage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/SessionRecorder', () => ({
  recordCacheLoad: vi.fn(),
  recordPoseTrackPersistFailure: vi.fn(),
}));

vi.mock('../utils/videoHash', () => ({
  computeQuickVideoHash: vi.fn().mockResolvedValue('mock-hash-abc'),
}));

vi.mock('./PipelineFactory', () => ({
  buildSkeletonEventFromFrame: vi.fn().mockReturnValue({
    skeleton: null,
    poseEvent: { pose: null, frameEvent: { videoTime: 0 } },
  } as SkeletonEvent),
}));

describe('InputSession + real VideoFileSkeletonSource mid-extraction abort', () => {
  let session: InputSession;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-arm the estimate promise for each test.
    harness.estimatePromise = new Promise((r) => {
      harness.resolveEstimate = r;
    });
    session = new InputSession({
      videoElement: document.createElement('video'),
      canvasElement: document.createElement('canvas'),
    });
  });

  afterEach(() => {
    session.dispose();
  });

  it('after stop(), late source emissions do not reach the session', async () => {
    const states: InputSessionState[] = [];
    const skeletons: SkeletonEvent[] = [];
    const stateSub = session.state$.subscribe((s) => states.push(s));
    const skeletonSub = session.skeletons$.subscribe((e) => skeletons.push(e));

    // Wait for the extracting state to surface through the session
    // subscription (proves the real source → session wiring is live before
    // we abort it).
    const extractingSeen = new Promise<void>((resolve) => {
      const sub = session.state$.subscribe(function onState(state) {
        if (
          state.type === 'video-file' &&
          state.sourceState.type === 'extracting'
        ) {
          sub.unsubscribe();
          resolve();
        }
      });
    });

    const file = new File(['data'], 'old.mp4', { type: 'video/mp4' });
    const startPromise = session.startVideoFile(file);
    await extractingSeen;

    // Stop mid-extraction: the mock's estimatePoses await is in-flight.
    session.stop();
    expect(session.state).toEqual({ type: 'idle' });
    const lenAfterStop = states.length;

    // Resolve the in-flight estimatePoses — the mock fires one
    // onFrameExtracted + one onProgress, then loops to the top,
    // sees signal.aborted, and throws AbortError. The real source's
    // extract() catches AbortError and emits {type:'idle'} without
    // rethrowing, so start() resolves (not rejects).
    harness.resolveEstimate();
    await startPromise;
    expect(await startPromise).toBeUndefined();

    // GUARANTEE 1: no stray SkeletonEvent reached the session.
    expect(skeletons).toHaveLength(0);

    // GUARANTEE 2: no state revert to video-file/* after stop()'s idle.
    const lateStates = states.slice(lenAfterStop);
    for (const s of lateStates) {
      expect(s.type).not.toBe('video-file');
    }
    expect(lateStates.filter((s) => s.type === 'video-file')).toHaveLength(0);

    // GUARANTEE 3: session state is still idle.
    expect(session.state).toEqual({ type: 'idle' });

    // GUARANTEE 4: the stopped source is still assigned for cache/query
    // access (the documented half-state).
    expect(session.getSource()).not.toBeNull();
    expect(session.getVideoFileSource()).not.toBeNull();

    stateSub.unsubscribe();
    skeletonSub.unsubscribe();
  });
});
