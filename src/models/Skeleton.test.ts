import { describe, expect, it } from 'vitest';
import { MediaPipeBodyParts, type PoseKeypoint } from '../types';
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
  return { x, y, score, visibility: score };
}

/**
 * Helper to create a full 33-keypoint MediaPipe skeleton with specific positions
 * Non-specified keypoints are set to undefined (sparse array)
 */
function createMediaPipeSkeleton(overrides: Partial<Record<string, PoseKeypoint>>): Skeleton {
  // Create sparse array - undefined keypoints won't be found
  const keypoints: (PoseKeypoint | undefined)[] = new Array(33);

  // Apply overrides using MediaPipe body part indices
  const nameToIndex: Record<string, number> = {
    nose: MediaPipeBodyParts.NOSE,
    leftEye: MediaPipeBodyParts.LEFT_EYE,
    rightEye: MediaPipeBodyParts.RIGHT_EYE,
    leftEar: MediaPipeBodyParts.LEFT_EAR,
    rightEar: MediaPipeBodyParts.RIGHT_EAR,
    leftShoulder: MediaPipeBodyParts.LEFT_SHOULDER,
    rightShoulder: MediaPipeBodyParts.RIGHT_SHOULDER,
    leftElbow: MediaPipeBodyParts.LEFT_ELBOW,
    rightElbow: MediaPipeBodyParts.RIGHT_ELBOW,
    leftWrist: MediaPipeBodyParts.LEFT_WRIST,
    rightWrist: MediaPipeBodyParts.RIGHT_WRIST,
    leftHip: MediaPipeBodyParts.LEFT_HIP,
    rightHip: MediaPipeBodyParts.RIGHT_HIP,
    leftKnee: MediaPipeBodyParts.LEFT_KNEE,
    rightKnee: MediaPipeBodyParts.RIGHT_KNEE,
    leftAnkle: MediaPipeBodyParts.LEFT_ANKLE,
    rightAnkle: MediaPipeBodyParts.RIGHT_ANKLE,
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

// Alias for backward compatibility in tests
const createCocoSkeleton = createMediaPipeSkeleton;

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

  describe('mirrored video behavior', () => {
    /**
     * When video is mirrored (selfie mode), left/right labels swap but
     * the visual appearance is the same. The algorithm should produce
     * consistent results regardless of which side is labeled "right".
     */

    it('getArmToVerticalAngle returns same magnitude for mirrored pose', () => {
      // Normal pose: right arm pointing down-right (positive angle)
      const normalSkeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(150, 200), // Elbow down and to the right
      });

      // Mirrored pose: arm pointing down-left (same visual, but mirrored)
      const mirroredSkeleton = createCocoSkeleton({
        leftShoulder: kp(200, 100),
        leftElbow: kp(150, 200), // Elbow down and to the left
      });

      const normalAngle = normalSkeleton.getArmToVerticalAngle();
      const mirroredAngle = mirroredSkeleton.getArmToVerticalAngle();

      // Both should detect similar arm position (magnitude matters, not sign)
      expect(Math.abs(normalAngle)).toBeCloseTo(Math.abs(mirroredAngle), 0);
    });

    it('getSpineAngle works with left-side keypoints', () => {
      // Right side
      const rightSkeleton = createCocoSkeleton({
        rightHip: kp(100, 300),
        rightShoulder: kp(120, 100), // Slightly leaned
      });

      // Left side (mirrored)
      const leftSkeleton = createCocoSkeleton({
        leftHip: kp(200, 300),
        leftShoulder: kp(180, 100), // Same lean, mirrored
      });

      const rightAngle = rightSkeleton.getSpineAngle();
      const leftAngle = leftSkeleton.getSpineAngle();

      // Spine angle should be similar regardless of side
      expect(rightAngle).toBeCloseTo(leftAngle, 0);
    });

    it('getHipAngle works with left-side keypoints', () => {
      // Right side - bent hip
      const rightSkeleton = createCocoSkeleton({
        rightKnee: kp(100, 400),
        rightHip: kp(100, 300),
        rightShoulder: kp(150, 150), // Leaned forward
      });

      // Left side (mirrored)
      const leftSkeleton = createCocoSkeleton({
        leftKnee: kp(200, 400),
        leftHip: kp(200, 300),
        leftShoulder: kp(150, 150), // Same lean
      });

      const rightAngle = rightSkeleton.getHipAngle();
      const leftAngle = leftSkeleton.getHipAngle();

      // Hip angle should be similar
      expect(rightAngle).toBeCloseTo(leftAngle, 1);
    });

    it('getKneeAngle works with left-side keypoints', () => {
      // Right side - straight leg
      const rightSkeleton = createCocoSkeleton({
        rightHip: kp(100, 200),
        rightKnee: kp(100, 300),
        rightAnkle: kp(100, 400),
      });

      // Left side
      const leftSkeleton = createCocoSkeleton({
        leftHip: kp(200, 200),
        leftKnee: kp(200, 300),
        leftAnkle: kp(200, 400),
      });

      const rightAngle = rightSkeleton.getKneeAngle();
      const leftAngle = leftSkeleton.getKneeAngle();

      expect(rightAngle).toBeCloseTo(180, 0);
      expect(leftAngle).toBeCloseTo(180, 0);
    });

    it('getWristHeight requires both shoulders', () => {
      // Missing left shoulder - should return 0
      const missingShoulderSkeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightWrist: kp(100, 50), // Wrist above shoulder
      });

      // Should return 0 because shoulder midpoint can't be calculated
      expect(missingShoulderSkeleton.getWristHeight()).toBe(0);
    });

    it('getWristHeight works when both sides present', () => {
      const skeleton = createCocoSkeleton({
        leftShoulder: kp(80, 100),
        rightShoulder: kp(120, 100),
        leftWrist: kp(80, 50), // Above shoulders
        rightWrist: kp(120, 50),
      });

      // Wrist 50px above shoulder midpoint
      expect(skeleton.getWristHeight()).toBe(50);
    });

    it('getWristHeight falls back to single wrist when one has low confidence', () => {
      const skeleton = createCocoSkeleton({
        leftShoulder: kp(80, 100),
        rightShoulder: kp(120, 100),
        leftWrist: kp(80, 200, 0.1), // Low confidence, way below shoulders
        rightWrist: kp(120, 50), // High confidence, above shoulders
      });

      // Should use only right wrist (high confidence) = 100 - 50 = 50 above
      expect(skeleton.getWristHeight()).toBe(50);
    });

    it('getWristHeight uses preferredSide when specified', () => {
      const skeleton = createCocoSkeleton({
        leftShoulder: kp(80, 100),
        rightShoulder: kp(120, 100),
        leftWrist: kp(80, 150), // Below shoulders
        rightWrist: kp(120, 50), // Above shoulders
      });

      // Without preference: averages both = 100 - (150+50)/2 = 100 - 100 = 0
      expect(skeleton.getWristHeight()).toBe(0);

      // With right preference: uses right only = 100 - 50 = 50
      expect(skeleton.getWristHeight('right')).toBe(50);

      // With left preference: uses left only = 100 - 150 = -50
      expect(skeleton.getWristHeight('left')).toBe(-50);
    });

    it('getWristHeight returns 0 when no reliable wrist data', () => {
      const skeleton = createCocoSkeleton({
        leftShoulder: kp(80, 100),
        rightShoulder: kp(120, 100),
        leftWrist: kp(80, 50, 0.1), // Both low confidence
        rightWrist: kp(120, 50, 0.1),
      });

      expect(skeleton.getWristHeight()).toBe(0);
    });
  });

  describe('getFacingDirection', () => {
    it('returns right when knee is ahead of ankle (facing right)', () => {
      const skeleton = createCocoSkeleton({
        leftAnkle: kp(100, 400),
        rightAnkle: kp(120, 400),
        leftKnee: kp(130, 300), // Knee 20px ahead of ankle
        rightKnee: kp(150, 300),
      });

      expect(skeleton.getFacingDirection()).toBe('right');
    });

    it('returns left when knee is behind ankle (facing left)', () => {
      const skeleton = createCocoSkeleton({
        leftAnkle: kp(150, 400),
        rightAnkle: kp(170, 400),
        leftKnee: kp(120, 300), // Knee 20px behind ankle
        rightKnee: kp(140, 300),
      });

      expect(skeleton.getFacingDirection()).toBe('left');
    });

    it('returns null when offset is too small to determine', () => {
      const skeleton = createCocoSkeleton({
        leftAnkle: kp(100, 400),
        rightAnkle: kp(120, 400),
        leftKnee: kp(105, 300), // Only 5px difference - below threshold
        rightKnee: kp(125, 300),
      });

      expect(skeleton.getFacingDirection()).toBeNull();
    });

    it('returns null when keypoints are missing', () => {
      const skeleton = createCocoSkeleton({
        leftAnkle: kp(100, 400),
        // Missing other keypoints
      });

      expect(skeleton.getFacingDirection()).toBeNull();
    });

    it('works with single side available', () => {
      const skeleton = createCocoSkeleton({
        rightAnkle: kp(100, 400),
        rightKnee: kp(130, 300), // Knee 30px ahead
      });

      expect(skeleton.getFacingDirection()).toBe('right');
    });
  });

  describe('getWristX', () => {
    it('returns left wrist X coordinate', () => {
      const skeleton = createCocoSkeleton({
        leftWrist: kp(150, 200),
        rightWrist: kp(250, 200),
      });

      expect(skeleton.getWristX('left')).toBe(150);
    });

    it('returns right wrist X coordinate', () => {
      const skeleton = createCocoSkeleton({
        leftWrist: kp(150, 200),
        rightWrist: kp(250, 200),
      });

      expect(skeleton.getWristX('right')).toBe(250);
    });

    it('returns null when wrist is missing', () => {
      const skeleton = createCocoSkeleton({
        leftWrist: kp(150, 200),
        // rightWrist missing
      });

      expect(skeleton.getWristX('right')).toBeNull();
    });
  });

  describe('getArmToVerticalAngle with preferredSide', () => {
    it('uses right arm when preferredSide is right', () => {
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(150, 200), // Arm at ~27° from vertical
        leftShoulder: kp(200, 100),
        leftElbow: kp(200, 200), // Arm straight down (0°)
      });

      // Without preference, would choose left (more vertical)
      // With preference, should use right
      const angleWithPreference = skeleton.getArmToVerticalAngle('right');
      expect(angleWithPreference).toBeGreaterThan(20);
    });

    it('uses left arm when preferredSide is left', () => {
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(100, 200), // Arm straight down (0°)
        leftShoulder: kp(200, 100),
        leftElbow: kp(250, 200), // Arm at angle
      });

      const angleWithPreference = skeleton.getArmToVerticalAngle('left');
      expect(angleWithPreference).toBeGreaterThan(20);
    });

    it('falls back to heuristics when preferred side has low confidence', () => {
      const skeleton = createCocoSkeleton({
        rightShoulder: kp(100, 100),
        rightElbow: kp(100, 200, 0.1), // Low confidence
        leftShoulder: kp(200, 100),
        leftElbow: kp(200, 200, 0.9), // High confidence, straight down
      });

      // Prefers right, but right has low confidence, falls back to left
      const angle = skeleton.getArmToVerticalAngle('right');
      expect(angle).toBeCloseTo(0, 0); // Should use left arm (straight down)
    });
  });

  describe('getKneeAngleForSide', () => {
    it('calculates left knee angle correctly', () => {
      const skeleton = createCocoSkeleton({
        leftHip: kp(100, 200),
        leftKnee: kp(100, 300),
        leftAnkle: kp(100, 400),
      });

      const angle = skeleton.getKneeAngleForSide('left');
      expect(angle).toBeCloseTo(180, 0); // Straight leg
    });

    it('calculates right knee angle correctly', () => {
      const skeleton = createCocoSkeleton({
        rightHip: kp(100, 200),
        rightKnee: kp(100, 300),
        rightAnkle: kp(100, 400),
      });

      const angle = skeleton.getKneeAngleForSide('right');
      expect(angle).toBeCloseTo(180, 0); // Straight leg
    });

    it('calculates bent knee angle (~90 degrees)', () => {
      const skeleton = createCocoSkeleton({
        leftHip: kp(100, 200),
        leftKnee: kp(100, 300),
        leftAnkle: kp(200, 300), // Bent at right angle
      });

      const angle = skeleton.getKneeAngleForSide('left');
      expect(angle).toBeCloseTo(90, 0);
    });

    it('returns 180 when keypoints are missing', () => {
      const skeleton = createCocoSkeleton({
        leftHip: kp(100, 200),
        // Missing knee and ankle
      });

      const angle = skeleton.getKneeAngleForSide('left');
      expect(angle).toBe(180); // Fallback to straight leg
    });

    it('caches results correctly', () => {
      const skeleton = createCocoSkeleton({
        leftHip: kp(100, 200),
        leftKnee: kp(100, 300),
        leftAnkle: kp(100, 400),
      });

      const angle1 = skeleton.getKneeAngleForSide('left');
      const angle2 = skeleton.getKneeAngleForSide('left');
      expect(angle1).toBe(angle2);
    });

    it('calculates different angles for different sides', () => {
      const skeleton = createCocoSkeleton({
        // Left leg straight
        leftHip: kp(100, 200),
        leftKnee: kp(100, 300),
        leftAnkle: kp(100, 400),
        // Right leg bent
        rightHip: kp(200, 200),
        rightKnee: kp(200, 300),
        rightAnkle: kp(300, 300),
      });

      const leftAngle = skeleton.getKneeAngleForSide('left');
      const rightAngle = skeleton.getKneeAngleForSide('right');

      expect(leftAngle).toBeCloseTo(180, 0);
      expect(rightAngle).toBeCloseTo(90, 0);
    });
  });

  describe('getHipAngleForSide', () => {
    it('calculates left hip angle correctly', () => {
      const skeleton = createCocoSkeleton({
        leftKnee: kp(100, 400),
        leftHip: kp(100, 300),
        leftShoulder: kp(100, 100),
      });

      const angle = skeleton.getHipAngleForSide('left');
      expect(angle).toBeCloseTo(180, 0); // Standing straight
    });

    it('calculates right hip angle correctly', () => {
      const skeleton = createCocoSkeleton({
        rightKnee: kp(100, 400),
        rightHip: kp(100, 300),
        rightShoulder: kp(100, 100),
      });

      const angle = skeleton.getHipAngleForSide('right');
      expect(angle).toBeCloseTo(180, 0); // Standing straight
    });

    it('calculates bent hip angle', () => {
      const skeleton = createCocoSkeleton({
        leftKnee: kp(100, 400),
        leftHip: kp(100, 300),
        leftShoulder: kp(200, 200), // Leaned forward
      });

      const angle = skeleton.getHipAngleForSide('left');
      expect(angle).toBeLessThan(180);
      expect(angle).toBeGreaterThan(90);
    });

    it('returns 180 when keypoints are missing', () => {
      const skeleton = createCocoSkeleton({
        leftHip: kp(100, 300),
        // Missing knee and shoulder
      });

      const angle = skeleton.getHipAngleForSide('left');
      expect(angle).toBe(180); // Fallback to standing
    });

    it('caches results correctly', () => {
      const skeleton = createCocoSkeleton({
        leftKnee: kp(100, 400),
        leftHip: kp(100, 300),
        leftShoulder: kp(100, 100),
      });

      const angle1 = skeleton.getHipAngleForSide('left');
      const angle2 = skeleton.getHipAngleForSide('left');
      expect(angle1).toBe(angle2);
    });
  });

  describe('getPreferredSide', () => {
    it('returns right when right side has higher confidence', () => {
      const skeleton = createCocoSkeleton({
        leftHip: kp(100, 300, 0.5),
        leftKnee: kp(100, 400, 0.5),
        leftAnkle: kp(100, 500, 0.5),
        rightHip: kp(200, 300, 0.9),
        rightKnee: kp(200, 400, 0.9),
        rightAnkle: kp(200, 500, 0.9),
      });

      expect(skeleton.getPreferredSide()).toBe('right');
    });

    it('returns left when left side has higher confidence', () => {
      const skeleton = createCocoSkeleton({
        leftHip: kp(100, 300, 0.9),
        leftKnee: kp(100, 400, 0.9),
        leftAnkle: kp(100, 500, 0.9),
        rightHip: kp(200, 300, 0.5),
        rightKnee: kp(200, 400, 0.5),
        rightAnkle: kp(200, 500, 0.5),
      });

      expect(skeleton.getPreferredSide()).toBe('left');
    });

    it('returns right when confidence scores are equal', () => {
      const skeleton = createCocoSkeleton({
        leftHip: kp(100, 300, 0.8),
        leftKnee: kp(100, 400, 0.8),
        leftAnkle: kp(100, 500, 0.8),
        rightHip: kp(200, 300, 0.8),
        rightKnee: kp(200, 400, 0.8),
        rightAnkle: kp(200, 500, 0.8),
      });

      // Default to right when equal
      expect(skeleton.getPreferredSide()).toBe('right');
    });

    it('handles missing keypoints gracefully', () => {
      const skeleton = createCocoSkeleton({
        // Only left side has keypoints
        leftHip: kp(100, 300, 0.9),
        leftKnee: kp(100, 400, 0.9),
      });

      expect(skeleton.getPreferredSide()).toBe('left');
    });

    it('handles all missing keypoints', () => {
      const skeleton = createCocoSkeleton({});

      // Should not throw, returns default
      expect(skeleton.getPreferredSide()).toBe('right');
    });
  });
});
