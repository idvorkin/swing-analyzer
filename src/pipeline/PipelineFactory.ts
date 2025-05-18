import { Pipeline } from './Pipeline';
import { PoseStage } from './PoseStage';
import { SkeletonStage } from './SkeletonStage';
import { FormStage } from './FormStage';
import { RepStage } from './RepStage';
import { FrameStage } from './FrameStage';
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
    const poseDetector = PipelineFactory.createPoseDetection();
    const skeletonBuilder = PipelineFactory.createSkeletonConstruction();
    const formAnalyzer = PipelineFactory.createFormCheckpointDetection(videoElement, canvasElement);
    const repDetector = PipelineFactory.createSwingRepAnalysis();
    
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
    return new FrameStage(videoElement, canvasElement);
  }
  
  /**
   * Create a pose detection component
   */
  static createPoseDetection(): PoseDetection {
    return new PoseStage();
  }
  
  /**
   * Create a skeleton construction component
   */
  static createSkeletonConstruction(): SkeletonConstruction {
    return new SkeletonStage();
  }
  
  /**
   * Create a form checkpoint detection component
   */
  static createFormCheckpointDetection(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement
  ): FormCheckpointDetection {
    return new FormStage(videoElement, canvasElement);
  }
  
  /**
   * Create a swing rep analysis component
   */
  static createSwingRepAnalysis(): SwingRepAnalysis {
    return new RepStage();
  }
} 