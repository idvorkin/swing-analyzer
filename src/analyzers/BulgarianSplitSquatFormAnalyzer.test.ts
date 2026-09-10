/**
 * Unit tests for BulgarianSplitSquatFormAnalyzer.
 *
 * These drive the analyzer with synthetic mock skeletons so each behavior can be
 * isolated: front-leg lock, rep counting off the front-knee angle, rejection of
 * shallow bobs, and the two stop-sign flags (knee valgus / low-back arch)
 * including the "not assessable from a side view" degradation.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Skeleton } from '../models/Skeleton';
import type { PoseKeypoint } from '../types';
import { MediaPipeBodyParts } from '../types';
import { asTimestampMs } from '../utils/brandedTypes';
import {
  BulgarianSplitSquatFormAnalyzer,
  NOT_ASSESSABLE,
} from './BulgarianSplitSquatFormAnalyzer';
import type { FormAnalyzerResult } from './FormAnalyzer';

const MID_X = 232; // frame midline (~464px wide sample)

interface MockOpts {
  frontKnee: number;
  backKnee?: number;
  frontHip?: number;
  spine?: number;
  front?: 'left' | 'right'; // which leg is planted (lower ankle)
  frontal?: boolean; // true => camera roughly head-on (valgus assessable)
  valgus?: boolean; // only meaningful when frontal
  facing?: 'left' | 'right' | null;
  archBack?: boolean; // shoulders shifted behind hips (needs facing)
}

/** Build a 33-length keypoint array from a small set of joint positions. */
function buildKeypoints(o: MockOpts): PoseKeypoint[] {
  const kp: PoseKeypoint[] = Array.from({ length: 33 }, () => ({
    x: MID_X,
    y: 300,
    z: 0,
    score: 0.9,
  }));
  const set = (i: number, x: number, y: number) => {
    kp[i] = { x, y, z: 0, score: 0.9 };
  };

  const front = o.front ?? 'right';
  const frontal = o.frontal ?? false;

  // Torso: shoulders above hips. Frontal view separates L/R in X; side view overlaps.
  let lShX = MID_X;
  let rShX = MID_X;
  let lHipX = MID_X;
  let rHipX = MID_X;
  if (frontal) {
    lShX = 196;
    rShX = 268;
    lHipX = 200;
    rHipX = 264;
  }
  // Low-back arch: shift shoulders behind the hips (leftward when facing right).
  if (o.archBack) {
    lShX -= 40;
    rShX -= 40;
  }
  set(MediaPipeBodyParts.LEFT_SHOULDER, lShX, 200);
  set(MediaPipeBodyParts.RIGHT_SHOULDER, rShX, 200);
  set(MediaPipeBodyParts.LEFT_HIP, lHipX, 350);
  set(MediaPipeBodyParts.RIGHT_HIP, rHipX, 350);

  // Ankles: the planted (front) foot sits lower in the frame (larger Y).
  const frontAnkleY = 600;
  const backAnkleY = 520;
  const lAnkleY = front === 'left' ? frontAnkleY : backAnkleY;
  const rAnkleY = front === 'right' ? frontAnkleY : backAnkleY;

  // Knee/ankle X for valgus: front knee drifts medially while ankle stays lateral.
  let lKneeX = lHipX;
  let rKneeX = rHipX;
  let lAnkleX = lHipX;
  let rAnkleX = rHipX;
  if (frontal) {
    if (front === 'right') {
      rAnkleX = 272; // lateral
      rKneeX = o.valgus ? 244 : 266; // medial when caving
    } else {
      lAnkleX = 192;
      lKneeX = o.valgus ? 220 : 198;
    }
  }
  set(MediaPipeBodyParts.LEFT_KNEE, lKneeX, 475);
  set(MediaPipeBodyParts.RIGHT_KNEE, rKneeX, 475);
  set(MediaPipeBodyParts.LEFT_ANKLE, lAnkleX, lAnkleY);
  set(MediaPipeBodyParts.RIGHT_ANKLE, rAnkleX, rAnkleY);

  return kp;
}

function mockSkeleton(o: MockOpts): Skeleton {
  const front = o.front ?? 'right';
  const keypoints = buildKeypoints(o);
  return {
    getKeypoints: vi.fn().mockReturnValue(keypoints),
    getSpineAngle: vi.fn().mockReturnValue(o.spine ?? 15),
    getPreferredSide: vi.fn().mockReturnValue(front),
    getFacingDirection: vi.fn().mockReturnValue(o.facing ?? null),
    getKneeAngleForSide: vi
      .fn()
      .mockImplementation((side: 'left' | 'right') =>
        side === front ? o.frontKnee : (o.backKnee ?? 165)
      ),
    getHipAngleForSide: vi
      .fn()
      .mockImplementation((side: 'left' | 'right') =>
        side === front ? (o.frontHip ?? 150) : 165
      ),
  } as unknown as Skeleton;
}

/** Feed a list of front-knee angles as consecutive frames. */
function feed(
  analyzer: BulgarianSplitSquatFormAnalyzer,
  frontKnees: number[],
  base: Partial<MockOpts> = {}
) {
  let lastResult: FormAnalyzerResult | undefined;
  for (const frontKnee of frontKnees) {
    lastResult = analyzer.processFrame(
      mockSkeleton({ ...base, frontKnee }),
      asTimestampMs(Date.now())
    );
  }
  return lastResult;
}

/** A full standing→bottom→standing rep as a smooth front-knee curve. */
function repCurve(bottom = 80): number[] {
  const down: number[] = [];
  for (let a = 160; a >= bottom; a -= 5) down.push(a);
  const up: number[] = [];
  for (let a = bottom + 5; a <= 165; a += 5) up.push(a);
  return [...down, ...up];
}

const STAND_PAD = [165, 165, 165, 165, 165, 165];

describe('BulgarianSplitSquatFormAnalyzer', () => {
  it('starts in the standing phase with zero reps', () => {
    const a = new BulgarianSplitSquatFormAnalyzer();
    expect(a.getPhase()).toBe('standing');
    expect(a.getRepCount()).toBe(0);
    expect(a.getExerciseName()).toBe('Bulgarian Split Squat');
    expect(a.getPhases()).toEqual([
      'standing',
      'descending',
      'bottom',
      'ascending',
    ]);
  });

  it('locks onto the planted (lower-ankle) leg as the front leg', () => {
    const a = new BulgarianSplitSquatFormAnalyzer();
    feed(a, STAND_PAD, { front: 'right' });
    expect(a.getWorkingLeg()).toBe('right');

    const b = new BulgarianSplitSquatFormAnalyzer();
    feed(b, STAND_PAD, { front: 'left' });
    expect(b.getWorkingLeg()).toBe('left');
  });

  it('counts one rep for a full descend/ascend of the front knee', () => {
    const a = new BulgarianSplitSquatFormAnalyzer();
    feed(a, STAND_PAD, { front: 'right' });
    feed(a, repCurve(80), { front: 'right' });
    expect(a.getRepCount()).toBe(1);
  });

  it('counts multiple reps', () => {
    const a = new BulgarianSplitSquatFormAnalyzer();
    feed(a, STAND_PAD, { front: 'right' });
    for (let i = 0; i < 3; i++) feed(a, repCurve(80), { front: 'right' });
    expect(a.getRepCount()).toBe(3);
  });

  it('does not count a shallow bob that never flexes past the down threshold', () => {
    const a = new BulgarianSplitSquatFormAnalyzer();
    feed(a, STAND_PAD, { front: 'right' });
    // Dips to ~120 (never below 110) and comes back up — not a rep.
    feed(a, [135, 128, 122, 120, 122, 128, 140, 155, 165], { front: 'right' });
    expect(a.getRepCount()).toBe(0);
  });

  it('scores a completed rep and reports front-knee depth', () => {
    const a = new BulgarianSplitSquatFormAnalyzer();
    feed(a, STAND_PAD, { front: 'right' });
    feed(a, repCurve(80), { front: 'right' });
    const q = a.getLastRepQuality();
    expect(q).not.toBeNull();
    // depth metric = 180 - minFrontKnee; bottom 80 => ~100
    expect(q?.metrics?.depth).toBeGreaterThan(80);
  });

  describe('stop-sign flags', () => {
    it('reports knee valgus as NOT assessable from a side view', () => {
      const a = new BulgarianSplitSquatFormAnalyzer();
      feed(a, STAND_PAD, { front: 'right', frontal: false });
      feed(a, repCurve(80), { front: 'right', frontal: false });
      expect(a.getRepCount()).toBe(1);
      expect(a.getLastRepQuality()?.metrics?.kneeCave).toBe(NOT_ASSESSABLE);
    });

    it('flags knee valgus (cave) from a frontal view when the knee drifts medially', () => {
      const a = new BulgarianSplitSquatFormAnalyzer();
      feed(a, STAND_PAD, { front: 'right', frontal: true, valgus: true });
      feed(a, repCurve(80), { front: 'right', frontal: true, valgus: true });
      expect(a.getRepCount()).toBe(1);
      expect(a.getLastRepQuality()?.metrics?.kneeCave).toBe(1);
    });

    it('does not flag valgus from a frontal view when the knee tracks the ankle', () => {
      const a = new BulgarianSplitSquatFormAnalyzer();
      feed(a, STAND_PAD, { front: 'right', frontal: true, valgus: false });
      feed(a, repCurve(80), { front: 'right', frontal: true, valgus: false });
      expect(a.getRepCount()).toBe(1);
      expect(a.getLastRepQuality()?.metrics?.kneeCave).toBe(0);
    });

    it('flags low-back arch when the trunk leans behind the hips', () => {
      const a = new BulgarianSplitSquatFormAnalyzer();
      const base = {
        front: 'right' as const,
        facing: 'right' as const,
        archBack: true,
      };
      feed(a, STAND_PAD, base);
      feed(a, repCurve(80), base);
      expect(a.getRepCount()).toBe(1);
      expect(a.getLastRepQuality()?.metrics?.lowBackArch).toBe(1);
    });
  });

  it('resets to the initial state', () => {
    const a = new BulgarianSplitSquatFormAnalyzer();
    feed(a, STAND_PAD, { front: 'right' });
    feed(a, repCurve(80), { front: 'right' });
    expect(a.getRepCount()).toBe(1);
    a.reset();
    expect(a.getRepCount()).toBe(0);
    expect(a.getPhase()).toBe('standing');
    expect(a.getWorkingLeg()).toBeNull();
  });
});
