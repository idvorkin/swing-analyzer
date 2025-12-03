/**
 * Model Configuration for Pose Detection
 *
 * Supports multiple pose detection models:
 * - MoveNet (Lightning/Thunder variants)
 * - BlazePose (Lite/Full/Heavy variants)
 */

export type PoseModel = 'movenet' | 'blazepose';

export type MoveNetVariant = 'lightning' | 'thunder';

export type BlazePoseVariant = 'lite' | 'full' | 'heavy';

export type BlazePoseRuntime = 'tfjs' | 'mediapipe';

export interface ModelConfig {
  /** Which pose detection model to use */
  model: PoseModel;

  /** MoveNet variant (only used when model='movenet') */
  moveNetVariant?: MoveNetVariant;

  /** BlazePose model complexity (only used when model='blazepose') */
  blazePoseVariant?: BlazePoseVariant;

  /**
   * BlazePose runtime (only used when model='blazepose')
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
 * Default configuration - MoveNet Lightning for backwards compatibility
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  model: 'movenet',
  moveNetVariant: 'lightning',
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

/**
 * MoveNet Thunder configuration - more accurate than Lightning but slower
 */
export const MOVENET_THUNDER_CONFIG: ModelConfig = {
  model: 'movenet',
  moveNetVariant: 'thunder',
  enableSmoothing: true,
};
