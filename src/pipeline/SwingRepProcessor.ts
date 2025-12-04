import { type Observable, of } from 'rxjs';
import { SwingPositionName, type RepData } from '../types';
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
  // Simple counter for reps
  private repCount = 0;

  // Store completed reps
  private completedReps: RepData[] = [];
  private currentRep: RepData | null = null;
  
  // Positions in current swing
  private detectedPositions = new Set<SwingPositionName>();
  private lastPosition: SwingPositionName | null = null;

  /**
   * Update rep count based on checkpoint event
   * Returns an Observable that emits rep events
   */
  updateRepCount(checkpointEvent: FormEvent): Observable<RepEvent> {
    console.log(`SwingRepProcessor: Received checkpoint event for position ${checkpointEvent.position}`);
    
    if (!checkpointEvent.skeletonEvent.skeleton || !checkpointEvent.position) {
      console.warn(`SwingRepProcessor: Invalid checkpoint event - missing skeleton or position`);
      // No skeleton data or position to process
      return of({
        repCount: this.repCount,
        checkpointEvent,
      });
    }

    // Get the current position from the form event
    const currentPosition = checkpointEvent.position;
    
    // Add this position to our detected positions for this rep
    this.detectedPositions.add(currentPosition);
    console.log(`SwingRepProcessor: Added position ${currentPosition}, detected positions now: ${Array.from(this.detectedPositions).join(', ')}`);
    
    // Check for rep completion
    // If we've seen a Release position followed by a Top position, we've completed a rep
    if (this.lastPosition === SwingPositionName.Release && currentPosition === SwingPositionName.Top) {
      console.log(`SwingRepProcessor: Detected transition from Release to Top, checking for rep completion`);
      // Check if we've seen all positions in the correct sequence
      if (this.hasCompletedFullCycle()) {
        console.log(`SwingRepProcessor: Full cycle detected, incrementing rep count`);
        this.incrementRepCount();
        
        // Reset detected positions for next rep
        this.detectedPositions.clear();
        this.detectedPositions.add(SwingPositionName.Top); // Start the next rep at Top

        // Log the rep completion with angles for each position
        console.log(`Rep ${this.repCount} detected - full swing cycle completed`, {
          top: {
            spineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Top)?.spineAngle,
            armToSpineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Top)?.armToSpineAngle
          },
          connect: {
            spineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Connect)?.spineAngle,
            armToSpineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Connect)?.armToSpineAngle
          },
          bottom: {
            spineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Bottom)?.spineAngle,
            armToSpineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Bottom)?.armToSpineAngle
          },
          release: {
            spineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Release)?.spineAngle,
            armToSpineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Release)?.armToSpineAngle
          }
        });
      } else {
        console.log(`SwingRepProcessor: Full cycle not detected, positions detected: ${Array.from(this.detectedPositions).join(', ')}`);
      }
    }

    // Update last position
    this.lastPosition = currentPosition;
    console.log(`SwingRepProcessor: Updated last position to ${this.lastPosition}`);

    // If we have a checkpoint and current rep exists, store the checkpoint
    if (checkpointEvent.checkpoint && this.currentRep) {
      this.currentRep.checkpoints.set(
        checkpointEvent.checkpoint.position,
        checkpointEvent.checkpoint
      );
      console.log(`SwingRepProcessor: Stored checkpoint for position ${checkpointEvent.checkpoint.position} in rep ${this.currentRep.repNumber}`);
    }

    // Create a new rep if we don't have one
    if (this.currentRep === null) {
      this.currentRep = {
        repNumber: this.repCount + 1, // Next rep (current count + 1)
        checkpoints: new Map(),
      };
      console.log(`SwingRepProcessor: Created new rep with number ${this.currentRep.repNumber}`);

      // If we have a checkpoint, add it
      if (checkpointEvent.checkpoint) {
        this.currentRep.checkpoints.set(
          checkpointEvent.checkpoint.position,
          checkpointEvent.checkpoint
        );
        console.log(`SwingRepProcessor: Added first checkpoint for position ${checkpointEvent.checkpoint.position}`);
      }
    }

    console.log(`SwingRepProcessor: Emitting RepEvent with repCount=${this.repCount}`);
    return of({
      repCount: this.repCount,
      checkpointEvent,
    });
  }

  /**
   * Check if we've detected all positions in the correct sequence
   */
  private hasCompletedFullCycle(): boolean {
    return (
      this.detectedPositions.has(SwingPositionName.Top) &&
      this.detectedPositions.has(SwingPositionName.Connect) &&
      this.detectedPositions.has(SwingPositionName.Bottom) &&
      this.detectedPositions.has(SwingPositionName.Release)
    );
  }

  /**
   * Get the current rep count
   */
  getRepCount(): number {
    return this.repCount;
  }

  /**
   * Reset the rep counter
   */
  reset(): void {
    this.repCount = 0;
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
   * Increment the rep count and update the completed reps collection
   */
  private incrementRepCount(): void {
    this.repCount += 1;

    // If we have a current rep, add it to completed reps
    if (this.currentRep) {
      // Update the rep number to match the new count
      this.currentRep.repNumber = this.repCount;
      this.completedReps.push(this.currentRep);
    }

    // Start a new rep
    this.currentRep = {
      repNumber: this.repCount + 1, // Next rep
      checkpoints: new Map(),
    };
  }

  calculateRepMetrics(): Record<string, any> {
    if (!this.currentRep) return {};

    // Get angles at each position
    return {
      top: {
        spineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Top)?.spineAngle,
        armToSpineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Top)?.armToSpineAngle
      },
      connect: {
        spineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Connect)?.spineAngle,
        armToSpineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Connect)?.armToSpineAngle
      },
      bottom: {
        spineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Bottom)?.spineAngle,
        armToSpineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Bottom)?.armToSpineAngle
      },
      release: {
        spineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Release)?.spineAngle,
        armToSpineAngle: this.currentRep?.checkpoints.get(SwingPositionName.Release)?.armToSpineAngle
      }
    };
  }
}
