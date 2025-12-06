/**
 * InputSession Tests
 *
 * Tests for the InputSession state machine that manages video input.
 * These are pure unit tests - no React, no actual video.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputSession, type InputSessionState } from './InputSession';

vi.mock('./VideoFileSkeletonSource', () => ({
  VideoFileSkeletonSource: vi.fn().mockImplementation(() => ({
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
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    dispose: vi.fn(),
    getSkeletonAtTime: vi.fn().mockReturnValue(null),
    hasSkeletonAtTime: vi.fn().mockReturnValue(false),
    save: vi.fn().mockResolvedValue(undefined),
    getLiveCache: vi.fn().mockReturnValue(null),
    getPoseTrack: vi.fn().mockReturnValue(null),
    getVideoHash: vi.fn().mockReturnValue(null),
  })),
}));

describe('InputSession', () => {
  let session: InputSession;
  let mockVideoElement: HTMLVideoElement;
  let mockCanvasElement: HTMLCanvasElement;

  beforeEach(() => {
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
      await session.startVideoFile(mockFile);

      const source = session.getSource();
      expect(source).not.toBeNull();
      expect(source?.type).toBe('video-file');
    });

    it('calls start on the video source', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await session.startVideoFile(mockFile);

      const source = session.getVideoFileSource();
      expect(source?.start).toHaveBeenCalled();
    });

    it('cleans up previous source when starting new video file', async () => {
      const mockFile1 = new File(['test1'], 'test1.mp4', { type: 'video/mp4' });
      await session.startVideoFile(mockFile1);
      const firstSource = session.getSource();

      const mockFile2 = new File(['test2'], 'test2.mp4', { type: 'video/mp4' });
      await session.startVideoFile(mockFile2);

      expect(firstSource?.dispose).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('stops the current source', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await session.startVideoFile(mockFile);
      const source = session.getSource();

      session.stop();

      expect(source?.stop).toHaveBeenCalled();
    });

    it('transitions to idle state', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await session.startVideoFile(mockFile);
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
      await session.startVideoFile(mockFile);

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
      await session.startVideoFile(mockFile);

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
      await session.startVideoFile(mockFile);

      await session.save();

      const source = session.getVideoFileSource();
      expect(source?.save).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('cleans up current source', async () => {
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await session.startVideoFile(mockFile);
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
      await session.startVideoFile(mockFile);
      expect(session.getVideoFileSource()).not.toBeNull();
    });

    it('getVideoFileSource returns null when no source is active', () => {
      expect(session.getVideoFileSource()).toBeNull();
    });
  });
});
