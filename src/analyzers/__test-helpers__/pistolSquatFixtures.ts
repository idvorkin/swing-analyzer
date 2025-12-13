/**
 * Phase angle fixtures for pistol squat tests.
 *
 * Working leg = left (bends), Extended leg = right (stays straight)
 *
 * Thresholds:
 * - standingKneeMin: 150 (nearly straight)
 * - standingSpineMax: 25 (upright)
 * - bottomKneeMax: 80 (deep squat)
 * - bottomHipMax: 100 (hip flexed)
 * - descendingKneeThreshold: 140 (start descending)
 * - ascendingKneeThreshold: 90 (start ascending)
 *
 * Ear Y values for ear-based trough detection:
 * - Higher ear Y = person is lower (image Y coords: 0 is top, higher is lower on screen)
 * - Standing: earY ~200 (person tall, ear near top of frame)
 * - Bottom: earY ~500 (person squatting, ear near bottom of frame)
 */

import type { PistolSquatSkeletonAngles } from './mockSkeleton';

export const PISTOL_SQUAT_PHASE_ANGLES: Record<
  string,
  PistolSquatSkeletonAngles
> = {
  standing: {
    leftKnee: 170, // Working leg straight
    rightKnee: 175, // Extended leg straight
    leftHip: 170, // Working hip extended
    rightHip: 170, // Extended hip extended
    spine: 10, // Upright
    earY: 200, // Person standing tall - ear near top
  },
  descending: {
    leftKnee: 130, // Working leg bending
    rightKnee: 175, // Extended leg stays straight
    leftHip: 140, // Working hip starting to flex
    rightHip: 170, // Extended hip
    spine: 20, // Slight forward lean
    earY: 300, // Person going down - ear moving lower
  },
  // Mid-descent - for gradual transition
  descendingDeep: {
    leftKnee: 90, // Deeper into descent
    rightKnee: 175,
    leftHip: 110,
    rightHip: 170,
    spine: 28,
    earY: 400, // Person going deeper
  },
  bottom: {
    leftKnee: 60, // Working leg deep squat (the trough)
    rightKnee: 170, // Extended leg straight
    leftHip: 80, // Working hip deeply flexed
    rightHip: 160, // Extended hip
    spine: 35, // Forward lean for balance
    earY: 500, // DEEPEST POINT - ear at lowest (highest Y)
  },
  // Transitional frames - ear Y DECREASING to confirm trough (person rising)
  bottomRising1: {
    leftKnee: 65, // Rising +5
    rightKnee: 170,
    leftHip: 82,
    rightHip: 160,
    spine: 34,
    earY: 490, // Rising - ear Y decreasing
  },
  bottomRising2: {
    leftKnee: 72, // Rising +7 more
    rightKnee: 170,
    leftHip: 85,
    rightHip: 160,
    spine: 33,
    earY: 480, // Rising more
  },
  bottomRising3: {
    leftKnee: 80, // Rising +8 more (confirms trough)
    rightKnee: 170,
    leftHip: 88,
    rightHip: 160,
    spine: 32,
    earY: 470, // Rising - confirms bottom was at earY 500
  },
  ascending: {
    leftKnee: 100, // Working leg rising
    rightKnee: 175, // Extended leg straight
    leftHip: 120, // Working hip extending
    rightHip: 170, // Extended hip
    spine: 25, // Returning upright
    earY: 350, // 50% point on the way back up
  },
};
