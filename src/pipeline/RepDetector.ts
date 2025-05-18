import { FormCheckpoint, FormPosition, RepCounter, RepData } from '../types';
import { Skeleton } from '../models/Skeleton';
import { SwingRepAnalysis, CheckpointEvent, RepEvent } from './PipelineInterfaces';
import { Observable, of } from 'rxjs';

/**
 * Analyzes skeletons and checkpoints to detect and count swing repetitions
 */
export class RepDetector implements SwingRepAnalysis {
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
    const isHinge = Math.abs(spineAngle) > this.repCounter.hingeThreshold;
    
    let repIncremented = false;
    
    // Detect transition from hinge to not-hinge (upright)
    if (this.repCounter.lastHingeState && !isHinge) {
      this.incrementRepCount();
      repIncremented = true;
    }
    
    // Update state
    this.repCounter.isHinge = isHinge;
    this.repCounter.lastHingeState = isHinge;
    
    // If we have a new checkpoint, store it in the current rep
    if (checkpointEvent.checkpoint && this.currentRep) {
      this.currentRep.checkpoints.set(
        checkpointEvent.checkpoint.position,
        checkpointEvent.checkpoint
      );
    }
    
    return of({
      repCount: this.repCounter.count,
      checkpointEvent,
      repIncremented
    } as RepEvent);
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
   * Set the hinge threshold angle
   */
  setHingeThreshold(degrees: number): void {
    this.repCounter.hingeThreshold = degrees;
  }
  
  /**
   * Increment the rep count
   */
  private incrementRepCount(): void {
    this.repCounter.count += 1;
    
    // If we have a current rep, add it to completed reps
    if (this.currentRep) {
      this.completedReps.push(this.currentRep);
    }
    
    // Start a new rep
    this.currentRep = {
      repNumber: this.repCounter.count,
      checkpoints: new Map()
    };
  }
} 