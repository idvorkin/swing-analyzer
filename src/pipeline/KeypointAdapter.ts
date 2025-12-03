/**
 * KeypointAdapter - Convert between different keypoint formats
 *
 * Normalizes MediaPipe BlazePose (33 keypoints) to COCO (17 keypoints)
 * so all downstream code (Skeleton, SkeletonRenderer, etc.) works unchanged.
 *
 * MediaPipe BlazePose keypoints:
 *   0: nose, 1-6: eyes (inner/outer), 7-8: ears, 9-10: mouth,
 *   11-12: shoulders, 13-14: elbows, 15-16: wrists,
 *   17-22: hands (pinky/index/thumb), 23-24: hips, 25-26: knees,
 *   27-28: ankles, 29-30: heels, 31-32: foot index
 *
 * COCO keypoints:
 *   0: nose, 1-2: eyes, 3-4: ears, 5-6: shoulders, 7-8: elbows,
 *   9-10: wrists, 11-12: hips, 13-14: knees, 15-16: ankles
 */

import {
  CocoBodyParts,
  MediaPipeBodyParts,
  type PoseKeypoint,
} from '../types';

/**
 * Mapping from MediaPipe-33 indices to COCO-17 indices
 * Maps the subset of MediaPipe keypoints that correspond to COCO keypoints
 */
const MEDIAPIPE_TO_COCO_MAP: Array<[number, number]> = [
  [MediaPipeBodyParts.NOSE, CocoBodyParts.NOSE],
  [MediaPipeBodyParts.LEFT_EYE, CocoBodyParts.LEFT_EYE],
  [MediaPipeBodyParts.RIGHT_EYE, CocoBodyParts.RIGHT_EYE],
  [MediaPipeBodyParts.LEFT_EAR, CocoBodyParts.LEFT_EAR],
  [MediaPipeBodyParts.RIGHT_EAR, CocoBodyParts.RIGHT_EAR],
  [MediaPipeBodyParts.LEFT_SHOULDER, CocoBodyParts.LEFT_SHOULDER],
  [MediaPipeBodyParts.RIGHT_SHOULDER, CocoBodyParts.RIGHT_SHOULDER],
  [MediaPipeBodyParts.LEFT_ELBOW, CocoBodyParts.LEFT_ELBOW],
  [MediaPipeBodyParts.RIGHT_ELBOW, CocoBodyParts.RIGHT_ELBOW],
  [MediaPipeBodyParts.LEFT_WRIST, CocoBodyParts.LEFT_WRIST],
  [MediaPipeBodyParts.RIGHT_WRIST, CocoBodyParts.RIGHT_WRIST],
  [MediaPipeBodyParts.LEFT_HIP, CocoBodyParts.LEFT_HIP],
  [MediaPipeBodyParts.RIGHT_HIP, CocoBodyParts.RIGHT_HIP],
  [MediaPipeBodyParts.LEFT_KNEE, CocoBodyParts.LEFT_KNEE],
  [MediaPipeBodyParts.RIGHT_KNEE, CocoBodyParts.RIGHT_KNEE],
  [MediaPipeBodyParts.LEFT_ANKLE, CocoBodyParts.LEFT_ANKLE],
  [MediaPipeBodyParts.RIGHT_ANKLE, CocoBodyParts.RIGHT_ANKLE],
];

/**
 * Convert MediaPipe BlazePose keypoints (33) to COCO format (17)
 *
 * @param keypoints - MediaPipe format keypoints (33 points)
 * @returns COCO format keypoints (17 points)
 */
export function mediaPipeToCoco(keypoints: PoseKeypoint[]): PoseKeypoint[] {
  // Create array of 17 null keypoints
  const cocoKeypoints: PoseKeypoint[] = new Array(17);

  for (const [mpIndex, cocoIndex] of MEDIAPIPE_TO_COCO_MAP) {
    const mpKeypoint = keypoints[mpIndex];

    if (mpKeypoint) {
      cocoKeypoints[cocoIndex] = {
        x: mpKeypoint.x,
        y: mpKeypoint.y,
        z: mpKeypoint.z,
        // BlazePose uses 'visibility', normalize to 'score' for consistency
        // Keep both for backwards compatibility
        score: mpKeypoint.score ?? mpKeypoint.visibility ?? 0,
        visibility: mpKeypoint.visibility ?? mpKeypoint.score ?? 0,
        name: mpKeypoint.name,
      };
    } else {
      // Create placeholder for missing keypoints
      cocoKeypoints[cocoIndex] = {
        x: 0,
        y: 0,
        score: 0,
        visibility: 0,
      };
    }
  }

  return cocoKeypoints;
}

/**
 * Check if keypoints are in MediaPipe format (33 keypoints)
 */
export function isMediaPipeFormat(keypoints: PoseKeypoint[]): boolean {
  return keypoints.length === 33;
}

/**
 * Check if keypoints are in COCO format (17 keypoints)
 */
export function isCocoFormat(keypoints: PoseKeypoint[]): boolean {
  return keypoints.length === 17;
}

/**
 * Normalize keypoints to COCO format
 * If already COCO format, returns as-is
 * If MediaPipe format, converts to COCO
 */
export function normalizeToCocoFormat(keypoints: PoseKeypoint[]): PoseKeypoint[] {
  if (isCocoFormat(keypoints)) {
    return keypoints;
  }

  if (isMediaPipeFormat(keypoints)) {
    return mediaPipeToCoco(keypoints);
  }

  // Unknown format - return as-is with warning
  console.warn(
    `KeypointAdapter: Unknown keypoint format (${keypoints.length} keypoints), expected 17 or 33`
  );
  return keypoints;
}
