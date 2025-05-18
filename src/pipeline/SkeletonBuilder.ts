import { PoseKeypoint, CocoBodyParts } from '../types';
import { Skeleton } from '../models/Skeleton';
import { SkeletonConstruction, PoseEvent, SkeletonEvent } from './PipelineInterfaces';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Builds a skeleton from pose keypoints detected by ML model
 */
export class SkeletonBuilder implements SkeletonConstruction {
  /**
   * Build a skeleton from a pose event
   * Returns an Observable that emits the skeleton event
   */
  buildSkeleton(poseEvent: PoseEvent): Observable<SkeletonEvent> {
    // If no pose was detected, return null skeleton
    if (!poseEvent.pose) {
      return of({
        skeleton: null,
        poseEvent
      });
    }

    // Build the skeleton from keypoints
    const keypoints = poseEvent.pose.keypoints;
    const spineAngle = this.calculateSpineVertical(keypoints);
    const hasVisibleKeypoints = this.hasRequiredKeypoints(keypoints);
    
    const skeleton = new Skeleton(keypoints, spineAngle, hasVisibleKeypoints);
    
    // Return the skeleton event
    return of({
      skeleton,
      poseEvent
    });
  }
  
  /**
   * Calculate the angle of the spine from vertical (0° is upright)
   * This will be moved from SwingAnalyzer.ts in phase 2
   */
  private calculateSpineVertical(keypoints: PoseKeypoint[]): number {
    // Currently a placeholder - will be implemented in phase 2
    // This logic will come from SwingAnalyzer.calculateSpineVertical
    return 0;
  }
  
  /**
   * Check if the required keypoints for pose analysis are visible
   */
  private hasRequiredKeypoints(keypoints: PoseKeypoint[]): boolean {
    // Required keypoints for spine angle calculation
    const requiredParts = [
      CocoBodyParts.LEFT_SHOULDER, 
      CocoBodyParts.RIGHT_SHOULDER,
      CocoBodyParts.LEFT_HIP, 
      CocoBodyParts.RIGHT_HIP
    ];
    
    // Check if all required keypoints are visible
    return requiredParts.every(index => {
      const point = keypoints[index];
      return point && point.visibility !== undefined && point.visibility > 0.5;
    });
  }
} 