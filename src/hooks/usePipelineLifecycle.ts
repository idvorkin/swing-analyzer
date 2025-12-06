import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { getSavedBlazePoseVariant } from '../components/settings/SettingsTab';
import {
  BLAZEPOSE_FULL_CONFIG,
  BLAZEPOSE_HEAVY_CONFIG,
  BLAZEPOSE_LITE_CONFIG,
  DEFAULT_MODEL_CONFIG,
} from '../config/modelConfig';
import type { LivePoseCache } from '../pipeline/LivePoseCache';
import type { Pipeline, PipelineResult, ThumbnailEvent } from '../pipeline/Pipeline';
import {
  createFrameAcquisition,
  createPipeline,
} from '../pipeline/PipelineFactory';
import type { SkeletonEvent } from '../pipeline/PipelineInterfaces';
import type { VideoFrameAcquisition } from '../pipeline/VideoFrameAcquisition';
import {
  recordPipelineInit,
  sessionRecorder,
} from '../services/SessionRecorder';
import type { PoseTrackFile } from '../types/posetrack';
import { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';

/**
 * Options for usePipelineLifecycle hook
 */
export interface UsePipelineLifecycleOptions {
  /**
   * Video element reference
   */
  videoRef: RefObject<HTMLVideoElement>;

  /**
   * Canvas element reference
   */
  canvasRef: RefObject<HTMLCanvasElement>;

  /**
   * Initial body part display state
   */
  showBodyParts?: boolean;

  /**
   * Initial body part display time in seconds
   */
  bodyPartDisplayTime?: number;

  /**
   * Callback when model is loaded
   */
  onModelLoaded?: () => void;

  /**
   * Callback when status changes
   */
  onStatusChange?: (status: string) => void;

  /**
   * Callback when processing state changes
   */
  onProcessingChange?: (isProcessing: boolean) => void;

  /**
   * Callback when rep count updates
   */
  onRepCountUpdate?: (repCount: number) => void;

  /**
   * Callback when spine angle updates
   */
  onSpineAngleUpdate?: (angle: number) => void;

  /**
   * Callback when arm-to-spine angle updates
   */
  onArmToSpineAngleUpdate?: (angle: number) => void;

  /**
   * Callback when using cached poses state changes
   */
  onUsingCachedPosesChange?: (usingCachedPoses: boolean) => void;

  /**
   * Callback when thumbnail event is received (for filmstrip)
   */
  onThumbnailEvent?: (event: ThumbnailEvent) => void;
}

/**
 * Return value from usePipelineLifecycle hook
 */
export interface UsePipelineLifecycleReturn {
  /**
   * Pipeline reference
   */
  pipelineRef: RefObject<Pipeline | null>;

  /**
   * Frame acquisition reference
   */
  frameAcquisitionRef: RefObject<VideoFrameAcquisition | null>;

  /**
   * Skeleton renderer reference
   */
  skeletonRendererRef: RefObject<SkeletonRenderer | null>;

  /**
   * Live pose cache reference
   */
  livePoseCacheRef: RefObject<LivePoseCache | null>;

  /**
   * Start processing
   */
  startProcessing: () => void;

  /**
   * Stop processing
   */
  stopProcessing: () => void;

  /**
   * Reset pipeline and state
   */
  reset: () => void;

  /**
   * Reset pipeline only (preserve rep count)
   */
  resetPipelineOnly: () => void;

  /**
   * Reinitialize with cached poses
   */
  reinitializeWithCachedPoses: (cachedPoseTrack: PoseTrackFile) => Promise<void>;

  /**
   * Reinitialize with live cache
   */
  reinitializeWithLiveCache: (liveCache: LivePoseCache) => Promise<void>;
}

/**
 * Hook for managing pipeline lifecycle including initialization, subscriptions,
 * and control functions.
 *
 * Extracted from useSwingAnalyzer to separate pipeline lifecycle management
 * from application state and UI logic.
 */
export function usePipelineLifecycle(
  options: UsePipelineLifecycleOptions
): UsePipelineLifecycleReturn {
  const {
    videoRef,
    canvasRef,
    showBodyParts = true,
    bodyPartDisplayTime = 0.5,
    onModelLoaded,
    onStatusChange,
    onProcessingChange,
    onRepCountUpdate,
    onSpineAngleUpdate,
    onArmToSpineAngleUpdate,
    onUsingCachedPosesChange,
    onThumbnailEvent,
  } = options;

  // Pipeline references
  const pipelineRef = useRef<Pipeline | null>(null);
  const frameAcquisitionRef = useRef<VideoFrameAcquisition | null>(null);
  const skeletonRendererRef = useRef<SkeletonRenderer | null>(null);
  const pipelineSubscriptionsRef = useRef<{ unsubscribe: () => void }[]>([]);
  const livePoseCacheRef = useRef<LivePoseCache | null>(null);

  /**
   * Initialize pipeline and models - runs once on mount
   */
  const initializePipeline = useCallback(async () => {
    try {
      if (videoRef.current && canvasRef.current) {
        // Get model config based on saved BlazePose variant preference
        const blazePoseVariant = getSavedBlazePoseVariant();
        let modelConfig = DEFAULT_MODEL_CONFIG;
        switch (blazePoseVariant) {
          case 'full':
            modelConfig = BLAZEPOSE_FULL_CONFIG;
            break;
          case 'heavy':
            modelConfig = BLAZEPOSE_HEAVY_CONFIG;
            break;
          default:
            modelConfig = BLAZEPOSE_LITE_CONFIG;
        }
        console.log(`Using pose model: BlazePose (${blazePoseVariant})`);

        // Create pipeline components
        const pipeline = createPipeline(videoRef.current, canvasRef.current, {
          modelConfig,
        });
        pipelineRef.current = pipeline;

        // Get frame acquisition for direct media control
        frameAcquisitionRef.current = createFrameAcquisition(
          videoRef.current,
          canvasRef.current
        ) as VideoFrameAcquisition;

        // Initialize the skeleton renderer
        skeletonRendererRef.current = new SkeletonRenderer(canvasRef.current);
        skeletonRendererRef.current.setBodyPartDisplay(
          showBodyParts,
          bodyPartDisplayTime
        );

        // Initialize the pipeline
        await pipeline.initialize();

        onModelLoaded?.();
        onStatusChange?.('Ready. Upload a video or start camera.');
        recordPipelineInit({ model: 'blazepose' });
      }
    } catch (error) {
      console.error('Failed to initialize:', error);
      onStatusChange?.('Error: Failed to initialize model.');
    }
  }, [
    videoRef,
    canvasRef,
    showBodyParts,
    bodyPartDisplayTime,
    onModelLoaded,
    onStatusChange,
  ]);

  /**
   * Set up full pipeline subscriptions (for ML inference mode)
   */
  const setupPipelineSubscriptions = useCallback(
    (pipeline: Pipeline) => {
      // Clean up existing subscriptions
      for (const sub of pipelineSubscriptionsRef.current) {
        sub.unsubscribe();
      }
      pipelineSubscriptionsRef.current = [];

      // Subscribe to skeleton events to render every detected skeleton
      const skeletonSubscription = pipeline.getSkeletonEvents().subscribe({
        next: (skeletonEvent: SkeletonEvent) => {
          if (skeletonEvent.skeleton) {
            onSpineAngleUpdate?.(
              Math.round(skeletonEvent.skeleton.getSpineAngle() || 0)
            );
            onArmToSpineAngleUpdate?.(
              Math.round(skeletonEvent.skeleton.getArmToVerticalAngle() || 0)
            );
            if (skeletonRendererRef.current) {
              skeletonRendererRef.current.renderSkeleton(
                skeletonEvent.skeleton,
                performance.now()
              );
            }
          }
        },
        error: (err) => {
          console.error('Skeleton event error:', err);
        },
      });

      // Subscribe to pipeline results for rep counting and other state
      const pipelineObservable = pipeline.start();
      const pipelineSubscription = pipelineObservable.subscribe({
        next: (result: PipelineResult) => {
          // Update rep count
          onRepCountUpdate?.(result.repCount);
        },
        error: (err) => {
          console.error('Pipeline error:', err);
          onStatusChange?.('Error in processing pipeline');
        },
        complete: () => {
          console.log('Pipeline processing completed');
          onProcessingChange?.(false);
        },
      });

      // Store subscriptions for cleanup
      pipelineSubscriptionsRef.current = [
        skeletonSubscription,
        pipelineSubscription,
      ];

      // Mark pipeline as processing now
      onProcessingChange?.(true);
    },
    [
      onSpineAngleUpdate,
      onArmToSpineAngleUpdate,
      onRepCountUpdate,
      onStatusChange,
      onProcessingChange,
    ]
  );

  /**
   * Set up subscriptions for batch/cached pose mode.
   * In batch mode, we need to listen for rep count updates from processSkeletonEvent()
   * which is called during extraction. Skeleton/angle updates happen via direct
   * processFrame() calls from video event handlers (onSkeletonUpdated callback).
   */
  const setupBatchSubscriptions = useCallback(
    (pipeline: Pipeline) => {
      // Clean up existing subscriptions
      for (const sub of pipelineSubscriptionsRef.current) {
        sub.unsubscribe();
      }
      pipelineSubscriptionsRef.current = [];

      // Subscribe to rep count updates from extraction (processSkeletonEvent emits results)
      const resultsSubscription = pipeline.getResults().subscribe({
        next: (result: PipelineResult) => {
          onRepCountUpdate?.(result.repCount);
        },
        error: (err) => {
          console.error('Batch pipeline error:', err);
        },
      });

      // Subscribe to thumbnail events for filmstrip (emitted when cycle completes with position candidates)
      const thumbnailSubscription = pipeline.getThumbnailEvents().subscribe({
        next: (event: ThumbnailEvent) => {
          onThumbnailEvent?.(event);
        },
        error: (err) => {
          console.error('Thumbnail event error:', err);
        },
      });

      pipelineSubscriptionsRef.current = [resultsSubscription, thumbnailSubscription];
    },
    [onRepCountUpdate, onThumbnailEvent]
  );

  /**
   * Initialize pipeline on mount
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs only once on mount
  useEffect(() => {
    initializePipeline();

    // Set up session recorder pipeline state getter
    // This runs at 4 FPS to capture pipeline state for debugging
    sessionRecorder.setPipelineStateGetter(() => ({
      repCount: pipelineRef.current?.getRepCount() ?? 0,
      isPlaying: videoRef.current ? !videoRef.current.paused : false,
      videoTime: videoRef.current?.currentTime ?? 0,
      skeletonAngles: pipelineRef.current?.getLatestSkeleton()
        ? {
            spine: pipelineRef.current.getLatestSkeleton()?.getSpineAngle() ?? 0,
            arm: pipelineRef.current.getLatestSkeleton()?.getArmToSpineAngle() ?? 0,
            hip: pipelineRef.current.getLatestSkeleton()?.getHipAngle() ?? 0,
            knee: pipelineRef.current.getLatestSkeleton()?.getKneeAngle() ?? 0,
          }
        : undefined,
    }));

    // Cleanup on unmount
    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.stop();
        pipelineRef.current = null;
      }

      if (frameAcquisitionRef.current) {
        frameAcquisitionRef.current = null;
      }
    };
  }, []);

  /**
   * Setup persistent subscriptions to pipeline events and start it once
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs only once on mount
  useEffect(() => {
    if (!pipelineRef.current) return;

    setupPipelineSubscriptions(pipelineRef.current);

    // Clean up subscriptions on unmount
    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }
      for (const sub of pipelineSubscriptionsRef.current) {
        sub.unsubscribe();
      }
      pipelineSubscriptionsRef.current = [];
    };
  }, []);

  /**
   * Start processing manually
   */
  const startProcessing = useCallback(() => {
    if (!pipelineRef.current) return;

    // Pipeline will automatically respond to video play/pause
    pipelineRef.current.start();
    onProcessingChange?.(true);
  }, [onProcessingChange]);

  /**
   * Stop processing manually
   */
  const stopProcessing = useCallback(() => {
    if (!pipelineRef.current) return;

    pipelineRef.current.stop();
    onProcessingChange?.(false);
  }, [onProcessingChange]);

  /**
   * Reset state and rep count - explicit action
   */
  const reset = useCallback(() => {
    if (pipelineRef.current) {
      pipelineRef.current.reset();
    }

    // Reset UI state via callbacks
    onRepCountUpdate?.(0);
    onSpineAngleUpdate?.(0);
  }, [onRepCountUpdate, onSpineAngleUpdate]);

  /**
   * Reset pipeline state without clearing rep count
   */
  const resetPipelineOnly = useCallback(() => {
    if (pipelineRef.current) {
      // Reset pipeline state but preserve rep count
      pipelineRef.current.reset();
    }

    // Reset spine angle but keep rep count
    onSpineAngleUpdate?.(0);
  }, [onSpineAngleUpdate]);

  /**
   * Shared logic for reinitializing pipeline with cached or live pose data.
   */
  const reinitializePipeline = useCallback(
    async (
      poseCache: LivePoseCache,
      pipelineOptions: Parameters<typeof createPipeline>[2],
      statusMessage: string,
      errorMessage: string
    ) => {
      if (!videoRef.current || !canvasRef.current) {
        console.warn('Cannot reinitialize: video or canvas not ready');
        return;
      }

      console.log(`Reinitializing pipeline: ${statusMessage}...`);

      // Stop current pipeline and clean up subscriptions
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }
      for (const sub of pipelineSubscriptionsRef.current) {
        sub.unsubscribe();
      }
      pipelineSubscriptionsRef.current = [];

      try {
        // Create new pipeline (for batch processing only)
        const pipeline = createPipeline(
          videoRef.current,
          canvasRef.current,
          pipelineOptions
        );
        pipelineRef.current = pipeline;

        // Store the cache for video event-driven skeleton rendering
        livePoseCacheRef.current = poseCache;

        // Initialize the new pipeline (no-op for cached transformer)
        await pipeline.initialize();

        // Use batch subscriptions - just listen for rep count updates from processSkeletonEvent().
        // Don't start full streaming pipeline (skeleton rendering is video-event driven).
        setupBatchSubscriptions(pipeline);

        // Update state to indicate we're using cached poses
        onUsingCachedPosesChange?.(true);
        onModelLoaded?.();
        onStatusChange?.(statusMessage);

        console.log(`Pipeline reinitialized: ${statusMessage}`);
      } catch (error) {
        console.error(`Failed to reinitialize pipeline:`, error);
        onStatusChange?.(errorMessage);
      }
    },
    [
      videoRef,
      canvasRef,
      setupBatchSubscriptions,
      onUsingCachedPosesChange,
      onModelLoaded,
      onStatusChange,
    ]
  );

  /**
   * Reinitialize the pipeline with cached pose data.
   * Call this when cached pose data becomes available to switch from ML inference
   * to using pre-extracted poses.
   */
  const reinitializeWithCachedPoses = useCallback(
    async (cachedPoseTrack: PoseTrackFile) => {
      // Convert PoseTrackFile to LivePoseCache for consistent getFrame() API
      const { LivePoseCache: LPC } = await import('../pipeline/LivePoseCache');
      const poseCache = LPC.fromPoseTrackFile(cachedPoseTrack);

      await reinitializePipeline(
        poseCache,
        { cachedPoseTrack },
        'Ready (using cached poses)',
        'Error: Failed to load cached poses'
      );
    },
    [reinitializePipeline]
  );

  /**
   * Reinitialize the pipeline with a live pose cache for streaming mode.
   * Call this when extraction starts to enable playback using progressively
   * extracted frames instead of ML inference.
   */
  const reinitializeWithLiveCache = useCallback(
    async (liveCache: LivePoseCache) => {
      await reinitializePipeline(
        liveCache,
        { livePoseCache: liveCache },
        'Ready (streaming poses)',
        'Error: Failed to initialize streaming'
      );
    },
    [reinitializePipeline]
  );

  return {
    pipelineRef,
    frameAcquisitionRef,
    skeletonRendererRef,
    livePoseCacheRef,
    startProcessing,
    stopProcessing,
    reset,
    resetPipelineOnly,
    reinitializeWithCachedPoses,
    reinitializeWithLiveCache,
  };
}
