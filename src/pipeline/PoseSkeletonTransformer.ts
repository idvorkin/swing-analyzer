import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs-core';
import { from, type Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Skeleton } from '../models/Skeleton';
import {
  CocoBodyParts,
  MediaPipeBodyParts,
  type PoseKeypoint,
  type PoseResult,
} from '../types';
import type {
  FrameEvent,
  SkeletonEvent,
  SkeletonTransformer,
} from './PipelineInterfaces';

/**
 * A pose event with the pose result and original frame data
 */
export interface PoseEvent {
  pose: PoseResult | null;
  frameEvent: FrameEvent;
}

/**
 * Get body part connections based on the active model type
 */
export function getSkeletonConnections(
  modelType: 'BlazePose' | 'MoveNet' | null
): [number, number][] {
  if (modelType === 'BlazePose') {
    return [
      // Torso
      [MediaPipeBodyParts.LEFT_SHOULDER, MediaPipeBodyParts.RIGHT_SHOULDER],
      [MediaPipeBodyParts.LEFT_SHOULDER, MediaPipeBodyParts.LEFT_HIP],
      [MediaPipeBodyParts.RIGHT_SHOULDER, MediaPipeBodyParts.RIGHT_HIP],
      [MediaPipeBodyParts.LEFT_HIP, MediaPipeBodyParts.RIGHT_HIP],

      // Arms
      [MediaPipeBodyParts.LEFT_SHOULDER, MediaPipeBodyParts.LEFT_ELBOW],
      [MediaPipeBodyParts.LEFT_ELBOW, MediaPipeBodyParts.LEFT_WRIST],
      [MediaPipeBodyParts.RIGHT_SHOULDER, MediaPipeBodyParts.RIGHT_ELBOW],
      [MediaPipeBodyParts.RIGHT_ELBOW, MediaPipeBodyParts.RIGHT_WRIST],

      // Legs
      [MediaPipeBodyParts.LEFT_HIP, MediaPipeBodyParts.LEFT_KNEE],
      [MediaPipeBodyParts.LEFT_KNEE, MediaPipeBodyParts.LEFT_ANKLE],
      [MediaPipeBodyParts.RIGHT_HIP, MediaPipeBodyParts.RIGHT_KNEE],
      [MediaPipeBodyParts.RIGHT_KNEE, MediaPipeBodyParts.RIGHT_ANKLE],
    ];
  }

  // MoveNet and fallback
  return [
    // Torso
    [CocoBodyParts.LEFT_SHOULDER, CocoBodyParts.RIGHT_SHOULDER],
    [CocoBodyParts.LEFT_SHOULDER, CocoBodyParts.LEFT_HIP],
    [CocoBodyParts.RIGHT_SHOULDER, CocoBodyParts.RIGHT_HIP],
    [CocoBodyParts.LEFT_HIP, CocoBodyParts.RIGHT_HIP],

    // Arms
    [CocoBodyParts.LEFT_SHOULDER, CocoBodyParts.LEFT_ELBOW],
    [CocoBodyParts.LEFT_ELBOW, CocoBodyParts.LEFT_WRIST],
    [CocoBodyParts.RIGHT_SHOULDER, CocoBodyParts.RIGHT_ELBOW],
    [CocoBodyParts.RIGHT_ELBOW, CocoBodyParts.RIGHT_WRIST],

    // Legs
    [CocoBodyParts.LEFT_HIP, CocoBodyParts.LEFT_KNEE],
    [CocoBodyParts.LEFT_KNEE, CocoBodyParts.LEFT_ANKLE],
    [CocoBodyParts.RIGHT_HIP, CocoBodyParts.RIGHT_KNEE],
    [CocoBodyParts.RIGHT_KNEE, CocoBodyParts.RIGHT_ANKLE],
  ];
}

/**
 * Singleton detector instance shared across all PoseSkeletonTransformer instances
 * This prevents the "File exists" error when multiple instances try to initialize MediaPipe
 */
let sharedDetector: poseDetection.PoseDetector | null = null;
let detectorInitPromise: Promise<void> | null = null;
let activeModelType: 'BlazePose' | 'MoveNet' | null = null;
let forcedModelType: 'BlazePose' | 'MoveNet' | null = null;

/**
 * Skeleton transformer stage - transforms frames to skeletons using ML pose detection
 * This combines the functionality of pose detection and skeleton construction
 */
export class PoseSkeletonTransformer implements SkeletonTransformer {
  /**
   * Initialize the pose detection model (uses singleton pattern)
   */
  async initialize(): Promise<void> {
    if (sharedDetector) {
      console.log('Detector already initialized, reusing existing instance');
      return;
    }

    if (detectorInitPromise) {
      console.log('Detector initialization in progress, waiting...');
      return detectorInitPromise;
    }

    detectorInitPromise = this.initializeDetector();
    return detectorInitPromise;
  }

  /**
   * Initialize TensorFlow and create the pose detector
   */
  private async initializeDetector(): Promise<void> {
    try {
      await this.configureTensorFlow();

      // If a specific model is forced, use that
      if (forcedModelType === 'MoveNet') {
        await this.createMoveNetFallback();
      } else if (forcedModelType === 'BlazePose') {
        await this.createBlazePoseDetector();
      } else {
        // Default: try BlazePose first, fallback to MoveNet
        try {
          await this.createBlazePoseDetector();
        } catch (error) {
          console.error('Failed to initialize BlazePose model:', error);
          await this.createMoveNetFallback();
        }
      }
    } finally {
      detectorInitPromise = null;
    }
  }

  private async configureTensorFlow(): Promise<void> {
    await tf.setBackend('webgl');
    console.log(`Using TensorFlow.js backend: ${tf.getBackend()}`);
    tf.env().set('WEBGL_CPU_FORWARD', false);
    tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
  }

  private async createBlazePoseDetector(): Promise<void> {
    console.log('Starting BlazePose initialization...');
    const config: poseDetection.BlazePoseMediaPipeModelConfig = {
      runtime: 'mediapipe',
      modelType: 'full', // 'full' provides 3D coordinates (x, y, z), 'lite' only gives 2D
      enableSmoothing: true,
      solutionPath:
        'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404',
    };

    sharedDetector = await poseDetection.createDetector(
      poseDetection.SupportedModels.BlazePose,
      config
    );
    activeModelType = 'BlazePose';
    console.log('BlazePose detector initialized successfully (33 keypoints with 3D coordinates)');
  }

  private async createMoveNetFallback(): Promise<void> {
    console.log('Attempting MoveNet fallback...');
    const config = {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      enableSmoothing: true,
    };

    try {
      sharedDetector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        config
      );
      activeModelType = 'MoveNet';
      console.log('MoveNet fallback initialized (17 keypoints)');
    } catch (fallbackError) {
      console.error('Failed to initialize fallback model:', fallbackError);
      throw new Error('Could not initialize any pose detection model');
    }
  }

  /**
   * Get the active model type
   */
  getModelType(): string {
    if (!activeModelType) return 'Loading...';
    return activeModelType === 'BlazePose'
      ? 'BlazePose Full (33 points, 3D)'
      : 'MoveNet Lightning (17 points, 2D)';
  }

  /**
   * Set which model to use (forces reinitialization)
   */
  async setModelType(modelType: 'BlazePose' | 'MoveNet'): Promise<void> {
    forcedModelType = modelType;
    await this.reinitialize();
  }

  /**
   * Reinitialize the detector (useful for switching models)
   */
  async reinitialize(): Promise<void> {
    // Dispose of current detector
    if (sharedDetector) {
      sharedDetector.dispose();
      sharedDetector = null;
      activeModelType = null;
    }

    // Reset initialization promise
    detectorInitPromise = null;

    // Reinitialize
    await this.initialize();
  }

  /**
   * Transform a frame event directly into a skeleton
   * This combines pose detection and skeleton construction in a single pipeline stage
   */
  transformToSkeleton(frameEvent: FrameEvent): Observable<SkeletonEvent> {
    // First detect the pose
    return this.detectPose(frameEvent).pipe(
      // Then transform the pose result into a skeleton
      switchMap((poseEvent) => this.buildSkeleton(poseEvent))
    );
  }

  /**
   * Private method to detect pose from a frame event
   */
  private detectPose(frameEvent: FrameEvent): Observable<PoseEvent> {
    if (!sharedDetector) {
      console.warn('Pose detector not initialized');
      return of({
        pose: null,
        frameEvent,
      });
    }

    return from(sharedDetector.estimatePoses(frameEvent.frame)).pipe(
      map((poses) => {
        if (poses.length === 0) {
          return {
            pose: null,
            frameEvent,
          };
        }

        // Use the first detected pose (we're focused on single person)
        const pose = poses[0];

        return {
          pose: {
            keypoints: pose.keypoints,
            score: pose.score,
          },
          frameEvent,
        };
      }),
      catchError((error) => {
        console.error('Error detecting pose:', error);
        return of({
          pose: null,
          frameEvent,
        });
      })
    );
  }

  /**
   * Private method to build a skeleton from a pose event
   */
  private buildSkeleton(poseEvent: PoseEvent): Observable<SkeletonEvent> {
    // If no pose was detected, return null skeleton
    if (!poseEvent.pose) {
      return of({
        skeleton: null,
        poseEvent,
      });
    }

    // Build the skeleton from keypoints
    const keypoints = poseEvent.pose.keypoints;
    const spineAngle = this.calculateSpineVertical(keypoints);
    const hasVisibleKeypoints = this.hasRequiredKeypoints(keypoints);

    const skeleton = new Skeleton(keypoints, spineAngle, hasVisibleKeypoints);

    // Return the skeleton event
    return of({
      skeleton,
      poseEvent,
    });
  }

  /**
   * Calculate the angle of the spine from vertical (0° is upright)
   */
  private calculateSpineVertical(keypoints: PoseKeypoint[]): number {
    // Select correct body part indices based on active model
    const BodyParts =
      activeModelType === 'BlazePose' ? MediaPipeBodyParts : CocoBodyParts;

    // 1. First approach: Use shoulders and hips if available (best)
    const leftShoulder = keypoints[BodyParts.LEFT_SHOULDER];
    const rightShoulder = keypoints[BodyParts.RIGHT_SHOULDER];
    const leftHip = keypoints[BodyParts.LEFT_HIP];
    const rightHip = keypoints[BodyParts.RIGHT_HIP];

    // Safe array of points that exist and are visible
    const safeShoulders = [];
    const safeHips = [];

    if (leftShoulder && this.isPointVisible(leftShoulder))
      safeShoulders.push(leftShoulder);
    if (rightShoulder && this.isPointVisible(rightShoulder))
      safeShoulders.push(rightShoulder);
    if (leftHip && this.isPointVisible(leftHip)) safeHips.push(leftHip);
    if (rightHip && this.isPointVisible(rightHip)) safeHips.push(rightHip);

    if (safeShoulders.length > 0 && safeHips.length > 0) {
      // Calculate average positions
      const topX =
        safeShoulders.reduce((sum, p) => sum + p.x, 0) / safeShoulders.length;
      const topY =
        safeShoulders.reduce((sum, p) => sum + p.y, 0) / safeShoulders.length;
      const bottomX =
        safeHips.reduce((sum, p) => sum + p.x, 0) / safeHips.length;
      const bottomY =
        safeHips.reduce((sum, p) => sum + p.y, 0) / safeHips.length;

      // Calculate angle from vertical axis
      const deltaX = topX - bottomX;
      const deltaY = bottomY - topY; // Inverted because Y axis points down in screen coordinates

      const angle = Math.abs((Math.atan2(deltaX, deltaY) * 180) / Math.PI);

      return angle;
    }

    // 2. Second approach: Use face orientation as fallback
    const nose = keypoints[BodyParts.NOSE];
    const leftEye = keypoints[BodyParts.LEFT_EYE];
    const rightEye = keypoints[BodyParts.RIGHT_EYE];

    if (nose && (leftEye || rightEye) && this.isPointVisible(nose)) {
      // Use visible eye, or average of both if available
      let eyeX = 0;
      let eyeY = 0;

      if (
        leftEye &&
        rightEye &&
        this.isPointVisible(leftEye) &&
        this.isPointVisible(rightEye)
      ) {
        eyeX = (leftEye.x + rightEye.x) / 2;
        eyeY = (leftEye.y + rightEye.y) / 2;
      } else if (leftEye && this.isPointVisible(leftEye)) {
        eyeX = leftEye.x;
        eyeY = leftEye.y;
      } else if (rightEye && this.isPointVisible(rightEye)) {
        eyeX = rightEye.x;
        eyeY = rightEye.y;
      } else {
        // No eyes visible
        return 0;
      }

      // Calculate angle of face from vertical
      // This assumes head tilt correlates with body tilt
      const deltaX = eyeX - nose.x;
      const deltaY = nose.y - eyeY; // Inverted because Y axis points down

      // Add 90 degrees to convert from face orientation to body orientation (approximate)
      const faceAngle = (Math.atan2(deltaX, deltaY) * 180) / Math.PI;
      // Map face angle to spine angle - this is a rough approximation
      // We need to adjust because face and spine angles have different reference points
      const spineAngle = Math.abs(faceAngle) * 0.5;

      return spineAngle;
    }

    // 3. If nothing else works, use vertical screen orientation
    return 0;
  }

  /**
   * Check if the required keypoints for pose analysis are visible
   */
  private hasRequiredKeypoints(keypoints: PoseKeypoint[]): boolean {
    // Select correct body part indices based on active model
    const BodyParts =
      activeModelType === 'BlazePose' ? MediaPipeBodyParts : CocoBodyParts;

    // Required keypoints for spine angle calculation
    const requiredParts = [
      BodyParts.LEFT_SHOULDER,
      BodyParts.RIGHT_SHOULDER,
      BodyParts.LEFT_HIP,
      BodyParts.RIGHT_HIP,
    ];

    // Check if all required keypoints are visible
    return requiredParts.every((index) => {
      const point = keypoints[index];
      return point && this.isPointVisible(point);
    });
  }

  /**
   * Check if a keypoint is visible with sufficient confidence
   * MoveNet uses 'score', BlazePose uses 'visibility'
   */
  private isPointVisible(point: PoseKeypoint): boolean {
    if (!point) {
      return false;
    }

    const VISIBILITY_THRESHOLD = 0.2;

    if (point.score !== undefined) {
      return point.score > VISIBILITY_THRESHOLD;
    }
    if (point.visibility !== undefined) {
      return point.visibility > VISIBILITY_THRESHOLD;
    }
    return false;
  }

  /**
   * Check if detector is initialized
   */
  isInitialized(): boolean {
    return sharedDetector !== null;
  }
}
