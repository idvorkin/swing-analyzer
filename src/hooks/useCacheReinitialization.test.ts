/**
 * useCacheReinitialization Hook Tests
 *
 * Tests the cache reinitialization logic for switching between ML inference
 * and cached pose modes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCacheReinitialization } from './useCacheReinitialization';
import type { Pipeline } from '../pipeline/Pipeline';
import type { LivePoseCache } from '../pipeline/LivePoseCache';
import type { PoseTrackFile } from '../types/posetrack';
import { createTopKeypoints } from '../test-utils/pose-fixtures';

// Mock the PipelineFactory module
vi.mock('../pipeline/PipelineFactory', () => ({
  createPipeline: vi.fn(),
}));

// Mock the LivePoseCache class
vi.mock('../pipeline/LivePoseCache', () => ({
  LivePoseCache: {
    fromPoseTrackFile: vi.fn(),
  },
}));

describe('useCacheReinitialization', () => {
  let mockVideoRef: React.RefObject<HTMLVideoElement>;
  let mockCanvasRef: React.RefObject<HTMLCanvasElement>;
  let mockPipelineRef: React.MutableRefObject<Pipeline | null>;
  let mockSubscriptionsRef: React.MutableRefObject<{ unsubscribe: () => void }[]>;
  let mockCallbacks: {
    setupBatchSubscriptions: ReturnType<typeof vi.fn>;
    setAppState: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    setUsingCachedPoses: ReturnType<typeof vi.fn>;
  };

  // Mock video and canvas elements
  let mockVideo: HTMLVideoElement;
  let mockCanvas: HTMLCanvasElement;

  // Mock pipeline
  let mockPipeline: Pipeline;

  // Mock subscription
  let mockSubscription: { unsubscribe: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // Create mock DOM elements
    mockVideo = document.createElement('video');
    mockCanvas = document.createElement('canvas');

    // Create mock refs
    mockVideoRef = { current: mockVideo };
    mockCanvasRef = { current: mockCanvas };

    // Create mock subscription
    mockSubscription = { unsubscribe: vi.fn() };

    // Create mock pipeline
    mockPipeline = {
      stop: vi.fn(),
      initialize: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      reset: vi.fn(),
      getRepCount: vi.fn().mockReturnValue(0),
      getLatestSkeleton: vi.fn().mockReturnValue(null),
    } as unknown as Pipeline;

    mockPipelineRef = { current: mockPipeline };
    mockSubscriptionsRef = { current: [mockSubscription] };

    // Create mock callbacks
    mockCallbacks = {
      setupBatchSubscriptions: vi.fn(),
      setAppState: vi.fn(),
      setStatus: vi.fn(),
      setUsingCachedPoses: vi.fn(),
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('reinitializeWithCachedPoses', () => {
    it('stops current pipeline and cleans up subscriptions', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockPoseTrack: PoseTrackFile = {
        metadata: {
          version: '1.0',
          model: 'movenet-lightning',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 300,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
        frames: [
          {
            frameIndex: 0,
            timestamp: 0,
            videoTime: 0,
            keypoints: createTopKeypoints(),
            score: 0.9,
          },
        ],
      };

      await result.current.reinitializeWithCachedPoses(mockPoseTrack);

      expect(mockPipeline.stop).toHaveBeenCalled();
      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(mockSubscriptionsRef.current).toEqual([]);
    });

    it('creates new pipeline with cached pose track', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockPoseTrack: PoseTrackFile = {
        metadata: {
          version: '1.0',
          model: 'movenet-lightning',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 300,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
        frames: [],
      };

      await result.current.reinitializeWithCachedPoses(mockPoseTrack);

      expect(createPipeline).toHaveBeenCalledWith(mockVideo, mockCanvas, {
        cachedPoseTrack: mockPoseTrack,
      });
    });

    it('initializes pipeline and sets up batch subscriptions', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockPoseTrack: PoseTrackFile = {
        metadata: {
          version: '1.0',
          model: 'movenet-lightning',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 300,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
        frames: [],
      };

      await result.current.reinitializeWithCachedPoses(mockPoseTrack);

      expect(mockPipeline.initialize).toHaveBeenCalled();
      expect(mockCallbacks.setupBatchSubscriptions).toHaveBeenCalledWith(mockPipeline);
    });

    it('updates state to indicate cached poses are being used', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockPoseTrack: PoseTrackFile = {
        metadata: {
          version: '1.0',
          model: 'movenet-lightning',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 300,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
        frames: [],
      };

      await result.current.reinitializeWithCachedPoses(mockPoseTrack);

      expect(mockCallbacks.setUsingCachedPoses).toHaveBeenCalledWith(true);
      expect(mockCallbacks.setAppState).toHaveBeenCalled();
      expect(mockCallbacks.setStatus).toHaveBeenCalledWith('Ready (using cached poses)');
    });

    it('converts PoseTrackFile to LivePoseCache', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      const { LivePoseCache } = await import('../pipeline/LivePoseCache');

      const mockLiveCache = {} as LivePoseCache;
      vi.mocked(LivePoseCache.fromPoseTrackFile).mockReturnValue(mockLiveCache);
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockPoseTrack: PoseTrackFile = {
        metadata: {
          version: '1.0',
          model: 'movenet-lightning',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 300,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
        frames: [],
      };

      await result.current.reinitializeWithCachedPoses(mockPoseTrack);

      expect(LivePoseCache.fromPoseTrackFile).toHaveBeenCalledWith(mockPoseTrack);
      expect(result.current.livePoseCacheRef.current).toBe(mockLiveCache);
    });

    it('handles missing video or canvas refs gracefully', async () => {
      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: { current: null },
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockPoseTrack: PoseTrackFile = {
        metadata: {
          version: '1.0',
          model: 'movenet-lightning',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 300,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
        frames: [],
      };

      await result.current.reinitializeWithCachedPoses(mockPoseTrack);

      // Should not attempt to create pipeline
      expect(mockPipeline.stop).not.toHaveBeenCalled();
    });

    it('handles initialization errors gracefully', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      const error = new Error('Initialization failed');
      const failingPipeline = {
        stop: vi.fn(),
        initialize: vi.fn().mockRejectedValue(error),
      } as unknown as Pipeline;

      vi.mocked(createPipeline).mockReturnValue(failingPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockPoseTrack: PoseTrackFile = {
        metadata: {
          version: '1.0',
          model: 'movenet-lightning',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 300,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
        frames: [],
      };

      await result.current.reinitializeWithCachedPoses(mockPoseTrack);

      expect(mockCallbacks.setStatus).toHaveBeenCalledWith(
        'Error: Failed to load cached poses'
      );
    });
  });

  describe('reinitializeWithLiveCache', () => {
    it('stops current pipeline and cleans up subscriptions', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockLiveCache = {} as LivePoseCache;

      await result.current.reinitializeWithLiveCache(mockLiveCache);

      expect(mockPipeline.stop).toHaveBeenCalled();
      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(mockSubscriptionsRef.current).toEqual([]);
    });

    it('creates new pipeline with live pose cache', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockLiveCache = {} as LivePoseCache;

      await result.current.reinitializeWithLiveCache(mockLiveCache);

      expect(createPipeline).toHaveBeenCalledWith(mockVideo, mockCanvas, {
        livePoseCache: mockLiveCache,
      });
    });

    it('initializes pipeline and sets up batch subscriptions', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockLiveCache = {} as LivePoseCache;

      await result.current.reinitializeWithLiveCache(mockLiveCache);

      expect(mockPipeline.initialize).toHaveBeenCalled();
      expect(mockCallbacks.setupBatchSubscriptions).toHaveBeenCalledWith(mockPipeline);
    });

    it('updates state to indicate streaming poses are being used', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockLiveCache = {} as LivePoseCache;

      await result.current.reinitializeWithLiveCache(mockLiveCache);

      expect(mockCallbacks.setUsingCachedPoses).toHaveBeenCalledWith(true);
      expect(mockCallbacks.setAppState).toHaveBeenCalled();
      expect(mockCallbacks.setStatus).toHaveBeenCalledWith('Ready (streaming poses)');
    });

    it('stores live cache in ref', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      vi.mocked(createPipeline).mockReturnValue(mockPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockLiveCache = {} as LivePoseCache;

      await result.current.reinitializeWithLiveCache(mockLiveCache);

      expect(result.current.livePoseCacheRef.current).toBe(mockLiveCache);
    });

    it('handles missing video or canvas refs gracefully', async () => {
      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: { current: null },
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockLiveCache = {} as LivePoseCache;

      await result.current.reinitializeWithLiveCache(mockLiveCache);

      // Should not attempt to create pipeline
      expect(mockPipeline.stop).not.toHaveBeenCalled();
    });

    it('handles initialization errors gracefully', async () => {
      const { createPipeline } = await import('../pipeline/PipelineFactory');
      const error = new Error('Initialization failed');
      const failingPipeline = {
        stop: vi.fn(),
        initialize: vi.fn().mockRejectedValue(error),
      } as unknown as Pipeline;

      vi.mocked(createPipeline).mockReturnValue(failingPipeline);

      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      const mockLiveCache = {} as LivePoseCache;

      await result.current.reinitializeWithLiveCache(mockLiveCache);

      expect(mockCallbacks.setStatus).toHaveBeenCalledWith(
        'Error: Failed to initialize streaming'
      );
    });
  });

  describe('livePoseCacheRef', () => {
    it('provides access to the live pose cache ref', () => {
      const { result } = renderHook(() =>
        useCacheReinitialization({
          videoRef: mockVideoRef,
          canvasRef: mockCanvasRef,
          pipelineRef: mockPipelineRef,
          subscriptionsRef: mockSubscriptionsRef,
          callbacks: mockCallbacks,
        })
      );

      expect(result.current.livePoseCacheRef).toBeDefined();
      expect(result.current.livePoseCacheRef.current).toBeNull();
    });
  });
});
