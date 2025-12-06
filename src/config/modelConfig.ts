/**
 * Model Configuration for Pose Detection
 *
 * BlazePose is the only supported model (33 MediaPipe keypoints normalized to COCO-17)
 */

export type PoseModel = 'blazepose';

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
 * Default configuration - BlazePose Lite
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  model: 'blazepose',
  blazePoseVariant: 'lite',
  blazePoseRuntime: 'tfjs',
  enableSmoothing: true,
};

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
