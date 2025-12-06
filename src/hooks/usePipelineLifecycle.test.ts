/**
 * usePipelineLifecycle Unit Tests
 *
 * Tests the pipeline lifecycle hook for initialization, subscriptions,
 * and control functions.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import type { RefObject } from 'react';
import { usePipelineLifecycle } from './usePipelineLifecycle';
import { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';
import type { LivePoseCache } from '../pipeline/LivePoseCache';
import type { PoseTrackFile } from '../types/posetrack';
import { Subject } from 'rxjs';

// Mock dependencies
vi.mock('../components/settings/SettingsTab', () => ({
  getSavedModelPreference: vi.fn(() => 'movenet'),
  getSavedBlazePoseVariant: vi.fn(() => 'lite'),
}));

vi.mock('../config/modelConfig', () => ({
  DEFAULT_MODEL_CONFIG: { type: 'movenet', variant: 'lightning' },
  BLAZEPOSE_LITE_CONFIG: { type: 'blazepose', variant: 'lite' },
  BLAZEPOSE_HEAVY_CONFIG: { type: 'blazepose', variant: 'heavy' },
  BLAZEPOSE_FULL_CONFIG: { type: 'blazepose', variant: 'full' },
}));

vi.mock('../services/SessionRecorder', () => ({
  sessionRecorder: {
    setPipelineStateGetter: vi.fn(),
  },
  recordPipelineInit: vi.fn(),
}));

vi.mock('../viewmodels/SkeletonRenderer', () => ({
  SkeletonRenderer: vi.fn(() => ({
    setBodyPartDisplay: vi.fn(),
    renderSkeleton: vi.fn(),
  })),
}));

vi.mock('../pipeline/LivePoseCache', () => ({
  LivePoseCache: {
    fromPoseTrackFile: vi.fn(() => ({
      getFrame: vi.fn(),
      addFrame: vi.fn(),
      getAllFrames: vi.fn(() => []),
    })),
  },
}));

// Mock pipeline factory
const mockPipeline = {
  initialize: vi.fn(async () => {}),
  start: vi.fn(() => new Subject()),
  stop: vi.fn(),
  reset: vi.fn(),
  getRepCount: vi.fn(() => 0),
  getLatestSkeleton: vi.fn(() => null),
  getSkeletonEvents: vi.fn(() => new Subject()),
  getResults: vi.fn(() => new Subject()),
  getCheckpointEvents: vi.fn(() => new Subject()),
  getThumbnailEvents: vi.fn(() => new Subject()),
};

const mockFrameAcquisition = {
  start: vi.fn(() => new Subject()),
  stop: vi.fn(),
  getCurrentFrame: vi.fn(),
  stopCamera: vi.fn(),
};

vi.mock('../pipeline/PipelineFactory', () => ({
  createPipeline: vi.fn(() => mockPipeline),
  createFrameAcquisition: vi.fn(() => mockFrameAcquisition),
}));

describe('usePipelineLifecycle', () => {
  let videoElement: HTMLVideoElement;
  let canvasElement: HTMLCanvasElement;
  let videoRef: RefObject<HTMLVideoElement>;
  let canvasRef: RefObject<HTMLCanvasElement>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock DOM elements
    videoElement = document.createElement('video');
    canvasElement = document.createElement('canvas');

    videoRef = { current: videoElement };
    canvasRef = { current: canvasElement };
  });

  describe('initialization', () => {
    it('initializes pipeline with default model config', async () => {
      const onModelLoaded = vi.fn();
      const onStatusChange = vi.fn();

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onModelLoaded,
          onStatusChange,
        })
      );

      await waitFor(() => {
        expect(mockPipeline.initialize).toHaveBeenCalled();
      });

      expect(onModelLoaded).toHaveBeenCalled();
      expect(onStatusChange).toHaveBeenCalledWith(
        'Ready. Upload a video or start camera.'
      );
      expect(result.current.pipelineRef.current).toBeTruthy();
    });

    it('initializes pipeline with BlazePose config', async () => {
      const { getSavedBlazePoseVariant } = await import(
        '../components/settings/SettingsTab'
      );
      (getSavedBlazePoseVariant as Mock).mockReturnValue('heavy');

      const { createPipeline } = await import('../pipeline/PipelineFactory');

      renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
        })
      );

      await waitFor(() => {
        expect(createPipeline).toHaveBeenCalledWith(
          videoElement,
          canvasElement,
          expect.objectContaining({
            modelConfig: { type: 'blazepose', variant: 'heavy' },
          })
        );
      });
    });

    it('initializes skeleton renderer with body part display options', async () => {
      renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          showBodyParts: false,
          bodyPartDisplayTime: 1.5,
        })
      );

      await waitFor(() => {
        expect(SkeletonRenderer).toHaveBeenCalledWith(canvasElement);
      });

      const rendererInstance = (SkeletonRenderer as unknown as Mock).mock.results[0]
        .value;
      expect(rendererInstance.setBodyPartDisplay).toHaveBeenCalledWith(false, 1.5);
    });

    it('handles initialization errors', async () => {
      const onStatusChange = vi.fn();
      mockPipeline.initialize.mockRejectedValueOnce(new Error('Init failed'));

      renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onStatusChange,
        })
      );

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith(
          'Error: Failed to initialize model.'
        );
      });
    });
  });

  describe('subscriptions', () => {
    it('sets up pipeline subscriptions on initialization', async () => {
      const onRepCountUpdate = vi.fn();
      const onSpineAngleUpdate = vi.fn();
      const onArmToSpineAngleUpdate = vi.fn();

      renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onRepCountUpdate,
          onSpineAngleUpdate,
          onArmToSpineAngleUpdate,
        })
      );

      await waitFor(() => {
        expect(mockPipeline.getSkeletonEvents).toHaveBeenCalled();
        expect(mockPipeline.start).toHaveBeenCalled();
      });
    });

    it('cleans up subscriptions on unmount', async () => {
      const { unmount } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
        })
      );

      await waitFor(() => {
        expect(mockPipeline.initialize).toHaveBeenCalled();
      });

      unmount();

      expect(mockPipeline.stop).toHaveBeenCalled();
    });
  });

  describe('control functions', () => {
    it('starts processing manually', async () => {
      const onProcessingChange = vi.fn();

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onProcessingChange,
        })
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      result.current.startProcessing();

      expect(mockPipeline.start).toHaveBeenCalled();
      expect(onProcessingChange).toHaveBeenCalledWith(true);
    });

    it('stops processing manually', async () => {
      const onProcessingChange = vi.fn();

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onProcessingChange,
        })
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      result.current.stopProcessing();

      expect(mockPipeline.stop).toHaveBeenCalled();
      expect(onProcessingChange).toHaveBeenCalledWith(false);
    });

    it('resets pipeline and state', async () => {
      const onRepCountUpdate = vi.fn();
      const onSpineAngleUpdate = vi.fn();

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onRepCountUpdate,
          onSpineAngleUpdate,
        })
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      result.current.reset();

      expect(mockPipeline.reset).toHaveBeenCalled();
      expect(onRepCountUpdate).toHaveBeenCalledWith(0);
      expect(onSpineAngleUpdate).toHaveBeenCalledWith(0);
    });

    it('resets pipeline only without clearing rep count', async () => {
      const onRepCountUpdate = vi.fn();
      const onSpineAngleUpdate = vi.fn();

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onRepCountUpdate,
          onSpineAngleUpdate,
        })
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      result.current.resetPipelineOnly();

      expect(mockPipeline.reset).toHaveBeenCalled();
      expect(onSpineAngleUpdate).toHaveBeenCalledWith(0);
      // Rep count should NOT be updated
      expect(onRepCountUpdate).not.toHaveBeenCalled();
    });
  });

  describe('reinitialize with cached poses', () => {
    it('reinitializes pipeline with cached pose data', async () => {
      const onUsingCachedPosesChange = vi.fn();
      const onStatusChange = vi.fn();

      const cachedPoseTrack: PoseTrackFile = {
        frames: [],
        metadata: {
          version: '1.0',
          model: 'blazepose',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoName: 'test.mp4',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 0,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
      };

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onUsingCachedPosesChange,
          onStatusChange,
        })
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      vi.clearAllMocks();

      await result.current.reinitializeWithCachedPoses(cachedPoseTrack);

      expect(mockPipeline.stop).toHaveBeenCalled();
      expect(mockPipeline.initialize).toHaveBeenCalled();
      expect(onUsingCachedPosesChange).toHaveBeenCalledWith(true);
      expect(onStatusChange).toHaveBeenCalledWith('Ready (using cached poses)');
    });

    it('handles reinitialization errors gracefully', async () => {
      const onStatusChange = vi.fn();

      const cachedPoseTrack: PoseTrackFile = {
        frames: [],
        metadata: {
          version: '1.0',
          model: 'blazepose',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoName: 'test.mp4',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 0,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
      };

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onStatusChange,
        })
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      // Clear status change calls from initialization
      onStatusChange.mockClear();

      // Mock error for reinitialization
      mockPipeline.initialize.mockRejectedValueOnce(
        new Error('Reinitialization failed')
      );

      await result.current.reinitializeWithCachedPoses(cachedPoseTrack);

      expect(onStatusChange).toHaveBeenCalledWith(
        'Error: Failed to load cached poses'
      );
    });
  });

  describe('reinitialize with live cache', () => {
    it('reinitializes pipeline with live pose cache', async () => {
      const onUsingCachedPosesChange = vi.fn();
      const onStatusChange = vi.fn();

      const liveCache = {
        getFrame: vi.fn(),
        addFrame: vi.fn(),
        getAllFrames: vi.fn(() => []),
      } as unknown as LivePoseCache;

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onUsingCachedPosesChange,
          onStatusChange,
        })
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      vi.clearAllMocks();

      await result.current.reinitializeWithLiveCache(liveCache);

      expect(mockPipeline.stop).toHaveBeenCalled();
      expect(mockPipeline.initialize).toHaveBeenCalled();
      expect(onUsingCachedPosesChange).toHaveBeenCalledWith(true);
      expect(onStatusChange).toHaveBeenCalledWith('Ready (streaming poses)');
    });

    it('does not set up Observable subscriptions for live cache mode', async () => {
      // In cached pose mode, skeleton processing happens via direct processFrame() calls
      // from video event handlers (onSkeletonUpdated), not through Observable subscriptions.
      const liveCache = {
        getFrame: vi.fn(),
        addFrame: vi.fn(),
        getAllFrames: vi.fn(() => []),
      } as unknown as LivePoseCache;

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
        })
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      vi.clearAllMocks();

      await result.current.reinitializeWithLiveCache(liveCache);

      // Should NOT start full streaming pipeline (no Observable subscriptions)
      expect(mockPipeline.start).not.toHaveBeenCalled();
      // No need to call getResults() - updates happen via direct processFrame() calls
    });
  });

  describe('edge cases', () => {
    it('handles missing video or canvas refs', async () => {
      const onStatusChange = vi.fn();

      const emptyVideoRef = { current: null };
      const emptyCanvasRef = { current: null };

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef: emptyVideoRef as RefObject<HTMLVideoElement>,
          canvasRef: emptyCanvasRef as RefObject<HTMLCanvasElement>,
          onStatusChange,
        })
      );

      // Should not crash, just not initialize
      expect(result.current.pipelineRef.current).toBeNull();
    });

    it('does not start processing if pipeline is not initialized', async () => {
      const videoRef = { current: null };
      const canvasRef = { current: null };

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef: videoRef as RefObject<HTMLVideoElement>,
          canvasRef: canvasRef as RefObject<HTMLCanvasElement>,
        })
      );

      // Should not throw
      expect(() => result.current.startProcessing()).not.toThrow();
      expect(() => result.current.stopProcessing()).not.toThrow();
      expect(() => result.current.reset()).not.toThrow();
    });

    it('skips reinitializeWithCachedPoses when video ref is null', async () => {
      const onStatusChange = vi.fn();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // First initialize with valid refs
      const { result, rerender } = renderHook(
        ({ vRef, cRef }) =>
          usePipelineLifecycle({
            videoRef: vRef,
            canvasRef: cRef,
            onStatusChange,
          }),
        {
          initialProps: {
            vRef: videoRef,
            cRef: canvasRef,
          },
        }
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      // Clear mocks from initialization
      onStatusChange.mockClear();
      consoleSpy.mockClear();

      // Now nullify the refs (simulating unmount scenario)
      const nullVideoRef = { current: null } as RefObject<HTMLVideoElement>;
      rerender({ vRef: nullVideoRef, cRef: canvasRef });

      const cachedPoseTrack: PoseTrackFile = {
        frames: [],
        metadata: {
          version: '1.0',
          model: 'blazepose',
          modelVersion: '1.0.0',
          sourceVideoHash: 'test-hash',
          sourceVideoName: 'test.mp4',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 0,
          fps: 30,
          videoWidth: 640,
          videoHeight: 480,
        },
      };

      await result.current.reinitializeWithCachedPoses(cachedPoseTrack);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Cannot reinitialize: video or canvas not ready'
      );
      // Status should NOT have been updated since we returned early
      expect(onStatusChange).not.toHaveBeenCalledWith('Ready (using cached poses)');

      consoleSpy.mockRestore();
    });

    it('skips reinitializeWithLiveCache when canvas ref is null', async () => {
      const onStatusChange = vi.fn();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // First initialize with valid refs
      const { result, rerender } = renderHook(
        ({ vRef, cRef }) =>
          usePipelineLifecycle({
            videoRef: vRef,
            canvasRef: cRef,
            onStatusChange,
          }),
        {
          initialProps: {
            vRef: videoRef,
            cRef: canvasRef,
          },
        }
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      // Clear mocks from initialization
      onStatusChange.mockClear();
      consoleSpy.mockClear();

      // Nullify canvas ref
      const nullCanvasRef = { current: null } as RefObject<HTMLCanvasElement>;
      rerender({ vRef: videoRef, cRef: nullCanvasRef });

      const liveCache = {
        getFrame: vi.fn(),
        addFrame: vi.fn(),
        getAllFrames: vi.fn(() => []),
      } as unknown as LivePoseCache;

      await result.current.reinitializeWithLiveCache(liveCache);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Cannot reinitialize: video or canvas not ready'
      );
      expect(onStatusChange).not.toHaveBeenCalledWith('Ready (streaming poses)');

      consoleSpy.mockRestore();
    });

    it('handles error in reinitializeWithLiveCache gracefully', async () => {
      const onStatusChange = vi.fn();

      const liveCache = {
        getFrame: vi.fn(),
        addFrame: vi.fn(),
        getAllFrames: vi.fn(() => []),
      } as unknown as LivePoseCache;

      const { result } = renderHook(() =>
        usePipelineLifecycle({
          videoRef,
          canvasRef,
          onStatusChange,
        })
      );

      await waitFor(() => {
        expect(result.current.pipelineRef.current).toBeTruthy();
      });

      onStatusChange.mockClear();

      // Mock error for reinitialization
      mockPipeline.initialize.mockRejectedValueOnce(
        new Error('Streaming init failed')
      );

      await result.current.reinitializeWithLiveCache(liveCache);

      expect(onStatusChange).toHaveBeenCalledWith(
        'Error: Failed to initialize streaming'
      );
    });
  });
});
