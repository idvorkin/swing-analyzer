import { describe, expect, it } from 'vitest';
import { CocoBodyParts, type PoseKeypoint } from '../types';
import { Skeleton } from './Skeleton';

/**
 * Helper to create a Skeleton instance for testing
 */
function createSkeleton(keypoints: PoseKeypoint[]): Skeleton {
  return new Skeleton(keypoints, 0, true, Date.now());
}

/**
 * Helper to create a keypoint with default confidence
 */
function kp(x: number, y: number, score = 0.9): PoseKeypoint {
  return { x, y, score };
}

/**
 * Helper to create a full 17-keypoint COCO skeleton with specific positions
 * Non-specified keypoints are set to undefined (sparse array)
 */
function createCocoSkeleton(overrides: Partial<Record<string, PoseKeypoint>>): Skeleton {
  // Create sparse array - undefined keypoints won't be found
  const keypoints: (PoseKeypoint | undefined)[] = new Array(17);

  // Apply overrides using COCO body part indices
  const nameToIndex: Record<string, number> = {
    nose: CocoBodyParts.NOSE,
    leftEye: CocoBodyParts.LEFT_EYE,
    rightEye: CocoBodyParts.RIGHT_EYE,
    leftEar: CocoBodyParts.LEFT_EAR,
    rightEar: CocoBodyParts.RIGHT_EAR,
    leftShoulder: CocoBodyParts.LEFT_SHOULDER,
    rightShoulder: CocoBodyParts.RIGHT_SHOULDER,
    leftElbow: CocoBodyParts.LEFT_ELBOW,
    rightElbow: CocoBodyParts.RIGHT_ELBOW,
    leftWrist: CocoBodyParts.LEFT_WRIST,
    rightWrist: CocoBodyParts.RIGHT_WRIST,
    leftHip: CocoBodyParts.LEFT_HIP,
    rightHip: CocoBodyParts.RIGHT_HIP,
    leftKnee: CocoBodyParts.LEFT_KNEE,
    rightKnee: CocoBodyParts.RIGHT_KNEE,
    leftAnkle: CocoBodyParts.LEFT_ANKLE,
    rightAnkle: CocoBodyParts.RIGHT_ANKLE,
  };

  for (const [name, point] of Object.entries(overrides)) {
    const index = nameToIndex[name];
    if (index !== undefined) {
      keypoints[index] = point;
    }
  }

  // Cast to PoseKeypoint[] - undefined entries will be handled by Skeleton
  return createSkeleton(keypoints as PoseKeypoint[]);
}

describe('Skeleton', () => {
  describe('getBoundingBox', () => {
    it('calculates bounding box from visible keypoints', () => {
      const keypoints = [
        kp(100, 50), // top-left area
        kp(200, 50), // top-right area
        kp(100, 150), // bottom-left area
        kp(200, 150), // bottom-right area
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0); // No padding for easier math

      expect(bbox).not.toBeNull();
      expect(bbox!.minX).toBe(100);
      expect(bbox!.maxX).toBe(200);
      expect(bbox!.minY).toBe(50);
      expect(bbox!.maxY).toBe(150);
      expect(bbox!.width).toBe(100);
      expect(bbox!.height).toBe(100);
      expect(bbox!.centerX).toBe(150);
      expect(bbox!.centerY).toBe(100);
    });

    it('applies padding correctly', () => {
      const keypoints = [
        kp(100, 100),
        kp(200, 100),
        kp(100, 200),
        kp(200, 200),
      ];

      const skeleton = createSkeleton(keypoints);
      // Raw box is 100x100, 20% padding = 20px on each side
      const bbox = skeleton.getBoundingBox(0.2, 0.2);

      expect(bbox).not.toBeNull();
      // minX = 100 - (100 * 0.2) = 80
      expect(bbox!.minX).toBe(80);
      // maxX = 200 + (100 * 0.2) = 220
      expect(bbox!.maxX).toBe(220);
      // Width with padding = 220 - 80 = 140
      expect(bbox!.width).toBe(140);
      expect(bbox!.height).toBe(140);
    });

    it('returns null when fewer than 3 keypoints are visible', () => {
      const keypoints = [kp(100, 100), kp(200, 200)];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox();

      expect(bbox).toBeNull();
    });

    it('filters out low confidence keypoints', () => {
      const keypoints = [
        kp(100, 100, 0.9), // High confidence - included
        kp(200, 100, 0.9), // High confidence - included
        kp(100, 200, 0.9), // High confidence - included
        kp(500, 500, 0.1), // Low confidence - excluded
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0);

      expect(bbox).not.toBeNull();
      // Should not include the (500, 500) point
      expect(bbox!.maxX).toBe(200);
      expect(bbox!.maxY).toBe(200);
    });

    it('returns null when all keypoints are below confidence threshold', () => {
      const keypoints = [
        kp(100, 100, 0.1),
        kp(200, 100, 0.1),
        kp(100, 200, 0.1),
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.5); // High threshold

      expect(bbox).toBeNull();
    });

    it('filters out keypoints with zero coordinates', () => {
      const keypoints = [
        kp(0, 0, 0.9), // Zero coords - excluded
        kp(100, 100, 0.9),
        kp(200, 100, 0.9),
        kp(150, 200, 0.9),
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0);

      expect(bbox).not.toBeNull();
      // Should not include (0, 0)
      expect(bbox!.minX).toBe(100);
      expect(bbox!.minY).toBe(100);
    });

    it('handles visibility property instead of score', () => {
      const keypoints: PoseKeypoint[] = [
        { x: 100, y: 100, visibility: 0.9 },
        { x: 200, y: 100, visibility: 0.9 },
        { x: 150, y: 200, visibility: 0.9 },
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0);

      expect(bbox).not.toBeNull();
      expect(bbox!.centerX).toBe(150);
    });

    it('calculates center correctly for asymmetric bounding box', () => {
      const keypoints = [
        kp(0, 0, 0.9), // Will be filtered (zero coords)
        kp(50, 100),
        kp(150, 100),
        kp(100, 300),
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0);

      expect(bbox).not.toBeNull();
      // X: min=50, max=150, center=100
      // Y: min=100, max=300, center=200
      expect(bbox!.centerX).toBe(100);
      expect(bbox!.centerY).toBe(200);
    });
  });

  describe('getElbowAngle', () => {
    it('calculates elbow angle for straight arm (180°)', () => {
      // Straight arm: shoulder, elbow, wrist in a line
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(100, 200),
        rightWrist: kp(100, 300),
      });

      const angle = skeleton.getElbowAngle();
      expect(angle).toBeCloseTo(180, 0);
    });

    it('calculates elbow angle for bent arm (90°)', () => {
      // Right angle: shoulder above, elbow at corner, wrist to the side
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(100, 200),
        rightWrist: kp(200, 200),
      });

      const angle = skeleton.getElbowAngle();
      expect(angle).toBeCloseTo(90, 0);
    });

    it('calculates elbow angle for tightly bent arm (~45°)', () => {
      // Acute angle
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(100, 200),
        rightWrist: kp(170, 130), // Wrist bent back toward shoulder
      });

      const angle = skeleton.getElbowAngle();
      expect(angle).toBeGreaterThan(40);
      expect(angle).toBeLessThan(50);
    });

    it('falls back to left side when right side unavailable', () => {
      const skeleton = createCocoSkeleton({
        leftShoulder: kp(100, 100),
        leftElbow: kp(100, 200),
        leftWrist: kp(100, 300),
      });

      const angle = skeleton.getElbowAngle();
      expect(angle).toBeCloseTo(180, 0);
    });

    it('returns 0 when keypoints are missing', () => {
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        // Missing elbow and wrist
      });

      const angle = skeleton.getElbowAngle();
      expect(angle).toBe(0);
    });

    it('caches the result on subsequent calls', () => {
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(100, 200),
        rightWrist: kp(100, 300),
      });

      const angle1 = skeleton.getElbowAngle();
      const angle2 = skeleton.getElbowAngle();
      expect(angle1).toBe(angle2);
    });
  });

  describe('getAngle (generic)', () => {
    it('calculates angle between three named keypoints', () => {
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(100, 200),
        rightWrist: kp(100, 300),
      });

      const angle = skeleton.getAngle('rightShoulder', 'rightElbow', 'rightWrist');
      expect(angle).toBeCloseTo(180, 0);
    });

    it('calculates hip angle using generic method', () => {
      // Same as getHipAngle: knee-hip-shoulder
      const skeleton = createCocoSkeleton({
        rightKnee: kp(100, 400),
        rightHip: kp(100, 300),
        rightShoulder: kp(100, 100),
      });

      const genericAngle = skeleton.getAngle('rightKnee', 'rightHip', 'rightShoulder');
      const hipAngle = skeleton.getHipAngle();

      expect(genericAngle).toBeCloseTo(hipAngle, 1);
    });

    it('calculates knee angle using generic method', () => {
      // Same as getKneeAngle: hip-knee-ankle
      const skeleton = createCocoSkeleton({
        rightHip: kp(100, 200),
        rightKnee: kp(100, 300),
        rightAnkle: kp(100, 400),
      });

      const genericAngle = skeleton.getAngle('rightHip', 'rightKnee', 'rightAnkle');
      const kneeAngle = skeleton.getKneeAngle();

      expect(genericAngle).toBeCloseTo(kneeAngle, 1);
    });

    it('returns null when keypoints not found', () => {
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
      });

      const angle = skeleton.getAngle('rightShoulder', 'rightElbow', 'rightWrist');
      expect(angle).toBeNull();
    });

    it('returns null for invalid keypoint names', () => {
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(100, 200),
        rightWrist: kp(100, 300),
      });

      const angle = skeleton.getAngle('invalidPoint', 'rightElbow', 'rightWrist');
      expect(angle).toBeNull();
    });

    it('calculates arbitrary angles for custom exercises', () => {
      // Example: ankle angle for pistol squat (knee-ankle-toe)
      // Using available keypoints as stand-in
      const skeleton = createCocoSkeleton({
        rightHip: kp(100, 100),
        rightKnee: kp(150, 200),
        rightAnkle: kp(100, 300),
      });

      const angle = skeleton.getAngle('rightHip', 'rightKnee', 'rightAnkle');
      expect(angle).not.toBeNull();
      expect(angle).toBeGreaterThan(0);
      expect(angle).toBeLessThan(180);
    });
  });
});
