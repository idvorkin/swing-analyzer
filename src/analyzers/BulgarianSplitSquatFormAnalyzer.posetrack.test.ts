/**
 * Integration tests for BulgarianSplitSquatFormAnalyzer using real posetrack data.
 *
 * Fixture: e2e-tests/fixtures/poses/bulgarian-split-squat-sample.posetrack.json
 * Ground truth: e2e-tests/fixtures/poses/bulgarian-split-squat-sample.groundtruth.json
 *
 * The sample is Igor's 8-rep Bulgarian split squat set, filmed from the SIDE
 * (front = right leg planted, back foot elevated). Because it is a side view,
 * knee valgus is not assessable (a frontal-plane fault) while low-back arch
 * (a sagittal-plane fault) is assessable and absent.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '../models/Skeleton';
import { MediaPipeBodyParts, type PoseKeypoint } from '../types';
import { asTimestampMs, asVideoTimeSeconds } from '../utils/brandedTypes';
import {
  BulgarianSplitSquatFormAnalyzer,
  NOT_ASSESSABLE,
} from './BulgarianSplitSquatFormAnalyzer';

interface PoseTrackFrame {
  keypoints: PoseKeypoint[];
  videoTime: number;
  score?: number;
}

interface PoseTrack {
  metadata: { videoWidth: number; videoHeight: number };
  frames: PoseTrackFrame[];
}

/** Spine angle from keypoints (same formula the app uses). */
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

interface RepRecord {
  videoTime: number;
  kneeCave: number;
  lowBackArch: number;
  minFrontKnee: number;
}

function analyze(posetrack: PoseTrack) {
  const analyzer = new BulgarianSplitSquatFormAnalyzer();
  const reps: RepRecord[] = [];

  for (const frame of posetrack.frames) {
    if (!frame.keypoints || frame.keypoints.length === 0) continue;
    if ((frame.score ?? 1) <= 0.3) continue; // skip frames with no pose

    const spineAngle = calculateSpineAngle(frame.keypoints);
    const skeleton = new Skeleton(frame.keypoints, spineAngle, true);
    const result = analyzer.processFrame(
      skeleton,
      asTimestampMs(Date.now()),
      asVideoTimeSeconds(frame.videoTime)
    );

    if (result.repCompleted) {
      const m = result.repQuality?.metrics ?? {};
      reps.push({
        videoTime: frame.videoTime,
        kneeCave: m.kneeCave ?? 0,
        lowBackArch: m.lowBackArch ?? 0,
        minFrontKnee: 180 - (m.depth ?? 0),
      });
    }
  }

  return {
    reps,
    repCount: analyzer.getRepCount(),
    frontLeg: analyzer.getWorkingLeg(),
  };
}

describe('BulgarianSplitSquatFormAnalyzer with real posetrack data', () => {
  const posetrack = loadJson<PoseTrack>(
    'bulgarian-split-squat-sample.posetrack.json'
  );
  const groundtruth = loadJson<{
    metadata: { expected_reps: number; working_leg: string };
  }>('bulgarian-split-squat-sample.groundtruth.json');

  it('detects the ground-truth rep count (8 reps)', () => {
    const { repCount } = analyze(posetrack);
    expect(repCount).toBe(groundtruth.metadata.expected_reps);
    expect(repCount).toBe(8);
  });

  it('locks onto the front (planted) leg = right', () => {
    const { frontLeg } = analyze(posetrack);
    expect(frontLeg).toBe(groundtruth.metadata.working_leg);
    expect(frontLeg).toBe('right');
  });

  it('reaches deep front-knee flexion each rep (min angle < 110 deg)', () => {
    const { reps } = analyze(posetrack);
    expect(reps.length).toBe(8);
    for (const rep of reps) {
      expect(rep.minFrontKnee).toBeLessThan(110);
    }
  });

  it('reports knee valgus as NOT assessable from this side view', () => {
    const { reps } = analyze(posetrack);
    for (const rep of reps) {
      expect(rep.kneeCave).toBe(NOT_ASSESSABLE);
    }
  });

  it('does not flag low-back arch (sagittal fault is assessable and absent)', () => {
    const { reps } = analyze(posetrack);
    for (const rep of reps) {
      expect(rep.lowBackArch).toBe(0);
    }
  });
});
