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
    getFacingDirection: vi.fn().mockReturnValue(null),
    getWristX: vi.fn().mockReturnValue(null),
  } as unknown as Skeleton;
}

/**
 * Phase angle presets based on default thresholds:
 * - topSpineMax: 25, topHipMin: 150
 * - bottomArmMax: 10, bottomSpineMin: 35, bottomHipMax: 140
 * - connectArmMax: 25, connectSpineMax: 25 (arms crossing vertical on way down)
 * - releaseArmMax: 25, releaseSpineMax: 25 (arms crossing vertical on way up)
 */
const PHASE_ANGLES_NORMAL = {
  top: { arm: 80, spine: 10, hip: 170, knee: 170, wristHeight: 50 },
  // CONNECT: arms approaching vertical, spine still upright (before hinge)
  connect: { arm: 20, spine: 20, hip: 155, knee: 165, wristHeight: 0 },
  bottom: { arm: -10, spine: 50, hip: 120, knee: 160, wristHeight: -100 },
  release: { arm: 20, spine: 15, hip: 155, knee: 165, wristHeight: 0 },
};

/**
 * Mirrored video version - arm angles have opposite sign
 * but same magnitude. Tests that algorithm uses Math.abs().
 */
const PHASE_ANGLES_MIRRORED = {
  top: { arm: -80, spine: 10, hip: 170, knee: 170, wristHeight: 50 },
  // CONNECT: arms approaching vertical, spine still upright (before hinge)
  connect: { arm: -20, spine: 20, hip: 155, knee: 165, wristHeight: 0 },
  bottom: { arm: 10, spine: 50, hip: 120, knee: 160, wristHeight: -100 },
  release: { arm: -20, spine: 15, hip: 155, knee: 165, wristHeight: 0 },
};

// Default to normal angles for backwards compatibility
const PHASE_ANGLES = PHASE_ANGLES_NORMAL;

/**
 * Test configurations for normal and mirrored video
 */
const VIDEO_ORIENTATIONS = [
  { name: 'normal video', angles: PHASE_ANGLES_NORMAL },
  { name: 'mirrored video', angles: PHASE_ANGLES_MIRRORED },
] as const;

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

  // Run phase transition tests with BOTH normal and mirrored video angles
  describe.each(VIDEO_ORIENTATIONS)('phase transitions ($name)', ({ angles: ANGLES }) => {
    it('transitions from TOP to CONNECT when arms reach vertical with spine upright', () => {
      // Start in top
      analyzer.processFrame(createMockSkeleton(ANGLES.top), 0);
      analyzer.processFrame(createMockSkeleton(ANGLES.top), 10);
      expect(analyzer.getPhase()).toBe('top');

      // Transition to connect (|arm| < 15, spine < 25) - arms vertical before hinge
      analyzer.processFrame(createMockSkeleton(ANGLES.connect), 20);
      analyzer.processFrame(createMockSkeleton(ANGLES.connect), 30);
      analyzer.processFrame(createMockSkeleton(ANGLES.connect), 40);

      expect(analyzer.getPhase()).toBe('connect');
    });

    it('transitions from CONNECT to BOTTOM when fully hinged', () => {
      // Get to connect phase first
      analyzer.processFrame(createMockSkeleton(ANGLES.top), 0);
      analyzer.processFrame(createMockSkeleton(ANGLES.top), 10);
      analyzer.processFrame(createMockSkeleton(ANGLES.connect), 20);
      analyzer.processFrame(createMockSkeleton(ANGLES.connect), 30);
      analyzer.processFrame(createMockSkeleton(ANGLES.connect), 40);
      expect(analyzer.getPhase()).toBe('connect');

      // Transition to bottom (|arm| < 15, spine > 35, hip < 140)
      analyzer.processFrame(createMockSkeleton(ANGLES.bottom), 50);
      analyzer.processFrame(createMockSkeleton(ANGLES.bottom), 60);
      analyzer.processFrame(createMockSkeleton(ANGLES.bottom), 70);

      expect(analyzer.getPhase()).toBe('bottom');
    });

    it('transitions from BOTTOM to RELEASE when hips extend', () => {
      // Get to bottom phase using parameterized angles
      goToPhaseWithAngles(analyzer, 'bottom', ANGLES);
      expect(analyzer.getPhase()).toBe('bottom');

      // Transition to release (|arm| > 10, spine < 25)
      analyzer.processFrame(createMockSkeleton(ANGLES.release), 100);
      analyzer.processFrame(createMockSkeleton(ANGLES.release), 110);
      analyzer.processFrame(createMockSkeleton(ANGLES.release), 120);

      expect(analyzer.getPhase()).toBe('release');
    });

    it('transitions from RELEASE to TOP when wrist peaks', () => {
      // Get to release phase using parameterized angles
      goToPhaseWithAngles(analyzer, 'release', ANGLES);
      expect(analyzer.getPhase()).toBe('release');

      // Simulate wrist height rising then falling (peak detection)
      // Need spine < 25 and hip > 150, and wrist height peaking
      // Pattern: gradual rise to peak, then fall
      const wristPattern = [10, 20, 30, 50, 50, 50, 40, 30];
      let time = 130;
      for (const wrist of wristPattern) {
        const angles = { ...ANGLES.top, wristHeight: wrist };
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

  describe('mirrored video support', () => {
    /**
     * In mirrored video (selfie mode), arm angles have opposite sign
     * but the same magnitude. The algorithm should work with either sign.
     */

    it('detects phases correctly with negative arm angles (normal video)', () => {
      // Normal video: arm behind body = negative angle
      const normalAngles = {
        top: { arm: 80, spine: 10, hip: 170, knee: 170, wristHeight: 50 },
        // CONNECT: arms approaching vertical, spine still upright (before hinge)
        connect: { arm: 20, spine: 20, hip: 155, knee: 165, wristHeight: 0 },
        bottom: { arm: -10, spine: 50, hip: 120, knee: 160, wristHeight: -100 },
        release: { arm: 20, spine: 15, hip: 155, knee: 165, wristHeight: 0 },
      };

      // Process through all phases
      for (let i = 0; i < 3; i++) {
        analyzer.processFrame(createMockSkeleton(normalAngles.top), i * 10);
      }
      expect(analyzer.getPhase()).toBe('top');

      for (let i = 0; i < 3; i++) {
        analyzer.processFrame(createMockSkeleton(normalAngles.connect), 30 + i * 10);
      }
      expect(analyzer.getPhase()).toBe('connect');

      for (let i = 0; i < 3; i++) {
        analyzer.processFrame(createMockSkeleton(normalAngles.bottom), 60 + i * 10);
      }
      expect(analyzer.getPhase()).toBe('bottom');
    });

    it('detects phases correctly with positive arm angles (mirrored video)', () => {
      // Mirrored video: arm behind body = positive angle (same magnitude, opposite sign)
      const mirroredAngles = {
        top: { arm: 80, spine: 10, hip: 170, knee: 170, wristHeight: 50 },
        // CONNECT: arms approaching vertical, spine still upright (before hinge)
        connect: { arm: -20, spine: 20, hip: 155, knee: 165, wristHeight: 0 },
        bottom: { arm: 10, spine: 50, hip: 120, knee: 160, wristHeight: -100 }, // +10 instead of -10
        release: { arm: -20, spine: 15, hip: 155, knee: 165, wristHeight: 0 },
      };

      // Process through all phases - should work identically
      for (let i = 0; i < 3; i++) {
        analyzer.processFrame(createMockSkeleton(mirroredAngles.top), i * 10);
      }
      expect(analyzer.getPhase()).toBe('top');

      for (let i = 0; i < 3; i++) {
        analyzer.processFrame(createMockSkeleton(mirroredAngles.connect), 30 + i * 10);
      }
      expect(analyzer.getPhase()).toBe('connect');

      for (let i = 0; i < 3; i++) {
        analyzer.processFrame(createMockSkeleton(mirroredAngles.bottom), 60 + i * 10);
      }
      expect(analyzer.getPhase()).toBe('bottom');
    });

    it('counts reps with mirrored arm angles', () => {
      // Use positive arm angles throughout (mirrored video style)
      const mirroredPhases = {
        top: { arm: 80, spine: 10, hip: 170, knee: 170, wristHeight: 50 },
        // CONNECT: arms approaching vertical, spine still upright (before hinge)
        connect: { arm: -20, spine: 20, hip: 155, knee: 165, wristHeight: 0 },
        bottom: { arm: 10, spine: 50, hip: 120, knee: 160, wristHeight: -100 },
        release: { arm: -20, spine: 15, hip: 155, knee: 165, wristHeight: 0 },
      };

      let time = 0;

      // Complete one rep with mirrored angles
      for (const phase of ['top', 'connect', 'bottom', 'release'] as const) {
        for (let i = 0; i < 3; i++) {
          analyzer.processFrame(createMockSkeleton(mirroredPhases[phase]), time);
          time += 10;
        }
      }

      // Peak detection for TOP
      const wristPattern = [10, 20, 30, 50, 50, 50, 40, 30];
      for (const wrist of wristPattern) {
        const angles = { ...mirroredPhases.top, wristHeight: wrist };
        analyzer.processFrame(createMockSkeleton(angles), time);
        time += 10;
      }

      expect(analyzer.getRepCount()).toBe(1);
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
 * Advance analyzer to a specific phase with custom angle set.
 * Used for parameterized tests with normal/mirrored angles.
 */
function goToPhaseWithAngles(
  analyzer: KettlebellSwingFormAnalyzer,
  targetPhase: SwingPhase,
  phaseAngles: typeof PHASE_ANGLES_NORMAL,
  startTime = 0
): void {
  const phases: SwingPhase[] = ['top', 'connect', 'bottom', 'release'];
  const currentPhase = analyzer.getPhase() as SwingPhase;
  const currentIndex = phases.indexOf(currentPhase);
  const targetIndex = phases.indexOf(targetPhase);
  let time = startTime;

  const needsFullCycle = targetPhase === 'top' && currentIndex > 0;

  if (needsFullCycle) {
    for (let i = currentIndex; i <= 3; i++) {
      const phase = phases[i];
      const angles = phaseAngles[phase];
      for (let j = 0; j < 4; j++) {
        analyzer.processFrame(createMockSkeleton(angles), time);
        time += 10;
      }
    }
    const wristPattern = [10, 20, 30, 50, 50, 50, 40, 30];
    for (const wrist of wristPattern) {
      const angles = { ...phaseAngles.top, wristHeight: wrist };
      analyzer.processFrame(createMockSkeleton(angles), time);
      time += 10;
    }
  } else {
    for (let i = currentIndex === -1 ? 0 : currentIndex; i <= targetIndex; i++) {
      const phase = phases[i];
      const angles = phaseAngles[phase];
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
