import { type Observable, of } from 'rxjs';
import { SwingPosition, type RepCounter, type RepData } from '../types';
import type {
  FormEvent,
  RepEvent,
  RepProcessor,
} from './PipelineInterfaces';

/**
 * Swing rep processor - processes form checkpoints to count and analyze swing repetitions
 * Based on detecting swing positions instead of raw angles
 */
export class SwingRepProcessor implements RepProcessor {
  // Track rep state
  private repCounter: RepCounter = {
    count: 0,
    isHinge: false,
    lastHingeState: false,
    hingeThreshold: 45, // Kept for backwards compatibility
  };

  // Store completed reps
  private completedReps: RepData[] = [];
  private currentRep: RepData | null = null;
  
  // Positions in current swing
  private detectedPositions = new Set<SwingPosition>();
  private lastPosition: SwingPosition | null = null;

  /**
   * Update rep count based on checkpoint event
   * Returns an Observable that emits rep events
   */
  updateRepCount(checkpointEvent: FormEvent): Observable<RepEvent> {
    if (!checkpointEvent.skeletonEvent.skeleton || !checkpointEvent.position) {
      // No skeleton data or position to process
      return of({
        repCount: this.repCounter.count,
        checkpointEvent,
      });
    }

    // Get the current position from the form event
    const currentPosition = checkpointEvent.position;
    
    // Add this position to our detected positions for this rep
    this.detectedPositions.add(currentPosition);
    
    // Check for rep completion
    let repIncremented = false;
    
    // If we've seen a Release position followed by a Top position, we've completed a rep
    if (this.lastPosition === SwingPosition.Release && currentPosition === SwingPosition.Top) {
      // Check if we've seen all positions in the correct sequence
      if (this.hasCompletedFullCycle()) {
        this.incrementRepCount();
        repIncremented = true;
        
        // Reset detected positions for next rep
        this.detectedPositions.clear();
        this.detectedPositions.add(SwingPosition.Top); // Start the next rep at Top

        // Log the rep completion
        console.log(`Rep ${this.repCounter.count} detected - full swing cycle completed`);
      }
    }

    // Update last position
    this.lastPosition = currentPosition;

    // If we have a checkpoint and current rep exists, store the checkpoint
    if (checkpointEvent.checkpoint && this.currentRep) {
      this.currentRep.checkpoints.set(
        checkpointEvent.checkpoint.position,
        checkpointEvent.checkpoint
      );
    }

    // Create a new rep if we don't have one
    if (this.currentRep === null) {
      this.currentRep = {
        repNumber: this.repCounter.count + 1, // Next rep (current count + 1)
        checkpoints: new Map(),
      };

      // If we have a checkpoint, add it
      if (checkpointEvent.checkpoint) {
        this.currentRep.checkpoints.set(
          checkpointEvent.checkpoint.position,
          checkpointEvent.checkpoint
        );
      }
    }

    return of({
      repCount: this.repCounter.count,
      checkpointEvent,
      repIncremented,
    });
  }

  /**
   * Check if we've detected all positions in the correct sequence
   */
  private hasCompletedFullCycle(): boolean {
    return (
      this.detectedPositions.has(SwingPosition.Top) &&
      this.detectedPositions.has(SwingPosition.Hinge) &&
      this.detectedPositions.has(SwingPosition.Bottom) &&
      this.detectedPositions.has(SwingPosition.Release)
    );
  }

  /**
   * Get the current rep count
   */
  getRepCount(): number {
    return this.repCounter.count;
  }

  /**
   * Reset the rep counter
   */
  reset(): void {
    this.repCounter = {
      count: 0,
      isHinge: false,
      lastHingeState: false,
      hingeThreshold: this.repCounter.hingeThreshold,
    };
    this.completedReps = [];
    this.currentRep = null;
    this.detectedPositions.clear();
    this.lastPosition = null;
  }

  /**
   * Get all completed reps
   */
  getAllReps(): RepData[] {
    return this.completedReps;
  }

  /**
   * Get the current rep in progress
   */
  getCurrentRep(): RepData | null {
    return this.currentRep;
  }

  /**
   * Set the hinge threshold angle
   * Kept for backwards compatibility
   */
  setHingeThreshold(degrees: number): void {
    this.repCounter.hingeThreshold = degrees;
  }

  /**
   * Increment the rep count and update the completed reps collection
   */
  private incrementRepCount(): void {
    this.repCounter.count += 1;

    // If we have a current rep, add it to completed reps
    if (this.currentRep) {
      // Update the rep number to match the new count
      this.currentRep.repNumber = this.repCounter.count;
      this.completedReps.push(this.currentRep);
    }

    // Start a new rep
    this.currentRep = {
      repNumber: this.repCounter.count + 1, // Next rep
      checkpoints: new Map(),
    };
  }
}
