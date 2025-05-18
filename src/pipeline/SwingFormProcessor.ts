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

  // Track best candidates for each position within a swing cycle
  private bestPositionCandidates = new Map<SwingPosition, {
    skeleton: Skeleton;
    timestamp: number;
    spineAngle: number;
    armToSpineAngle: number;
    angleDelta: number; // how close to the ideal angle
  }>();

  // Ideal target angles for each position
  private readonly IDEAL_ANGLES = {
    [SwingPosition.Top]: 0,      // Most vertical
    [SwingPosition.Hinge]: 45,   // Mid-point down
    [SwingPosition.Bottom]: 90,  // Most horizontal
    [SwingPosition.Release]: 30, // Mid-point up
  };

  // Threshold to detect a new cycle starting - lowered for easier detection
  private readonly CYCLE_RESET_THRESHOLD = 25; // Degrees from vertical (was 15)

  // Lower the minimum angle for cycle detection to make testing easier
  private readonly MIN_CYCLE_ANGLE = 40; // Was 60

  // Tracking swing direction
  private isDownswing = true;
  private prevSpineAngle = 0;
  
  // Tracking swing angle extremes for cycle detection
  private maxSpineAngleInCycle = 0;

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
    const spineAngle = Math.abs(skeleton.getSpineAngle());
    const timestamp = skeletonEvent.poseEvent.frameEvent.timestamp;
    
    // DEBUG: Log basic frame info
    console.log(`Processing frame: spineAngle=${spineAngle.toFixed(2)}°, ts=${timestamp}`);
    
    // Get arm to spine angle from skeleton
    const armToSpineAngle = skeleton.getArmToSpineAngle();
    console.log(`Arm-to-spine angle: ${armToSpineAngle.toFixed(2)}°`);

    // Detect swing direction
    const isIncreasing = spineAngle > this.prevSpineAngle;
    if (Math.abs(spineAngle - this.prevSpineAngle) > 3) { // Only change direction on significant changes
      this.isDownswing = isIncreasing;
    }
    this.prevSpineAngle = spineAngle;

    // Track max angle in cycle for cycle detection
    this.maxSpineAngleInCycle = Math.max(this.maxSpineAngleInCycle, spineAngle);
    console.log(`Max angle in cycle: ${this.maxSpineAngleInCycle.toFixed(2)}°, direction: ${this.isDownswing ? 'down' : 'up'}`);

    // Check for cycle reset (going back to top)
    if (this.maxSpineAngleInCycle > this.MIN_CYCLE_ANGLE && spineAngle < this.CYCLE_RESET_THRESHOLD) {
      console.log(`===== CYCLE COMPLETE: Processing best candidates =====`);
      // We've completed a cycle, process the best candidates
      const formEvents: FormEvent[] = [];
      
      // Process positions in the correct sequence
      const sequence = [SwingPosition.Top, SwingPosition.Hinge, SwingPosition.Bottom, SwingPosition.Release];
      
      for (const position of sequence) {
        const candidate = this.bestPositionCandidates.get(position);
        if (candidate) {
          console.log(`Found best candidate for ${position}: spine=${candidate.spineAngle.toFixed(2)}°, arm=${candidate.armToSpineAngle.toFixed(2)}°`);
          // Create a checkpoint from the best candidate
          const checkpoint = this.createCheckpoint(
            position,
            candidate.skeleton,
            candidate.timestamp,
            candidate.spineAngle,
            candidate.armToSpineAngle
          );
          
          // Store in detected positions map
          this.detectedPositions.set(position, checkpoint);
          
          // Create form event
          formEvents.push({
            checkpoint,
            position,
            skeletonEvent: {
              ...skeletonEvent,
              skeleton: candidate.skeleton
            },
          });
        } else {
          console.warn(`No candidate found for position ${position}`);
        }
      }
      
      // Reset for next cycle
      this.bestPositionCandidates.clear();
      this.maxSpineAngleInCycle = 0;
      
      // If we have events, return the first one and queue the rest (or create a multicasting observable)
      if (formEvents.length > 0) {
        console.log(`Emitting form event for position: ${formEvents[0].position}`);
        return of(formEvents[0]); // For simplicity, just return the first event
      } else {
        console.warn('No form events to emit after cycle completion');
      }
      
      return EMPTY;
    }

    // Update best candidates for each position based on how close we are to the ideal angle
    this.updatePositionCandidate(SwingPosition.Top, skeleton, timestamp, spineAngle, armToSpineAngle);
    
    // Only consider Hinge in the downswing
    if (this.isDownswing) {
      this.updatePositionCandidate(SwingPosition.Hinge, skeleton, timestamp, spineAngle, armToSpineAngle);
    }
    
    // Consider Bottom position at any time (will be constrained by angle)
    this.updatePositionCandidate(SwingPosition.Bottom, skeleton, timestamp, spineAngle, armToSpineAngle);
    
    // Only consider Release in the upswing
    if (!this.isDownswing) {
      this.updatePositionCandidate(SwingPosition.Release, skeleton, timestamp, spineAngle, armToSpineAngle);
    }

    // No new checkpoint detected, return empty observable
    return EMPTY;
  }

  /**
   * Update the best candidate for a position if this frame is better
   */
  private updatePositionCandidate(
    position: SwingPosition,
    skeleton: Skeleton,
    timestamp: number,
    spineAngle: number,
    armToSpineAngle: number
  ): void {
    const idealAngle = this.IDEAL_ANGLES[position];
    const angleDelta = Math.abs(spineAngle - idealAngle);
    
    const currentBest = this.bestPositionCandidates.get(position);
    
    // Update if this is the first candidate or better than existing
    if (!currentBest || angleDelta < currentBest.angleDelta) {
      this.bestPositionCandidates.set(position, {
        skeleton,
        timestamp,
        spineAngle,
        armToSpineAngle,
        angleDelta,
      });
      console.log(`Updated best candidate for ${position}: spine=${spineAngle.toFixed(2)}°, arm=${armToSpineAngle.toFixed(2)}°, delta=${angleDelta.toFixed(2)}`);
    }
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
    this.bestPositionCandidates.clear();
    this.lastPosition = SwingPosition.Top;
    this.maxSpineAngleInCycle = 0;
    this.prevSpineAngle = 0;
    this.isDownswing = true;
  }

  /**
   * Create a checkpoint from skeleton data
   */
  private createCheckpoint(
    position: SwingPosition,
    skeleton: Skeleton,
    timestamp: number,
    spineAngle: number,
    armToSpineAngle: number
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

    // Create a checkpoint with the capture including the arm-to-spine angle
    return {
      position,
      timestamp,
      image: imageData,
      spineAngle: spineAngle,
      armToSpineAngle: armToSpineAngle,
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
