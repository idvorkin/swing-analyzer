import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skeleton } from '../models/Skeleton';
import { PistolSquatFormAnalyzer } from './PistolSquatFormAnalyzer';

/**
 * Creates a mock Skeleton that returns specific angle values.
 * For pistol squats, we need per-leg angles via getKneeAngleForSide/getHipAngleForSide.
 * Also need getKeypoints() for ear-based bottom detection.
 *
 * The earY parameter controls ear position for trough detection:
 * - Lower earY = person standing tall (ear near top of frame)
 * - Higher earY = person squatting deep (ear near bottom of frame)
 */
function createMockSkeleton(
  angles: {
    leftKnee: number;
    rightKnee: number;
    leftHip: number;
    rightHip: number;
    spine: number;
    earY?: number; // Optional - can be passed in angles object
  },
  earY?: number
): Skeleton {
  // Use earY from angles object if not passed as separate parameter
  const finalEarY = earY ?? angles.earY ?? 300;
  // Create mock keypoints array with ear positions
  // MediaPipe indices: LEFT_EAR = 7, RIGHT_EAR = 8
  const mockKeypoints = Array(33)
    .fill(null)
    .map((_, i) => {
      if (i === 7 || i === 8) {
        // Ear keypoints - earY should be higher (larger Y) when squatting deeper
        return { x: 500, y: finalEarY, z: 0, score: 0.9 };
      }
      return { x: 500, y: 300, z: 0, score: 0.9 };
    });

  return {
    getAngle: vi
      .fn()
      .mockImplementation(
        (_point1: string, vertex: string, _point2: string) => {
          // Left knee angle: leftHip -> leftKnee -> leftAnkle
          if (vertex === 'leftKnee') return angles.leftKnee;
          // Right knee angle: rightHip -> rightKnee -> rightAnkle
          if (vertex === 'rightKnee') return angles.rightKnee;
          // Left hip angle: leftKnee -> leftHip -> leftShoulder
          if (vertex === 'leftHip') return angles.leftHip;
          // Right hip angle: rightKnee -> rightHip -> rightShoulder
          if (vertex === 'rightHip') return angles.rightHip;
          return 180;
        }
      ),
    getSpineAngle: vi.fn().mockReturnValue(angles.spine),
    // New side-specific methods used by PistolSquatFormAnalyzer
    getKneeAngleForSide: vi
      .fn()
      .mockImplementation((side: 'left' | 'right') => {
        return side === 'left' ? angles.leftKnee : angles.rightKnee;
      }),
    getHipAngleForSide: vi.fn().mockImplementation((side: 'left' | 'right') => {
      return side === 'left' ? angles.leftHip : angles.rightHip;
    }),
    // Return mock keypoints for ear-based detection
    getKeypoints: vi.fn().mockReturnValue(mockKeypoints),
  } as unknown as Skeleton;
}

/**
 * Phase angle presets for pistol squat:
 * Working leg = left (bends), Extended leg = right (stays straight)
 *
 * Thresholds:
 * - standingKneeMin: 150 (nearly straight)
 * - standingSpineMax: 25 (upright)
 * - bottomKneeMax: 80 (deep squat)
 * - bottomHipMax: 100 (hip flexed)
 * - descendingKneeThreshold: 140 (start descending)
 * - ascendingKneeThreshold: 90 (start ascending)
 *
 * Ear Y values for ear-based trough detection:
 * - Higher ear Y = person is lower (image Y coords: 0 is top, higher is lower on screen)
 * - Standing: earY ~200 (person tall, ear near top of frame)
 * - Bottom: earY ~500 (person squatting, ear near bottom of frame)
 */
const PHASE_ANGLES = {
  standing: {
    leftKnee: 170, // Working leg straight
    rightKnee: 175, // Extended leg straight
    leftHip: 170, // Working hip extended
    rightHip: 170, // Extended hip extended
    spine: 10, // Upright
    earY: 200, // Person standing tall - ear near top
  },
  descending: {
    leftKnee: 130, // Working leg bending
    rightKnee: 175, // Extended leg stays straight
    leftHip: 140, // Working hip starting to flex
    rightHip: 170, // Extended hip
    spine: 20, // Slight forward lean
    earY: 300, // Person going down - ear moving lower
  },
  // Mid-descent - for gradual transition
  descendingDeep: {
    leftKnee: 90, // Deeper into descent
    rightKnee: 175,
    leftHip: 110,
    rightHip: 170,
    spine: 28,
    earY: 400, // Person going deeper
  },
  bottom: {
    leftKnee: 60, // Working leg deep squat (the trough)
    rightKnee: 170, // Extended leg straight
    leftHip: 80, // Working hip deeply flexed
    rightHip: 160, // Extended hip
    spine: 35, // Forward lean for balance
    earY: 500, // DEEPEST POINT - ear at lowest (highest Y)
  },
  // Transitional frames - ear Y DECREASING to confirm trough (person rising)
  bottomRising1: {
    leftKnee: 65, // Rising +5°
    rightKnee: 170,
    leftHip: 82,
    rightHip: 160,
    spine: 34,
    earY: 490, // Rising - ear Y decreasing
  },
  bottomRising2: {
    leftKnee: 72, // Rising +7° more
    rightKnee: 170,
    leftHip: 85,
    rightHip: 160,
    spine: 33,
    earY: 480, // Rising more
  },
  bottomRising3: {
    leftKnee: 80, // Rising +8° more (confirms trough)
    rightKnee: 170,
    leftHip: 88,
    rightHip: 160,
    spine: 32,
    earY: 470, // Rising - confirms bottom was at earY 500
  },
  ascending: {
    leftKnee: 100, // Working leg rising
    rightKnee: 175, // Extended leg straight
    leftHip: 120, // Working hip extending
    rightHip: 170, // Extended hip
    spine: 25, // Returning upright
    earY: 350, // 50% point on the way back up
  },
};

describe('PistolSquatFormAnalyzer', () => {
  let analyzer: PistolSquatFormAnalyzer;

  beforeEach(() => {
    analyzer = new PistolSquatFormAnalyzer();
  });

  describe('initial state', () => {
    it('starts in STANDING phase', () => {
      expect(analyzer.getPhase()).toBe('standing');
    });

    it('starts with 0 rep count', () => {
      expect(analyzer.getRepCount()).toBe(0);
    });

    it('has no last rep quality initially', () => {
      expect(analyzer.getLastRepQuality()).toBeNull();
    });

    it('returns correct exercise name', () => {
      expect(analyzer.getExerciseName()).toBe('Pistol Squat');
    });

    it('returns all phases', () => {
      expect(analyzer.getPhases()).toEqual([
        'standing',
        'descending',
        'bottom',
        'ascending',
      ]);
    });
  });

  describe('phase transitions', () => {
    it('transitions from STANDING to DESCENDING when knee bends', () => {
      // Start in standing
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 20);
      expect(analyzer.getPhase()).toBe('standing');

      // Move to descending
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 40);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 50);
      expect(analyzer.getPhase()).toBe('descending');
    });

    it('transitions from DESCENDING to BOTTOM at deep squat (trough detection)', () => {
      // Get to descending with gradual descent
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);
      analyzer.processFrame(
        createMockSkeleton(PHASE_ANGLES.descendingDeep),
        40
      );
      expect(analyzer.getPhase()).toBe('descending');

      // Hit the bottom (trough point)
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 50);
      expect(analyzer.getPhase()).toBe('descending'); // Still descending until trough confirmed

      // Angle starts rising - confirms the trough was the bottom
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising1), 60);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising2), 70);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising3), 80);
      expect(analyzer.getPhase()).toBe('bottom'); // Trough confirmed!
    });

    it('transitions from BOTTOM to ASCENDING when knee starts extending', () => {
      // Get to descending
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);
      analyzer.processFrame(
        createMockSkeleton(PHASE_ANGLES.descendingDeep),
        40
      );

      // Hit bottom (trough) and confirm with rising frames
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 50);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising1), 60);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising2), 70);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising3), 80);
      expect(analyzer.getPhase()).toBe('bottom');

      // Continue ascending - knee above ascending threshold (90°)
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 90);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 100);
      expect(analyzer.getPhase()).toBe('ascending');
    });

    it('completes a full rep cycle: standing → descending → bottom → ascending → standing', () => {
      // Phase 1: Standing
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      expect(analyzer.getPhase()).toBe('standing');
      expect(analyzer.getRepCount()).toBe(0);

      // Phase 2: Descending (gradual descent)
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);
      analyzer.processFrame(
        createMockSkeleton(PHASE_ANGLES.descendingDeep),
        40
      );
      expect(analyzer.getPhase()).toBe('descending');

      // Phase 3: Bottom (trough) - hit lowest point then rise to confirm
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 50);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising1), 60);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising2), 70);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising3), 80);
      expect(analyzer.getPhase()).toBe('bottom');

      // Phase 4: Ascending (knee above ascending threshold)
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 90);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 100);
      expect(analyzer.getPhase()).toBe('ascending');

      // Phase 5: Back to standing (rep complete!)
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 110);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 120);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 130);

      expect(analyzer.getPhase()).toBe('standing');
      expect(analyzer.getRepCount()).toBe(1);
    });
  });

  describe('rep counting', () => {
    it('counts multiple reps correctly', () => {
      // Helper to run through one full rep with trough detection
      const doOneRep = (startTime: number) => {
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.standing),
          startTime
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.standing),
          startTime + 10
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.descending),
          startTime + 20
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.descending),
          startTime + 30
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.descendingDeep),
          startTime + 40
        );
        // Hit bottom (trough) and confirm with rising frames
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.bottom),
          startTime + 50
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.bottomRising1),
          startTime + 60
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.bottomRising2),
          startTime + 70
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.bottomRising3),
          startTime + 80
        );
        // Continue ascending
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.ascending),
          startTime + 90
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.ascending),
          startTime + 100
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.standing),
          startTime + 110
        );
        analyzer.processFrame(
          createMockSkeleton(PHASE_ANGLES.standing),
          startTime + 120
        );
      };

      expect(analyzer.getRepCount()).toBe(0);

      doOneRep(0);
      expect(analyzer.getRepCount()).toBe(1);

      doOneRep(200);
      expect(analyzer.getRepCount()).toBe(2);

      doOneRep(400);
      expect(analyzer.getRepCount()).toBe(3);
    });
  });

  describe('quality scoring', () => {
    it('provides quality feedback after rep completion', () => {
      // Do one full rep with trough detection
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);
      analyzer.processFrame(
        createMockSkeleton(PHASE_ANGLES.descendingDeep),
        40
      );
      // Hit bottom (trough) and confirm with rising frames
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 50);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising1), 60);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising2), 70);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising3), 80);
      // Continue ascending
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 90);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 100);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 110);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 120);

      const quality = analyzer.getLastRepQuality();
      expect(quality).not.toBeNull();
      expect(quality?.score).toBeGreaterThan(0);
      expect(quality?.score).toBeLessThanOrEqual(100);
      expect(quality?.feedback).toBeInstanceOf(Array);
      expect(quality?.feedback.length).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      // Do partial rep to change state
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);

      // Reset
      analyzer.reset();

      expect(analyzer.getPhase()).toBe('standing');
      expect(analyzer.getRepCount()).toBe(0);
      expect(analyzer.getLastRepQuality()).toBeNull();
    });
  });

  describe('working leg detection', () => {
    it('starts with null working leg', () => {
      expect(analyzer.getWorkingLeg()).toBeNull();
    });

    it('detects left leg as working when left knee is more bent', () => {
      // Process frames where left knee is consistently more bent (lower angle)
      for (let i = 0; i < 10; i++) {
        analyzer.processFrame(
          createMockSkeleton({
            leftKnee: 100, // Working leg - bent
            rightKnee: 170, // Extended leg - straight
            leftHip: 120,
            rightHip: 170,
            spine: 20,
          }),
          i * 10
        );
      }

      expect(analyzer.getWorkingLeg()).toBe('left');
    });

    it('detects right leg as working when right knee is more bent', () => {
      // Process frames where right knee is consistently more bent
      for (let i = 0; i < 10; i++) {
        analyzer.processFrame(
          createMockSkeleton({
            leftKnee: 170, // Extended leg - straight
            rightKnee: 100, // Working leg - bent
            leftHip: 170,
            rightHip: 120,
            spine: 20,
          }),
          i * 10
        );
      }

      expect(analyzer.getWorkingLeg()).toBe('right');
    });

    it('allows manual override of working leg', () => {
      // Auto-detect left
      for (let i = 0; i < 10; i++) {
        analyzer.processFrame(
          createMockSkeleton({
            leftKnee: 100,
            rightKnee: 170,
            leftHip: 120,
            rightHip: 170,
            spine: 20,
          }),
          i * 10
        );
      }
      expect(analyzer.getWorkingLeg()).toBe('left');

      // Manual override to right
      analyzer.setWorkingLeg('right');
      expect(analyzer.getWorkingLeg()).toBe('right');
    });

    it('resets working leg on reset()', () => {
      analyzer.setWorkingLeg('left');
      expect(analyzer.getWorkingLeg()).toBe('left');

      analyzer.reset();
      expect(analyzer.getWorkingLeg()).toBeNull();
    });
  });
});
