/**
 * SkeletonSource - Unified interface for skeleton data sources
 *
 * Video file sources (batch extraction + cache) implement this interface,
 * allowing the pipeline to consume skeletons without knowing the source details.
 */

import type { Observable } from 'rxjs';
import type { SkeletonEvent } from './PipelineInterfaces';

/**
 * Source type discriminator
 */
export type SkeletonSourceType = 'video-file';

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
 * Interface for skeleton data sources
 *
 * Video file sources produce Observable<SkeletonEvent> from
 * batch extraction with caching for fast playback lookup.
 */
export interface SkeletonSource {
  /** Source type discriminator */
  readonly type: SkeletonSourceType;

  /** Current state of the source */
  readonly state: SkeletonSourceState;

  /**
   * Observable stream of skeleton events
   * Emits during extraction, then from cache during playback
   */
  readonly skeletons$: Observable<SkeletonEvent>;

  /**
   * Observable of state changes
   */
  readonly state$: Observable<SkeletonSourceState>;

  /**
   * Start the source
   * Checks cache, then extracts if needed
   * @param signal - Optional AbortSignal to cancel the operation
   */
  start(signal?: AbortSignal): Promise<void>;

  /**
   * Stop the source
   * Cancels extraction if in progress
   */
  stop(): void;

  /**
   * Clean up resources
   */
  dispose(): void;

  /**
   * Get skeleton at a specific video time (for seeking/stepping)
   * Returns cached skeleton if available
   *
   * @param videoTime - The video time in seconds
   * @returns The skeleton event at that time, or null if not cached
   */
  getSkeletonAtTime(videoTime: number): SkeletonEvent | null;

  /**
   * Check if skeleton data is available for a given time
   * Returns true if frame is cached
   */
  hasSkeletonAtTime(videoTime: number): boolean;
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
