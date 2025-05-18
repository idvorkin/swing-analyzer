import { FormCheckpoint, FormPosition } from '../types';
import { Skeleton } from '../models/Skeleton';
import { FormCheckpointDetection, SkeletonEvent, CheckpointEvent } from './PipelineInterfaces';
import { Observable, of } from 'rxjs';

/**
 * Analyzes skeletons to detect form checkpoints (key positions in swing)
 */
export class FormAnalyzer implements FormCheckpointDetection {
  // Last detected position
  private lastPosition = FormPosition.Top;
  
  // Map of detected positions in current rep
  private detectedPositions = new Map<FormPosition, FormCheckpoint>();
  
  // Angle thresholds for position detection
  private readonly HINGE_THRESHOLD = 20; // Degrees from vertical
  private readonly BOTTOM_THRESHOLD = 60; // Degrees from vertical 
  private readonly RELEASE_THRESHOLD = 45; // Degrees from vertical
  
  constructor(
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement
  ) {}
  
  /**
   * Process a skeleton event to detect checkpoints
   * Returns an Observable that emits checkpoint events
   */
  processFrame(skeletonEvent: SkeletonEvent, repCount: number): Observable<CheckpointEvent> {
    // If no skeleton was detected, return null checkpoint
    if (!skeletonEvent.skeleton) {
      return of({
        checkpoint: null,
        position: null,
        skeletonEvent
      });
    }
    
    const skeleton = skeletonEvent.skeleton;
    const spineAngle = skeleton.getSpineAngle();
    
    // Detect position based on spine angle
    const detectedPosition = this.detectPosition(spineAngle);
    
    // Create checkpoint event (in Phase 2, this will capture image data)
    if (detectedPosition !== null && detectedPosition !== this.lastPosition) {
      // Position transition detected
      this.lastPosition = detectedPosition;
      
      // In Phase 2, we'll create a real checkpoint here
      const checkpoint: FormCheckpoint = {
        position: detectedPosition,
        timestamp: skeletonEvent.poseEvent.frameEvent.timestamp,
        image: new ImageData(1, 1), // Placeholder, will be implemented in Phase 2
        spineAngle: spineAngle
      };
      
      // Store in detected positions map
      this.detectedPositions.set(detectedPosition, checkpoint);
      
      return of({
        checkpoint,
        position: detectedPosition,
        skeletonEvent
      });
    }
    
    // No new checkpoint detected
    return of({
      checkpoint: null,
      position: this.lastPosition,
      skeletonEvent
    });
  }
  
  /**
   * Reset all detected positions
   */
  reset(): void {
    this.detectedPositions.clear();
    this.lastPosition = FormPosition.Top;
  }
  
  /**
   * Detect position based on spine angle
   * This is a simplified placeholder for Phase 2 implementation
   */
  private detectPosition(spineAngle: number): FormPosition | null {
    const absAngle = Math.abs(spineAngle);
    
    // Simple state machine for position detection
    switch (this.lastPosition) {
      case FormPosition.Top:
        if (absAngle > this.HINGE_THRESHOLD) {
          return FormPosition.Hinge;
        }
        break;
        
      case FormPosition.Hinge:
        if (absAngle > this.BOTTOM_THRESHOLD) {
          return FormPosition.Bottom;
        }
        break;
        
      case FormPosition.Bottom:
        if (absAngle < this.RELEASE_THRESHOLD) {
          return FormPosition.Release;
        }
        break;
        
      case FormPosition.Release:
        if (absAngle < this.HINGE_THRESHOLD) {
          return FormPosition.Top;
        }
        break;
    }
    
    // No position change
    return null;
  }
} 