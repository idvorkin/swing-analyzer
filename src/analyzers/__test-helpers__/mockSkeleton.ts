/**
 * Shared mock skeleton factory for analyzer tests.
 *
 * Provides flexible mock skeletons that can be configured for different exercises:
 * - Kettlebell swing: arm, spine, hip, knee, wristHeight
 * - Pistol squat: leftKnee, rightKnee, leftHip, rightHip, spine, earY
 * - Exercise detector: leftKnee, rightKnee (minimal)
 */

import { vi } from 'vitest';
import type { Skeleton } from '../../models/Skeleton';

/**
 * Configuration for kettlebell swing mock skeleton
 */
export interface SwingSkeletonAngles {
  arm: number;
  spine: number;
  hip: number;
  knee: number;
  wristHeight: number;
}

/**
 * Configuration for pistol squat mock skeleton
 */
export interface PistolSquatSkeletonAngles {
  leftKnee: number;
  rightKnee: number;
  leftHip: number;
  rightHip: number;
  spine: number;
  earY?: number;
}

/**
 * Creates a mock Skeleton for kettlebell swing tests.
 * Returns specific angle values for arm, spine, hip, knee, and wristHeight.
 */
export function createSwingMockSkeleton(angles: SwingSkeletonAngles): Skeleton {
  return {
    getArmToVerticalAngle: vi.fn().mockReturnValue(angles.arm),
    getSpineAngle: vi.fn().mockReturnValue(angles.spine),
    getHipAngle: vi.fn().mockReturnValue(angles.hip),
    getKneeAngle: vi.fn().mockReturnValue(angles.knee),
    getWristHeight: vi.fn().mockReturnValue(angles.wristHeight),
    getFacingDirection: vi.fn().mockReturnValue(null),
    getWristX: vi.fn().mockReturnValue(null),
  } as unknown as Skeleton;
}

/**
 * Creates a mock Skeleton for pistol squat tests.
 * Supports per-leg angles and ear-based bottom detection via keypoints.
 *
 * The earY parameter controls ear position for trough detection:
 * - Lower earY = person standing tall (ear near top of frame)
 * - Higher earY = person squatting deep (ear near bottom of frame)
 */
export function createPistolSquatMockSkeleton(
  angles: PistolSquatSkeletonAngles
): Skeleton {
  const earY = angles.earY ?? 300;

  // Create mock keypoints array with ear positions
  // MediaPipe indices: LEFT_EAR = 7, RIGHT_EAR = 8
  const mockKeypoints = Array(33)
    .fill(null)
    .map((_, i) => {
      if (i === 7 || i === 8) {
        // Ear keypoints - earY should be higher (larger Y) when squatting deeper
        return { x: 500, y: earY, z: 0, score: 0.9 };
      }
      return { x: 500, y: 300, z: 0, score: 0.9 };
    });

  return {
    getAngle: vi
      .fn()
      .mockImplementation(
        (_point1: string, vertex: string, _point2: string) => {
          if (vertex === 'leftKnee') return angles.leftKnee;
          if (vertex === 'rightKnee') return angles.rightKnee;
          if (vertex === 'leftHip') return angles.leftHip;
          if (vertex === 'rightHip') return angles.rightHip;
          return 180;
        }
      ),
    getSpineAngle: vi.fn().mockReturnValue(angles.spine),
    getKneeAngleForSide: vi
      .fn()
      .mockImplementation((side: 'left' | 'right') => {
        return side === 'left' ? angles.leftKnee : angles.rightKnee;
      }),
    getHipAngleForSide: vi.fn().mockImplementation((side: 'left' | 'right') => {
      return side === 'left' ? angles.leftHip : angles.rightHip;
    }),
    getKeypoints: vi.fn().mockReturnValue(mockKeypoints),
  } as unknown as Skeleton;
}

/**
 * Creates a minimal mock Skeleton for exercise detection tests.
 * Only provides knee angles (left and right).
 */
export function createDetectorMockSkeleton(
  leftKnee: number,
  rightKnee: number
): Skeleton {
  return {
    getAngle: vi
      .fn()
      .mockImplementation(
        (_point1: string, vertex: string, _point2: string) => {
          if (vertex === 'leftKnee') return leftKnee;
          if (vertex === 'rightKnee') return rightKnee;
          return 180;
        }
      ),
    getSpineAngle: vi.fn().mockReturnValue(10),
    getKneeAngleForSide: vi
      .fn()
      .mockImplementation((side: 'left' | 'right') => {
        return side === 'left' ? leftKnee : rightKnee;
      }),
  } as unknown as Skeleton;
}

/**
 * Creates a minimal mock Skeleton for generic tests.
 * Returns fixed values - useful when the test doesn't depend on specific angles.
 */
export function createBasicMockSkeleton(): Skeleton {
  return {
    getArmToVerticalAngle: vi.fn().mockReturnValue(45),
    getSpineAngle: vi.fn().mockReturnValue(15),
    getHipAngle: vi.fn().mockReturnValue(160),
    getKneeAngle: vi.fn().mockReturnValue(170),
    getWristHeight: vi.fn().mockReturnValue(0),
  } as unknown as Skeleton;
}
