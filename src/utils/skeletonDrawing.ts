/**
 * Shared skeleton drawing utility
 *
 * Extracts skeleton rendering logic that can be shared between:
 * - SkeletonRenderer (main canvas rendering)
 * - SwingFormProcessor (thumbnail overlay rendering)
 */

import type { PoseKeypoint } from '../types';
import { CocoBodyParts } from '../types';

/**
 * Options for skeleton drawing
 */
export interface SkeletonDrawOptions {
  /** Radius of keypoint circles */
  keypointRadius?: number;
  /** Width of connection lines */
  lineWidth?: number;
  /** Color for keypoints */
  keypointColor?: string;
  /** Color for connection lines */
  connectionColor?: string;
  /** Color for spine line */
  spineColor?: string;
  /** Minimum confidence score to draw a keypoint */
  minConfidence?: number;
}

const DEFAULT_OPTIONS: Required<SkeletonDrawOptions> = {
  keypointRadius: 4,
  lineWidth: 2,
  keypointColor: '#00ff00',
  connectionColor: '#ffffff',
  spineColor: '#ff0000',
  minConfidence: 0.2,
};

/**
 * Standard COCO body part connections
 */
const BODY_CONNECTIONS: [number, number][] = [
  // Torso
  [CocoBodyParts.LEFT_SHOULDER, CocoBodyParts.RIGHT_SHOULDER],
  [CocoBodyParts.LEFT_SHOULDER, CocoBodyParts.LEFT_HIP],
  [CocoBodyParts.RIGHT_SHOULDER, CocoBodyParts.RIGHT_HIP],
  [CocoBodyParts.LEFT_HIP, CocoBodyParts.RIGHT_HIP],
  // Arms
  [CocoBodyParts.LEFT_SHOULDER, CocoBodyParts.LEFT_ELBOW],
  [CocoBodyParts.LEFT_ELBOW, CocoBodyParts.LEFT_WRIST],
  [CocoBodyParts.RIGHT_SHOULDER, CocoBodyParts.RIGHT_ELBOW],
  [CocoBodyParts.RIGHT_ELBOW, CocoBodyParts.RIGHT_WRIST],
  // Legs
  [CocoBodyParts.LEFT_HIP, CocoBodyParts.LEFT_KNEE],
  [CocoBodyParts.LEFT_KNEE, CocoBodyParts.LEFT_ANKLE],
  [CocoBodyParts.RIGHT_HIP, CocoBodyParts.RIGHT_KNEE],
  [CocoBodyParts.RIGHT_KNEE, CocoBodyParts.RIGHT_ANKLE],
  // Face
  [CocoBodyParts.LEFT_EYE, CocoBodyParts.RIGHT_EYE],
  [CocoBodyParts.NOSE, CocoBodyParts.LEFT_EYE],
  [CocoBodyParts.NOSE, CocoBodyParts.RIGHT_EYE],
  [CocoBodyParts.LEFT_EYE, CocoBodyParts.LEFT_EAR],
  [CocoBodyParts.RIGHT_EYE, CocoBodyParts.RIGHT_EAR],
];

/**
 * Check if a keypoint is visible with sufficient confidence
 */
function isPointVisible(point: PoseKeypoint | undefined, minConfidence: number): boolean {
  if (!point) return false;
  const confidence = point.score ?? point.visibility ?? 0;
  return confidence > minConfidence;
}

/**
 * Draw skeleton keypoints and connections to a canvas context
 *
 * @param ctx - Canvas 2D rendering context
 * @param keypoints - Array of pose keypoints
 * @param options - Drawing options
 */
export function drawSkeletonToContext(
  ctx: CanvasRenderingContext2D,
  keypoints: PoseKeypoint[],
  options: SkeletonDrawOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Draw spine first (so it appears behind other connections)
  drawSpine(ctx, keypoints, opts);

  // Draw body connections
  drawConnections(ctx, keypoints, opts);

  // Draw keypoints on top
  drawKeypoints(ctx, keypoints, opts);
}

/**
 * Draw the spine line (mid-shoulders to mid-hips)
 */
function drawSpine(
  ctx: CanvasRenderingContext2D,
  keypoints: PoseKeypoint[],
  opts: Required<SkeletonDrawOptions>
): void {
  const leftShoulder = keypoints[CocoBodyParts.LEFT_SHOULDER];
  const rightShoulder = keypoints[CocoBodyParts.RIGHT_SHOULDER];
  const leftHip = keypoints[CocoBodyParts.LEFT_HIP];
  const rightHip = keypoints[CocoBodyParts.RIGHT_HIP];

  if (
    !isPointVisible(leftShoulder, opts.minConfidence) ||
    !isPointVisible(rightShoulder, opts.minConfidence) ||
    !isPointVisible(leftHip, opts.minConfidence) ||
    !isPointVisible(rightHip, opts.minConfidence)
  ) {
    return;
  }

  // Calculate midpoints
  const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const midHipX = (leftHip.x + rightHip.x) / 2;
  const midHipY = (leftHip.y + rightHip.y) / 2;

  // Draw spine line
  ctx.beginPath();
  ctx.strokeStyle = opts.spineColor;
  ctx.lineWidth = opts.lineWidth + 1; // Slightly thicker for emphasis
  ctx.moveTo(midShoulderX, midShoulderY);
  ctx.lineTo(midHipX, midHipY);
  ctx.stroke();
}

/**
 * Draw body part connections
 */
function drawConnections(
  ctx: CanvasRenderingContext2D,
  keypoints: PoseKeypoint[],
  opts: Required<SkeletonDrawOptions>
): void {
  ctx.beginPath();
  ctx.strokeStyle = opts.connectionColor;
  ctx.lineWidth = opts.lineWidth;

  for (const [i, j] of BODY_CONNECTIONS) {
    const pointA = keypoints[i];
    const pointB = keypoints[j];

    if (isPointVisible(pointA, opts.minConfidence) && isPointVisible(pointB, opts.minConfidence)) {
      ctx.moveTo(pointA.x, pointA.y);
      ctx.lineTo(pointB.x, pointB.y);
    }
  }

  ctx.stroke();
}

/**
 * Draw keypoint circles
 */
function drawKeypoints(
  ctx: CanvasRenderingContext2D,
  keypoints: PoseKeypoint[],
  opts: Required<SkeletonDrawOptions>
): void {
  ctx.fillStyle = opts.keypointColor;

  for (const point of keypoints) {
    if (isPointVisible(point, opts.minConfidence)) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, opts.keypointRadius, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}

/**
 * Get the standard body connections for external use
 */
export function getBodyConnections(): readonly [number, number][] {
  return BODY_CONNECTIONS;
}
