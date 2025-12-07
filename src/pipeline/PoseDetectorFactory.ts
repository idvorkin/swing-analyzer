/**
 * PoseDetectorFactory - Factory for creating pose detection models
 *
 * Supports BlazePose (Lite/Full/Heavy variants with TFJS or MediaPipe runtime)
 */

import * as poseDetection from '@tensorflow-models/pose-detection';
import type { ModelConfig } from '../config/modelConfig';
import { DEFAULT_MODEL_CONFIG } from '../config/modelConfig';

export interface PoseDetectorResult {
  detector: poseDetection.PoseDetector;
  modelName: string;
  keypointFormat: 'mediapipe';
}

/**
 * Factory for creating pose detectors based on configuration
 */
export class PoseDetectorFactory {
  /**
   * Create a pose detector based on the provided configuration
   *
   * @param config - Model configuration
   * @returns Detector instance with metadata
   */
  static async create(
    config: ModelConfig = DEFAULT_MODEL_CONFIG
  ): Promise<PoseDetectorResult> {
    return PoseDetectorFactory.createBlazePose(config);
  }

  /**
   * Create a BlazePose detector
   */
  private static async createBlazePose(
    config: ModelConfig
  ): Promise<PoseDetectorResult> {
    const variant = config.blazePoseVariant || 'lite';
    const runtime = config.blazePoseRuntime || 'tfjs';

    console.log(
      `PoseDetectorFactory: Creating BlazePose ${variant} (${runtime} runtime)`
    );

    if (runtime === 'mediapipe') {
      return PoseDetectorFactory.createBlazePoseMediaPipe(config);
    }

    return PoseDetectorFactory.createBlazePoseTfjs(config);
  }

  /**
   * Create BlazePose with TensorFlow.js runtime
   */
  private static async createBlazePoseTfjs(
    config: ModelConfig
  ): Promise<PoseDetectorResult> {
    const variant = config.blazePoseVariant || 'lite';

    const detectorConfig: poseDetection.BlazePoseTfjsModelConfig = {
      runtime: 'tfjs',
      modelType: variant,
      enableSmoothing: config.enableSmoothing ?? true,
    };

    try {
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.BlazePose,
        detectorConfig
      );

      return {
        detector,
        modelName: `BlazePose ${variant} (tfjs)`,
        keypointFormat: 'mediapipe',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create BlazePose ${variant} (tfjs) detector: ${message}`
      );
    }
  }

  /**
   * Create BlazePose with MediaPipe runtime
   * Note: Requires WASM files to be served
   */
  private static async createBlazePoseMediaPipe(
    config: ModelConfig
  ): Promise<PoseDetectorResult> {
    const variant = config.blazePoseVariant || 'lite';

    const detectorConfig: poseDetection.BlazePoseMediaPipeModelConfig = {
      runtime: 'mediapipe',
      modelType: variant,
      enableSmoothing: config.enableSmoothing ?? true,
      // MediaPipe requires solution path for WASM files
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose',
    };

    try {
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.BlazePose,
        detectorConfig
      );

      return {
        detector,
        modelName: `BlazePose ${variant} (mediapipe)`,
        keypointFormat: 'mediapipe',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create BlazePose ${variant} (mediapipe) detector: ${message}`
      );
    }
  }
}
