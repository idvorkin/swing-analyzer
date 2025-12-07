/**
 * Model Configuration for Pose Detection
 *
 * BlazePose is the only supported model (33 MediaPipe keypoints)
 */

// Import PoseModel from types (single source of truth)
import type { PoseModel } from '../types/posetrack';
// Re-export for convenience
export type { PoseModel };

export type BlazePoseVariant = 'lite' | 'full' | 'heavy';

export type BlazePoseRuntime = 'tfjs' | 'mediapipe';

export interface ModelConfig {
  /** Which pose detection model to use */
  model: PoseModel;

  /** BlazePose model complexity */
  blazePoseVariant?: BlazePoseVariant;

  /**
   * BlazePose runtime
   * - 'tfjs': Better for iOS/iPad, ~1MB smaller
   * - 'mediapipe': Better for desktop/Android
   */
  blazePoseRuntime?: BlazePoseRuntime;

  /** Enable temporal smoothing for video (disable for static images) */
  enableSmoothing?: boolean;

  /** Custom model URL (optional, uses CDN by default) */
  modelUrl?: string;
}

/**
 * BlazePose Lite configuration - fastest BlazePose variant
 */
export const BLAZEPOSE_LITE_CONFIG: ModelConfig = {
  model: 'blazepose',
  blazePoseVariant: 'lite',
  blazePoseRuntime: 'tfjs',
  enableSmoothing: true,
};

/**
 * Default configuration - BlazePose Lite
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = BLAZEPOSE_LITE_CONFIG;

/**
 * BlazePose Full configuration - balanced accuracy/speed
 */
export const BLAZEPOSE_FULL_CONFIG: ModelConfig = {
  model: 'blazepose',
  blazePoseVariant: 'full',
  blazePoseRuntime: 'tfjs',
  enableSmoothing: true,
};

/**
 * BlazePose Heavy configuration - highest accuracy, slowest
 */
export const BLAZEPOSE_HEAVY_CONFIG: ModelConfig = {
  model: 'blazepose',
  blazePoseVariant: 'heavy',
  blazePoseRuntime: 'tfjs',
  enableSmoothing: true,
};
