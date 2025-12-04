import { useCallback, useEffect, useRef } from 'react';
import { Skeleton } from '../models/Skeleton';
import type { LivePoseCache } from '../pipeline/LivePoseCache';
import { CocoBodyParts, type PoseKeypoint } from '../types';
import { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';

export interface UseSkeletonRenderingOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  livePoseCacheRef: React.RefObject<LivePoseCache | null>;
  showBodyParts?: boolean;
  bodyPartDisplayTime?: number;
}

export interface SkeletonRenderingReturn {
  buildSkeletonFromFrame: (keypoints: PoseKeypoint[]) => Skeleton | null;
  setBodyPartDisplay: (show: boolean, displaySeconds: number) => void;
  setDebugMode: (enabled: boolean) => void;
  skeletonRendererRef: React.RefObject<SkeletonRenderer | null>;
}

/**
 * Hook to manage skeleton rendering logic
 *
 * Extracts skeleton rendering logic from useSwingAnalyzer:
 * - Building Skeleton from PoseKeypoint[]
 * - Cache-based skeleton rendering on video timeupdate/seeked events
 * - Body part display settings
 * - Debug mode toggle
 * - SkeletonRenderer ref management
 */
export function useSkeletonRendering({
  videoRef,
  canvasRef,
  livePoseCacheRef,
  showBodyParts = true,
  bodyPartDisplayTime = 0.5,
}: UseSkeletonRenderingOptions): SkeletonRenderingReturn {
  const skeletonRendererRef = useRef<SkeletonRenderer | null>(null);

  // Initialize skeleton renderer when canvas is ready
  useEffect(() => {
    if (canvasRef.current && !skeletonRendererRef.current) {
      skeletonRendererRef.current = new SkeletonRenderer(canvasRef.current);
      skeletonRendererRef.current.setBodyPartDisplay(
        showBodyParts,
        bodyPartDisplayTime
      );
    }
  }, [canvasRef, showBodyParts, bodyPartDisplayTime]);

  // Helper function to build a Skeleton from cached frame data
  const buildSkeletonFromFrame = useCallback((keypoints: PoseKeypoint[]): Skeleton | null => {
    if (!keypoints || keypoints.length === 0) return null;

    // Calculate spine angle
    const leftShoulder = keypoints[CocoBodyParts.LEFT_SHOULDER];
    const rightShoulder = keypoints[CocoBodyParts.RIGHT_SHOULDER];
    const leftHip = keypoints[CocoBodyParts.LEFT_HIP];
    const rightHip = keypoints[CocoBodyParts.RIGHT_HIP];

    let spineAngle = 0;
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
      const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
      const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
      const hipMidX = (leftHip.x + rightHip.x) / 2;
      const hipMidY = (leftHip.y + rightHip.y) / 2;
      const deltaX = shoulderMidX - hipMidX;
      const deltaY = hipMidY - shoulderMidY;
      spineAngle = Math.abs((Math.atan2(deltaX, deltaY) * 180) / Math.PI);
    }

    // Check visibility
    const minScore = 0.3;
    const hasVisibleKeypoints =
      (leftShoulder?.score ?? 0) >= minScore &&
      (rightShoulder?.score ?? 0) >= minScore &&
      (leftHip?.score ?? 0) >= minScore &&
      (rightHip?.score ?? 0) >= minScore;

    return new Skeleton(keypoints, spineAngle, hasVisibleKeypoints);
  }, []);

  // Set body part display options
  const setBodyPartDisplay = useCallback(
    (show: boolean, displaySeconds: number) => {
      if (skeletonRendererRef.current) {
        skeletonRendererRef.current.setBodyPartDisplay(show, displaySeconds);
      }
    },
    []
  );

  // Set debug mode
  const setDebugMode = useCallback((enabled: boolean) => {
    if (skeletonRendererRef.current) {
      skeletonRendererRef.current.setDebugMode(enabled);
    }
  }, []);

  // Render skeleton from cache on video time updates (for cached pose playback)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const renderSkeletonFromCache = () => {
      // Only render from cache if we're using cached poses
      const cache = livePoseCacheRef.current;
      if (!cache || !skeletonRendererRef.current) return;

      const frame = cache.getFrame(video.currentTime);
      if (!frame?.keypoints) return;

      const skeleton = buildSkeletonFromFrame(frame.keypoints);
      if (skeleton) {
        // Render skeleton
        skeletonRendererRef.current.renderSkeleton(skeleton, performance.now());
      }
    };

    // Render on time updates (during playback) and after seeks
    video.addEventListener('timeupdate', renderSkeletonFromCache);
    video.addEventListener('seeked', renderSkeletonFromCache);

    return () => {
      video.removeEventListener('timeupdate', renderSkeletonFromCache);
      video.removeEventListener('seeked', renderSkeletonFromCache);
    };
  }, [videoRef, livePoseCacheRef, buildSkeletonFromFrame]);

  return {
    buildSkeletonFromFrame,
    setBodyPartDisplay,
    setDebugMode,
    skeletonRendererRef,
  };
}
