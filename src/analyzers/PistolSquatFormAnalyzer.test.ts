import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PistolSquatFormAnalyzer } from './PistolSquatFormAnalyzer';
import type { Skeleton } from '../models/Skeleton';

/**
 * Creates a mock Skeleton that returns specific angle values.
 * For pistol squats, we need per-leg angles via getKneeAngleForSide/getHipAngleForSide.
 */
function createMockSkeleton(angles: {
  leftKnee: number;
  rightKnee: number;
  leftHip: number;
  rightHip: number;
  spine: number;
}): Skeleton {
  return {
    getAngle: vi.fn().mockImplementation((_point1: string, vertex: string, _point2: string) => {
      // Left knee angle: leftHip -> leftKnee -> leftAnkle
      if (vertex === 'leftKnee') return angles.leftKnee;
      // Right knee angle: rightHip -> rightKnee -> rightAnkle
      if (vertex === 'rightKnee') return angles.rightKnee;
      // Left hip angle: leftKnee -> leftHip -> leftShoulder
      if (vertex === 'leftHip') return angles.leftHip;
      // Right hip angle: rightKnee -> rightHip -> rightShoulder
      if (vertex === 'rightHip') return angles.rightHip;
      return 180;
    }),
    getSpineAngle: vi.fn().mockReturnValue(angles.spine),
    // New side-specific methods used by PistolSquatFormAnalyzer
    getKneeAngleForSide: vi.fn().mockImplementation((side: 'left' | 'right') => {
      return side === 'left' ? angles.leftKnee : angles.rightKnee;
    }),
    getHipAngleForSide: vi.fn().mockImplementation((side: 'left' | 'right') => {
      return side === 'left' ? angles.leftHip : angles.rightHip;
    }),
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
 */
const PHASE_ANGLES = {
  standing: {
    leftKnee: 170,   // Working leg straight
    rightKnee: 175,  // Extended leg straight
    leftHip: 170,    // Working hip extended
    rightHip: 170,   // Extended hip extended
    spine: 10,       // Upright
  },
  descending: {
    leftKnee: 130,   // Working leg bending
    rightKnee: 175,  // Extended leg stays straight
    leftHip: 140,    // Working hip starting to flex
    rightHip: 170,   // Extended hip
    spine: 20,       // Slight forward lean
  },
  bottom: {
    leftKnee: 60,    // Working leg deep squat
    rightKnee: 170,  // Extended leg straight
    leftHip: 80,     // Working hip deeply flexed
    rightHip: 160,   // Extended hip
    spine: 35,       // Forward lean for balance
  },
  // Transitional frame - knee just starting to rise from bottom
  bottomRising: {
    leftKnee: 70,    // Knee starting to rise
    rightKnee: 170,
    leftHip: 85,
    rightHip: 160,
    spine: 33,
  },
  ascending: {
    leftKnee: 100,   // Working leg rising
    rightKnee: 175,  // Extended leg straight
    leftHip: 120,    // Working hip extending
    rightHip: 170,   // Extended hip
    spine: 25,       // Returning upright
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
      expect(analyzer.getPhases()).toEqual(['standing', 'descending', 'bottom', 'ascending']);
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

    it('transitions from DESCENDING to BOTTOM at deep squat', () => {
      // Get to descending
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 40);
      expect(analyzer.getPhase()).toBe('descending');

      // Move to bottom
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 50);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 60);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 70);
      expect(analyzer.getPhase()).toBe('bottom');
    });

    it('transitions from BOTTOM to ASCENDING when knee starts extending', () => {
      // Get to bottom
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 40);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 50);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 60);
      expect(analyzer.getPhase()).toBe('bottom');

      // Transition: knee starts rising from bottom position
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising), 70);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 80);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 90);
      expect(analyzer.getPhase()).toBe('ascending');
    });

    it('completes a full rep cycle: standing → descending → bottom → ascending → standing', () => {
      // Phase 1: Standing
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      expect(analyzer.getPhase()).toBe('standing');
      expect(analyzer.getRepCount()).toBe(0);

      // Phase 2: Descending
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 40);
      expect(analyzer.getPhase()).toBe('descending');

      // Phase 3: Bottom
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 50);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 60);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 70);
      expect(analyzer.getPhase()).toBe('bottom');

      // Phase 4: Ascending (need transitional frame for direction detection)
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising), 80);
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
      // Helper to run through one full rep
      const doOneRep = (startTime: number) => {
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), startTime);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), startTime + 10);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), startTime + 20);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), startTime + 30);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), startTime + 40);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), startTime + 50);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), startTime + 60);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), startTime + 70);
        // Transitional frame for direction detection
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising), startTime + 80);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), startTime + 90);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), startTime + 100);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), startTime + 110);
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), startTime + 120);
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
      // Do one rep
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 30);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.descending), 40);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 50);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 60);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 70);
      // Transitional frame for direction detection
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottomRising), 80);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 90);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.ascending), 100);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 110);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.standing), 120);

      const quality = analyzer.getLastRepQuality();
      expect(quality).not.toBeNull();
      expect(quality!.score).toBeGreaterThan(0);
      expect(quality!.score).toBeLessThanOrEqual(100);
      expect(quality!.feedback).toBeInstanceOf(Array);
      expect(quality!.feedback.length).toBeGreaterThan(0);
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
});
