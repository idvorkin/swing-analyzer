import { beforeEach, describe, expect, it } from 'vitest';
import type { Skeleton } from '../models/Skeleton';
import { createBasicMockSkeleton } from './__test-helpers__';
import type {
  FormAnalyzerResult,
  RepPosition,
  RepQuality,
} from './FormAnalyzer';
import { type BasePhasePeak, FormAnalyzerBase } from './FormAnalyzerBase';

// ============================================
// Test Implementation
// ============================================

type TestPhase = 'start' | 'middle' | 'end';

interface TestAngles {
  angle1: number;
  angle2: number;
}

interface TestPeak extends BasePhasePeak<TestPhase, TestAngles> {
  // No additional fields needed for test
}

/**
 * Concrete test implementation of FormAnalyzerBase.
 * Used to test the base class functionality.
 */
class TestFormAnalyzer extends FormAnalyzerBase<
  TestPhase,
  TestAngles,
  TestPeak
> {
  // Track metrics for quality scoring
  private metrics = { maxAngle1: 0, minAngle2: 180 };

  // Expose protected methods for testing
  public _canTransition = () => this.canTransition();
  public _transitionTo = (phase: TestPhase) => this.transitionTo(phase);
  public _completeRep = () => this.completeRep();
  public _storePeak = (phase: TestPhase, peak: TestPeak) =>
    this.storePeak(phase, peak);
  public _getPeak = (phase: TestPhase) => this.getPeak(phase);
  public _convertPeaksToPositions = () => this.convertPeaksToPositions();

  // Expose protected fields for testing
  public get _phase() {
    return this.phase;
  }
  public set _phase(p: TestPhase) {
    this.phase = p;
  }
  public get _repCount() {
    return this.repCount;
  }
  public get _framesInPhase() {
    return this.framesInPhase;
  }
  public set _framesInPhase(f: number) {
    this.framesInPhase = f;
  }
  public get _currentRepPeaks() {
    return this.currentRepPeaks;
  }

  constructor() {
    super('start');
  }

  processFrame(
    skeleton: Skeleton,
    timestamp = Date.now(),
    videoTime?: number,
    frameImage?: ImageData
  ): FormAnalyzerResult {
    const angles: TestAngles = { angle1: 45, angle2: 90 };

    // Track metrics
    this.metrics.maxAngle1 = Math.max(this.metrics.maxAngle1, angles.angle1);
    this.metrics.minAngle2 = Math.min(this.metrics.minAngle2, angles.angle2);

    this.framesInPhase++;

    // Simple state machine for testing
    let repCompleted = false;
    let repPositions: RepPosition[] | undefined;
    let repQuality: RepQuality | undefined;

    if (this.phase === 'start' && this.canTransition()) {
      this._storePeak(
        'start',
        this.createPeak(skeleton, timestamp, videoTime, angles, frameImage)
      );
      this.transitionTo('middle');
    } else if (this.phase === 'middle' && this.canTransition()) {
      this._storePeak(
        'middle',
        this.createPeak(skeleton, timestamp, videoTime, angles, frameImage)
      );
      this.transitionTo('end');
    } else if (this.phase === 'end' && this.canTransition()) {
      this._storePeak(
        'end',
        this.createPeak(skeleton, timestamp, videoTime, angles, frameImage)
      );
      const result = this.completeRep();
      repCompleted = true;
      repPositions = result.repPositions;
      repQuality = result.repQuality;
      this.transitionTo('start');
      this.resetMetrics();
    }

    return {
      phase: this.phase,
      repCompleted,
      repCount: this.repCount,
      repPositions,
      repQuality,
      angles: { ...angles } as Record<string, number>,
    };
  }

  private createPeak(
    skeleton: Skeleton,
    timestamp: number,
    videoTime: number | undefined,
    angles: TestAngles,
    frameImage?: ImageData
  ): TestPeak {
    return {
      phase: this.phase,
      skeleton,
      timestamp,
      videoTime,
      score: angles.angle1,
      angles: { ...angles },
      frameImage,
    };
  }

  getExerciseName(): string {
    return 'Test Exercise';
  }

  getPhases(): string[] {
    return ['start', 'middle', 'end'];
  }

  protected calculateRepQuality(): RepQuality {
    const score = Math.min(
      100,
      this.metrics.maxAngle1 + (180 - this.metrics.minAngle2)
    );
    return {
      score,
      metrics: { ...this.metrics },
      feedback: score >= 80 ? ['Great job!'] : ['Keep practicing'],
    };
  }

  protected resetExerciseState(): void {
    this._phase = 'start';
    this.resetMetrics();
  }

  private resetMetrics(): void {
    this.metrics = { maxAngle1: 0, minAngle2: 180 };
  }
}

// Alias for backwards compatibility in test code
const createMockSkeleton = createBasicMockSkeleton;

// ============================================
// Tests
// ============================================

describe('FormAnalyzerBase', () => {
  let analyzer: TestFormAnalyzer;

  beforeEach(() => {
    analyzer = new TestFormAnalyzer();
  });

  describe('initial state', () => {
    it('starts with the initial phase provided to constructor', () => {
      expect(analyzer.getPhase()).toBe('start');
    });

    it('starts with 0 rep count', () => {
      expect(analyzer.getRepCount()).toBe(0);
    });

    it('starts with null last rep quality', () => {
      expect(analyzer.getLastRepQuality()).toBeNull();
    });

    it('starts with 0 frames in phase', () => {
      expect(analyzer._framesInPhase).toBe(0);
    });

    it('starts with empty current rep peaks', () => {
      expect(Object.keys(analyzer._currentRepPeaks)).toHaveLength(0);
    });
  });

  describe('getExerciseName()', () => {
    it('returns the exercise name from concrete implementation', () => {
      expect(analyzer.getExerciseName()).toBe('Test Exercise');
    });
  });

  describe('getPhases()', () => {
    it('returns phases from concrete implementation', () => {
      expect(analyzer.getPhases()).toEqual(['start', 'middle', 'end']);
    });
  });

  describe('canTransition()', () => {
    it('returns false when framesInPhase < minFramesInPhase', () => {
      analyzer._framesInPhase = 0;
      expect(analyzer._canTransition()).toBe(false);

      analyzer._framesInPhase = 1;
      expect(analyzer._canTransition()).toBe(false);
    });

    it('returns true when framesInPhase >= minFramesInPhase', () => {
      analyzer._framesInPhase = 2;
      expect(analyzer._canTransition()).toBe(true);

      analyzer._framesInPhase = 5;
      expect(analyzer._canTransition()).toBe(true);
    });
  });

  describe('transitionTo()', () => {
    it('changes the phase', () => {
      expect(analyzer._phase).toBe('start');
      analyzer._transitionTo('middle');
      expect(analyzer._phase).toBe('middle');
    });

    it('resets framesInPhase to 0', () => {
      analyzer._framesInPhase = 5;
      analyzer._transitionTo('middle');
      expect(analyzer._framesInPhase).toBe(0);
    });
  });

  describe('storePeak() and getPeak()', () => {
    it('stores and retrieves peaks by phase', () => {
      const skeleton = createMockSkeleton();
      const peak: TestPeak = {
        phase: 'start',
        skeleton,
        timestamp: 100,
        videoTime: 1.0,
        score: 50,
        angles: { angle1: 45, angle2: 90 },
      };

      analyzer._storePeak('start', peak);
      expect(analyzer._getPeak('start')).toEqual(peak);
    });

    it('returns undefined for phases without peaks', () => {
      expect(analyzer._getPeak('middle')).toBeUndefined();
    });

    it('overwrites existing peaks', () => {
      const skeleton = createMockSkeleton();
      const peak1: TestPeak = {
        phase: 'start',
        skeleton,
        timestamp: 100,
        score: 50,
        angles: { angle1: 45, angle2: 90 },
      };
      const peak2: TestPeak = {
        phase: 'start',
        skeleton,
        timestamp: 200,
        score: 75,
        angles: { angle1: 60, angle2: 80 },
      };

      analyzer._storePeak('start', peak1);
      analyzer._storePeak('start', peak2);
      expect(analyzer._getPeak('start')?.score).toBe(75);
    });
  });

  describe('convertPeaksToPositions()', () => {
    it('converts stored peaks to RepPosition array', () => {
      const skeleton = createMockSkeleton();
      const startPeak: TestPeak = {
        phase: 'start',
        skeleton,
        timestamp: 100,
        videoTime: 1.0,
        score: 50,
        angles: { angle1: 45, angle2: 90 },
      };
      const middlePeak: TestPeak = {
        phase: 'middle',
        skeleton,
        timestamp: 200,
        videoTime: 2.0,
        score: 60,
        angles: { angle1: 50, angle2: 85 },
      };

      analyzer._storePeak('start', startPeak);
      analyzer._storePeak('middle', middlePeak);

      const positions = analyzer._convertPeaksToPositions();

      expect(positions).toHaveLength(2);
      expect(positions.map((p) => p.name).sort()).toEqual(['middle', 'start']);

      const startPos = positions.find((p) => p.name === 'start');
      expect(startPos?.skeleton).toBe(skeleton);
      expect(startPos?.timestamp).toBe(100);
      expect(startPos?.videoTime).toBe(1.0);
      expect(startPos?.score).toBe(50);
      expect(startPos?.angles).toEqual({ angle1: 45, angle2: 90 });
    });

    it('returns empty array when no peaks stored', () => {
      const positions = analyzer._convertPeaksToPositions();
      expect(positions).toHaveLength(0);
    });

    it('includes frameImage when present', () => {
      const skeleton = createMockSkeleton();
      const mockImageData = { width: 100, height: 100 } as ImageData;
      const peak: TestPeak = {
        phase: 'start',
        skeleton,
        timestamp: 100,
        score: 50,
        angles: { angle1: 45, angle2: 90 },
        frameImage: mockImageData,
      };

      analyzer._storePeak('start', peak);
      const positions = analyzer._convertPeaksToPositions();

      expect(positions[0].frameImage).toBe(mockImageData);
    });
  });

  describe('completeRep()', () => {
    it('increments rep count', () => {
      expect(analyzer._repCount).toBe(0);
      analyzer._completeRep();
      expect(analyzer._repCount).toBe(1);
      analyzer._completeRep();
      expect(analyzer._repCount).toBe(2);
    });

    it('calculates and stores rep quality', () => {
      expect(analyzer.getLastRepQuality()).toBeNull();
      analyzer._completeRep();
      const quality = analyzer.getLastRepQuality();
      expect(quality).not.toBeNull();
      expect(quality?.score).toBeGreaterThanOrEqual(0);
      expect(quality?.score).toBeLessThanOrEqual(100);
      expect(quality?.feedback).toBeInstanceOf(Array);
    });

    it('returns repPositions and repQuality', () => {
      const skeleton = createMockSkeleton();
      analyzer._storePeak('start', {
        phase: 'start',
        skeleton,
        timestamp: 100,
        score: 50,
        angles: { angle1: 45, angle2: 90 },
      });

      const result = analyzer._completeRep();

      expect(result.repPositions).toBeInstanceOf(Array);
      expect(result.repPositions.length).toBeGreaterThan(0);
      expect(result.repQuality).toBeDefined();
      expect(result.repQuality.score).toBeGreaterThanOrEqual(0);
    });

    it('clears current rep peaks after completion', () => {
      const skeleton = createMockSkeleton();
      analyzer._storePeak('start', {
        phase: 'start',
        skeleton,
        timestamp: 100,
        score: 50,
        angles: { angle1: 45, angle2: 90 },
      });

      expect(Object.keys(analyzer._currentRepPeaks)).toHaveLength(1);
      analyzer._completeRep();
      expect(Object.keys(analyzer._currentRepPeaks)).toHaveLength(0);
    });
  });

  describe('reset()', () => {
    it('resets rep count to 0', () => {
      analyzer._completeRep();
      analyzer._completeRep();
      expect(analyzer.getRepCount()).toBe(2);

      analyzer.reset();
      expect(analyzer.getRepCount()).toBe(0);
    });

    it('resets framesInPhase to 0', () => {
      analyzer._framesInPhase = 10;
      analyzer.reset();
      expect(analyzer._framesInPhase).toBe(0);
    });

    it('clears last rep quality', () => {
      analyzer._completeRep();
      expect(analyzer.getLastRepQuality()).not.toBeNull();

      analyzer.reset();
      expect(analyzer.getLastRepQuality()).toBeNull();
    });

    it('clears current rep peaks', () => {
      const skeleton = createMockSkeleton();
      analyzer._storePeak('start', {
        phase: 'start',
        skeleton,
        timestamp: 100,
        score: 50,
        angles: { angle1: 45, angle2: 90 },
      });

      analyzer.reset();
      expect(Object.keys(analyzer._currentRepPeaks)).toHaveLength(0);
    });

    it('calls resetExerciseState()', () => {
      // Move to middle phase
      analyzer._phase = 'middle';

      analyzer.reset();

      // resetExerciseState() should reset phase back to 'start'
      expect(analyzer._phase).toBe('start');
    });
  });

  describe('full integration via processFrame()', () => {
    it('completes a full rep cycle through state machine', () => {
      const skeleton = createMockSkeleton();

      // Process enough frames to complete: start → middle → end → start
      // Need 2 frames per phase to pass canTransition() check
      const results: FormAnalyzerResult[] = [];

      for (let i = 0; i < 8; i++) {
        results.push(analyzer.processFrame(skeleton, i * 10));
      }

      // Find the result where rep completed
      const completedResult = results.find((r) => r.repCompleted);
      expect(completedResult).toBeDefined();
      expect(completedResult?.repCount).toBe(1);
      expect(completedResult?.repPositions).toBeDefined();
      expect(completedResult?.repPositions?.length).toBe(3); // start, middle, end
      expect(completedResult?.repQuality).toBeDefined();
    });

    it('counts multiple reps correctly', () => {
      const skeleton = createMockSkeleton();

      // Complete first rep
      for (let i = 0; i < 8; i++) {
        analyzer.processFrame(skeleton, i * 10);
      }
      expect(analyzer.getRepCount()).toBe(1);

      // Complete second rep
      for (let i = 0; i < 8; i++) {
        analyzer.processFrame(skeleton, 100 + i * 10);
      }
      expect(analyzer.getRepCount()).toBe(2);
    });
  });
});
