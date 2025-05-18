import { PoseKeypoint, PoseResult, FormCheckpoint, FormPosition, RepData } from '../types';
import { Skeleton } from '../models/Skeleton';
import { Observable } from 'rxjs';

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
 * Pose detection stage - detects keypoints from frames
 */
export interface PoseDetection {
  /**
   * Initialize the pose detector
   */
  initialize(): Promise<void>;
  
  /**
   * Detect pose from a frame event
   * Returns an Observable that emits the pose result or null
   */
  detectPose(frameEvent: FrameEvent): Observable<PoseEvent>;
}

/**
 * A pose event with the pose result and original frame data
 */
export interface PoseEvent {
  pose: PoseResult | null;
  frameEvent: FrameEvent;
}

/**
 * Skeleton building stage - creates skeleton from keypoints
 */
export interface SkeletonConstruction {
  /**
   * Build a skeleton from a pose event
   * Returns an Observable that emits the skeleton
   */
  buildSkeleton(poseEvent: PoseEvent): Observable<SkeletonEvent>;
}

/**
 * A skeleton event with the skeleton and original frame data
 */
export interface SkeletonEvent {
  skeleton: Skeleton | null;
  poseEvent: PoseEvent;
}

/**
 * Form checkpoint detection stage - identifies key positions in the motion
 */
export interface FormCheckpointDetection {
  /**
   * Process a skeleton to identify checkpoints
   * Returns an Observable that emits checkpoint events
   */
  processFrame(skeletonEvent: SkeletonEvent, repCount: number): Observable<CheckpointEvent>;
  
  /**
   * Reset the checkpoint detector state
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
 * Swing rep analysis stage - analyzes complete repetitions
 */
export interface SwingRepAnalysis {
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