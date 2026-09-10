/**
 * Regression rep.ro for: Exercise auto-detection misclassifies Bulgarian split
 * squat as pistol squat.
 *
 * Fixture: e2e-tests/fixtures/poses/bulgarian-split-squat-sample.posetrack.json
 * Ground truth: 8 reps, working leg = right (front/planted leg).
 *
 * Before the fix this sample misrouted to 'pistol-squat' (confidence 83) and the
 * pipeline auto-swapped to the pistol analyzer (repCount 4, wrong working leg).
 * After the fix the detector should return 'bulgarian-split-squat' and the
 * pipeline should swap to the Bulgarian analyzer (repCount 8, working leg right).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '../models/Skeleton';
import { Pipeline } from '../pipeline/Pipeline';
import type {
  FrameAcquisition,
  FrameEvent,
  SkeletonEvent,
  SkeletonTransformer,
} from '../pipeline/PipelineInterfaces';
import { MediaPipeBodyParts, type PoseKeypoint } from '../types';
import { asTimestampMs, asVideoTimeSeconds } from '../utils/brandedTypes';
import { ExerciseDetector } from './ExerciseDetector';

interface PoseTrackFrame {
  keypoints: PoseKeypoint[];
  videoTime: number;
  score?: number;
}

interface PoseTrack {
  metadata: { videoWidth: number; videoHeight: number };
  frames: PoseTrackFrame[];
}

function calculateSpineAngle(keypoints: PoseKeypoint[]): number {
  const ls = keypoints[MediaPipeBodyParts.LEFT_SHOULDER];
  const rs = keypoints[MediaPipeBodyParts.RIGHT_SHOULDER];
  const lh = keypoints[MediaPipeBodyParts.LEFT_HIP];
  const rh = keypoints[MediaPipeBodyParts.RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return 0;
  const smx = (ls.x + rs.x) / 2;
  const smy = (ls.y + rs.y) / 2;
  const hmx = (lh.x + rh.x) / 2;
  const hmy = (lh.y + rh.y) / 2;
  return Math.abs((Math.atan2(smx - hmx, hmy - smy) * 180) / Math.PI);
}

function loadJson<T>(filename: string): T {
  const path = resolve(__dirname, '../../e2e-tests/fixtures/poses', filename);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('Bulgarian split squat misdetection repro', () => {
  const posetrack = loadJson<PoseTrack>(
    'bulgarian-split-squat-sample.posetrack.json'
  );
  const groundtruth = loadJson<{
    metadata: { expected_reps: number; working_leg: string };
  }>('bulgarian-split-squat-sample.groundtruth.json');

  function frameSkeletons(): {
    skeleton: Skeleton;
    videoTime: number;
    frameScore: number;
  }[] {
    const out: { skeleton: Skeleton; videoTime: number; frameScore: number }[] =
      [];
    for (const frame of posetrack.frames) {
      if (!frame.keypoints || frame.keypoints.length === 0) continue;
      const spineAngle = calculateSpineAngle(frame.keypoints);
      const skeleton = new Skeleton(frame.keypoints, spineAngle, true);
      out.push({
        skeleton,
        videoTime: frame.videoTime,
        frameScore: frame.score ?? 1,
      });
    }
    return out;
  }

  it('ExerciseDetector returns bulgarian-split-squat (not pistol-squat)', () => {
    const detector = new ExerciseDetector();
    let lockedAtFrame: number | null = null;
    const frames = frameSkeletons();
    let result = detector.getResult();
    for (let i = 0; i < frames.length; i++) {
      result = detector.processFrame(frames[i].skeleton);
      if (detector.isLocked()) {
        lockedAtFrame = i;
        break;
      }
    }
    expect(detector.isLocked()).toBe(true);
    expect(result.exercise).toBe('bulgarian-split-squat');
    expect(result.confidence).toBeGreaterThanOrEqual(70);
    // Locks during the detection window (~minFrames), not after the whole video.
    expect(lockedAtFrame).not.toBeNull();
    if (lockedAtFrame !== null) {
      expect(lockedAtFrame).toBeLessThanOrEqual(120);
    }
    // Ground truth sanity: the front (working) leg is right; the back foot is
    // elevated. This anchors the rear-foot-elevation discriminator expectation.
    expect(groundtruth.metadata.expected_reps).toBe(8);
    expect(groundtruth.metadata.working_leg).toBe('right');
  });

  it('Pipeline end-to-end swaps to Bulgarian analyzer and emits 8 reps', () => {
    const frames = frameSkeletons();
    const acq: FrameAcquisition = {
      getCurrentFrame: () => ({}) as HTMLCanvasElement,
      start: () => new Subject<FrameEvent>().asObservable(),
      stop: () => {},
    } as unknown as FrameAcquisition;
    const transformer = {
      initialize: async () => {},
      transformToSkeleton: () => new Subject<SkeletonEvent>().asObservable(),
    } as unknown as SkeletonTransformer;

    // Default constructor: autoSwitchAnalyzer = true, KettlebellSwingFormAnalyzer
    const pipeline = new Pipeline(acq, transformer);
    let emittedRepCount = 0;
    pipeline.getResults().subscribe((r) => {
      emittedRepCount = r.repCount;
    });

    for (const f of frames) {
      const event: SkeletonEvent = {
        skeleton: f.skeleton,
        poseEvent: {
          pose: null,
          frameEvent: {
            frame: {} as HTMLCanvasElement,
            timestamp: asTimestampMs(Math.round(f.videoTime * 1000)),
            videoTime: asVideoTimeSeconds(f.videoTime),
          },
        },
      };
      pipeline.processSkeletonEvent(event);
    }

    // Detection should lock to the Bulgarian exercise (not pistol-squat)
    expect(pipeline.isExerciseDetectionLocked()).toBe(true);
    expect(pipeline.getDetectedExercise()).toBe('bulgarian-split-squat');
    // The Bulgarian analyzer should be installed
    expect(pipeline.getFormAnalyzer().getExerciseName()).toBe(
      'Bulgarian Split Squat'
    );
    // Rep count should match ground truth (8), not the pistol miscount (4)
    expect(pipeline.getRepCount()).toBe(groundtruth.metadata.expected_reps);
    expect(pipeline.getRepCount()).toBe(8);
    // The getResults() stream should also have emitted the final rep count
    expect(emittedRepCount).toBe(8);
    // The working leg should be the front/planted right leg (ground truth)
    const workingLeg = pipeline.getFormAnalyzer().getWorkingLeg?.() ?? null;
    expect(workingLeg).toBe('right');
  });
});
