/**
 * PoseDetectorFactory - Factory for creating pose detection models
 *
 * Supports:
 * - MoveNet (Lightning/Thunder variants)
 * - BlazePose (Lite/Full/Heavy variants with TFJS or MediaPipe runtime)
 */

import * as poseDetection from '@tensorflow-models/pose-detection';
import type { ModelConfig } from '../config/modelConfig';
import { DEFAULT_MODEL_CONFIG } from '../config/modelConfig';

export interface PoseDetectorResult {
  detector: poseDetection.PoseDetector;
  modelName: string;
  keypointFormat: 'coco' | 'mediapipe';
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
    if (config.model === 'blazepose') {
      return this.createBlazePose(config);
    }
    return this.createMoveNet(config);
  }

  /**
   * Create a MoveNet detector
   */
  private static async createMoveNet(
    config: ModelConfig
  ): Promise<PoseDetectorResult> {
    const variant = config.moveNetVariant || 'lightning';

    const modelType =
      variant === 'thunder'
        ? poseDetection.movenet.modelType.SINGLEPOSE_THUNDER
        : poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING;

    const detectorConfig: poseDetection.MoveNetModelConfig = {
      modelType,
      enableSmoothing: config.enableSmoothing ?? true,
    };

    // Use custom model URL if provided
    if (config.modelUrl) {
      detectorConfig.modelUrl = config.modelUrl;
    } else {
      // Use local model files
      detectorConfig.modelUrl = `/models/movenet-${variant}/model.json`;
    }

    console.log(`PoseDetectorFactory: Creating MoveNet ${variant}`);

    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      detectorConfig
    );

    return {
      detector,
      modelName: `MoveNet ${variant}`,
      keypointFormat: 'coco',
    };
  }

  /**
   * Create a BlazePose detector
   */
  private static async createBlazePose(
    config: ModelConfig
  ): Promise<PoseDetectorResult> {
    const variant = config.blazePoseVariant || 'lite';
    const runtime = config.blazePoseRuntime || 'tfjs';

    console.log(`PoseDetectorFactory: Creating BlazePose ${variant} (${runtime} runtime)`);

    if (runtime === 'mediapipe') {
      return this.createBlazePoseMediaPipe(config);
    }

    return this.createBlazePoseTfjs(config);
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

    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.BlazePose,
      detectorConfig
    );

    return {
      detector,
      modelName: `BlazePose ${variant} (tfjs)`,
      keypointFormat: 'mediapipe',
    };
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

    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.BlazePose,
      detectorConfig
    );

    return {
      detector,
      modelName: `BlazePose ${variant} (mediapipe)`,
      keypointFormat: 'mediapipe',
    };
  }
}
