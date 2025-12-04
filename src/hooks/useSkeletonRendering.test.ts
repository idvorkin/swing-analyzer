/**
 * useSkeletonRendering Hook Unit Tests
 *
 * Tests the skeleton rendering hook logic.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSkeletonRendering } from './useSkeletonRendering';
import {
  createTopKeypoints,
  createBottomKeypoints,
  createConnectKeypoints,
  createReleaseKeypoints,
} from '../test-utils/pose-fixtures';
import { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';
import type { LivePoseCache } from '../pipeline/LivePoseCache';
import type { PoseKeypoint } from '../types';

// Mock SkeletonRenderer
vi.mock('../viewmodels/SkeletonRenderer', () => {
  return {
    SkeletonRenderer: vi.fn().mockImplementation(() => ({
      renderSkeleton: vi.fn(),
      setBodyPartDisplay: vi.fn(),
      setDebugMode: vi.fn(),
    })),
  };
});

describe('useSkeletonRendering', () => {
  let videoElement: HTMLVideoElement;
  let canvasElement: HTMLCanvasElement;

  beforeEach(() => {
    // Create mock DOM elements
    videoElement = document.createElement('video');
    canvasElement = document.createElement('canvas');

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('creates skeleton renderer when canvas is available', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      expect(result.current.skeletonRendererRef.current).toBeTruthy();
      expect(SkeletonRenderer).toHaveBeenCalledWith(canvasElement);
    });

    it('sets initial body part display options', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
          showBodyParts: true,
          bodyPartDisplayTime: 1.5,
        })
      );

      const renderer = result.current.skeletonRendererRef.current;
      expect(renderer?.setBodyPartDisplay).toHaveBeenCalledWith(true, 1.5);
    });
  });

  describe('buildSkeletonFromFrame', () => {
    it('builds skeleton from valid TOP keypoints', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      const keypoints = createTopKeypoints();
      const skeleton = result.current.buildSkeletonFromFrame(keypoints);

      expect(skeleton).toBeTruthy();
      expect(skeleton?.getKeypoints()).toEqual(keypoints);
      expect(skeleton?.getSpineAngle()).toBeGreaterThanOrEqual(0);
    });

    it('builds skeleton from valid BOTTOM keypoints', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      const keypoints = createBottomKeypoints();
      const skeleton = result.current.buildSkeletonFromFrame(keypoints);

      expect(skeleton).toBeTruthy();
      expect(skeleton?.getKeypoints()).toEqual(keypoints);
      expect(skeleton?.getSpineAngle()).toBeGreaterThanOrEqual(0);
    });

    it('builds skeleton from valid CONNECT keypoints', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      const keypoints = createConnectKeypoints();
      const skeleton = result.current.buildSkeletonFromFrame(keypoints);

      expect(skeleton).toBeTruthy();
      expect(skeleton?.getKeypoints()).toEqual(keypoints);
    });

    it('builds skeleton from valid RELEASE keypoints', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      const keypoints = createReleaseKeypoints();
      const skeleton = result.current.buildSkeletonFromFrame(keypoints);

      expect(skeleton).toBeTruthy();
      expect(skeleton?.getKeypoints()).toEqual(keypoints);
    });

    it('returns null for empty keypoints array', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      const skeleton = result.current.buildSkeletonFromFrame([]);

      expect(skeleton).toBeNull();
    });

    it('calculates spine angle correctly', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      const topKeypoints = createTopKeypoints();
      const topSkeleton = result.current.buildSkeletonFromFrame(topKeypoints);

      const bottomKeypoints = createBottomKeypoints();
      const bottomSkeleton = result.current.buildSkeletonFromFrame(bottomKeypoints);

      // Both should have spine angles
      expect(topSkeleton?.getSpineAngle()).toBeGreaterThanOrEqual(0);
      expect(bottomSkeleton?.getSpineAngle()).toBeGreaterThanOrEqual(0);
    });

    it('checks keypoint visibility with minimum score threshold', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      // Create keypoints with low scores (below 0.3 threshold)
      const lowScoreKeypoints: PoseKeypoint[] = createTopKeypoints().map(
        (kp) => ({ ...kp, score: 0.1 })
      );

      const skeleton = result.current.buildSkeletonFromFrame(lowScoreKeypoints);

      // Skeleton should be created but marked as not having visible keypoints
      expect(skeleton).toBeTruthy();
      expect(skeleton?.hasRequiredKeypoints()).toBe(false);
    });
  });

  describe('setBodyPartDisplay', () => {
    it('updates body part display settings', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      result.current.setBodyPartDisplay(false, 2.0);

      const renderer = result.current.skeletonRendererRef.current;
      expect(renderer?.setBodyPartDisplay).toHaveBeenCalledWith(false, 2.0);
    });

    it('handles multiple calls to setBodyPartDisplay', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      result.current.setBodyPartDisplay(true, 1.0);
      result.current.setBodyPartDisplay(false, 0.5);
      result.current.setBodyPartDisplay(true, 3.0);

      const renderer = result.current.skeletonRendererRef.current;
      expect(renderer?.setBodyPartDisplay).toHaveBeenCalledTimes(4); // Initial + 3 calls
    });
  });

  describe('setDebugMode', () => {
    it('enables debug mode', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      result.current.setDebugMode(true);

      const renderer = result.current.skeletonRendererRef.current;
      expect(renderer?.setDebugMode).toHaveBeenCalledWith(true);
    });

    it('disables debug mode', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      result.current.setDebugMode(false);

      const renderer = result.current.skeletonRendererRef.current;
      expect(renderer?.setDebugMode).toHaveBeenCalledWith(false);
    });

    it('toggles debug mode', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      result.current.setDebugMode(true);
      result.current.setDebugMode(false);
      result.current.setDebugMode(true);

      const renderer = result.current.skeletonRendererRef.current;
      expect(renderer?.setDebugMode).toHaveBeenCalledTimes(3);
    });
  });

  describe('video event handling', () => {
    it('renders skeleton on timeupdate event', () => {
      const keypoints = createTopKeypoints();
      const mockCache = {
        getFrame: vi.fn().mockReturnValue({ keypoints }),
      } as unknown as LivePoseCache;

      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: mockCache },
        })
      );

      // Trigger timeupdate event
      videoElement.dispatchEvent(new Event('timeupdate'));

      const renderer = result.current.skeletonRendererRef.current;
      expect(renderer?.renderSkeleton).toHaveBeenCalled();
    });

    it('renders skeleton on seeked event', () => {
      const keypoints = createBottomKeypoints();
      const mockCache = {
        getFrame: vi.fn().mockReturnValue({ keypoints }),
      } as unknown as LivePoseCache;

      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: mockCache },
        })
      );

      // Trigger seeked event
      videoElement.dispatchEvent(new Event('seeked'));

      const renderer = result.current.skeletonRendererRef.current;
      expect(renderer?.renderSkeleton).toHaveBeenCalled();
    });

    it('does not render if cache is not available', () => {
      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: null },
        })
      );

      // Clear previous calls from initialization
      const renderer = result.current.skeletonRendererRef.current;
      if (renderer?.renderSkeleton) {
        vi.mocked(renderer.renderSkeleton).mockClear();
      }

      // Trigger timeupdate event
      videoElement.dispatchEvent(new Event('timeupdate'));

      expect(renderer?.renderSkeleton).not.toHaveBeenCalled();
    });

    it('does not render if frame has no keypoints', () => {
      const mockCache = {
        getFrame: vi.fn().mockReturnValue({ keypoints: null }),
      } as unknown as LivePoseCache;

      const { result } = renderHook(() =>
        useSkeletonRendering({
          videoRef: { current: videoElement },
          canvasRef: { current: canvasElement },
          livePoseCacheRef: { current: mockCache },
        })
      );

      const renderer = result.current.skeletonRendererRef.current;
      if (renderer?.renderSkeleton) {
        vi.mocked(renderer.renderSkeleton).mockClear();
      }

      // Trigger timeupdate event
      videoElement.dispatchEvent(new Event('timeupdate'));

      expect(renderer?.renderSkeleton).not.toHaveBeenCalled();
    });
  });
});
