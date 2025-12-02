/**
 * PoseTrack Pipeline
 *
 * A CPU-only analysis pipeline that works with pre-extracted pose data.
 * Does NOT require WebGL or TensorFlow - all analysis is pure TypeScript.
 * This enables:
 * - Fast testing without ML model loading
 * - Deterministic results
 * - Offline analysis
 */

import { type Observable, Subject } from 'rxjs';
import { Skeleton } from '../models/Skeleton';
import type { FormCheckpoint, PoseKeypoint } from '../types';
import { SwingPositionName } from '../types';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';
import type { FormEvent, RepEvent, SkeletonEvent } from './PipelineInterfaces';
import type { PoseEvent } from './PoseSkeletonTransformer';

/**
 * Result from processing a single pose track frame
 */
export interface PoseTrackFrameResult {
  frameIndex: number;
  videoTime: number;
  skeleton: Skeleton | null;
  checkpoint: FormCheckpoint | null;
  position: SwingPositionName | null;
  repCount: number;
}

/**
 * Options for pose track playback
 */
export interface PoseTrackPlaybackOptions {
  /** Start frame index (default: 0) */
  startFrame?: number;
  /** End frame index (default: last frame) */
  endFrame?: number;
  /** Playback speed multiplier (default: 1.0) */
  speed?: number;
  /** Whether to loop (default: false) */
  loop?: boolean;
}

/**
 * Callback for pose track frame events
 */
export type PoseTrackFrameCallback = (result: PoseTrackFrameResult) => void;

/**
 * CPU-only pipeline for analyzing pose track data
 */
export class PoseTrackPipeline {
  private poseTrack: PoseTrackFile;
  private currentFrameIndex: number = 0;
  private repCount: number = 0;
  private isPlaying: boolean = false;
  private playbackTimer: number | null = null;

  // Position detection state (simplified from SwingFormProcessor)
  private lastPosition: SwingPositionName | null = null;
  private positionHistory: SwingPositionName[] = [];

  // RxJS subjects for event streams
  private skeletonSubject = new Subject<SkeletonEvent>();
  private formSubject = new Subject<FormEvent>();
  private repSubject = new Subject<RepEvent>();

  constructor(poseTrack: PoseTrackFile) {
    this.poseTrack = poseTrack;
  }

  /**
   * Get the pose track metadata
   */
  getMetadata() {
    return this.poseTrack.metadata;
  }

  /**
   * Get total frame count
   */
  getFrameCount(): number {
    return this.poseTrack.frames.length;
  }

  /**
   * Get current frame index
   */
  getCurrentFrameIndex(): number {
    return this.currentFrameIndex;
  }

  /**
   * Get current rep count
   */
  getRepCount(): number {
    return this.repCount;
  }

  /**
   * Observable stream of skeleton events
   */
  get skeletons$(): Observable<SkeletonEvent> {
    return this.skeletonSubject.asObservable();
  }

  /**
   * Observable stream of form events
   */
  get forms$(): Observable<FormEvent> {
    return this.formSubject.asObservable();
  }

  /**
   * Observable stream of rep events
   */
  get reps$(): Observable<RepEvent> {
    return this.repSubject.asObservable();
  }

  /**
   * Process a single frame and return the result
   */
  processFrame(frameIndex: number): PoseTrackFrameResult {
    if (frameIndex < 0 || frameIndex >= this.poseTrack.frames.length) {
      throw new Error(`Frame index ${frameIndex} out of bounds`);
    }

    const frame = this.poseTrack.frames[frameIndex];
    this.currentFrameIndex = frameIndex;

    // Build skeleton from keypoints
    const skeleton = this.buildSkeleton(frame);

    // Detect swing position
    const position = skeleton ? this.detectPosition(skeleton) : null;

    // Check for rep completion
    const repIncremented = this.checkRepCompletion(position);
    if (repIncremented) {
      this.repCount++;
    }

    // Create result
    const result: PoseTrackFrameResult = {
      frameIndex,
      videoTime: frame.videoTime,
      skeleton,
      checkpoint: null, // TODO: Build checkpoint if at key position
      position,
      repCount: this.repCount,
    };

    // Emit events
    this.emitEvents(frame, skeleton, position, repIncremented);

    return result;
  }

  /**
   * Process all frames in sequence
   */
  processAllFrames(callback?: PoseTrackFrameCallback): PoseTrackFrameResult[] {
    const results: PoseTrackFrameResult[] = [];

    for (let i = 0; i < this.poseTrack.frames.length; i++) {
      const result = this.processFrame(i);
      results.push(result);
      callback?.(result);
    }

    return results;
  }

  /**
   * Start playback at video speed
   */
  startPlayback(
    options: PoseTrackPlaybackOptions = {},
    callback?: PoseTrackFrameCallback
  ): void {
    const {
      startFrame = 0,
      endFrame = this.poseTrack.frames.length - 1,
      speed = 1.0,
      loop = false,
    } = options;

    this.stopPlayback();
    this.currentFrameIndex = startFrame;
    this.isPlaying = true;

    const fps = this.poseTrack.metadata.fps;
    const frameInterval = 1000 / fps / speed;

    const playFrame = () => {
      if (!this.isPlaying) return;

      const result = this.processFrame(this.currentFrameIndex);
      callback?.(result);

      this.currentFrameIndex++;

      if (this.currentFrameIndex > endFrame) {
        if (loop) {
          this.currentFrameIndex = startFrame;
          this.repCount = 0;
          this.lastPosition = null;
          this.positionHistory = [];
        } else {
          this.stopPlayback();
          return;
        }
      }

      this.playbackTimer = window.setTimeout(playFrame, frameInterval);
    };

    playFrame();
  }

  /**
   * Stop playback
   */
  stopPlayback(): void {
    this.isPlaying = false;
    if (this.playbackTimer !== null) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  /**
   * Seek to a specific frame
   */
  seekToFrame(frameIndex: number): PoseTrackFrameResult {
    return this.processFrame(frameIndex);
  }

  /**
   * Seek to a specific video time
   */
  seekToTime(time: number): PoseTrackFrameResult {
    // Find the closest frame to the requested time
    let closestIndex = 0;
    let closestDiff = Math.abs(this.poseTrack.frames[0].videoTime - time);

    for (let i = 1; i < this.poseTrack.frames.length; i++) {
      const diff = Math.abs(this.poseTrack.frames[i].videoTime - time);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    return this.processFrame(closestIndex);
  }

  /**
   * Reset the pipeline state
   */
  reset(): void {
    this.currentFrameIndex = 0;
    this.repCount = 0;
    this.lastPosition = null;
    this.positionHistory = [];
    this.stopPlayback();
  }

  /**
   * Get frame data at a specific index
   */
  getFrame(frameIndex: number): PoseTrackFrame | null {
    if (frameIndex < 0 || frameIndex >= this.poseTrack.frames.length) {
      return null;
    }
    return this.poseTrack.frames[frameIndex];
  }

  /**
   * Get skeleton at a specific frame without processing
   */
  getSkeletonAtFrame(frameIndex: number): Skeleton | null {
    const frame = this.getFrame(frameIndex);
    if (!frame) return null;
    return this.buildSkeleton(frame);
  }

  /**
   * Build a Skeleton from pose track frame data
   */
  private buildSkeleton(frame: PoseTrackFrame): Skeleton | null {
    if (!frame.keypoints || frame.keypoints.length === 0) {
      return null;
    }

    // Use pre-computed spine angle if available
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
   * Detect swing position from skeleton
   * Simplified version of SwingFormProcessor logic
   */
  private detectPosition(skeleton: Skeleton): SwingPositionName | null {
    const spineAngle = skeleton.getSpineAngle();
    const armAngle = skeleton.getArmToVerticalAngle();

    // Position detection thresholds (simplified)
    const TOP_SPINE_MAX = 25;
    const BOTTOM_SPINE_MIN = 40;
    const CONNECT_ARM_MAX = 45;
    const RELEASE_ARM_MIN = 120;

    let position: SwingPositionName | null = null;

    if (spineAngle >= BOTTOM_SPINE_MIN) {
      // Check if at bottom position
      position = SwingPositionName.Bottom;
    } else if (spineAngle <= TOP_SPINE_MAX && armAngle > RELEASE_ARM_MIN) {
      // Check if at release position
      position = SwingPositionName.Release;
    } else if (spineAngle <= TOP_SPINE_MAX && armAngle < CONNECT_ARM_MAX) {
      // Check if at top position
      position = SwingPositionName.Top;
    } else if (spineAngle > TOP_SPINE_MAX && spineAngle < BOTTOM_SPINE_MIN) {
      // Check if at connect position (transition)
      if (armAngle < 90) {
        position = SwingPositionName.Connect;
      }
    }

    // Update position history
    if (position && position !== this.lastPosition) {
      this.positionHistory.push(position);
      if (this.positionHistory.length > 10) {
        this.positionHistory.shift();
      }
      this.lastPosition = position;
    }

    return position;
  }

  /**
   * Check if a rep was completed
   */
  private checkRepCompletion(position: SwingPositionName | null): boolean {
    if (!position) return false;

    // A rep is complete when we see: top -> connect -> bottom -> release -> top
    // Simplified: count a rep when we return to 'top' after seeing 'bottom'
    const history = this.positionHistory;
    const len = history.length;

    if (len >= 3 && position === SwingPositionName.Top) {
      // Check if we went through a full cycle
      const recentPositions = history.slice(-4);
      const hasBottom = recentPositions.includes(SwingPositionName.Bottom);
      const hasConnect = recentPositions.includes(SwingPositionName.Connect);

      if (hasBottom && hasConnect) {
        // Clear history to start fresh for next rep
        this.positionHistory = [position];
        return true;
      }
    }

    return false;
  }

  /**
   * Emit RxJS events for compatibility with existing UI
   */
  private emitEvents(
    frame: PoseTrackFrame,
    skeleton: Skeleton | null,
    position: SwingPositionName | null,
    repIncremented: boolean
  ): void {
    // Create frame event (minimal, since we don't have the actual frame)
    const frameEvent = {
      frame: null as unknown as HTMLVideoElement,
      timestamp: frame.timestamp,
      videoTime: frame.videoTime,
    };

    // Create pose event
    const poseEvent: PoseEvent = {
      pose: {
        keypoints: frame.keypoints,
        score: frame.score,
      },
      frameEvent,
    };

    // Emit skeleton event
    const skeletonEvent: SkeletonEvent = {
      skeleton,
      poseEvent,
    };
    this.skeletonSubject.next(skeletonEvent);

    // Emit form event
    const formEvent: FormEvent = {
      checkpoint: null, // TODO: Build checkpoint at key positions
      position,
      skeletonEvent,
    };
    this.formSubject.next(formEvent);

    // Emit rep event
    const repEvent: RepEvent = {
      repCount: this.repCount,
      checkpointEvent: formEvent,
      repIncremented,
    };
    this.repSubject.next(repEvent);
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopPlayback();
    this.skeletonSubject.complete();
    this.formSubject.complete();
    this.repSubject.complete();
  }
}

/**
 * Create a pose track pipeline from a pose track file
 */
export function createPoseTrackPipeline(
  poseTrack: PoseTrackFile
): PoseTrackPipeline {
  return new PoseTrackPipeline(poseTrack);
}

/**
 * Analyze a pose track and return summary statistics
 */
export function analyzePoseTrack(poseTrack: PoseTrackFile): {
  totalFrames: number;
  framesWithPose: number;
  detectionRate: number;
  averageConfidence: number;
  repCount: number;
  duration: number;
} {
  const pipeline = new PoseTrackPipeline(poseTrack);
  const results = pipeline.processAllFrames();

  const framesWithPose = results.filter((r) => r.skeleton !== null).length;
  const totalFrames = results.length;

  // Calculate average confidence
  let totalConfidence = 0;
  let confidenceCount = 0;
  for (const frame of poseTrack.frames) {
    if (frame.score !== undefined) {
      totalConfidence += frame.score;
      confidenceCount++;
    }
  }

  // Get repCount before disposing pipeline
  const repCount = pipeline.getRepCount();
  pipeline.dispose();

  return {
    totalFrames,
    framesWithPose,
    detectionRate: totalFrames > 0 ? framesWithPose / totalFrames : 0,
    averageConfidence:
      confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    repCount,
    duration: poseTrack.metadata.sourceVideoDuration,
  };
}
