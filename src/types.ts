import type { Skeleton } from './models/Skeleton';

export interface Point {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface PoseKeypoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  score?: number;
  name?: string;
}

export interface PoseResult {
  keypoints: PoseKeypoint[];
  score?: number;
}

export interface RepCounter {
  count: number;
  isConnect: boolean;
  lastConnectState: boolean;
  connectThreshold: number;
}

export enum SwingPositionName {
  Top = 'top',
  Connect = 'connect',
  Bottom = 'bottom',
  Release = 'release',
}

export interface FormCheckpoint {
  position: SwingPositionName;
  timestamp: number;
  videoTime?: number; // Video currentTime in seconds when checkpoint was captured
  image: ImageData;
  spineAngle: number;
  armToSpineAngle: number;
  armToVerticalAngle: number; // Angle between arm and vertical (0° is down, 180° is up)
  skeleton: Skeleton;
  // Enhanced biomechanics (optional for backwards compatibility)
  hipAngle?: number; // Knee-Hip-Shoulder angle (~180° standing, ~100° bottom)
  kneeAngle?: number; // Hip-Knee-Ankle angle (~180° straight, ~90° squat)
  hingeScore?: number; // -1 (squat) to +1 (hinge) movement pattern
  angularVelocity?: {
    // Degrees per second at this frame
    spine: number;
    hip: number;
  };
}

/**
 * Form quality assessment for a rep or session
 */
export interface FormQualityMetrics {
  hingeScore: number; // -1 (squat pattern) to +1 (hinge pattern)
  powerScore: number; // 0-100, based on hip extension velocity
  consistencyScore: number; // 0-100, rep-to-rep variation
  lockoutScore: number; // 0-100, quality of top position
  depthScore: number; // 0-100, quality of bottom position
  overallScore: number; // 0-100, weighted composite
}

export interface RepData {
  repNumber: number;
  checkpoints: Map<SwingPositionName, FormCheckpoint>;
}

export interface AppState {
  isModelLoaded: boolean;
  isProcessing: boolean;
  usingCamera: boolean;
  cameraMode: 'environment' | 'user'; // Track which camera is active (environment = back camera, user = front camera)
  displayMode: 'both' | 'video' | 'overlay'; // Track the current display mode
  repCounter: RepCounter;
  showBodyParts: boolean;
  bodyPartDisplayTime: number; // in seconds
  currentRepIndex: number; // Index of the current rep being viewed
}

// COCO keypoint mapping used by MoveNet and PoseNet models
export const CocoBodyParts = {
  NOSE: 0,
  LEFT_EYE: 1,
  RIGHT_EYE: 2,
  LEFT_EAR: 3,
  RIGHT_EAR: 4,
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
  LEFT_HIP: 11,
  RIGHT_HIP: 12,
  LEFT_KNEE: 13,
  RIGHT_KNEE: 14,
  LEFT_ANKLE: 15,
  RIGHT_ANKLE: 16,
};

// MediaPipe BlazePose mapping (33 keypoints)
export const MediaPipeBodyParts = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};
