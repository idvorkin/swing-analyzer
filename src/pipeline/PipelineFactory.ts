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
 * Create a complete pipeline with all components
 */
export function createPipeline(
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement
): Pipeline {
  // Create each pipeline stage
  const frameAcquisition = createFrameAcquisition(videoElement, canvasElement);
  const skeletonTransformer = createSkeletonTransformer();
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
