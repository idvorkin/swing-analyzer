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
 * In streaming mode, if a frame isn't cached yet, the transformer
 * waits for extraction to produce it (blocking behavior).
 *
 * This enables:
 * - Fast, deterministic E2E testing (pre-seeded data)
 * - Progressive playback during extraction (streaming)
 * - No WebGL/TensorFlow dependencies during playback
 */

import { from, type Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Skeleton } from '../models/Skeleton';
import type { PoseKeypoint } from '../types';
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
  private waitTimeoutMs: number;

  /**
   * Create from LivePoseCache (streaming mode)
   */
  constructor(cache: LivePoseCache, options?: { waitTimeoutMs?: number });

  /**
   * Create from static PoseTrackFile (static mode)
   */
  constructor(poseTrack: PoseTrackFile, options?: { waitTimeoutMs?: number });

  constructor(
    cacheOrPoseTrack: LivePoseCache | PoseTrackFile,
    options: { waitTimeoutMs?: number } = {}
  ) {
    const { waitTimeoutMs = 5000 } = options;
    this.waitTimeoutMs = waitTimeoutMs;

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
   * If frame isn't cached yet, waits for extraction to produce it.
   */
  transformToSkeleton(frameEvent: FrameEvent): Observable<SkeletonEvent> {
    const videoTime = frameEvent.videoTime ?? 0;

    // Try to get frame from cache (non-blocking first)
    const cachedFrame = this.cache.getFrame(videoTime);

    if (cachedFrame) {
      // Frame available - return immediately
      return of(this.buildSkeletonEvent(cachedFrame, frameEvent));
    }

    // Frame not available - check if extraction is complete
    if (this.cache.isExtractionComplete()) {
      // Extraction done but frame not found - return null skeleton
      console.warn(
        `CachedPoseSkeletonTransformer: No frame at ${videoTime}s (extraction complete)`
      );
      return of({
        skeleton: null,
        poseEvent: this.createPoseEvent(null, frameEvent),
      });
    }

    // Wait for extraction to produce the frame
    return from(
      this.cache.waitForFrame(videoTime, { timeoutMs: this.waitTimeoutMs })
    ).pipe(
      map((frame) => this.buildSkeletonEvent(frame, frameEvent)),
      catchError((error) => {
        console.warn(
          `CachedPoseSkeletonTransformer: ${(error as Error).message}`
        );
        return of({
          skeleton: null,
          poseEvent: this.createPoseEvent(null, frameEvent),
        });
      })
    );
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

    // Use pre-computed spine angle if available, otherwise calculate
    const spineAngle =
      frame.angles?.spineAngle ?? this.calculateSpineAngle(frame.keypoints);
    const hasVisibleKeypoints = this.hasRequiredKeypoints(frame.keypoints);

    return new Skeleton(frame.keypoints, spineAngle, hasVisibleKeypoints);
  }

  /**
   * Calculate spine angle from keypoints
   */
  private calculateSpineAngle(keypoints: PoseKeypoint[]): number {
    // COCO keypoint indices
    const LEFT_SHOULDER = 5;
    const RIGHT_SHOULDER = 6;
    const LEFT_HIP = 11;
    const RIGHT_HIP = 12;

    const leftShoulder = keypoints[LEFT_SHOULDER];
    const rightShoulder = keypoints[RIGHT_SHOULDER];
    const leftHip = keypoints[LEFT_HIP];
    const rightHip = keypoints[RIGHT_HIP];

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
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
    const requiredIndices = [5, 6, 11, 12]; // Shoulders and hips
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
