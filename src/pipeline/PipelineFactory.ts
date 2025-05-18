import { Pipeline } from './Pipeline';
import { PoseDetector } from './PoseDetector';
import { SkeletonBuilder } from './SkeletonBuilder';
import { FormAnalyzer } from './FormAnalyzer';
import { RepDetector } from './RepDetector';
import { VideoFrameAcquisition } from './FrameAcquisition';
import { FrameAcquisition, PoseDetection, SkeletonConstruction, FormCheckpointDetection, SwingRepAnalysis } from './PipelineInterfaces';

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
    const poseDetector = PipelineFactory.createPoseDetector();
    const skeletonBuilder = PipelineFactory.createSkeletonBuilder();
    const formAnalyzer = PipelineFactory.createFormAnalyzer(videoElement, canvasElement);
    const repDetector = PipelineFactory.createRepDetector();
    
    // Create the pipeline with all stages
    return new Pipeline(
      frameAcquisition,
      poseDetector,
      skeletonBuilder,
      formAnalyzer,
      repDetector
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
   * Create a pose detector
   */
  static createPoseDetector(): PoseDetection {
    return new PoseDetector();
  }
  
  /**
   * Create a skeleton builder
   */
  static createSkeletonBuilder(): SkeletonConstruction {
    return new SkeletonBuilder();
  }
  
  /**
   * Create a form analyzer
   */
  static createFormAnalyzer(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement
  ): FormCheckpointDetection {
    return new FormAnalyzer(videoElement, canvasElement);
  }
  
  /**
   * Create a rep detector
   */
  static createRepDetector(): SwingRepAnalysis {
    return new RepDetector();
  }
} 