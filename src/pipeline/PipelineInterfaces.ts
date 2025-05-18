import type { Observable } from 'rxjs';
import type { Skeleton } from '../models/Skeleton';
import {
  type FormCheckpoint,
  type FormPosition,
  PoseKeypoint,
  type PoseResult,
  type RepData,
} from '../types';

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
 * A pose event with the pose result and original frame data
 */
export interface PoseEvent {
  pose: PoseResult | null;
  frameEvent: FrameEvent;
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
  processFrame(
    skeletonEvent: SkeletonEvent,
    repCount: number
  ): Observable<CheckpointEvent>;

  /**
   * Reset the form processor state
   */
  reset(): void;
}

/**
 * A checkpoint event with the checkpoint and skeleton data
 */
export interface CheckpointEvent {
  checkpoint: FormCheckpoint | null;
  position: FormPosition | null;
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
  updateRepCount(checkpointEvent: CheckpointEvent): Observable<RepEvent>;

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
  checkpointEvent: CheckpointEvent;
  repIncremented?: boolean;
}
