/**
 * useCacheReinitialization Hook
 *
 * Handles pipeline reinitialization when switching from ML inference mode
 * to using cached pose data (either pre-extracted or streaming).
 */

import { useCallback, useRef } from 'react';
import type { Pipeline } from '../pipeline/Pipeline';
import { LivePoseCache } from '../pipeline/LivePoseCache';
import type { PoseTrackFile } from '../types/posetrack';
import { createPipeline } from '../pipeline/PipelineFactory';

/**
 * Callbacks for pipeline management
 */
export interface CacheReinitializationCallbacks {
  /** Callback to set up batch subscriptions (just rep count updates) */
  setupBatchSubscriptions: (pipeline: Pipeline) => void;

  /** Callback to update app state */
  setAppState: (updater: (prev: any) => any) => void;

  /** Callback to update status message */
  setStatus: (status: string) => void;

  /** Callback to update using cached poses state */
  setUsingCachedPoses: (using: boolean) => void;
}

/**
 * Options for the useCacheReinitialization hook
 */
export interface UseCacheReinitializationOptions {
  /** Ref to the video element */
  videoRef: React.RefObject<HTMLVideoElement>;

  /** Ref to the canvas element */
  canvasRef: React.RefObject<HTMLCanvasElement>;

  /** Ref to the pipeline instance */
  pipelineRef: React.MutableRefObject<Pipeline | null>;

  /** Ref to pipeline subscriptions for cleanup */
  subscriptionsRef: React.MutableRefObject<{ unsubscribe: () => void }[]>;

  /** Callbacks for pipeline management */
  callbacks: CacheReinitializationCallbacks;
}

/**
 * Hook for managing pipeline reinitialization with cached pose data
 */
export function useCacheReinitialization(options: UseCacheReinitializationOptions) {
  const { videoRef, canvasRef, pipelineRef, subscriptionsRef, callbacks } = options;
  const {
    setupBatchSubscriptions,
    setAppState,
    setStatus,
    setUsingCachedPoses,
  } = callbacks;

  // State
  const livePoseCacheRef = useRef<LivePoseCache | null>(null);

  /**
   * Reinitialize the pipeline with cached pose data.
   * Call this when cached pose data becomes available to switch from ML inference
   * to using pre-extracted poses.
   */
  const reinitializeWithCachedPoses = useCallback(
    async (cachedPoseTrack: PoseTrackFile) => {
      if (!videoRef.current || !canvasRef.current) {
        console.warn('Cannot reinitialize: video or canvas not ready');
        return;
      }

      console.log('Reinitializing pipeline with cached pose data...');

      // Stop current pipeline
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }

      // Clean up existing subscriptions
      for (const sub of subscriptionsRef.current) {
        sub.unsubscribe();
      }
      subscriptionsRef.current = [];

      try {
        // Create new pipeline with cached data (for batch processing only)
        const pipeline = createPipeline(videoRef.current, canvasRef.current, {
          cachedPoseTrack,
        });
        pipelineRef.current = pipeline;

        // Store the cache for video event-driven skeleton rendering
        // Convert PoseTrackFile to LivePoseCache for consistent getFrame() API
        livePoseCacheRef.current = LivePoseCache.fromPoseTrackFile(cachedPoseTrack);

        // Initialize the new pipeline (no-op for cached transformer)
        await pipeline.initialize();

        // Use batch subscriptions - just listen for rep count updates from processSkeletonEvent().
        // Don't start full streaming pipeline (skeleton rendering is video-event driven).
        setupBatchSubscriptions(pipeline);

        // Update state to indicate we're using cached poses
        setUsingCachedPoses(true);
        setAppState((prev: any) => ({ ...prev, isModelLoaded: true }));
        setStatus('Ready (using cached poses)');

        console.log('Pipeline reinitialized with cached pose data');
      } catch (error) {
        console.error('Failed to reinitialize with cached poses:', error);
        setStatus('Error: Failed to load cached poses');
      }
    },
    [
      videoRef,
      canvasRef,
      pipelineRef,
      subscriptionsRef,
      setupBatchSubscriptions,
      setUsingCachedPoses,
      setAppState,
      setStatus,
    ]
  );

  /**
   * Reinitialize the pipeline with a live pose cache for streaming mode.
   * Call this when extraction starts to enable playback using progressively
   * extracted frames instead of ML inference.
   */
  const reinitializeWithLiveCache = useCallback(
    async (liveCache: LivePoseCache) => {
      if (!videoRef.current || !canvasRef.current) {
        console.warn('Cannot reinitialize: video or canvas not ready');
        return;
      }

      console.log('Reinitializing pipeline with live pose cache...');

      // Stop current pipeline
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }

      // Clean up existing subscriptions
      for (const sub of subscriptionsRef.current) {
        sub.unsubscribe();
      }
      subscriptionsRef.current = [];

      try {
        // Create new pipeline with live cache (for batch processing only)
        const pipeline = createPipeline(videoRef.current, canvasRef.current, {
          livePoseCache: liveCache,
        });
        pipelineRef.current = pipeline;

        // Store the cache for video event-driven skeleton rendering
        livePoseCacheRef.current = liveCache;

        // Initialize the new pipeline (no-op for cached transformer)
        await pipeline.initialize();

        // Use batch subscriptions - just listen for rep count updates from processSkeletonEvent().
        // Don't start full streaming pipeline (skeleton rendering is video-event driven).
        // Running the full pipeline during playback would cause duplicate rep counting.
        setupBatchSubscriptions(pipeline);

        // Update state to indicate we're using cached poses (streaming)
        setUsingCachedPoses(true);
        setAppState((prev: any) => ({ ...prev, isModelLoaded: true }));
        setStatus('Ready (streaming poses)');

        console.log('Pipeline reinitialized with live pose cache');
      } catch (error) {
        console.error('Failed to reinitialize with live cache:', error);
        setStatus('Error: Failed to initialize streaming');
      }
    },
    [
      videoRef,
      canvasRef,
      pipelineRef,
      subscriptionsRef,
      setupBatchSubscriptions,
      setUsingCachedPoses,
      setAppState,
      setStatus,
    ]
  );

  return {
    reinitializeWithCachedPoses,
    reinitializeWithLiveCache,
    livePoseCacheRef,
  };
}
