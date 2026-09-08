/**
 * InputSession late-emission isolation after stop()
 *
 * Regression tests: InputSession.stop() must unsubscribe from the source's
 * skeletons$/state$ streams so that late post-abort emissions (one in-flight
 * frame + one extracting/idle state from extractPosesFromVideo's unguarded
 * awaits) do not revert the session from idle back to video-file/... or
 * push an old-video frame into the freshly reset pipeline. stop() keeps
 * this.source assigned for cache/query access (the "stopped but queryable"
 * half-state the upload path relies on).
 *
 * These tests use the same controllable mock-source harness as
 * InputSession.test.ts to drive each late-emission path in isolation and
 * assert the session stays isolated after stop().
 */

import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputSessionState } from './InputSession';
import { InputSession } from './InputSession';
import type { SkeletonEvent } from './PipelineInterfaces';
import type { SkeletonSourceState } from './SkeletonSource';

/** A mock source whose start() promise is controlled by the test. */
interface MockVideoFileSource {
  type: 'video-file';
  state: SkeletonSourceState;
  stateSubject: BehaviorSubject<SkeletonSourceState>;
  skeletonSubject: Subject<SkeletonEvent>;
  state$: BehaviorSubject<SkeletonSourceState>;
  skeletons$: Subject<SkeletonEvent>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  getSkeletonAtTime: ReturnType<typeof vi.fn>;
  hasSkeletonAtTime: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  getLiveCache: ReturnType<typeof vi.fn>;
  getPoseTrack: ReturnType<typeof vi.fn>;
  getVideoHash: ReturnType<typeof vi.fn>;
  resolveStart: () => void;
  rejectStart: (err: unknown) => void;
}

const mockSources: MockVideoFileSource[] = [];

vi.mock('./VideoFileSkeletonSource', () => ({
  // biome-ignore lint/complexity/useArrowFunction: arrow functions are not constructable; this mock is invoked with `new`
  VideoFileSkeletonSource: vi.fn().mockImplementation(function () {
    const stateSubject = new BehaviorSubject<SkeletonSourceState>({
      type: 'idle',
    });
    const skeletonSubject = new Subject<SkeletonEvent>();
    let resolveStart: () => void = () => {};
    let rejectStart: (err: unknown) => void = () => {};
    const startPromise = new Promise<void>((resolve, reject) => {
      resolveStart = resolve;
      rejectStart = reject;
    });
    const source: MockVideoFileSource = {
      type: 'video-file',
      get state() {
        return stateSubject.getValue();
      },
      stateSubject,
      skeletonSubject,
      state$: stateSubject,
      skeletons$: skeletonSubject,
      start: vi.fn().mockReturnValue(startPromise),
      stop: vi.fn(),
      dispose: vi.fn(),
      getSkeletonAtTime: vi.fn().mockReturnValue(null),
      hasSkeletonAtTime: vi.fn().mockReturnValue(false),
      save: vi.fn().mockResolvedValue(undefined),
      getLiveCache: vi.fn().mockReturnValue(null),
      getPoseTrack: vi.fn().mockReturnValue(null),
      getVideoHash: vi.fn().mockReturnValue(null),
      resolveStart,
      rejectStart,
    } as MockVideoFileSource;
    mockSources.push(source);
    return source;
  }),
}));

describe('InputSession late-emission isolation after stop()', () => {
  let session: InputSession;

  beforeEach(() => {
    mockSources.length = 0;
    session = new InputSession({
      videoElement: document.createElement('video'),
      canvasElement: document.createElement('canvas'),
    });
  });

  afterEach(() => {
    session.dispose();
  });

  /**
   * Start a video file and surface the extracting state through the session,
   * returning the mock source and the start promise.
   */
  async function startAndReachExtracting(fileName: string) {
    const file = new File(['data'], fileName, { type: 'video/mp4' });
    const startPromise = session.startVideoFile(file);
    await Promise.resolve(); // pump microtask so constructor + start run
    const source = mockSources[mockSources.length - 1];

    // Surface the extracting state through the session subscription.
    source.stateSubject.next({
      type: 'extracting',
      progress: {
        currentFrame: 0,
        totalFrames: 100,
        percentage: 0,
        currentTime: 0,
        totalDuration: 10,
      },
    });
    return { source, startPromise };
  }

  it('does NOT revert session state to video-file/idle when stopped source emits idle late', async () => {
    const { source, startPromise } = await startAndReachExtracting('old.mp4');

    const states: InputSessionState[] = [];
    const stateSub = session.state$.subscribe((s) => states.push(s));

    session.stop();
    expect(session.state).toEqual({ type: 'idle' });
    const lenAfterStop = states.length;

    // Simulate the late catch-block {type:'idle'} the real
    // VideoFileSkeletonSource.extract() emits after AbortError.
    source.stateSubject.next({ type: 'idle' });
    source.resolveStart();
    await startPromise;

    // No state may arrive after stop()'s idle.
    const lateStates = states.slice(lenAfterStop);
    expect(lateStates).toHaveLength(0);
    expect(session.state).toEqual({ type: 'idle' });
    stateSub.unsubscribe();
  });

  it('does NOT deliver a stray SkeletonEvent through session.skeletons$ after stop()', async () => {
    const { source, startPromise } = await startAndReachExtracting('old.mp4');

    // Subject (not BehaviorSubject) — no initial emission, starts empty.
    const received: SkeletonEvent[] = [];
    const skeletonSub = session.skeletons$.subscribe((e) => received.push(e));

    session.stop();
    expect(session.state).toEqual({ type: 'idle' });

    // Simulate the late onFrameExtracted callback: the in-flight frame
    // completes post-abort and the source emits a stray skeleton event
    // from the OLD video into the session.
    source.skeletonSubject.next({
      skeleton: null,
      poseEvent: {
        pose: null,
        frameEvent: {
          frame: null as unknown as HTMLCanvasElement,
          timestamp: 0 as never,
          videoTime: 0 as never,
        },
      },
    } as unknown as SkeletonEvent);
    source.resolveStart();
    await startPromise;

    // No stray OLD-video frame may reach the freshly reset pipeline.
    expect(received).toHaveLength(0);
    expect(session.state).toEqual({ type: 'idle' });
    skeletonSub.unsubscribe();
  });

  it('keeps this.source assigned after stop() so cache/query access still works', async () => {
    const { source, startPromise } = await startAndReachExtracting('old.mp4');

    session.stop();
    source.resolveStart();
    await startPromise;

    // The stopped source must remain assigned for cache/query access
    // (the documented "stopped but queryable" half-state).
    expect(session.getSource()).toBe(source);
    expect(session.getVideoFileSource()).toBe(source);
  });
});
