/**
 * SkeletonRenderer tests
 *
 * These tests exercise the public `renderSkeleton` entry point and assert on
 * the canvas 2D operations it issues. jsdom does NOT implement
 * `HTMLCanvasElement.prototype.getContext('2d')` (it returns null and prints
 * a "Not implemented" error), so we inject a fake canvas whose `getContext`
 * returns a recording mock context. The `Skeleton` instances are real (not
 * stubbed) so the angle math and keypoint lookups are exercised end-to-end.
 *
 * Primary regression: the arm-to-vertical angle OVERLAY LABEL must refer to
 * the same arm whose vector is drawn. `visualizeArmToVerticalAngle` always
 * draws the right arm when right keypoints exist (`rightShoulder || leftShoulder`,
 * `rightElbow || leftElbow`), so the angle passed in must be the right arm's
 * angle (`getArmToVerticalAngle('right')`), not the auto "most-vertical" arm.
 */

import { describe, expect, it, vi } from 'vitest';
import { Skeleton } from '../models/Skeleton';
import { MediaPipeBodyParts, type PoseKeypoint } from '../types';
import { SkeletonRenderer } from './SkeletonRenderer';

type Op =
  | { kind: 'beginPath' }
  | {
      kind: 'moveTo' | 'lineTo' | 'arc';
      args: number[];
      strokeStyle: string;
      lineWidth: number;
      fillStyle: string;
    }
  | { kind: 'stroke' }
  | { kind: 'fill' }
  | {
      kind: 'fillText';
      text: string;
      x: number;
      y: number;
      fillStyle: string;
    }
  | { kind: 'clearRect' };

/**
 * Create a mock CanvasRenderingContext2D that records every operation in a
 * chronological `ops` array, snapshotting the current strokeStyle/lineWidth/
 * fillStyle at each path op so subpaths can be inspected afterward.
 *
 * Why snapshot at call time: the production code sets `ctx.strokeStyle` /
 * `ctx.lineWidth` AFTER `beginPath` but BEFORE `moveTo`/`lineTo`/`arc`, and
 * the dot-drawing blocks never reset `strokeStyle`, so the raw strokeStyle
 * alone is not enough to identify a subpath — we group by `beginPath`.
 */
function createMockContext() {
  const ops: Op[] = [];

  const ctx = {
    strokeStyle: '',
    lineWidth: 0,
    fillStyle: '',
    font: '',
    textAlign: '',
    canvas: { width: 640, height: 480 },
    clearRect: vi.fn(() => {
      ops.push({ kind: 'clearRect' });
    }),
    beginPath: vi.fn(() => {
      ops.push({ kind: 'beginPath' });
    }),
    moveTo: vi.fn((x: number, y: number) => {
      ops.push({
        kind: 'moveTo',
        args: [x, y],
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
        fillStyle: ctx.fillStyle,
      });
    }),
    lineTo: vi.fn((x: number, y: number) => {
      ops.push({
        kind: 'lineTo',
        args: [x, y],
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
        fillStyle: ctx.fillStyle,
      });
    }),
    arc: vi.fn((x: number, y: number, r: number, a: number, b: number) => {
      ops.push({
        kind: 'arc',
        args: [x, y, r, a, b],
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
        fillStyle: ctx.fillStyle,
      });
    }),
    stroke: vi.fn(() => {
      ops.push({ kind: 'stroke' });
    }),
    fill: vi.fn(() => {
      ops.push({ kind: 'fill' });
    }),
    fillText: vi.fn((text: string, x: number, y: number) => {
      ops.push({
        kind: 'fillText',
        text,
        x,
        y,
        fillStyle: ctx.fillStyle,
      });
    }),
  };

  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

/** Create a fake HTMLCanvasElement whose getContext('2d') returns the mock ctx. */
function createMockCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  return {
    width: 640,
    height: 480,
    getContext: vi.fn(() => ctx),
    style: {} as CSSStyleDeclaration,
  } as unknown as HTMLCanvasElement;
}

/** A keypoint with high confidence by default. */
function kp(x: number, y: number, score = 0.9): PoseKeypoint {
  return { x, y, score, visibility: score };
}

/** Build a real Skeleton from named MediaPipe keypoint overrides. */
function createMediaPipeSkeleton(
  overrides: Partial<Record<string, PoseKeypoint>>
): Skeleton {
  const keypoints: (PoseKeypoint | undefined)[] = new Array(33);
  const nameToIndex: Record<string, number> = {
    nose: MediaPipeBodyParts.NOSE,
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
  return new Skeleton(keypoints as PoseKeypoint[], 0, true, 0);
}

/**
 * Group the chronological `ops` stream into subpaths delimited by `beginPath`.
 * Each group captures the path ops (moveTo/lineTo/arc) and the strokes/fills
 * issued before the next beginPath, along with the strokeStyle active on the
 * FIRST path op of the group (the renderer sets style right after beginPath).
 */
type Subpath = {
  strokeStyle: string;
  lineWidth: number;
  pathOps: Extract<Op, { kind: 'moveTo' | 'lineTo' | 'arc' }>[];
  hasStroke: boolean;
  hasFill: boolean;
};

function groupSubpaths(ops: Op[]): Subpath[] {
  const groups: Subpath[] = [];
  let current: Subpath | null = null;
  for (const op of ops) {
    if (op.kind === 'beginPath') {
      if (current) groups.push(current);
      current = {
        strokeStyle: '',
        lineWidth: 0,
        pathOps: [],
        hasStroke: false,
        hasFill: false,
      };
    } else if (op.kind === 'stroke') {
      if (current) current.hasStroke = true;
    } else if (op.kind === 'fill') {
      if (current) current.hasFill = true;
    } else if (
      op.kind === 'moveTo' ||
      op.kind === 'lineTo' ||
      op.kind === 'arc'
    ) {
      if (!current)
        current = {
          strokeStyle: '',
          lineWidth: 0,
          pathOps: [],
          hasStroke: false,
          hasFill: false,
        };
      if (current.pathOps.length === 0) {
        current.strokeStyle = op.strokeStyle;
        current.lineWidth = op.lineWidth;
      }
      current.pathOps.push(op);
    }
  }
  if (current) groups.push(current);
  return groups;
}

/** The yellow arm vector subpath (strokeStyle '#ffff00', lineWidth 5, has a lineTo + stroke). */
function getYellowArmVector(ops: Op[]): {
  moveTo: number[];
  lineTo: number[];
} {
  const arm = groupSubpaths(ops).find(
    (g) => g.strokeStyle === '#ffff00' && g.lineWidth === 5 && g.hasStroke
  );
  if (!arm) {
    throw new Error('a yellow arm vector subpath was drawn');
  }
  const moveTos = arm.pathOps.filter((o) => o.kind === 'moveTo');
  const lineTos = arm.pathOps.filter((o) => o.kind === 'lineTo');
  expect(moveTos.length, 'exactly one moveTo in the arm vector').toBe(1);
  expect(lineTos.length, 'exactly one lineTo in the arm vector').toBe(1);
  return { moveTo: moveTos[0].args, lineTo: lineTos[0].args };
}

/** The overlay's angle-label fillText (pure "<number>°" text). */
function getAngleLabelOps(ops: Op[]) {
  return ops.filter(
    (o): o is Extract<Op, { kind: 'fillText' }> =>
      o.kind === 'fillText' && /^-?\d+(\.\d+)?°$/.test(o.text)
  );
}

/** Render a skeleton and return the recorded canvas ops. */
function renderAndGetOps(skeleton: Skeleton) {
  const { ctx, ops } = createMockContext();
  const canvas = createMockCanvas(ctx);
  const renderer = new SkeletonRenderer(canvas);
  // Use a large timestamp so showBodyParts labels are OFF (lastLabelTimestamp
  // is 0; 10000 - 0 < 500 is false) and the only fillText calls come from
  // visualizeArmToVerticalAngle ('Vertical', 'Shoulder', 'Elbow', '<angle>°').
  renderer.renderSkeleton(skeleton, 10000);
  return { ops };
}

describe('SkeletonRenderer — arm-to-vertical overlay', () => {
  describe('renderSkeleton arm-to-vertical angle label', () => {
    it('labels the overlay with the drawn (right) arm angle, not the auto most-vertical (left) arm angle', () => {
      // Bug-report reproduction pose: right arm horizontal (+90°),
      // left arm straight down (0°). Auto heuristic picks left (more
      // vertical); the drawn vector is always the right arm. The label
      // must therefore come from getArmToVerticalAngle('right') -> 90°.
      const rightShoulder = kp(100, 100);
      const rightElbow = kp(200, 100); // horizontal -> +90° from vertical
      const leftShoulder = kp(300, 100);
      const leftElbow = kp(300, 200); // straight down -> 0° from vertical

      const skeleton = createMediaPipeSkeleton({
        rightShoulder,
        rightElbow,
        leftShoulder,
        leftElbow,
      });

      // Sanity: the two selection strategies genuinely diverge here.
      expect(skeleton.getArmToVerticalAngle()).toBeCloseTo(0, 0); // auto -> left
      expect(skeleton.getArmToVerticalAngle('right')).toBeCloseTo(90, 0); // right

      const { ops } = renderAndGetOps(skeleton);

      // The overlay angle label must be the right arm's angle (90.0°),
      // NOT the left auto angle (0.0°).
      const labels = getAngleLabelOps(ops);
      expect(labels.length, 'exactly one overlay angle label').toBe(1);
      expect(labels[0].text).toBe('90.0°');
      expect(labels[0].text).not.toBe('0.0°');

      // The label is positioned at the drawn right-arm vector origin:
      // (shoulder.x - 20, shoulder.y - 10).
      expect(labels[0].x).toBe(rightShoulder.x - 20);
      expect(labels[0].y).toBe(rightShoulder.y - 10);

      // The drawn yellow arm vector must be the right arm
      // (shoulder -> elbow), matching the labeled angle's arm.
      const arm = getYellowArmVector(ops);
      expect(arm.moveTo).toEqual([rightShoulder.x, rightShoulder.y]);
      expect(arm.lineTo).toEqual([rightElbow.x, rightElbow.y]);
      expect(arm.lineTo).not.toEqual([leftElbow.x, leftElbow.y]);
    });

    it('falls back to the left arm for BOTH the vector and the angle when right-arm keypoints are entirely absent (no mismatch)', () => {
      // With no right shoulder/elbow, visualizeArmToVerticalAngle draws the
      // left arm (rightShoulder || leftShoulder). getArmToVerticalAngle('right')
      // falls through to the left-arm fallback (Strategy 3), so the label is
      // the left arm's angle -> vector and label still refer to the same arm.
      const leftShoulder = kp(300, 100);
      const leftElbow = kp(300, 200); // straight down -> 0°

      const skeleton = createMediaPipeSkeleton({
        leftShoulder,
        leftElbow,
      });

      expect(skeleton.getArmToVerticalAngle('right')).toBeCloseTo(0, 0); // left fallback

      const { ops } = renderAndGetOps(skeleton);

      const labels = getAngleLabelOps(ops);
      expect(labels.length).toBe(1);
      expect(labels[0].text).toBe('0.0°');

      // The drawn arm vector is the LEFT arm (right keypoints absent).
      const arm = getYellowArmVector(ops);
      expect(arm.moveTo).toEqual([leftShoulder.x, leftShoulder.y]);
      expect(arm.lineTo).toEqual([leftElbow.x, leftElbow.y]);
    });
  });
});
