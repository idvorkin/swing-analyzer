import type { ModelConfig } from '../config/modelConfig';
import { Skeleton } from '../models/Skeleton';
import { CocoBodyParts, type PoseKeypoint } from '../types';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';
import {
  CachedPoseSkeletonTransformer,
  type CachedPoseSkeletonTransformerConfig,
} from './CachedPoseSkeletonTransformer';
import type { LivePoseCache } from './LivePoseCache';
import { Pipeline } from './Pipeline';
import type {
  FormProcessor,
  FrameAcquisition,
  RepProcessor,
  SkeletonEvent,
  SkeletonTransformer,
} from './PipelineInterfaces';
import { PoseSkeletonTransformer } from './PoseSkeletonTransformer';
import { SwingFormProcessor } from './SwingFormProcessor';
import { SwingRepProcessor } from './SwingRepProcessor';
import { VideoFrameAcquisition } from './VideoFrameAcquisition';

/**
 * Options for pipeline creation
 */
export interface CreatePipelineOptions {
  /**
   * Pre-extracted pose data to use instead of ML inference.
   * When provided, the pipeline will use CachedPoseSkeletonTransformer.
   */
  cachedPoseTrack?: PoseTrackFile;

  /**
   * Live pose cache for streaming mode.
   * When provided, the pipeline will use CachedPoseSkeletonTransformer
   * with blocking waits for frames not yet extracted.
   */
  livePoseCache?: LivePoseCache;

  /**
   * Model configuration for pose detection.
   * Allows switching between MoveNet and BlazePose.
   */
  modelConfig?: ModelConfig;

  /**
   * Simulated frames per second for cached pose playback.
   * When set, adds a delay between frames to simulate real-time processing.
   * Default: 15 FPS (typical mobile device performance).
   * Set to 0 to disable delay and process as fast as possible.
   */
  simulatedFps?: number;

  /**
   * Skip form/rep processing during playback.
   * When true, the pipeline only emits skeleton events for rendering.
   * Defaults to true when using cached poses (cachedPoseTrack or livePoseCache).
   * Set to false to force full processing even with cached poses.
   */
  playbackOnly?: boolean;
}

/**
 * Create a complete pipeline with all components
 *
 * @param videoElement - The video element to process
 * @param canvasElement - The canvas element for rendering
 * @param options - Optional configuration including cached pose data
 */
export function createPipeline(
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement,
  options: CreatePipelineOptions = {}
): Pipeline {
  // Create each pipeline stage
  const frameAcquisition = createFrameAcquisition(videoElement, canvasElement);

  // Choose skeleton transformer based on available cache options
  let skeletonTransformer: SkeletonTransformer;
  let usingCachedPoses = false;

  // Build config for cached transformer (default 15 FPS simulation)
  const cachedConfig: CachedPoseSkeletonTransformerConfig = {
    simulatedFps: options.simulatedFps ?? 15,
  };

  if (options.livePoseCache) {
    // Streaming mode: use LivePoseCache with blocking waits
    skeletonTransformer = new CachedPoseSkeletonTransformer(
      options.livePoseCache,
      cachedConfig
    );
    usingCachedPoses = true;
  } else if (options.cachedPoseTrack) {
    // Static mode: use pre-loaded PoseTrackFile
    skeletonTransformer = new CachedPoseSkeletonTransformer(
      options.cachedPoseTrack,
      cachedConfig
    );
    usingCachedPoses = true;
  } else {
    // ML mode: use real-time ML inference
    skeletonTransformer = createSkeletonTransformer(options.modelConfig);
  }

  const formProcessor = createFormProcessor(videoElement, canvasElement);
  const repProcessor = createRepProcessor();

  // Determine playback mode:
  // - If explicitly set, use that value
  // - Otherwise, default to playback-only when using cached poses
  const playbackOnly = options.playbackOnly ?? usingCachedPoses;

  // Create the pipeline with all stages
  return new Pipeline(
    frameAcquisition,
    skeletonTransformer,
    formProcessor,
    repProcessor,
    playbackOnly
  );
}

/**
 * Create a frame acquisition component
 */
export function createFrameAcquisition(
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement
): FrameAcquisition {
  return new VideoFrameAcquisition(videoElement, canvasElement);
}

/**
 * Create a skeleton transformer component
 * This combines the pose detection and skeleton construction stages
 *
 * @param config - Optional model configuration (defaults to MoveNet Lightning)
 */
export function createSkeletonTransformer(
  config?: ModelConfig
): SkeletonTransformer {
  return new PoseSkeletonTransformer(config);
}

/**
 * Create a form processor component
 */
export function createFormProcessor(
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement
): FormProcessor {
  return new SwingFormProcessor(videoElement, canvasElement);
}

/**
 * Create a rep processor component
 */
export function createRepProcessor(): RepProcessor {
  return new SwingRepProcessor();
}

/**
 * Create a cached skeleton transformer component
 * Uses pre-extracted pose data instead of ML inference
 *
 * @param poseTrack - Pre-extracted pose data
 * @param config - Optional configuration (default: 15 FPS simulation)
 */
export function createCachedSkeletonTransformer(
  poseTrack: PoseTrackFile,
  config?: CachedPoseSkeletonTransformerConfig
): SkeletonTransformer {
  return new CachedPoseSkeletonTransformer(
    poseTrack,
    config ?? { simulatedFps: 15 }
  );
}

/**
 * Build a SkeletonEvent from a PoseTrackFrame.
 * Used for batch/extraction mode to process extracted frames through the pipeline.
 *
 * @param frame - The extracted pose track frame
 * @returns A SkeletonEvent that can be passed to Pipeline.processSkeletonEvent()
 */
export function buildSkeletonEventFromFrame(frame: PoseTrackFrame): SkeletonEvent {
  const skeleton = buildSkeletonFromFrame(frame);

  return {
    skeleton,
    poseEvent: {
      pose: skeleton
        ? { keypoints: frame.keypoints, score: frame.score }
        : null,
      frameEvent: {
        frame: null as unknown as HTMLVideoElement, // Not used in batch mode
        timestamp: frame.timestamp,
        videoTime: frame.videoTime, // Include video time for seeking
        frameImage: frame.frameImage, // Pass through for thumbnail capture
      },
    },
  };
}

/**
 * Build a Skeleton from a PoseTrackFrame
 */
function buildSkeletonFromFrame(frame: PoseTrackFrame): Skeleton | null {
  if (!frame.keypoints || frame.keypoints.length === 0) {
    return null;
  }

  // Use pre-computed spine angle if available
  const precomputed = frame.angles?.spineAngle;
  const spineAngle =
    precomputed && precomputed !== 0
      ? precomputed
      : calculateSpineAngle(frame.keypoints);

  const hasVisibleKeypoints = hasRequiredKeypoints(frame.keypoints);

  return new Skeleton(frame.keypoints, spineAngle, hasVisibleKeypoints);
}

/**
 * Calculate spine angle from keypoints
 */
function calculateSpineAngle(keypoints: PoseKeypoint[]): number {
  const leftShoulder = keypoints[CocoBodyParts.LEFT_SHOULDER];
  const rightShoulder = keypoints[CocoBodyParts.RIGHT_SHOULDER];
  const leftHip = keypoints[CocoBodyParts.LEFT_HIP];
  const rightHip = keypoints[CocoBodyParts.RIGHT_HIP];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return 0;
  }

  // Calculate midpoints
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;

  // Calculate angle from vertical
  const dx = shoulderMidX - hipMidX;
  const dy = hipMidY - shoulderMidY; // Inverted for screen coordinates

  return Math.atan2(dx, dy) * (180 / Math.PI);
}

/**
 * Check if frame has required keypoints for skeleton
 */
function hasRequiredKeypoints(keypoints: PoseKeypoint[]): boolean {
  const minScore = 0.3;
  const leftShoulder = keypoints[CocoBodyParts.LEFT_SHOULDER];
  const rightShoulder = keypoints[CocoBodyParts.RIGHT_SHOULDER];
  const leftHip = keypoints[CocoBodyParts.LEFT_HIP];
  const rightHip = keypoints[CocoBodyParts.RIGHT_HIP];

  return (
    (leftShoulder?.score ?? 0) >= minScore &&
    (rightShoulder?.score ?? 0) >= minScore &&
    (leftHip?.score ?? 0) >= minScore &&
    (rightHip?.score ?? 0) >= minScore
  );
}
