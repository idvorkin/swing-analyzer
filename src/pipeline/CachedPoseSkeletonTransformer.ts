/**
 * CachedPoseSkeletonTransformer
 *
 * A SkeletonTransformer implementation that uses cached pose data
 * instead of running ML inference.
 *
 * Supports two modes:
 * 1. Static mode: Pre-loaded PoseTrackFile (all frames available)
 * 2. Streaming mode: LivePoseCache (frames added progressively)
 *
 * Note: Skeleton rendering during playback is now handled by video event
 * listeners (timeupdate/seeked), not by this transformer. This transformer
 * is still used for form/rep processing during extraction batch mode.
 */

import { type Observable, of } from 'rxjs';
import { Skeleton } from '../models/Skeleton';
import { CocoBodyParts, type PoseKeypoint } from '../types';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';
import { LivePoseCache } from './LivePoseCache';
import type {
  FrameEvent,
  SkeletonEvent,
  SkeletonTransformer,
} from './PipelineInterfaces';
import type { PoseEvent } from './PoseSkeletonTransformer';

/**
 * SkeletonTransformer that uses cached/streaming pose data
 */
export class CachedPoseSkeletonTransformer implements SkeletonTransformer {
  private cache: LivePoseCache;
  /** Max time difference (seconds) for frame lookup during streaming */
  private streamingTolerance = 0.1; // 100ms - about 3 frames at 30fps

  /**
   * Create from LivePoseCache (streaming mode)
   */
  constructor(cache: LivePoseCache);

  /**
   * Create from static PoseTrackFile (static mode)
   */
  constructor(poseTrack: PoseTrackFile);

  constructor(cacheOrPoseTrack: LivePoseCache | PoseTrackFile) {
    if (cacheOrPoseTrack instanceof LivePoseCache) {
      this.cache = cacheOrPoseTrack;
    } else {
      // Convert static PoseTrackFile to LivePoseCache
      this.cache = LivePoseCache.fromPoseTrackFile(cacheOrPoseTrack);
    }

    console.log(
      `CachedPoseSkeletonTransformer: Initialized with ${this.cache.getFrameCount()} frames`
    );
  }

  /**
   * Initialize - no-op for cached data
   */
  async initialize(): Promise<void> {
    console.log('CachedPoseSkeletonTransformer: Ready (using cached poses)');
  }

  /**
   * Transform a frame event into a skeleton using cached pose data.
   *
   * During streaming (extraction in progress):
   * - Only uses frames within tolerance of requested time
   * - Returns null skeleton if no nearby frame exists (skips frame)
   *
   * After extraction complete:
   * - Uses closest available frame regardless of distance
   */
  transformToSkeleton(frameEvent: FrameEvent): Observable<SkeletonEvent> {
    const videoTime = frameEvent.videoTime ?? 0;
    const isComplete = this.cache.isExtractionComplete();

    // During streaming, only use frames within tolerance
    // After extraction, use any available frame (closest match)
    const tolerance = isComplete ? undefined : this.streamingTolerance;
    const cachedFrame = this.cache.getFrame(videoTime, tolerance);

    if (cachedFrame) {
      return of(this.buildSkeletonEvent(cachedFrame, frameEvent));
    }

    // No frame within tolerance - return null skeleton
    return of({
      skeleton: null,
      poseEvent: this.createPoseEvent(null, frameEvent),
    });
  }

  /**
   * Build a SkeletonEvent from a cached frame
   */
  private buildSkeletonEvent(
    frame: PoseTrackFrame,
    frameEvent: FrameEvent
  ): SkeletonEvent {
    const skeleton = this.buildSkeleton(frame);
    return {
      skeleton,
      poseEvent: this.createPoseEvent(frame, frameEvent),
    };
  }

  /**
   * Build a Skeleton from cached frame data
   */
  private buildSkeleton(frame: PoseTrackFrame): Skeleton | null {
    if (!frame.keypoints || frame.keypoints.length === 0) {
      return null;
    }

    // Use pre-computed spine angle if available and non-zero
    // Fall back to calculation if precomputed is 0 (legacy data bug)
    const precomputed = frame.angles?.spineAngle;
    const spineAngle =
      precomputed && precomputed !== 0
        ? precomputed
        : this.calculateSpineAngle(frame.keypoints);
    const hasVisibleKeypoints = this.hasRequiredKeypoints(frame.keypoints);

    return new Skeleton(frame.keypoints, spineAngle, hasVisibleKeypoints);
  }

  /**
   * Calculate spine angle from keypoints
   */
  private calculateSpineAngle(keypoints: PoseKeypoint[]): number {
    const leftShoulder = keypoints[CocoBodyParts.LEFT_SHOULDER];
    const rightShoulder = keypoints[CocoBodyParts.RIGHT_SHOULDER];
    const leftHip = keypoints[CocoBodyParts.LEFT_HIP];
    const rightHip = keypoints[CocoBodyParts.RIGHT_HIP];

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
      console.warn(
        `CachedPoseSkeletonTransformer: Missing keypoints for spine angle - ` +
          `LS:${!!leftShoulder} RS:${!!rightShoulder} LH:${!!leftHip} RH:${!!rightHip}, ` +
          `total keypoints: ${keypoints.length}`
      );
      return 0;
    }

    // Calculate midpoints
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;

    // Calculate angle from vertical
    const deltaX = shoulderMidX - hipMidX;
    const deltaY = hipMidY - shoulderMidY; // Inverted for screen coordinates

    return Math.abs((Math.atan2(deltaX, deltaY) * 180) / Math.PI);
  }

  /**
   * Check if required keypoints are visible
   */
  private hasRequiredKeypoints(keypoints: PoseKeypoint[]): boolean {
    const requiredIndices = [
      CocoBodyParts.LEFT_SHOULDER,
      CocoBodyParts.RIGHT_SHOULDER,
      CocoBodyParts.LEFT_HIP,
      CocoBodyParts.RIGHT_HIP,
    ];
    return requiredIndices.every((index) => {
      const point = keypoints[index];
      return point && (point.score ?? point.visibility ?? 0) > 0.2;
    });
  }

  /**
   * Create a PoseEvent from cached frame data
   */
  private createPoseEvent(
    frame: PoseTrackFrame | null,
    frameEvent: FrameEvent
  ): PoseEvent {
    if (!frame) {
      return {
        pose: null,
        frameEvent,
      };
    }

    return {
      pose: {
        keypoints: frame.keypoints,
        score: frame.score,
      },
      frameEvent,
    };
  }

  /**
   * Get the underlying cache
   */
  getCache(): LivePoseCache {
    return this.cache;
  }

  /**
   * Check if extraction is complete
   */
  isExtractionComplete(): boolean {
    return this.cache.isExtractionComplete();
  }

  /**
   * Get the number of cached frames
   */
  getFrameCount(): number {
    return this.cache.getFrameCount();
  }
}
