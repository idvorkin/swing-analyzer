/**
 * Edge-case tests pinning the Bulgarian split squat detection discriminator
 * (procedures E1, F1, F2, F3 from the fix's test plan).
 *
 * These exercise the new rear-foot-elevation branch in isolation with
 * controlled mock skeletons (knee angles + ankle Y), sweeping the three
 * fixtures' signatures (Bulgarian / pistol / swing) and the override /
 * reset / threshold-margin behavior.
 */

import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { Skeleton } from '../models/Skeleton';
import { Pipeline } from '../pipeline/Pipeline';
import type {
  FrameAcquisition,
  FrameEvent,
  SkeletonEvent,
  SkeletonTransformer,
} from '../pipeline/PipelineInterfaces';
import { MediaPipeBodyParts } from '../types';
import { asTimestampMs, asVideoTimeSeconds } from '../utils/brandedTypes';
import { ExerciseDetector } from './ExerciseDetector';

/** Fast detector config for unit tests (mirrors ExerciseDetector.test.ts). */
const FAST = {
  minFrames: 10,
  maxFrames: 30,
  asymmetryThreshold: 35,
  confidenceThreshold: 70,
  rearFootElevationDeadzone: 15,
  minRearFootElevationFrames: 5,
  rearFootElevationRatioThreshold: 0.7,
  minRearFootElevationMagnitude: 25,
};

interface MockOpts {
  leftKnee: number;
  rightKnee: number;
  leftAnkleY: number;
  rightAnkleY: number;
  ankleScore?: number;
}

/**
 * Mock skeleton exposing both the side-specific knee angles (for asymmetry)
 * and a real keypoints array (for the rear-foot-elevation read). Mirrors the
 * shape the production ExerciseDetector consumes from a real Skeleton.
 */
function makeMockSkeleton(opts: MockOpts): Skeleton {
  const score = opts.ankleScore ?? 0.9;
  const keypoints = Array(33)
    .fill(null)
    .map(() => ({ x: 100, y: 0, z: 0, score: 0 }));
  keypoints[MediaPipeBodyParts.LEFT_ANKLE] = {
    x: 100,
    y: opts.leftAnkleY,
    z: 0,
    score,
  };
  keypoints[MediaPipeBodyParts.RIGHT_ANKLE] = {
    x: 110,
    y: opts.rightAnkleY,
    z: 0,
    score,
  };
  return {
    getKneeAngleForSide: vi
      .fn()
      .mockImplementation((side: 'left' | 'right') =>
        side === 'left' ? opts.leftKnee : opts.rightKnee
      ),
    getKeypoints: vi.fn().mockReturnValue(keypoints),
    getSpineAngle: vi.fn().mockReturnValue(10),
  } as unknown as Skeleton;
}

function runFrames(
  detector: ExerciseDetector,
  makeFrame: (i: number) => Skeleton,
  count: number
) {
  let result: ReturnType<ExerciseDetector['processFrame']> | undefined;
  for (let i = 0; i < count; i++) {
    result = detector.processFrame(makeFrame(i));
  }
  // count >= minFrames guarantees processFrame returned a real detection at
  // least once; guard keeps the non-null assertion rule satisfied.
  if (result === undefined) {
    throw new Error('runFrames called with count=0');
  }
  return result;
}

describe('ExerciseDetector Bulgarian discriminator — edge cases', () => {
  describe('F1: discriminator routes by signature', () => {
    it('F1a Bulgarian signature (sustained one-sided elevation + asymmetry) → bulgarian-split-squat', () => {
      const detector = new ExerciseDetector(FAST);
      // Front = right ankle lower (larger Y); back = left ankle higher (smaller Y).
      // Asymmetric knees (front bends, back stay straight) → high asymmetry.
      const result = runFrames(
        detector,
        () =>
          makeMockSkeleton({
            leftKnee: 165, // back leg straight
            rightKnee: 70, // front leg deep
            leftAnkleY: 550, // back/elevated (higher = smaller Y)
            rightAnkleY: 630, // front/planted (lower)
          }),
        10
      );
      expect(result.exercise).toBe('bulgarian-split-squat');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      const stats = detector.getStats();
      expect(stats.rearFootElevatedSide).toBe('left'); // left is elevated
      expect(stats.rearFootElevationRatio).toBeGreaterThan(0.7);
    });

    it('F1b Pistol signature (asymmetric but NOT sustained elevation) → pistol-squat', () => {
      const detector = new ExerciseDetector(FAST);
      // Pistol: huge asymmetry, but the extended foot dangles — alternate which
      // ankle is higher each frame so no single side is sustained > 0.7.
      const result = runFrames(
        detector,
        (i) =>
          makeMockSkeleton({
            leftKnee: 60, // working leg bent
            rightKnee: 170, // extended leg straight
            leftAnkleY: i % 2 === 0 ? 600 : 500, // alternate
            rightAnkleY: i % 2 === 0 ? 500 : 600, // alternate (dy flips sign)
          }),
        10
      );
      // Falls through the Bulgarian branch (ratio ~0.5 < 0.7) → pistol branch.
      expect(result.exercise).toBe('pistol-squat');
      expect(detector.getStats().rearFootElevationRatio).toBeLessThan(0.7);
    });

    it('F1c Swing signature (large stable elevation but symmetric knees) → kettlebell-swing', () => {
      const detector = new ExerciseDetector(FAST);
      // Side stance: stable one-sided ankle delta, but BOTH knees symmetric
      // (low asymmetry) → the Bulgarian gate (asymmetry > threshold) must fail.
      const result = runFrames(
        detector,
        () =>
          makeMockSkeleton({
            leftKnee: 170,
            rightKnee: 172, // ~2° asymmetry, well below 35
            leftAnkleY: 550, // stable elevation (would look Bulgarian otherwise)
            rightAnkleY: 630,
          }),
        10
      );
      expect(result.exercise).toBe('kettlebell-swing');
      // Bulgarian branch never fired → stats still reflect the elevation but
      // it wasn't used. Confirm the asymmetry gate held.
      expect(detector.getStats().maxKneeAsymmetry).toBeLessThanOrEqual(35);
    });

    it('F1d low-confidence ankles → Bulgarian branch does not fire (falls through, no crash)', () => {
      const detector = new ExerciseDetector(FAST);
      // Ankle score below 0.3 → elevation history stays empty.
      const result = runFrames(
        detector,
        () =>
          makeMockSkeleton({
            leftKnee: 70,
            rightKnee: 165, // asymmetric (would route Bulgarian if ankles read)
            leftAnkleY: 550,
            rightAnkleY: 630,
            ankleScore: 0.2, // below 0.3 → skipped
          }),
        10
      );
      // No ankle evidence → cannot be Bulgarian → asymmetric → pistol branch.
      expect(result.exercise).toBe('pistol-squat');
      expect(detector.getStats().rearFootElevationFrames).toBe(0);
    });
  });

  describe('F2: reset() clears elevation history', () => {
    it('does not leak a prior Bulgarian elevation signal into a new video', () => {
      const detector = new ExerciseDetector(FAST);
      // First run: Bulgarian signature → locks Bulgarian.
      runFrames(
        detector,
        () =>
          makeMockSkeleton({
            leftKnee: 165,
            rightKnee: 70,
            leftAnkleY: 550,
            rightAnkleY: 630,
          }),
        10
      );
      expect(detector.isLocked()).toBe(true);
      expect(detector.getResult().exercise).toBe('bulgarian-split-squat');

      detector.reset();
      expect(detector.getStats().rearFootElevationFrames).toBe(0);
      expect(detector.getStats().rearFootElevationRatio).toBe(0);

      // Second run on the SAME detector: pistol signature (asymmetric, no
      // sustained elevation). Must classify pistol — NOT Bulgarian carried
      // over from the previous history.
      const result = runFrames(
        detector,
        (i) =>
          makeMockSkeleton({
            leftKnee: 60,
            rightKnee: 170,
            leftAnkleY: i % 2 === 0 ? 600 : 500,
            rightAnkleY: i % 2 === 0 ? 500 : 600,
          }),
        10
      );
      expect(result.exercise).toBe('pistol-squat');
    });
  });

  describe('F3: threshold sweep pins the safety margin', () => {
    it('lowering rearFootElevationRatioThreshold below the pistol fixture ratio misroutes to Bulgarian', () => {
      // Pistol's sustained-elevation ratio is ~0.5 on this alternating signal.
      // The 0.7 default must stay above it. Drop the threshold to 0.4 to prove
      // the pistol signature would NOW be swallowed by the Bulgarian branch —
      // i.e. the 0.7 default is load-bearing.
      const lowThresholdConfig = {
        ...FAST,
        rearFootElevationRatioThreshold: 0.4,
      };
      const detector = new ExerciseDetector(lowThresholdConfig);
      const result = runFrames(
        detector,
        (i) =>
          makeMockSkeleton({
            leftKnee: 60,
            rightKnee: 170,
            leftAnkleY: i % 2 === 0 ? 600 : 500,
            rightAnkleY: i % 2 === 0 ? 500 : 600,
          }),
        10
      );
      expect(result.exercise).toBe('bulgarian-split-squat');
    });
  });
});

describe('E1: manual override wins over the Bulgarian auto-branch', () => {
  it('setExerciseType(pistol) before frames keeps pistol analyzer despite Bulgarian-looking fixture', () => {
    const acq: FrameAcquisition = {
      getCurrentFrame: () => ({}) as HTMLCanvasElement,
      start: () => new Subject<FrameEvent>().asObservable(),
      stop: () => {},
    } as unknown as FrameAcquisition;
    const transformer = {
      initialize: async () => {},
      transformToSkeleton: () => new Subject<SkeletonEvent>().asObservable(),
    } as unknown as SkeletonTransformer;

    const pipeline = new Pipeline(acq, transformer);
    // User override BEFORE any frames: locks detector, disables auto-switch.
    pipeline.setExerciseType('pistol-squat');

    // Feed a Bulgarian signature fixture (would auto-detect Bulgarian if not overridden).
    for (let i = 0; i < 75; i++) {
      const skeleton = makeMockSkeleton({
        leftKnee: 165,
        rightKnee: 70,
        leftAnkleY: 550,
        rightAnkleY: 630,
      });
      const event: SkeletonEvent = {
        skeleton,
        poseEvent: {
          pose: null,
          frameEvent: {
            frame: {} as HTMLCanvasElement,
            timestamp: asTimestampMs(i * 33),
            videoTime: asVideoTimeSeconds(i / 30),
          },
        },
      };
      pipeline.processSkeletonEvent(event);
    }

    // Manual lock must win: pistol-squat, NOT bulgarian-split-squat.
    expect(pipeline.getDetectedExercise()).toBe('pistol-squat');
    expect(pipeline.getFormAnalyzer().getExerciseName()).toBe('Pistol Squat');
  });
});
