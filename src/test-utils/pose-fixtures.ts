/**
 * Pose Fixtures for Unit Tests
 *
 * Creates synthetic pose data for testing swing analysis.
 * Mirrors the E2E fixtures but for use in unit tests.
 * Uses MediaPipe 33-keypoint format.
 */

import type { PoseKeypoint } from '../types';
import { MediaPipeBodyParts } from '../types';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';

/**
 * MediaPipe keypoint indices (33-point format)
 */
export const KEYPOINT_INDICES = MediaPipeBodyParts;

/**
 * Swing phases
 */
export enum SwingPhase {
  TOP = 'top',
  CONNECT = 'connect',
  BOTTOM = 'bottom',
  RELEASE = 'release',
}

/**
 * Create base keypoints for a standing person (640x480 video)
 * MediaPipe 33-keypoint format
 */
function createBaseKeypoints(): PoseKeypoint[] {
  // Create 33-element array for MediaPipe format
  const kp: PoseKeypoint[] = new Array(33).fill(null).map(() => ({
    x: 0,
    y: 0,
    score: 0.5,
    visibility: 0.5,
  }));

  // Face keypoints (0-10)
  kp[KEYPOINT_INDICES.NOSE] = { x: 320, y: 60, score: 0.95, visibility: 0.95 };
  kp[KEYPOINT_INDICES.LEFT_EYE_INNER] = {
    x: 315,
    y: 50,
    score: 0.92,
    visibility: 0.92,
  };
  kp[KEYPOINT_INDICES.LEFT_EYE] = {
    x: 310,
    y: 50,
    score: 0.92,
    visibility: 0.92,
  };
  kp[KEYPOINT_INDICES.LEFT_EYE_OUTER] = {
    x: 305,
    y: 50,
    score: 0.92,
    visibility: 0.92,
  };
  kp[KEYPOINT_INDICES.RIGHT_EYE_INNER] = {
    x: 325,
    y: 50,
    score: 0.92,
    visibility: 0.92,
  };
  kp[KEYPOINT_INDICES.RIGHT_EYE] = {
    x: 330,
    y: 50,
    score: 0.92,
    visibility: 0.92,
  };
  kp[KEYPOINT_INDICES.RIGHT_EYE_OUTER] = {
    x: 335,
    y: 50,
    score: 0.92,
    visibility: 0.92,
  };
  kp[KEYPOINT_INDICES.LEFT_EAR] = {
    x: 295,
    y: 55,
    score: 0.88,
    visibility: 0.88,
  };
  kp[KEYPOINT_INDICES.RIGHT_EAR] = {
    x: 345,
    y: 55,
    score: 0.88,
    visibility: 0.88,
  };
  kp[KEYPOINT_INDICES.MOUTH_LEFT] = {
    x: 315,
    y: 70,
    score: 0.85,
    visibility: 0.85,
  };
  kp[KEYPOINT_INDICES.MOUTH_RIGHT] = {
    x: 325,
    y: 70,
    score: 0.85,
    visibility: 0.85,
  };

  // Upper body keypoints (11-22)
  kp[KEYPOINT_INDICES.LEFT_SHOULDER] = {
    x: 280,
    y: 120,
    score: 0.95,
    visibility: 0.95,
  };
  kp[KEYPOINT_INDICES.RIGHT_SHOULDER] = {
    x: 360,
    y: 120,
    score: 0.95,
    visibility: 0.95,
  };
  kp[KEYPOINT_INDICES.LEFT_ELBOW] = {
    x: 260,
    y: 200,
    score: 0.92,
    visibility: 0.92,
  };
  kp[KEYPOINT_INDICES.RIGHT_ELBOW] = {
    x: 380,
    y: 200,
    score: 0.92,
    visibility: 0.92,
  };
  kp[KEYPOINT_INDICES.LEFT_WRIST] = {
    x: 250,
    y: 280,
    score: 0.9,
    visibility: 0.9,
  };
  kp[KEYPOINT_INDICES.RIGHT_WRIST] = {
    x: 390,
    y: 280,
    score: 0.9,
    visibility: 0.9,
  };
  kp[KEYPOINT_INDICES.LEFT_PINKY] = {
    x: 245,
    y: 290,
    score: 0.85,
    visibility: 0.85,
  };
  kp[KEYPOINT_INDICES.RIGHT_PINKY] = {
    x: 395,
    y: 290,
    score: 0.85,
    visibility: 0.85,
  };
  kp[KEYPOINT_INDICES.LEFT_INDEX] = {
    x: 250,
    y: 295,
    score: 0.85,
    visibility: 0.85,
  };
  kp[KEYPOINT_INDICES.RIGHT_INDEX] = {
    x: 390,
    y: 295,
    score: 0.85,
    visibility: 0.85,
  };
  kp[KEYPOINT_INDICES.LEFT_THUMB] = {
    x: 255,
    y: 285,
    score: 0.85,
    visibility: 0.85,
  };
  kp[KEYPOINT_INDICES.RIGHT_THUMB] = {
    x: 385,
    y: 285,
    score: 0.85,
    visibility: 0.85,
  };

  // Lower body keypoints (23-32)
  kp[KEYPOINT_INDICES.LEFT_HIP] = {
    x: 290,
    y: 280,
    score: 0.95,
    visibility: 0.95,
  };
  kp[KEYPOINT_INDICES.RIGHT_HIP] = {
    x: 350,
    y: 280,
    score: 0.95,
    visibility: 0.95,
  };
  kp[KEYPOINT_INDICES.LEFT_KNEE] = {
    x: 285,
    y: 380,
    score: 0.93,
    visibility: 0.93,
  };
  kp[KEYPOINT_INDICES.RIGHT_KNEE] = {
    x: 355,
    y: 380,
    score: 0.93,
    visibility: 0.93,
  };
  kp[KEYPOINT_INDICES.LEFT_ANKLE] = {
    x: 280,
    y: 470,
    score: 0.91,
    visibility: 0.91,
  };
  kp[KEYPOINT_INDICES.RIGHT_ANKLE] = {
    x: 360,
    y: 470,
    score: 0.91,
    visibility: 0.91,
  };
  kp[KEYPOINT_INDICES.LEFT_HEEL] = {
    x: 275,
    y: 475,
    score: 0.88,
    visibility: 0.88,
  };
  kp[KEYPOINT_INDICES.RIGHT_HEEL] = {
    x: 365,
    y: 475,
    score: 0.88,
    visibility: 0.88,
  };
  kp[KEYPOINT_INDICES.LEFT_FOOT_INDEX] = {
    x: 270,
    y: 480,
    score: 0.88,
    visibility: 0.88,
  };
  kp[KEYPOINT_INDICES.RIGHT_FOOT_INDEX] = {
    x: 370,
    y: 480,
    score: 0.88,
    visibility: 0.88,
  };

  return kp;
}

/**
 * Create keypoints for TOP position (upright, arms down)
 */
export function createTopKeypoints(): PoseKeypoint[] {
  const kp = createBaseKeypoints();

  // Upright torso
  kp[KEYPOINT_INDICES.NOSE] = { x: 320, y: 50, score: 0.95 };
  kp[KEYPOINT_INDICES.LEFT_SHOULDER] = { x: 280, y: 110, score: 0.95 };
  kp[KEYPOINT_INDICES.RIGHT_SHOULDER] = { x: 360, y: 110, score: 0.95 };

  // Arms hanging down, slightly forward
  kp[KEYPOINT_INDICES.LEFT_ELBOW] = { x: 275, y: 180, score: 0.92 };
  kp[KEYPOINT_INDICES.RIGHT_ELBOW] = { x: 365, y: 180, score: 0.92 };
  kp[KEYPOINT_INDICES.LEFT_WRIST] = { x: 270, y: 250, score: 0.9 };
  kp[KEYPOINT_INDICES.RIGHT_WRIST] = { x: 370, y: 250, score: 0.9 };

  // Hips at standing position
  kp[KEYPOINT_INDICES.LEFT_HIP] = { x: 290, y: 270, score: 0.95 };
  kp[KEYPOINT_INDICES.RIGHT_HIP] = { x: 350, y: 270, score: 0.95 };

  return kp;
}

/**
 * Create keypoints for CONNECT position (arms close to torso, slight lean)
 */
export function createConnectKeypoints(): PoseKeypoint[] {
  const kp = createBaseKeypoints();

  // Slight forward lean
  kp[KEYPOINT_INDICES.NOSE] = { x: 325, y: 70, score: 0.95 };
  kp[KEYPOINT_INDICES.LEFT_SHOULDER] = { x: 285, y: 130, score: 0.95 };
  kp[KEYPOINT_INDICES.RIGHT_SHOULDER] = { x: 365, y: 130, score: 0.95 };

  // Arms tucked close to body
  kp[KEYPOINT_INDICES.LEFT_ELBOW] = { x: 300, y: 180, score: 0.92 };
  kp[KEYPOINT_INDICES.RIGHT_ELBOW] = { x: 350, y: 180, score: 0.92 };
  kp[KEYPOINT_INDICES.LEFT_WRIST] = { x: 310, y: 230, score: 0.9 };
  kp[KEYPOINT_INDICES.RIGHT_WRIST] = { x: 340, y: 230, score: 0.9 };

  // Hips slightly back
  kp[KEYPOINT_INDICES.LEFT_HIP] = { x: 285, y: 275, score: 0.95 };
  kp[KEYPOINT_INDICES.RIGHT_HIP] = { x: 345, y: 275, score: 0.95 };

  return kp;
}

/**
 * Create keypoints for BOTTOM position (bent over, deep hinge)
 */
export function createBottomKeypoints(): PoseKeypoint[] {
  const kp = createBaseKeypoints();

  // Bent forward significantly
  kp[KEYPOINT_INDICES.NOSE] = { x: 350, y: 150, score: 0.93 };
  kp[KEYPOINT_INDICES.LEFT_SHOULDER] = { x: 300, y: 180, score: 0.94 };
  kp[KEYPOINT_INDICES.RIGHT_SHOULDER] = { x: 380, y: 180, score: 0.94 };

  // Arms reaching down
  kp[KEYPOINT_INDICES.LEFT_ELBOW] = { x: 310, y: 260, score: 0.91 };
  kp[KEYPOINT_INDICES.RIGHT_ELBOW] = { x: 370, y: 260, score: 0.91 };
  kp[KEYPOINT_INDICES.LEFT_WRIST] = { x: 320, y: 330, score: 0.88 };
  kp[KEYPOINT_INDICES.RIGHT_WRIST] = { x: 360, y: 330, score: 0.88 };

  // Hips pushed back
  kp[KEYPOINT_INDICES.LEFT_HIP] = { x: 270, y: 280, score: 0.95 };
  kp[KEYPOINT_INDICES.RIGHT_HIP] = { x: 330, y: 280, score: 0.95 };

  // Knees slightly bent
  kp[KEYPOINT_INDICES.LEFT_KNEE] = { x: 275, y: 370, score: 0.93 };
  kp[KEYPOINT_INDICES.RIGHT_KNEE] = { x: 345, y: 370, score: 0.93 };

  return kp;
}

/**
 * Create keypoints for RELEASE position (arms extended outward)
 */
export function createReleaseKeypoints(): PoseKeypoint[] {
  const kp = createBaseKeypoints();

  // Coming back up, slight forward lean
  kp[KEYPOINT_INDICES.NOSE] = { x: 330, y: 80, score: 0.95 };
  kp[KEYPOINT_INDICES.LEFT_SHOULDER] = { x: 285, y: 125, score: 0.95 };
  kp[KEYPOINT_INDICES.RIGHT_SHOULDER] = { x: 365, y: 125, score: 0.95 };

  // Arms extended outward/forward
  kp[KEYPOINT_INDICES.LEFT_ELBOW] = { x: 240, y: 150, score: 0.92 };
  kp[KEYPOINT_INDICES.RIGHT_ELBOW] = { x: 400, y: 150, score: 0.92 };
  kp[KEYPOINT_INDICES.LEFT_WRIST] = { x: 200, y: 130, score: 0.9 };
  kp[KEYPOINT_INDICES.RIGHT_WRIST] = { x: 440, y: 130, score: 0.9 };

  // Hips straightening
  kp[KEYPOINT_INDICES.LEFT_HIP] = { x: 288, y: 272, score: 0.95 };
  kp[KEYPOINT_INDICES.RIGHT_HIP] = { x: 348, y: 272, score: 0.95 };

  return kp;
}

/**
 * Get keypoints for a specific swing phase
 */
export function getKeypointsForPhase(phase: SwingPhase): PoseKeypoint[] {
  switch (phase) {
    case SwingPhase.TOP:
      return createTopKeypoints();
    case SwingPhase.CONNECT:
      return createConnectKeypoints();
    case SwingPhase.BOTTOM:
      return createBottomKeypoints();
    case SwingPhase.RELEASE:
      return createReleaseKeypoints();
  }
}

/**
 * Interpolate between two keypoint sets
 */
export function interpolateKeypoints(
  from: PoseKeypoint[],
  to: PoseKeypoint[],
  t: number // 0 to 1
): PoseKeypoint[] {
  return from.map((kp, i) => ({
    x: kp.x + (to[i].x - kp.x) * t,
    y: kp.y + (to[i].y - kp.y) * t,
    score:
      Math.min(kp.score ?? 0.9, to[i].score ?? 0.9) - Math.abs(t - 0.5) * 0.1,
  }));
}

/**
 * Create a single rep sequence (Top -> Connect -> Bottom -> Release -> Top)
 * Returns frames with interpolation for smooth transitions
 */
export function createRepSequence(
  framesPerPhase: number = 8
): PoseTrackFrame[] {
  const frames: PoseTrackFrame[] = [];
  const fps = 30;
  const phases = [
    SwingPhase.TOP,
    SwingPhase.CONNECT,
    SwingPhase.BOTTOM,
    SwingPhase.RELEASE,
    SwingPhase.TOP,
  ];

  let frameIndex = 0;

  for (let i = 0; i < phases.length - 1; i++) {
    const fromKeypoints = getKeypointsForPhase(phases[i]);
    const toKeypoints = getKeypointsForPhase(phases[i + 1]);

    for (let j = 0; j < framesPerPhase; j++) {
      const t = j / framesPerPhase;
      const keypoints = interpolateKeypoints(fromKeypoints, toKeypoints, t);

      frames.push({
        frameIndex,
        timestamp: Math.round((frameIndex / fps) * 1000),
        videoTime: frameIndex / fps,
        keypoints,
        score: 0.9,
      });

      frameIndex++;
    }
  }

  return frames;
}

/**
 * Create a PoseTrackFile with multiple reps
 */
export function createPoseTrackWithReps(
  repCount: number,
  options: {
    videoHash?: string;
    videoName?: string;
    framesPerPhase?: number;
  } = {}
): PoseTrackFile {
  const {
    videoHash = 'a'.repeat(64),
    videoName = 'test-video.mp4',
    framesPerPhase = 8,
  } = options;

  const frames: PoseTrackFrame[] = [];

  for (let rep = 0; rep < repCount; rep++) {
    const repFrames = createRepSequence(framesPerPhase);

    // Adjust frame indices and timestamps
    const offset = frames.length;
    for (const frame of repFrames) {
      frames.push({
        ...frame,
        frameIndex: frame.frameIndex + offset,
        timestamp: frame.timestamp + offset * (1000 / 30),
        videoTime: frame.videoTime + offset / 30,
      });
    }
  }

  const fps = 30;
  return {
    metadata: {
      version: '1.0',
      model: 'blazepose',
      modelVersion: '4.0.0',
      sourceVideoHash: videoHash,
      sourceVideoName: videoName,
      sourceVideoDuration: frames.length / fps,
      extractedAt: new Date().toISOString(),
      frameCount: frames.length,
      fps,
      videoWidth: 640,
      videoHeight: 480,
    },
    frames,
  };
}

/**
 * Create a PoseTrackFile with frames at a single phase (for testing position detection)
 */
export function createSinglePhasePoseTrack(
  phase: SwingPhase,
  frameCount: number = 10
): PoseTrackFile {
  const keypoints = getKeypointsForPhase(phase);
  const fps = 30;

  const frames: PoseTrackFrame[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push({
      frameIndex: i,
      timestamp: Math.round((i / fps) * 1000),
      videoTime: i / fps,
      keypoints: [...keypoints], // Copy to avoid mutation
      score: 0.9,
    });
  }

  return {
    metadata: {
      version: '1.0',
      model: 'blazepose',
      modelVersion: '4.0.0',
      sourceVideoHash: 'a'.repeat(64),
      sourceVideoName: `${phase}-only.mp4`,
      sourceVideoDuration: frameCount / fps,
      extractedAt: new Date().toISOString(),
      frameCount,
      fps,
      videoWidth: 640,
      videoHeight: 480,
    },
    frames,
  };
}
