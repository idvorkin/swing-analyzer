/**
 * InputSession Tests
 *
 * Tests for the InputSession state machine that manages video input.
 * These are pure unit tests - no React, no actual video.
 */

import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputSession, type InputSessionState } from './InputSession';
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

/**
 * One entry per constructed VideoFileSkeletonSource, in construction order.
 *
 * NOTE: sources are constructed a microtask after startVideoFile() is called
 * (it awaits cleanup() first) — `await Promise.resolve();` before indexing this
 * array. For two back-to-back startVideoFile() calls, both constructions land in
 * the same microtask flush, so a single `await Promise.resolve();` after both
 * calls is sufficient.
 */
const mockSources: MockVideoFileSource[] = [];

vi.mock('./VideoFileSkeletonSource', () => ({
  VideoFileSkeletonSource: vi.fn().mockImplementation(() => {
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

describe('InputSession', () => {
  let session: InputSession;
  let mockVideoElement: HTMLVideoElement;
  let mockCanvasElement: HTMLCanvasElement;

  beforeEach(() => {
    mockSources.length = 0;

    // Create mock DOM elements
    mockVideoElement = document.createElement('video');
    mockCanvasElement = document.createElement('canvas');

    session = new InputSession({
      videoElement: mockVideoElement,
      canvasElement: mockCanvasElement,
    });
  });

  afterEach(() => {
    session.dispose();
  });

  describe('initial state', () => {
    it('starts in idle state', () => {
      expect(session.state).toEqual({ type: 'idle' });
    });

    it('has no active source', () => {
      expect(session.getSource()).toBeNull();
    });
  });

  describe('state$', () => {
    it('emits state changes', () => {
      const states: InputSessionState[] = [];
      const subscription = session.state$.subscribe((state) => {
        states.push(state);
      });

      // Initial state should be emitted
      expect(states).toHaveLength(1);
      expect(states[0]).toEqual({ type: 'idle' });

      subscription.unsubscribe();
    });
  });

  describe('startVideoFile', () => {
    it('creates a video file source', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;

      const source = session.getSource();
      expect(source).not.toBeNull();
      expect(source?.type).toBe('video-file');
    });

    it('calls start on the video source', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;

      const source = session.getVideoFileSource();
      expect(source?.start).toHaveBeenCalled();
    });

    it('cleans up previous source when starting new video file', async () => {
      const mockFile1 = new File(['test1'], 'test1.mp4', { type: 'video/mp4' });
      const startPromise1 = session.startVideoFile(mockFile1);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise1;
      const firstSource = session.getSource();

      const mockFile2 = new File(['test2'], 'test2.mp4', { type: 'video/mp4' });
      const startPromise2 = session.startVideoFile(mockFile2);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise2;

      expect(firstSource?.dispose).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('stops the current source', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;
      const source = session.getSource();

      session.stop();

      expect(source?.stop).toHaveBeenCalled();
    });

    it('transitions to idle state', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;
      session.stop();

      expect(session.state).toEqual({ type: 'idle' });
    });
  });

  describe('getSkeletonAtTime', () => {
    it('returns null when no source', () => {
      const result = session.getSkeletonAtTime(1.0);
      expect(result).toBeNull();
    });

    it('delegates to source when available', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;

      session.getSkeletonAtTime(1.0);

      const source = session.getSource();
      expect(source?.getSkeletonAtTime).toHaveBeenCalledWith(1.0);
    });
  });

  describe('hasSkeletonAtTime', () => {
    it('returns false when no source', () => {
      const result = session.hasSkeletonAtTime(1.0);
      expect(result).toBe(false);
    });

    it('delegates to source when available', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;

      session.hasSkeletonAtTime(1.0);

      const source = session.getSource();
      expect(source?.hasSkeletonAtTime).toHaveBeenCalledWith(1.0);
    });
  });

  describe('save', () => {
    it('throws if not in video file mode', async () => {
      await expect(session.save()).rejects.toThrow(
        'Cannot save: not in video file mode'
      );
    });

    it('delegates to video source when available', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;

      await session.save();

      const source = session.getVideoFileSource();
      expect(source?.save).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('cleans up current source', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;
      const source = session.getSource();

      session.dispose();

      expect(source?.dispose).toHaveBeenCalled();
    });

    it('can be called multiple times safely', () => {
      session.dispose();
      session.dispose();
      // Should not throw
    });
  });

  describe('source type getters', () => {
    it('getVideoFileSource returns source when video file is active', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;
      expect(session.getVideoFileSource()).not.toBeNull();
    });

    it('getVideoFileSource returns null when no source is active', () => {
      expect(session.getVideoFileSource()).toBeNull();
    });
  });

  describe('abort signal support', () => {
    it('passes abort signal to video source start()', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const abortController = new AbortController();

      const startPromise = session.startVideoFile(
        mockFile,
        abortController.signal
      );
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;

      const source = session.getVideoFileSource();
      expect(source?.start).toHaveBeenCalledWith(abortController.signal);
    });

    it('returns early if signal is already aborted', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const abortController = new AbortController();
      abortController.abort();

      await session.startVideoFile(mockFile, abortController.signal);

      // Should not create a source since we aborted before starting
      expect(session.getSource()).toBeNull();
    });

    it('works without abort signal (backward compatible)', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });

      const startPromise = session.startVideoFile(mockFile);
      await Promise.resolve(); // let startVideoFile's internal cleanup() microtask run so the source is constructed
      mockSources[mockSources.length - 1].resolveStart();
      await startPromise;

      const source = session.getVideoFileSource();
      expect(source?.start).toHaveBeenCalledWith(undefined);
    });

    it('cleans up source and returns to idle when abort occurs during start', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const abortController = new AbortController();

      // Override mock to throw AbortError when start is called
      const { VideoFileSkeletonSource } = await import(
        './VideoFileSkeletonSource'
      );
      vi.mocked(VideoFileSkeletonSource).mockImplementationOnce(
        () =>
          ({
            type: 'video-file',
            state: { type: 'idle' },
            state$: {
              pipe: vi.fn().mockReturnThis(),
              subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
            },
            skeletons$: {
              pipe: vi.fn().mockReturnThis(),
              subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
            },
            start: vi
              .fn()
              .mockRejectedValue(new DOMException('Aborted', 'AbortError')),
            stop: vi.fn(),
            dispose: vi.fn(),
            getSkeletonAtTime: vi.fn().mockReturnValue(null),
            hasSkeletonAtTime: vi.fn().mockReturnValue(false),
            save: vi.fn().mockResolvedValue(undefined),
            getLiveCache: vi.fn().mockReturnValue(null),
            getPoseTrack: vi.fn().mockReturnValue(null),
            getVideoHash: vi.fn().mockReturnValue(null),
          }) as unknown as InstanceType<typeof VideoFileSkeletonSource>
      );

      // Create new session that will use the abort-throwing mock
      const abortSession = new InputSession({
        videoElement: mockVideoElement,
        canvasElement: mockCanvasElement,
      });

      await abortSession.startVideoFile(mockFile, abortController.signal);

      // Source should be cleaned up
      expect(abortSession.getSource()).toBeNull();
      // State should be idle
      expect(abortSession.state).toEqual({ type: 'idle' });

      abortSession.dispose();
    });
  });

  describe('race harness', () => {
    it('tracks each constructed source and controls start() resolution', async () => {
      const file = new File(['x'], 'a.mp4', { type: 'video/mp4' });
      const p = session.startVideoFile(file);
      // startVideoFile awaits an internal cleanup() microtask before constructing
      // the source, so let that turn of the microtask queue run first.
      await Promise.resolve();
      expect(mockSources).toHaveLength(1);
      expect(mockSources[0].start).toHaveBeenCalled();
      mockSources[0].resolveStart();
      await p;
      expect(session.state.type).toBe('video-file');
    });
  });

  describe('overlapping startVideoFile calls', () => {
    const fileA = new File(['a'], 'a.mp4', { type: 'video/mp4' });
    const fileB = new File(['b'], 'b.mp4', { type: 'video/mp4' });

    it('a stale abort does not dispose the new source or reset state', async () => {
      const p1 = session.startVideoFile(fileA); // source[0] pending
      const p2 = session.startVideoFile(fileB); // source[1] pending
      // Both back-to-back calls' source constructions land in the same
      // microtask flush (see NOTE above mockSources) — one flush suffices.
      await Promise.resolve();

      // A's in-flight start now rejects with AbortError (stale)
      mockSources[0].rejectStart(new DOMException('Aborted', 'AbortError'));
      await p1;

      // The new source must be untouched and the session must not go idle
      expect(mockSources[1].dispose).not.toHaveBeenCalled();
      expect(session.state.type).not.toBe('idle');

      mockSources[1].resolveStart();
      await p2;
      expect(session.getSource()).toBe(mockSources[1]);
    });

    it('a stale non-abort error does not clobber the new load with error state', async () => {
      const p1 = session.startVideoFile(fileA);
      const p2 = session.startVideoFile(fileB);
      await Promise.resolve();

      mockSources[0].rejectStart(new Error('decode failed'));
      // Stale errors are swallowed (the load was superseded) — p1 must not throw
      await expect(p1).resolves.toBeUndefined();

      expect(session.state.type).not.toBe('error');
      expect(mockSources[1].dispose).not.toHaveBeenCalled();

      mockSources[1].resolveStart();
      await p2;
    });
  });
});
