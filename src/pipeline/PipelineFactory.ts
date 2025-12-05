import type { ModelConfig } from '../config/modelConfig';
import { getExerciseDefinition } from '../exercises';
import { Skeleton } from '../models/Skeleton';
import { CocoBodyParts, type PoseKeypoint } from '../types';
import { ExerciseType } from '../types/exercise';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';
import { CachedPoseSkeletonTransformer } from './CachedPoseSkeletonTransformer';
import type { LivePoseCache } from './LivePoseCache';
import { Pipeline } from './Pipeline';
import type {
  FrameAcquisition,
  SkeletonEvent,
  SkeletonTransformer,
} from './PipelineInterfaces';
import { PoseSkeletonTransformer } from './PoseSkeletonTransformer';
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
   * Exercise type for form analysis.
   * When provided, uses the generic FormAnalyzer with the appropriate
   * exercise definition. Defaults to KettlebellSwing.
   */
  exerciseType?: ExerciseType;
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

  if (options.livePoseCache) {
    // Streaming mode: use LivePoseCache
    skeletonTransformer = new CachedPoseSkeletonTransformer(
      options.livePoseCache
    );
  } else if (options.cachedPoseTrack) {
    // Static mode: use pre-loaded PoseTrackFile
    skeletonTransformer = new CachedPoseSkeletonTransformer(
      options.cachedPoseTrack
    );
  } else {
    // ML mode: use real-time ML inference
    skeletonTransformer = createSkeletonTransformer(options.modelConfig);
  }

  // Get exercise definition (defaults to kettlebell swing)
  const exerciseType = options.exerciseType ?? ExerciseType.KettlebellSwing;
  const exerciseDefinition = getExerciseDefinition(exerciseType);

  // Create the pipeline with exercise support
  return new Pipeline(frameAcquisition, skeletonTransformer, exerciseDefinition);
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
 * Create a cached skeleton transformer from a PoseTrackFile
 *
 * @param poseTrack - The pre-extracted pose data
 */
export function createCachedSkeletonTransformer(
  poseTrack: PoseTrackFile
): CachedPoseSkeletonTransformer {
  return new CachedPoseSkeletonTransformer(poseTrack);
}

/**
 * Build a SkeletonEvent from a PoseTrackFrame
 * Useful for processing cached pose data
 */
export function buildSkeletonEventFromFrame(frame: PoseTrackFrame): SkeletonEvent {
  const skeleton = buildSkeletonFromFrame(frame.keypoints);
  return {
    skeleton,
    poseEvent: {
      pose: skeleton
        ? {
            keypoints: frame.keypoints,
            score: frame.score,
          }
        : null,
      frameEvent: {
        frame: null as unknown as HTMLCanvasElement, // Not needed for extraction
        timestamp: frame.timestamp,
        videoTime: frame.videoTime,
        frameImage: frame.frameImage,
      },
    },
  };
}

/**
 * Build a Skeleton from keypoints
 */
function buildSkeletonFromFrame(keypoints: PoseKeypoint[]): Skeleton | null {
  if (!keypoints || keypoints.length === 0) {
    return null;
  }

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
  const requiredIndices = [
    CocoBodyParts.LEFT_SHOULDER,
    CocoBodyParts.RIGHT_SHOULDER,
    CocoBodyParts.LEFT_HIP,
    CocoBodyParts.RIGHT_HIP,
  ];
  const hasVisibleKeypoints = requiredIndices.every((index) => {
    const point = keypoints[index];
    return point && (point.score ?? point.visibility ?? 0) > 0.2;
  });

  return new Skeleton(keypoints, spineAngle, hasVisibleKeypoints);
}
