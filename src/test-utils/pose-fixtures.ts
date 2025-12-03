/**
 * Pose Fixtures for Unit Tests
 *
 * Creates synthetic pose data for testing swing analysis.
 * Mirrors the E2E fixtures but for use in unit tests.
 */

import type { PoseKeypoint } from '../types';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';

/**
 * COCO keypoint indices
 */
export const KEYPOINT_INDICES = {
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
} as const;

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
 */
function createBaseKeypoints(): PoseKeypoint[] {
  return [
    { x: 320, y: 60, score: 0.95 }, // 0: nose
    { x: 310, y: 50, score: 0.92 }, // 1: left_eye
    { x: 330, y: 50, score: 0.92 }, // 2: right_eye
    { x: 295, y: 55, score: 0.88 }, // 3: left_ear
    { x: 345, y: 55, score: 0.88 }, // 4: right_ear
    { x: 280, y: 120, score: 0.95 }, // 5: left_shoulder
    { x: 360, y: 120, score: 0.95 }, // 6: right_shoulder
    { x: 260, y: 200, score: 0.92 }, // 7: left_elbow
    { x: 380, y: 200, score: 0.92 }, // 8: right_elbow
    { x: 250, y: 280, score: 0.9 }, // 9: left_wrist
    { x: 390, y: 280, score: 0.9 }, // 10: right_wrist
    { x: 290, y: 280, score: 0.95 }, // 11: left_hip
    { x: 350, y: 280, score: 0.95 }, // 12: right_hip
    { x: 285, y: 380, score: 0.93 }, // 13: left_knee
    { x: 355, y: 380, score: 0.93 }, // 14: right_knee
    { x: 280, y: 470, score: 0.91 }, // 15: left_ankle
    { x: 360, y: 470, score: 0.91 }, // 16: right_ankle
  ];
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
      model: 'movenet-lightning',
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
      model: 'movenet-lightning',
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
