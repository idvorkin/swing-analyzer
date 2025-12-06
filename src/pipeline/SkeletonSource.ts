/**
 * SkeletonSource - Unified interface for skeleton data sources
 *
 * Both camera (real-time ML) and video file (batch extraction + cache) sources
 * implement this interface, allowing the pipeline to consume skeletons
 * without knowing the source type.
 */

import type { Observable } from 'rxjs';
import type { SkeletonEvent } from './PipelineInterfaces';

/**
 * Source type discriminator
 */
export type SkeletonSourceType = 'camera' | 'video-file';

/**
 * Progress information during extraction (video-file only)
 */
export interface ExtractionProgress {
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  currentTime: number;
  totalDuration: number;
}

/**
 * State of a skeleton source
 */
export type SkeletonSourceState =
  | { type: 'idle' }
  | { type: 'starting' }
  | { type: 'checking-cache' }
  | { type: 'extracting'; progress: ExtractionProgress }
  | { type: 'active' }
  | { type: 'error'; message: string };

/**
 * Unified interface for skeleton data sources
 *
 * Both camera and video file sources produce Observable<SkeletonEvent>,
 * but differ in:
 * - Camera: real-time ML inference, no caching
 * - Video file: batch extraction with caching, fast playback lookup
 */
export interface SkeletonSource {
  /** Source type discriminator */
  readonly type: SkeletonSourceType;

  /** Current state of the source */
  readonly state: SkeletonSourceState;

  /**
   * Observable stream of skeleton events
   * - Camera: emits in real-time as frames are processed
   * - Video file: emits during extraction, then from cache during playback
   */
  readonly skeletons$: Observable<SkeletonEvent>;

  /**
   * Observable of state changes
   */
  readonly state$: Observable<SkeletonSourceState>;

  /**
   * Start the source
   * - Camera: begins capturing and ML inference
   * - Video file: checks cache, then extracts if needed
   */
  start(): Promise<void>;

  /**
   * Stop the source
   * - Camera: stops capture
   * - Video file: cancels extraction if in progress
   */
  stop(): void;

  /**
   * Clean up resources
   */
  dispose(): void;

  /**
   * Get skeleton at a specific video time (for seeking/stepping)
   * - Camera: returns null (no caching)
   * - Video file: returns cached skeleton if available
   *
   * @param videoTime - The video time in seconds
   * @returns The skeleton event at that time, or null if not cached
   */
  getSkeletonAtTime(videoTime: number): SkeletonEvent | null;

  /**
   * Check if skeleton data is available for a given time
   * - Camera: always false
   * - Video file: true if frame is cached
   */
  hasSkeletonAtTime(videoTime: number): boolean;
}

/**
 * Configuration for creating a camera source
 */
export interface CameraSourceConfig {
  /** Camera facing mode */
  facingMode: 'user' | 'environment';
  /** Video element to attach stream to */
  videoElement: HTMLVideoElement;
  /** Canvas element for frame capture */
  canvasElement: HTMLCanvasElement;
}

/**
 * Configuration for creating a video file source
 */
export interface VideoFileSourceConfig {
  /** The video file to process */
  videoFile: File;
  /** Video element for playback */
  videoElement: HTMLVideoElement;
  /** Canvas element for frame capture */
  canvasElement: HTMLCanvasElement;
  /** Whether to auto-extract if not cached (default: true) */
  autoExtract?: boolean;
  /** Model to use for extraction */
  model?: 'blazepose';
}
