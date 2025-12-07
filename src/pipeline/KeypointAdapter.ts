/**
 * KeypointAdapter - Keypoint format validation
 *
 * All pose data now uses MediaPipe BlazePose format (33 keypoints).
 * This module provides validation helpers.
 *
 * MediaPipe BlazePose keypoints (33 total):
 *   0: nose, 1-6: eyes (inner/outer), 7-8: ears, 9-10: mouth,
 *   11-12: shoulders, 13-14: elbows, 15-16: wrists,
 *   17-22: hands (pinky/index/thumb), 23-24: hips, 25-26: knees,
 *   27-28: ankles, 29-30: heels, 31-32: foot index
 */

import type { PoseKeypoint } from '../types';

/**
 * Expected keypoint count for MediaPipe BlazePose format
 */
export const MEDIAPIPE_KEYPOINT_COUNT = 33;

/**
 * Check if keypoints are in MediaPipe format (33 keypoints)
 */
export function isMediaPipeFormat(keypoints: PoseKeypoint[]): boolean {
  return keypoints.length === MEDIAPIPE_KEYPOINT_COUNT;
}

/**
 * Validate that keypoints are in MediaPipe-33 format.
 * Throws an error if the format is incorrect.
 */
export function validateMediaPipeFormat(keypoints: PoseKeypoint[]): void {
  if (!isMediaPipeFormat(keypoints)) {
    throw new Error(
      `Invalid keypoint format: expected ${MEDIAPIPE_KEYPOINT_COUNT} keypoints (MediaPipe-33), got ${keypoints.length}. ` +
        `Legacy COCO-17 format is no longer supported. Please regenerate pose data with BlazePose-33 format.`
    );
  }
}

/**
 * Normalize keypoints - now just validates MediaPipe format.
 * @deprecated Use validateMediaPipeFormat instead. This function is kept for backwards compatibility.
 */
export function normalizeToMediaPipeFormat(
  keypoints: PoseKeypoint[]
): PoseKeypoint[] {
  if (isMediaPipeFormat(keypoints)) {
    return keypoints;
  }

  // Log warning for legacy data
  console.error(
    `KeypointAdapter: Legacy keypoint format detected (${keypoints.length} keypoints). ` +
      `Only MediaPipe-33 format is supported. Please regenerate pose data.`
  );

  // Return as-is but this will likely cause issues downstream
  return keypoints;
}
