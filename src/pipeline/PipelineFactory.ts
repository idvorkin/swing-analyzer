import type { PoseTrackFile } from '../types/posetrack';
import { CachedPoseSkeletonTransformer } from './CachedPoseSkeletonTransformer';
import type { LivePoseCache } from './LivePoseCache';
import { Pipeline } from './Pipeline';
import type {
  FormProcessor,
  FrameAcquisition,
  RepProcessor,
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
    // Streaming mode: use LivePoseCache with blocking waits
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
    skeletonTransformer = createSkeletonTransformer();
  }

  const formProcessor = createFormProcessor(videoElement, canvasElement);
  const repProcessor = createRepProcessor();

  // Create the pipeline with all stages
  return new Pipeline(
    frameAcquisition,
    skeletonTransformer,
    formProcessor,
    repProcessor
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
 */
export function createSkeletonTransformer(): SkeletonTransformer {
  return new PoseSkeletonTransformer();
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
 */
export function createCachedSkeletonTransformer(
  poseTrack: PoseTrackFile
): SkeletonTransformer {
  return new CachedPoseSkeletonTransformer(poseTrack);
}
