import { type Observable, of, EMPTY } from 'rxjs';
import type { Skeleton } from '../models/Skeleton';
import { type FormCheckpoint, SwingPosition } from '../types';
import type {
  FormEvent,
  FormProcessor,
  SkeletonEvent,
} from './PipelineInterfaces';

// Test comment for pre-commit hook - Type checking
/**
 * Swing form processor - processes skeletons to identify swing form positions and checkpoints
 */
export class SwingFormProcessor implements FormProcessor {
  // Last detected position
  private lastPosition = SwingPosition.Top;

  // Map of detected positions in current rep
  private detectedPositions = new Map<SwingPosition, FormCheckpoint>();

  // Angle thresholds for position detection
  private readonly HINGE_THRESHOLD = 20; // Degrees from vertical
  private readonly BOTTOM_THRESHOLD = 60; // Degrees from vertical
  private readonly RELEASE_THRESHOLD = 45; // Degrees from vertical

  constructor(
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement
  ) {}

  /**
   * Process a skeleton to identify checkpoints
   * Returns an Observable that emits checkpoint events only when transitions occur
   */
  processFrame(
    skeletonEvent: SkeletonEvent
  ): Observable<FormEvent> {
    // If no skeleton was detected, return empty observable
    if (!skeletonEvent.skeleton) {
      return EMPTY;
    }

    const skeleton = skeletonEvent.skeleton;
    const spineAngle = skeleton.getSpineAngle();
    const timestamp = skeletonEvent.poseEvent.frameEvent.timestamp;

    // Auto-reset positions when going back to top after a full cycle
    if (this.isFullCycleComplete() && Math.abs(spineAngle) < this.HINGE_THRESHOLD) {
      this.detectedPositions.clear();
      this.lastPosition = SwingPosition.Top;
    }

    // Detect position based on spine angle and previous position
    const { newPosition, hasTransition } =
      this.detectPositionTransition(spineAngle);

    // If we have a position transition or it's a new rep's first position
    if (hasTransition || (this.detectedPositions.size === 0 && newPosition)) {
      // Capture the checkpoint
      const checkpoint = this.captureCheckpoint(
        newPosition || SwingPosition.Top,
        skeleton,
        timestamp
      );

      // Update last position
      this.lastPosition = newPosition || SwingPosition.Top;

      // Store in detected positions map
      this.detectedPositions.set(newPosition || SwingPosition.Top, checkpoint);

      return of({
        checkpoint,
        position: newPosition,
        skeletonEvent,
      });
    }

    // No new checkpoint detected, return empty observable
    return EMPTY;
  }

  /**
   * Check if a full swing cycle has been completed
   * A full cycle is when we've detected all positions: Top -> Hinge -> Bottom -> Release
   */
  private isFullCycleComplete(): boolean {
    return (
      this.detectedPositions.has(SwingPosition.Top) &&
      this.detectedPositions.has(SwingPosition.Hinge) &&
      this.detectedPositions.has(SwingPosition.Bottom) &&
      this.detectedPositions.has(SwingPosition.Release)
    );
  }

  /**
   * Reset the form processor state
   */
  reset(): void {
    this.detectedPositions.clear();
    this.lastPosition = SwingPosition.Top;
  }

  /**
   * Detect position transitions based on spine angle and state machine
   */
  private detectPositionTransition(spineAngle: number): {
    newPosition: SwingPosition | null;
    hasTransition: boolean;
  } {
    const absAngle = Math.abs(spineAngle);
    let newPosition: SwingPosition | null = null;
    let hasTransition = false;

    // State machine for position detection
    switch (this.lastPosition) {
      case SwingPosition.Top:
        // From Top, we can only go to Hinge
        if (
          absAngle > this.HINGE_THRESHOLD &&
          !this.detectedPositions.has(SwingPosition.Hinge)
        ) {
          newPosition = SwingPosition.Hinge;
          hasTransition = true;
        }
        break;

      case SwingPosition.Hinge:
        // From Hinge, we can go to Bottom
        if (
          absAngle > this.BOTTOM_THRESHOLD &&
          !this.detectedPositions.has(SwingPosition.Bottom)
        ) {
          newPosition = SwingPosition.Bottom;
          hasTransition = true;
        }
        break;

      case SwingPosition.Bottom:
        // From Bottom, we can go to Release
        if (
          absAngle < this.RELEASE_THRESHOLD &&
          !this.detectedPositions.has(SwingPosition.Release)
        ) {
          newPosition = SwingPosition.Release;
          hasTransition = true;
        }
        break;

      case SwingPosition.Release:
        // From Release, we go back to Top for the next rep
        // This happens automatically when the rep counter increases
        if (absAngle < this.HINGE_THRESHOLD) {
          newPosition = SwingPosition.Top;
          hasTransition = true;
        }
        break;
    }

    return { newPosition, hasTransition };
  }

  /**
   * Capture a checkpoint from the current video frame
   */
  private captureCheckpoint(
    position: SwingPosition,
    skeleton: Skeleton,
    timestamp: number
  ): FormCheckpoint {
    // Create a temporary canvas to blend video and skeleton
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvasElement.width;
    tempCanvas.height = this.canvasElement.height;
    const tempCtx = tempCanvas.getContext('2d');

    let imageData = new ImageData(1, 1); // Default

    if (tempCtx) {
      // First draw the video frame
      tempCtx.drawImage(
        this.videoElement,
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
      );

      // Then draw the canvas with the skeleton overlay
      tempCtx.drawImage(
        this.canvasElement,
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
      );

      // Get the combined image data
      imageData = tempCtx.getImageData(
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
      );
    }

    // Create a checkpoint with the capture
    return {
      position,
      timestamp,
      image: imageData,
      spineAngle: skeleton.getSpineAngle(),
      skeleton: skeleton,
    };
  }

  /**
   * Get all detected positions for the current rep
   */
  getDetectedPositions(): Map<SwingPosition, FormCheckpoint> {
    return this.detectedPositions;
  }

  /**
   * Check if a specific position has been detected in the current rep
   */
  hasDetectedPosition(position: SwingPosition): boolean {
    return this.detectedPositions.has(position);
  }
}
