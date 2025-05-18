import { FormCheckpoint, FormPosition, RepCounter, RepData } from '../types';
import { Skeleton } from '../models/Skeleton';
import { SwingRepAnalysis, CheckpointEvent, RepEvent } from './PipelineInterfaces';
import { Observable, of } from 'rxjs';

/**
 * Swing rep analysis stage - analyzes skeletons and checkpoints to detect and count swing repetitions
 */
export class RepStage implements SwingRepAnalysis {
  // Track rep state
  private repCounter: RepCounter = {
    count: 0,
    isHinge: false,
    lastHingeState: false,
    hingeThreshold: 45 // Degrees, matching original implementation
  };
  
  // Store completed reps
  private completedReps: RepData[] = [];
  private currentRep: RepData | null = null;
  
  /**
   * Update rep count based on checkpoint event
   * Returns an Observable that emits rep events
   */
  updateRepCount(checkpointEvent: CheckpointEvent): Observable<RepEvent> {
    if (!checkpointEvent.skeletonEvent.skeleton) {
      // No skeleton data to process
      return of({
        repCount: this.repCounter.count,
        checkpointEvent
      });
    }
    
    const skeleton = checkpointEvent.skeletonEvent.skeleton;
    const spineAngle = skeleton.getSpineAngle();
    
    // Calculate if the position is hinged based on spine angle
    // Note: The logic here is intentionally inverted from the original implementation
    // In the original, isHinge=true means the person is UPRIGHT (not hinged)
    // This is more intuitive: isHinge=true means they ARE in a hinged position
    const isHinge = Math.abs(spineAngle) < this.repCounter.hingeThreshold;
    
    // Track whether we incremented a rep in this update
    let repIncremented = false;
    
    // Only count a rep when transitioning from hinge to not-hinge (straightening up)
    if (this.repCounter.lastHingeState && !isHinge) {
      this.incrementRepCount();
      repIncremented = true;
      
      // Log the rep completion
      console.log(`Rep ${this.repCounter.count} detected - spine angle: ${spineAngle.toFixed(1)}°`);
    }
    
    // Update state for next time
    this.repCounter.isHinge = isHinge;
    this.repCounter.lastHingeState = isHinge;
    
    // If we have a new checkpoint and current rep exists, store the checkpoint
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
        checkpoints: new Map()
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
      repIncremented
    });
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
      hingeThreshold: this.repCounter.hingeThreshold
    };
    this.completedReps = [];
    this.currentRep = null;
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
      checkpoints: new Map()
    };
  }
} 