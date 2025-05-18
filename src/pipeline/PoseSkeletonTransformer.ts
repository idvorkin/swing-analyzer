import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs-core';
import { type Observable, from, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Skeleton } from '../models/Skeleton';
import { CocoBodyParts, type PoseKeypoint, type PoseResult } from '../types';
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
 * Defines body part connections for the skeleton
 */
export const SKELETON_CONNECTIONS = [
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

/**
 * Skeleton transformer stage - transforms frames to skeletons using ML pose detection
 * This combines the functionality of pose detection and skeleton construction
 */
export class PoseSkeletonTransformer implements SkeletonTransformer {
  private detector: poseDetection.PoseDetector | null = null;

  // Throttle logging
  private lastLogTime = 0;
  private logThrottleMs = 1000; // 1 second

  /**
   * Initialize the pose detector model
   */
  async initialize(): Promise<void> {
    try {
      await tf.setBackend('webgl');
      console.log(`Using TensorFlow.js backend: ${tf.getBackend()}`);

      // Configure TensorFlow.js for better performance
      tf.env().set('WEBGL_CPU_FORWARD', false);
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);

      // Use MoveNet - better performance on mobile
      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
        // No modelUrl - use default from tfhub.dev
      };

      this.detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
      );

      console.log('Pose detector initialized successfully');
    } catch (error) {
      console.error('Failed to initialize primary model:', error);

      // Try a fallback model
      try {
        this.detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.PoseNet
        );
        console.log('Fallback model initialized');
      } catch (fallbackError) {
        console.error('Failed to initialize fallback model:', fallbackError);
        throw new Error('Could not initialize any pose detection model');
      }
    }
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
    if (!this.detector) {
      console.warn('Pose detector not initialized');
      return of({
        pose: null,
        frameEvent,
      });
    }

    // Convert the Promise-based detection to an Observable
    return from(this.detector.estimatePoses(frameEvent.frame)).pipe(
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
    // 1. First approach: Use shoulders and hips if available (best)
    const leftShoulder = keypoints[CocoBodyParts.LEFT_SHOULDER];
    const rightShoulder = keypoints[CocoBodyParts.RIGHT_SHOULDER];
    const leftHip = keypoints[CocoBodyParts.LEFT_HIP];
    const rightHip = keypoints[CocoBodyParts.RIGHT_HIP];

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
    const nose = keypoints[CocoBodyParts.NOSE];
    const leftEye = keypoints[CocoBodyParts.LEFT_EYE];
    const rightEye = keypoints[CocoBodyParts.RIGHT_EYE];

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
    // Required keypoints for spine angle calculation
    const requiredParts = [
      CocoBodyParts.LEFT_SHOULDER,
      CocoBodyParts.RIGHT_SHOULDER,
      CocoBodyParts.LEFT_HIP,
      CocoBodyParts.RIGHT_HIP,
    ];

    // Check if all required keypoints are visible
    return requiredParts.every((index) => {
      const point = keypoints[index];
      return point && this.isPointVisible(point);
    });
  }

  /**
   * Check if a keypoint is visible with sufficient confidence
   */
  private isPointVisible(point: PoseKeypoint): boolean {
    if (!point) {
      return false;
    }

    // Different models use different confidence thresholds
    // MoveNet uses 'score', BlazePose uses 'visibility'
    const confidence =
      point.score !== undefined
        ? point.score
        : point.visibility !== undefined
          ? point.visibility
          : 0;

    return confidence > 0.2; // Threshold to consider a point visible
  }

  /**
   * Check if detector is initialized
   */
  isInitialized(): boolean {
    return this.detector !== null;
  }
}
