/**
 * Pose Factory - Generate synthetic pose data for E2E tests
 *
 * Creates realistic pose sequences for swing analysis testing.
 * Based on the actual swing phases: Top -> Connect -> Bottom -> Release
 */

import type { PoseKeypoint } from '../../src/types';
import type {
  PoseTrackFile,
  PoseTrackFrame,
  PoseTrackMetadata,
  PrecomputedAngles,
} from '../../src/types/posetrack';

// Video hash for swing-sample.mp4 (computed from the actual file)
// This allows fixtures to match the hardcoded sample video
export const SWING_SAMPLE_VIDEO_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * COCO keypoint indices for reference
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
 * Swing phases for rep detection
 */
export enum SwingPhase {
  TOP = 'top',
  CONNECT = 'connect',
  BOTTOM = 'bottom',
  RELEASE = 'release',
}

/**
 * Spine angle thresholds (from PoseTrackPipeline)
 */
const SPINE_ANGLES = {
  TOP: 15, // Upright position
  CONNECT: 35, // Arms connecting
  BOTTOM: 50, // Bent over
  RELEASE: 25, // Arms released
};

/**
 * Arm to vertical angle thresholds
 */
const ARM_ANGLES = {
  TOP: 160, // Arms down
  CONNECT: 40, // Arms close to body
  BOTTOM: 30, // Arms down at bottom
  RELEASE: 130, // Arms extended
};

/**
 * Create base keypoints for a standing person
 * Coordinates are in pixels (assuming 640x480 video)
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
 * Create keypoints for CONNECT position (arms close to torso)
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
 * Create keypoints for BOTTOM position (bent over)
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
 * Create keypoints for RELEASE position (arms extended)
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
 * Interpolate between two keypoint sets
 */
function interpolateKeypoints(
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
 * Calculate angles from keypoints
 */
function calculateAngles(keypoints: PoseKeypoint[]): PrecomputedAngles {
  const leftShoulder = keypoints[KEYPOINT_INDICES.LEFT_SHOULDER];
  const rightShoulder = keypoints[KEYPOINT_INDICES.RIGHT_SHOULDER];
  const leftHip = keypoints[KEYPOINT_INDICES.LEFT_HIP];
  const rightHip = keypoints[KEYPOINT_INDICES.RIGHT_HIP];
  const leftWrist = keypoints[KEYPOINT_INDICES.LEFT_WRIST];
  const rightWrist = keypoints[KEYPOINT_INDICES.RIGHT_WRIST];

  // Spine angle: angle between shoulder midpoint, hip midpoint, and vertical
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;

  const spineAngle =
    Math.atan2(hipMidX - shoulderMidX, hipMidY - shoulderMidY) *
    (180 / Math.PI);

  // Arm to vertical angle
  const wristMidX = (leftWrist.x + rightWrist.x) / 2;
  const wristMidY = (leftWrist.y + rightWrist.y) / 2;
  const armToVerticalAngle =
    Math.atan2(wristMidX - shoulderMidX, wristMidY - shoulderMidY) *
    (180 / Math.PI);

  // Arm to spine angle (simplified)
  const armToSpineAngle = Math.abs(armToVerticalAngle - spineAngle);

  return {
    spineAngle: Math.abs(spineAngle),
    armToSpineAngle,
    armToVerticalAngle: Math.abs(armToVerticalAngle),
  };
}

/**
 * Create a single frame of pose data
 */
function createFrame(
  frameIndex: number,
  fps: number,
  keypoints: PoseKeypoint[],
  score: number = 0.9
): PoseTrackFrame {
  const videoTime = frameIndex / fps;
  return {
    frameIndex,
    timestamp: Math.round(videoTime * 1000),
    videoTime,
    keypoints,
    score,
    angles: calculateAngles(keypoints),
  };
}

/**
 * Create a complete rep sequence (Top -> Connect -> Bottom -> Release -> Top)
 */
export function createRepSequence(
  startFrame: number,
  fps: number,
  framesPerPhase: number = 15
): PoseTrackFrame[] {
  const frames: PoseTrackFrame[] = [];
  const phases = [
    { from: createTopKeypoints(), to: createConnectKeypoints() },
    { from: createConnectKeypoints(), to: createBottomKeypoints() },
    { from: createBottomKeypoints(), to: createReleaseKeypoints() },
    { from: createReleaseKeypoints(), to: createTopKeypoints() },
  ];

  let frameIndex = startFrame;

  for (const phase of phases) {
    for (let i = 0; i < framesPerPhase; i++) {
      const t = i / (framesPerPhase - 1);
      const keypoints = interpolateKeypoints(phase.from, phase.to, t);
      frames.push(
        createFrame(frameIndex, fps, keypoints, 0.88 + Math.random() * 0.1)
      );
      frameIndex++;
    }
  }

  return frames;
}

/**
 * Create pose track metadata
 */
export function createMetadata(
  frameCount: number,
  fps: number = 30,
  videoHash: string = SWING_SAMPLE_VIDEO_HASH,
  videoName: string = 'swing-sample.mp4'
): PoseTrackMetadata {
  return {
    version: '1.0',
    model: 'movenet-lightning',
    modelVersion: '4.0.0',
    sourceVideoHash: videoHash,
    sourceVideoName: videoName,
    sourceVideoDuration: frameCount / fps,
    extractedAt: new Date().toISOString(),
    frameCount,
    fps,
    videoWidth: 640,
    videoHeight: 480,
  };
}

/**
 * Create a complete PoseTrackFile with specified number of reps
 */
export function createPoseTrackWithReps(
  repCount: number,
  options: {
    fps?: number;
    framesPerPhase?: number;
    videoHash?: string;
    videoName?: string;
    includePartialRep?: boolean;
  } = {}
): PoseTrackFile {
  const {
    fps = 30,
    framesPerPhase = 15,
    videoHash = SWING_SAMPLE_VIDEO_HASH,
    videoName = 'test-video.mp4',
    includePartialRep = false,
  } = options;

  const frames: PoseTrackFrame[] = [];

  // Add some initial standing frames
  const initialFrames = 10;
  for (let i = 0; i < initialFrames; i++) {
    frames.push(createFrame(i, fps, createTopKeypoints(), 0.92));
  }

  // Add complete reps
  for (let rep = 0; rep < repCount; rep++) {
    const repFrames = createRepSequence(frames.length, fps, framesPerPhase);
    frames.push(...repFrames);
  }

  // Optionally add a partial rep (just Top -> Connect -> Bottom, no Release)
  if (includePartialRep) {
    const partialPhases = [
      { from: createTopKeypoints(), to: createConnectKeypoints() },
      { from: createConnectKeypoints(), to: createBottomKeypoints() },
    ];

    for (const phase of partialPhases) {
      for (let i = 0; i < framesPerPhase; i++) {
        const t = i / (framesPerPhase - 1);
        const keypoints = interpolateKeypoints(phase.from, phase.to, t);
        frames.push(createFrame(frames.length, fps, keypoints, 0.88));
      }
    }
  }

  // Add some ending standing frames
  const endFrames = 5;
  for (let i = 0; i < endFrames; i++) {
    frames.push(createFrame(frames.length, fps, createTopKeypoints(), 0.91));
  }

  return {
    metadata: createMetadata(frames.length, fps, videoHash, videoName),
    frames,
  };
}

/**
 * Create a pose track with poor detection quality (low scores)
 */
export function createPoorDetectionPoseTrack(
  frameCount: number = 60
): PoseTrackFile {
  const fps = 30;
  const frames: PoseTrackFrame[] = [];

  for (let i = 0; i < frameCount; i++) {
    // Random low confidence scores
    const score = 0.3 + Math.random() * 0.3;
    const kp = createBaseKeypoints().map((k) => ({
      ...k,
      score: 0.2 + Math.random() * 0.4,
      // Add some noise to positions
      x: k.x + (Math.random() - 0.5) * 50,
      y: k.y + (Math.random() - 0.5) * 50,
    }));

    // Some frames have no detection at all
    const keypoints = Math.random() > 0.2 ? kp : [];

    frames.push({
      frameIndex: i,
      timestamp: Math.round((i / fps) * 1000),
      videoTime: i / fps,
      keypoints,
      score: keypoints.length > 0 ? score : 0,
    });
  }

  return {
    metadata: createMetadata(
      frameCount,
      fps,
      SWING_SAMPLE_VIDEO_HASH,
      'poor-detection.mp4'
    ),
    frames,
  };
}

/**
 * Create a pose track with only a specific phase (for checkpoint testing)
 */
export function createSinglePhasePoseTrack(
  phase: SwingPhase,
  frameCount: number = 30
): PoseTrackFile {
  const fps = 30;
  const frames: PoseTrackFrame[] = [];

  const keypointCreators = {
    [SwingPhase.TOP]: createTopKeypoints,
    [SwingPhase.CONNECT]: createConnectKeypoints,
    [SwingPhase.BOTTOM]: createBottomKeypoints,
    [SwingPhase.RELEASE]: createReleaseKeypoints,
  };

  const createKeypoints = keypointCreators[phase];

  for (let i = 0; i < frameCount; i++) {
    frames.push(createFrame(i, fps, createKeypoints(), 0.92));
  }

  return {
    metadata: createMetadata(
      frameCount,
      fps,
      SWING_SAMPLE_VIDEO_HASH,
      `${phase}-only.mp4`
    ),
    frames,
  };
}
