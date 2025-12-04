import type { Observable } from 'rxjs';
import type { Skeleton } from '../models/Skeleton';
import type { FormCheckpoint, RepData, SwingPositionName } from '../types';
import type { PoseEvent } from './PoseSkeletonTransformer';

/**
 * Frame acquisition stage - processes raw video/camera frames
 */
export interface FrameAcquisition {
  /**
   * Get the current frame
   */
  getCurrentFrame(): HTMLCanvasElement | HTMLVideoElement;

  /**
   * Start frame acquisition and return an Observable of frame events
   */
  start(): Observable<FrameEvent>;

  /**
   * Stop frame acquisition
   */
  stop(): void;
}

/**
 * A frame event with the source element and timestamp
 */
export interface FrameEvent {
  frame: HTMLCanvasElement | HTMLVideoElement;
  timestamp: number;
  videoTime?: number; // video.currentTime in seconds (for seeking)

  /**
   * Frame image captured during extraction.
   * Only populated in extraction mode by PoseExtractor.
   * Undefined during playback, camera mode, or real-time processing.
   * Used for filmstrip thumbnail capture when main video is at wrong position.
   */
  frameImage?: ImageData;
}

/**
 * Skeleton transformer stage - transforms frames into skeleton models
 * Combines pose detection and skeleton construction into a single stage
 */
export interface SkeletonTransformer {
  /**
   * Initialize the skeleton transformer
   */
  initialize(): Promise<void>;

  /**
   * Transform a frame event into a skeleton
   * Returns an Observable that emits the skeleton event
   */
  transformToSkeleton(frameEvent: FrameEvent): Observable<SkeletonEvent>;
}

/**
 * A skeleton event with the skeleton and original frame data
 */
export interface SkeletonEvent {
  skeleton: Skeleton | null;
  poseEvent: PoseEvent;
}

/**
 * Form processor stage - processes skeletons to identify form positions
 * Maintains state for form analysis
 */
export interface FormProcessor {
  /**
   * Process a skeleton to identify checkpoints
   * Returns an Observable that emits checkpoint events
   */
  processFrame(skeletonEvent: SkeletonEvent): Observable<FormEvent>;

  /**
   * Reset the form processor state
   */
  reset(): void;
}

/**
 * A checkpoint event with the checkpoint and skeleton data
 */
export interface FormEvent {
  checkpoint: FormCheckpoint | null;
  position: SwingPositionName | null;
  skeletonEvent: SkeletonEvent;
}

/**
 * Rep processor stage - processes form checkpoints to count and analyze repetitions
 * Maintains state for repetition tracking
 */
export interface RepProcessor {
  /**
   * Update rep count based on checkpoint event
   * Returns an Observable that emits rep count updates
   */
  updateRepCount(checkpointEvent: FormEvent): Observable<RepEvent>;

  /**
   * Get the current rep count
   */
  getRepCount(): number;

  /**
   * Reset rep counter
   */
  reset(): void;

  /**
   * Get all completed reps
   */
  getAllReps(): RepData[];
}

/**
 * A rep event with the rep count and checkpoint data
 */
export interface RepEvent {
  repCount: number;
  checkpointEvent: FormEvent;
}
