import { Pipeline } from './Pipeline';
import { VideoFrameAcquisition } from './VideoFrameAcquisition';
import { PoseSkeletonTransformer } from './PoseSkeletonTransformer';
import { SwingFormProcessor } from './SwingFormProcessor';
import { SwingRepProcessor } from './SwingRepProcessor';
import { FrameAcquisition, SkeletonTransformer, FormProcessor, RepProcessor } from './PipelineInterfaces';

/**
 * Factory to create and configure the processing pipeline
 */
export class PipelineFactory {
  /**
   * Create a complete pipeline with all components
   */
  static createPipeline(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement
  ): Pipeline {
    // Create each pipeline stage
    const frameAcquisition = PipelineFactory.createFrameAcquisition(videoElement, canvasElement);
    const skeletonTransformer = PipelineFactory.createSkeletonTransformer();
    const formProcessor = PipelineFactory.createFormProcessor(videoElement, canvasElement);
    const repProcessor = PipelineFactory.createRepProcessor();
    
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
  static createFrameAcquisition(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement
  ): FrameAcquisition {
    return new VideoFrameAcquisition(videoElement, canvasElement);
  }
  
  /**
   * Create a skeleton transformer component
   * This combines the pose detection and skeleton construction stages
   */
  static createSkeletonTransformer(): SkeletonTransformer {
    return new PoseSkeletonTransformer();
  }
  
  /**
   * Create a form processor component
   */
  static createFormProcessor(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement
  ): FormProcessor {
    return new SwingFormProcessor(videoElement, canvasElement);
  }
  
  /**
   * Create a rep processor component
   */
  static createRepProcessor(): RepProcessor {
    return new SwingRepProcessor();
  }
} 