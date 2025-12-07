import { describe, expect, it, beforeEach, vi } from 'vitest';
import { KettlebellSwingFormAnalyzer, type SwingPhase } from './KettlebellSwingFormAnalyzer';
import type { Skeleton } from '../models/Skeleton';

/**
 * Creates a mock Skeleton that returns specific angle values.
 * This is simpler than constructing real keypoints for each test case.
 */
function createMockSkeleton(angles: {
  arm: number;
  spine: number;
  hip: number;
  knee: number;
  wristHeight: number;
}): Skeleton {
  return {
    getArmToVerticalAngle: vi.fn().mockReturnValue(angles.arm),
    getSpineAngle: vi.fn().mockReturnValue(angles.spine),
    getHipAngle: vi.fn().mockReturnValue(angles.hip),
    getKneeAngle: vi.fn().mockReturnValue(angles.knee),
    getWristHeight: vi.fn().mockReturnValue(angles.wristHeight),
  } as unknown as Skeleton;
}

/**
 * Phase angle presets based on default thresholds:
 * - topSpineMax: 25, topHipMin: 150
 * - bottomArmMax: 0, bottomSpineMin: 35, bottomHipMax: 140
 * - connectArmMax: 30, connectSpineMin: 20
 * - releaseArmMin: 10, releaseSpineMax: 25
 */
const PHASE_ANGLES = {
  top: { arm: 80, spine: 10, hip: 170, knee: 170, wristHeight: 50 },
  connect: { arm: 20, spine: 25, hip: 155, knee: 165, wristHeight: 0 },
  bottom: { arm: -10, spine: 50, hip: 120, knee: 160, wristHeight: -100 },
  release: { arm: 20, spine: 15, hip: 155, knee: 165, wristHeight: 0 },
};

describe('KettlebellSwingFormAnalyzer', () => {
  let analyzer: KettlebellSwingFormAnalyzer;

  beforeEach(() => {
    analyzer = new KettlebellSwingFormAnalyzer();
  });

  describe('initial state', () => {
    it('starts in TOP phase', () => {
      expect(analyzer.getPhase()).toBe('top');
    });

    it('starts with 0 rep count', () => {
      expect(analyzer.getRepCount()).toBe(0);
    });

    it('has no last rep quality initially', () => {
      expect(analyzer.getLastRepQuality()).toBeNull();
    });

    it('returns correct exercise name', () => {
      expect(analyzer.getExerciseName()).toBe('Kettlebell Swing');
    });

    it('returns all phases', () => {
      expect(analyzer.getPhases()).toEqual(['top', 'connect', 'bottom', 'release']);
    });
  });

  describe('phase transitions', () => {
    it('transitions from TOP to CONNECT when arm drops and spine tilts', () => {
      // Start in top
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.top), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.top), 10);
      expect(analyzer.getPhase()).toBe('top');

      // Transition to connect (arm < 30, spine > 20)
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), 30);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), 40);

      expect(analyzer.getPhase()).toBe('connect');
    });

    it('transitions from CONNECT to BOTTOM when fully hinged', () => {
      // Get to connect phase first
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.top), 0);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.top), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), 20);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), 30);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), 40);
      expect(analyzer.getPhase()).toBe('connect');

      // Transition to bottom (arm < 0, spine > 35, hip < 140)
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 50);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 60);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), 70);

      expect(analyzer.getPhase()).toBe('bottom');
    });

    it('transitions from BOTTOM to RELEASE when hips extend', () => {
      // Get to bottom phase
      goToPhase(analyzer, 'bottom');
      expect(analyzer.getPhase()).toBe('bottom');

      // Transition to release (arm > 10, spine < 25)
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.release), 100);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.release), 110);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.release), 120);

      expect(analyzer.getPhase()).toBe('release');
    });

    it('transitions from RELEASE to TOP when wrist peaks', () => {
      // Get to release phase
      goToPhase(analyzer, 'release');
      expect(analyzer.getPhase()).toBe('release');

      // Simulate wrist height rising then falling (peak detection)
      // Need spine < 25 and hip > 150, and wrist height peaking
      // Pattern: gradual rise to peak, then fall
      const wristPattern = [10, 20, 30, 50, 50, 50, 40, 30];
      let time = 130;
      for (const wrist of wristPattern) {
        const angles = { ...PHASE_ANGLES.top, wristHeight: wrist };
        analyzer.processFrame(createMockSkeleton(angles), time);
        time += 10;
      }

      expect(analyzer.getPhase()).toBe('top');
    });
  });

  describe('rep counting', () => {
    it('counts a rep when completing full cycle', () => {
      expect(analyzer.getRepCount()).toBe(0);

      // Complete one full swing cycle
      completeOneRep(analyzer);

      expect(analyzer.getRepCount()).toBe(1);
    });

    it('returns repCompleted: true only when cycle completes', () => {
      // Go through partial cycle
      goToPhase(analyzer, 'bottom');
      const bottomResult = analyzer.processFrame(
        createMockSkeleton(PHASE_ANGLES.bottom),
        100
      );
      expect(bottomResult.repCompleted).toBe(false);

      // Complete the cycle - release phase
      for (let i = 0; i < 3; i++) {
        analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.release), 200 + i * 10);
      }

      // Final transition to top with peak detection
      // Pattern: gradual rise to peak, then fall
      const wristPattern = [10, 20, 30, 50, 50, 50, 40, 30];
      let time = 230;
      const results: ReturnType<typeof analyzer.processFrame>[] = [];
      for (const wrist of wristPattern) {
        const angles = { ...PHASE_ANGLES.top, wristHeight: wrist };
        results.push(analyzer.processFrame(createMockSkeleton(angles), time));
        time += 10;
      }

      // Find the result where rep completed
      const completedResult = results.find((r) => r.repCompleted);
      expect(completedResult).toBeDefined();
      expect(completedResult?.repCount).toBe(1);
    });

    it('counts multiple reps correctly', () => {
      completeOneRep(analyzer);
      expect(analyzer.getRepCount()).toBe(1);

      completeOneRep(analyzer, 500);
      expect(analyzer.getRepCount()).toBe(2);

      completeOneRep(analyzer, 1000);
      expect(analyzer.getRepCount()).toBe(3);
    });
  });

  describe('rep positions (peak tracking)', () => {
    it('returns repPositions when rep completes', () => {
      // Complete one rep
      const results = collectResults(analyzer, () => completeOneRep(analyzer));
      const completionResult = results.find((r) => r.repCompleted);

      expect(completionResult).toBeDefined();
      expect(completionResult?.repPositions).toBeDefined();
      expect(completionResult?.repPositions?.length).toBeGreaterThan(0);
    });

    it('captures positions for all phases', () => {
      const results = collectResults(analyzer, () => completeOneRep(analyzer));
      const completionResult = results.find((r) => r.repCompleted);

      const positionNames = completionResult?.repPositions?.map((p) => p.name) ?? [];

      // Should have positions for top, connect, bottom, release
      expect(positionNames).toContain('top');
      expect(positionNames).toContain('connect');
      expect(positionNames).toContain('bottom');
      expect(positionNames).toContain('release');
    });

    it('includes skeleton in each position', () => {
      const results = collectResults(analyzer, () => completeOneRep(analyzer));
      const completionResult = results.find((r) => r.repCompleted);

      for (const pos of completionResult?.repPositions ?? []) {
        expect(pos.skeleton).toBeDefined();
      }
    });

    it('includes angles in each position', () => {
      const results = collectResults(analyzer, () => completeOneRep(analyzer));
      const completionResult = results.find((r) => r.repCompleted);

      for (const pos of completionResult?.repPositions ?? []) {
        expect(pos.angles).toBeDefined();
        expect(pos.angles.arm).toBeDefined();
        expect(pos.angles.spine).toBeDefined();
        expect(pos.angles.hip).toBeDefined();
        expect(pos.angles.knee).toBeDefined();
      }
    });
  });

  describe('quality scoring', () => {
    it('returns repQuality when rep completes', () => {
      const results = collectResults(analyzer, () => completeOneRep(analyzer));
      const completionResult = results.find((r) => r.repCompleted);

      expect(completionResult?.repQuality).toBeDefined();
      expect(completionResult?.repQuality?.score).toBeGreaterThanOrEqual(0);
      expect(completionResult?.repQuality?.score).toBeLessThanOrEqual(100);
    });

    it('includes feedback in quality result', () => {
      const results = collectResults(analyzer, () => completeOneRep(analyzer));
      const completionResult = results.find((r) => r.repCompleted);

      expect(completionResult?.repQuality?.feedback).toBeDefined();
      expect(Array.isArray(completionResult?.repQuality?.feedback)).toBe(true);
    });

    it('penalizes shallow hinge depth', () => {
      // Create skeleton with shallow spine angle (< 40)
      const shallowHinge = { ...PHASE_ANGLES.bottom, spine: 30 };

      // Complete a rep with shallow hinge
      goToPhase(analyzer, 'bottom', 0, shallowHinge);
      const results = collectResults(analyzer, () => {
        goToPhase(analyzer, 'release', 100);
        goToPhase(analyzer, 'top', 200);
      });

      const completionResult = results.find((r) => r.repCompleted);
      expect(completionResult?.repQuality?.score).toBeLessThan(100);
      expect(
        completionResult?.repQuality?.feedback.some((f) =>
          f.toLowerCase().includes('hinge')
        )
      ).toBe(true);
    });

    it('provides good feedback for proper form', () => {
      // Use good angles throughout
      const goodTop = { ...PHASE_ANGLES.top, arm: 80 }; // High arm angle
      const goodBottom = { ...PHASE_ANGLES.bottom, spine: 55 }; // Good hinge depth

      analyzer.processFrame(createMockSkeleton(goodTop), 0);
      analyzer.processFrame(createMockSkeleton(goodTop), 10);

      // Go through full cycle with good form
      goToPhase(analyzer, 'connect', 20);
      goToPhase(analyzer, 'bottom', 50, goodBottom);
      goToPhase(analyzer, 'release', 100);

      const results = collectResults(analyzer, () => goToPhase(analyzer, 'top', 150));
      const completionResult = results.find((r) => r.repCompleted);

      // Should have good score
      expect(completionResult?.repQuality?.score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('reset', () => {
    it('resets phase to TOP', () => {
      goToPhase(analyzer, 'bottom');
      expect(analyzer.getPhase()).toBe('bottom');

      analyzer.reset();
      expect(analyzer.getPhase()).toBe('top');
    });

    it('resets rep count to 0', () => {
      completeOneRep(analyzer);
      completeOneRep(analyzer, 500);
      expect(analyzer.getRepCount()).toBe(2);

      analyzer.reset();
      expect(analyzer.getRepCount()).toBe(0);
    });

    it('clears last rep quality', () => {
      completeOneRep(analyzer);
      expect(analyzer.getLastRepQuality()).not.toBeNull();

      analyzer.reset();
      expect(analyzer.getLastRepQuality()).toBeNull();
    });
  });

  describe('frame debouncing', () => {
    it('requires minimum frames before transitioning', () => {
      // Single frame should not trigger transition
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), 0);
      expect(analyzer.getPhase()).toBe('top'); // Still in top

      // Need multiple frames
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), 10);
      analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), 20);
      expect(analyzer.getPhase()).toBe('connect');
    });
  });

  describe('angle reporting', () => {
    it('returns current angles in result', () => {
      const skeleton = createMockSkeleton({
        arm: 45,
        spine: 30,
        hip: 160,
        knee: 170,
        wristHeight: 20,
      });

      const result = analyzer.processFrame(skeleton, 0);

      expect(result.angles.arm).toBe(45);
      expect(result.angles.spine).toBe(30);
      expect(result.angles.hip).toBe(160);
      expect(result.angles.knee).toBe(170);
      expect(result.angles.wristHeight).toBe(20);
    });
  });
});

// ========================================
// Test Helpers
// ========================================

/**
 * Advance analyzer to a specific phase.
 *
 * Note: Going to 'top' from release requires peak detection,
 * so we use a special wrist height pattern.
 */
function goToPhase(
  analyzer: KettlebellSwingFormAnalyzer,
  targetPhase: SwingPhase,
  startTime = 0,
  overrideAngles?: typeof PHASE_ANGLES.top
): void {
  const phases: SwingPhase[] = ['top', 'connect', 'bottom', 'release'];
  const currentPhase = analyzer.getPhase() as SwingPhase;
  const currentIndex = phases.indexOf(currentPhase);
  const targetIndex = phases.indexOf(targetPhase);
  let time = startTime;

  // Determine the range of phases to process
  // If target is 'top' and we're past top, we need to complete the cycle
  const needsFullCycle = targetPhase === 'top' && currentIndex > 0;

  if (needsFullCycle) {
    // First, go through remaining phases to get to release
    for (let i = currentIndex; i <= 3; i++) {
      const phase = phases[i];
      const angles = PHASE_ANGLES[phase];

      for (let j = 0; j < 4; j++) {
        analyzer.processFrame(createMockSkeleton(angles), time);
        time += 10;
      }
    }

    // Then do peak detection to return to top
    const wristPattern = [10, 20, 30, 50, 50, 50, 40, 30];
    for (const wrist of wristPattern) {
      const angles = overrideAngles
        ? { ...overrideAngles, wristHeight: wrist }
        : { ...PHASE_ANGLES.top, wristHeight: wrist };
      analyzer.processFrame(createMockSkeleton(angles), time);
      time += 10;
    }
  } else {
    // Simple forward progression through phases
    for (let i = currentIndex === -1 ? 0 : currentIndex; i <= targetIndex; i++) {
      const phase = phases[i];
      const angles =
        i === targetIndex && overrideAngles ? overrideAngles : PHASE_ANGLES[phase];

      for (let j = 0; j < 4; j++) {
        analyzer.processFrame(createMockSkeleton(angles), time);
        time += 10;
      }
    }
  }
}

/**
 * Complete one full rep cycle
 *
 * The peak detection requires a clear pattern of:
 * - Wrist height rising (prev2 < prev1)
 * - Then falling (prev1 > curr)
 *
 * With smoothing (window radius 2), we need enough frames to establish the pattern.
 */
function completeOneRep(
  analyzer: KettlebellSwingFormAnalyzer,
  startTime = 0
): void {
  let time = startTime;

  // TOP phase - high wrist
  for (let i = 0; i < 3; i++) {
    analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.top), time);
    time += 10;
  }

  // CONNECT phase - wrist dropping
  for (let i = 0; i < 3; i++) {
    analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.connect), time);
    time += 10;
  }

  // BOTTOM phase - lowest wrist
  for (let i = 0; i < 3; i++) {
    analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.bottom), time);
    time += 10;
  }

  // RELEASE phase - wrist starting to rise
  for (let i = 0; i < 3; i++) {
    analyzer.processFrame(createMockSkeleton(PHASE_ANGLES.release), time);
    time += 10;
  }

  // Back to TOP with gradual rise then fall for peak detection
  // Pattern: 10, 20, 30, 50, 50, 50, 40, 30 (clear rise to peak then fall)
  const wristPattern = [10, 20, 30, 50, 50, 50, 40, 30];
  for (const wrist of wristPattern) {
    const angles = { ...PHASE_ANGLES.top, wristHeight: wrist };
    analyzer.processFrame(createMockSkeleton(angles), time);
    time += 10;
  }
}

/**
 * Collect all results from a series of processFrame calls
 */
function collectResults(
  analyzer: KettlebellSwingFormAnalyzer,
  fn: () => void
): ReturnType<typeof analyzer.processFrame>[] {
  const results: ReturnType<typeof analyzer.processFrame>[] = [];
  const originalProcess = analyzer.processFrame.bind(analyzer);

  analyzer.processFrame = (...args) => {
    const result = originalProcess(...args);
    results.push(result);
    return result;
  };

  fn();

  analyzer.processFrame = originalProcess;
  return results;
}
