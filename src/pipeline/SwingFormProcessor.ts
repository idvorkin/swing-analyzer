import { type Observable, of } from 'rxjs';
import type { Skeleton } from '../models/Skeleton';
import { type FormCheckpoint, FormPosition } from '../types';
import type {
  CheckpointEvent,
  FormProcessor,
  SkeletonEvent,
} from './PipelineInterfaces';

/**
 * Swing form processor - processes skeletons to identify swing form positions and checkpoints
 */
export class SwingFormProcessor implements FormProcessor {
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
   * Process a skeleton to identify checkpoints
   * Returns an Observable that emits checkpoint events
   */
  processFrame(
    skeletonEvent: SkeletonEvent,
    repCount: number
  ): Observable<CheckpointEvent> {
    // If no skeleton was detected, return null checkpoint
    if (!skeletonEvent.skeleton) {
      return of({
        checkpoint: null,
        position: null,
        skeletonEvent,
      });
    }

    const skeleton = skeletonEvent.skeleton;
    const spineAngle = skeleton.getSpineAngle();
    const timestamp = skeletonEvent.poseEvent.frameEvent.timestamp;

    // If this is a new rep, reset positions
    if (repCount === 0 || this.lastRepCount !== repCount) {
      this.detectedPositions.clear();
      this.lastPosition = FormPosition.Top;
      this.lastRepCount = repCount;
    }

    // Detect position based on spine angle and previous position
    const { newPosition, hasTransition } =
      this.detectPositionTransition(spineAngle);

    // If we have a position transition or it's a new rep's first position
    if (hasTransition || (this.detectedPositions.size === 0 && newPosition)) {
      // Capture the checkpoint
      const checkpoint = this.captureCheckpoint(
        newPosition!,
        skeleton,
        timestamp
      );

      // Update last position
      this.lastPosition = newPosition!;

      // Store in detected positions map
      this.detectedPositions.set(newPosition!, checkpoint);

      return of({
        checkpoint,
        position: newPosition,
        skeletonEvent,
      });
    }

    // No new checkpoint detected
    return of({
      checkpoint: null,
      position: this.lastPosition,
      skeletonEvent,
    });
  }

  // Track the last rep count to detect new reps
  private lastRepCount = -1;

  /**
   * Reset the form processor state
   */
  reset(): void {
    this.detectedPositions.clear();
    this.lastPosition = FormPosition.Top;
    this.lastRepCount = -1;
  }

  /**
   * Detect position transitions based on spine angle and state machine
   */
  private detectPositionTransition(spineAngle: number): {
    newPosition: FormPosition | null;
    hasTransition: boolean;
  } {
    const absAngle = Math.abs(spineAngle);
    let newPosition: FormPosition | null = null;
    let hasTransition = false;

    // State machine for position detection
    switch (this.lastPosition) {
      case FormPosition.Top:
        // From Top, we can only go to Hinge
        if (
          absAngle > this.HINGE_THRESHOLD &&
          !this.detectedPositions.has(FormPosition.Hinge)
        ) {
          newPosition = FormPosition.Hinge;
          hasTransition = true;
        }
        break;

      case FormPosition.Hinge:
        // From Hinge, we can go to Bottom
        if (
          absAngle > this.BOTTOM_THRESHOLD &&
          !this.detectedPositions.has(FormPosition.Bottom)
        ) {
          newPosition = FormPosition.Bottom;
          hasTransition = true;
        }
        break;

      case FormPosition.Bottom:
        // From Bottom, we can go to Release
        if (
          absAngle < this.RELEASE_THRESHOLD &&
          !this.detectedPositions.has(FormPosition.Release)
        ) {
          newPosition = FormPosition.Release;
          hasTransition = true;
        }
        break;

      case FormPosition.Release:
        // From Release, we go back to Top for the next rep
        // This happens automatically when the rep counter increases
        if (absAngle < this.HINGE_THRESHOLD) {
          newPosition = FormPosition.Top;
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
    position: FormPosition,
    skeleton: Skeleton,
    timestamp: number
  ): FormCheckpoint {
    console.log(
      `Capturing position: ${position}, spine angle: ${skeleton.getSpineAngle().toFixed(2)}`
    );

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
    };
  }

  /**
   * Get all detected positions for the current rep
   */
  getDetectedPositions(): Map<FormPosition, FormCheckpoint> {
    return this.detectedPositions;
  }

  /**
   * Check if a specific position has been detected in the current rep
   */
  hasDetectedPosition(position: FormPosition): boolean {
    return this.detectedPositions.has(position);
  }
}
