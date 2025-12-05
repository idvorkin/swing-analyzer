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
import { getExerciseDefinition } from '../exercises';
import { Skeleton } from '../models/Skeleton';
import type { FormCheckpoint, PoseKeypoint } from '../types';
import { SwingPositionName } from '../types';
import type { ExerciseDefinition } from '../types/exercise';
import { ExerciseType } from '../types/exercise';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';
import { FormAnalyzer } from './FormAnalyzer';
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
 * Options for creating a PoseTrackPipeline
 */
export interface PoseTrackPipelineOptions {
  /** Exercise type for analysis (defaults to KettlebellSwing) */
  exerciseType?: ExerciseType;
  /** Custom exercise definition (overrides exerciseType) */
  exerciseDefinition?: ExerciseDefinition;
}

/**
 * CPU-only pipeline for analyzing pose track data
 */
export class PoseTrackPipeline {
  private poseTrack: PoseTrackFile;
  private currentFrameIndex: number = 0;
  private isPlaying: boolean = false;
  private playbackTimer: number | null = null;

  // Form analyzer for position detection and rep counting
  private formAnalyzer: FormAnalyzer;
  private exerciseDefinition: ExerciseDefinition;

  // RxJS subjects for event streams
  private skeletonSubject = new Subject<SkeletonEvent>();
  private formSubject = new Subject<FormEvent>();
  private repSubject = new Subject<RepEvent>();

  constructor(poseTrack: PoseTrackFile, options: PoseTrackPipelineOptions = {}) {
    this.poseTrack = poseTrack;

    // Determine exercise definition
    if (options.exerciseDefinition) {
      this.exerciseDefinition = options.exerciseDefinition;
    } else {
      const exerciseType = options.exerciseType ?? ExerciseType.KettlebellSwing;
      this.exerciseDefinition = getExerciseDefinition(exerciseType);
    }

    // Create form analyzer
    this.formAnalyzer = new FormAnalyzer(this.exerciseDefinition);
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
    return this.formAnalyzer.getRepCount();
  }

  /**
   * Get the exercise definition
   */
  getExerciseDefinition(): ExerciseDefinition {
    return this.exerciseDefinition;
  }

  /**
   * Get the form analyzer
   */
  getFormAnalyzer(): FormAnalyzer {
    return this.formAnalyzer;
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

    // Process through FormAnalyzer for position detection and rep counting
    let position: SwingPositionName | null = null;
    let repCount = this.formAnalyzer.getRepCount();

    if (skeleton) {
      const analysisResult = this.formAnalyzer.processFrame(
        skeleton,
        frame.timestamp,
        frame.videoTime
      );
      position = analysisResult.position as SwingPositionName | null;
      repCount = analysisResult.repCount;
    }

    // Create result
    const result: PoseTrackFrameResult = {
      frameIndex,
      videoTime: frame.videoTime,
      skeleton,
      checkpoint: null, // TODO: Build checkpoint if at key position
      position,
      repCount,
    };

    // Emit events
    this.emitEvents(frame, skeleton, position);

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
          this.formAnalyzer.reset();
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
    this.formAnalyzer.reset();
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
   * Emit RxJS events for compatibility with existing UI
   */
  private emitEvents(
    frame: PoseTrackFrame,
    skeleton: Skeleton | null,
    position: SwingPositionName | null
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
      repCount: this.formAnalyzer.getRepCount(),
      checkpointEvent: formEvent,
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
  poseTrack: PoseTrackFile,
  options?: PoseTrackPipelineOptions
): PoseTrackPipeline {
  return new PoseTrackPipeline(poseTrack, options);
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
