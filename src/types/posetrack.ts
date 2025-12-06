/**
 * PoseTrack Types
 *
 * Types for storing and loading pose extraction data separate from video files.
 * This enables:
 * - Faster loading (skip ML model inference)
 * - Better testing (deterministic pose data)
 * - Offline analysis (no WebGL required)
 */

import type { PoseKeypoint } from '../types';

/**
 * Supported pose detection models
 */
export type PoseModel = 'blazepose';

/**
 * Metadata about the pose track file
 */
export interface PoseTrackMetadata {
  /** Schema version for forward compatibility */
  version: '1.0';

  /** Model used for pose extraction */
  model: PoseModel;

  /** Specific version of the model (e.g., "1.0.0") */
  modelVersion: string;

  /** SHA-256 hash of the source video file for matching */
  sourceVideoHash: string;

  /** Original video filename (informational only) */
  sourceVideoName?: string;

  /** Duration of the source video in seconds */
  sourceVideoDuration: number;

  /** ISO 8601 timestamp when poses were extracted */
  extractedAt: string;

  /** Total number of frames in the pose track */
  frameCount: number;

  /** Frames per second of the source video */
  fps: number;

  /** Width of the source video in pixels */
  videoWidth: number;

  /** Height of the source video in pixels */
  videoHeight: number;
}

/**
 * Pre-computed angles for a single frame (optional optimization)
 */
export interface PrecomputedAngles {
  /** Spine angle in degrees */
  spineAngle: number;

  /** Arm to spine angle in degrees */
  armToSpineAngle: number;

  /** Arm to vertical angle in degrees */
  armToVerticalAngle: number;

  /** Hip angle in degrees (optional) */
  hipAngle?: number;

  /** Knee angle in degrees (optional) */
  kneeAngle?: number;
}

/**
 * A single frame of pose data
 */
export interface PoseTrackFrame {
  /** Frame index (0-based) */
  frameIndex: number;

  /** Timestamp in milliseconds from video start */
  timestamp: number;

  /** Video currentTime in seconds */
  videoTime: number;

  /** Array of keypoints detected in this frame */
  keypoints: PoseKeypoint[];

  /** Overall pose confidence score (0-1) */
  score?: number;

  /** Pre-computed angles (optional, saves ~20% analysis time) */
  angles?: PrecomputedAngles;

  /**
   * RUNTIME ONLY - not serialized to PoseTrack files.
   * Frame image captured during extraction for filmstrip thumbnails.
   * Only populated in extraction mode by PoseExtractor.
   * Cleared immediately after thumbnail creation to conserve memory.
   */
  frameImage?: ImageData;
}

/**
 * Complete pose track file structure
 */
export interface PoseTrackFile {
  /** File metadata */
  metadata: PoseTrackMetadata;

  /** Array of pose frames */
  frames: PoseTrackFrame[];
}

/**
 * Options for pose extraction
 */
export interface PoseExtractionOptions {
  /** Model to use for extraction */
  model: PoseModel;

  /** Whether to pre-compute angles during extraction */
  precomputeAngles?: boolean;

  /** Callback for progress updates */
  onProgress?: (progress: PoseExtractionProgress) => void;

  /**
   * Callback fired for each frame as it's extracted.
   * Use this to progressively populate a LivePoseCache for streaming playback.
   */
  onFrameExtracted?: (frame: PoseTrackFrame) => void;

  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Progress information during pose extraction
 */
export interface PoseExtractionProgress {
  /** Current frame being processed */
  currentFrame: number;

  /** Total frames to process */
  totalFrames: number;

  /** Progress percentage (0-100) */
  percentage: number;

  /** Current video time in seconds */
  currentTime: number;

  /** Total video duration in seconds */
  totalDuration: number;

  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;

  /** Elapsed time in seconds */
  elapsedTime?: number;

  /** Current extraction speed in frames per second */
  fps?: number;

  /** Current keypoints (for live preview) */
  currentKeypoints?: PoseKeypoint[];
}

/**
 * Result of pose extraction
 */
export interface PoseExtractionResult {
  /** The extracted pose track */
  poseTrack: PoseTrackFile;

  /** Time taken to extract in milliseconds */
  extractionTimeMs: number;

  /** Average frames per second during extraction */
  extractionFps: number;
}

/**
 * Status of pose track for a video
 */
export type PoseTrackStatus =
  | { type: 'none' }
  | { type: 'extracting'; progress: PoseExtractionProgress }
  | { type: 'ready'; poseTrack: PoseTrackFile; fromCache: boolean }
  | { type: 'error'; error: string };

/**
 * Storage info for a saved pose track
 */
export interface SavedPoseTrackInfo {
  /** Filename of the pose track */
  filename: string;

  /** Video hash this pose track is for */
  videoHash: string;

  /** Original video name */
  videoName?: string;

  /** Model used for extraction */
  model: PoseModel;

  /** Number of frames */
  frameCount: number;

  /** Duration in seconds */
  duration: number;

  /** File size in bytes */
  fileSize: number;

  /** When the pose track was created */
  createdAt: string;
}
