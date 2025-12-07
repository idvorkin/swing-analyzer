/**
 * Integration tests for KettlebellSwingFormAnalyzer using real posetrack data.
 *
 * These tests verify that the analyzer produces consistent results when:
 * 1. Processing the same video in normal and mirrored orientations
 * 2. Detecting the correct number of reps from known videos
 *
 * This complements the unit tests which use mock skeletons.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { KettlebellSwingFormAnalyzer } from './KettlebellSwingFormAnalyzer';
import { Skeleton } from '../models/Skeleton';
import { MediaPipeBodyParts, type PoseKeypoint } from '../types';

// MediaPipe left/right pairs to swap when mirroring
const LEFT_RIGHT_PAIRS: [number, number][] = [
  [MediaPipeBodyParts.LEFT_EYE, MediaPipeBodyParts.RIGHT_EYE],
  [MediaPipeBodyParts.LEFT_EYE_INNER, MediaPipeBodyParts.RIGHT_EYE_INNER],
  [MediaPipeBodyParts.LEFT_EYE_OUTER, MediaPipeBodyParts.RIGHT_EYE_OUTER],
  [MediaPipeBodyParts.LEFT_EAR, MediaPipeBodyParts.RIGHT_EAR],
  [MediaPipeBodyParts.LEFT_SHOULDER, MediaPipeBodyParts.RIGHT_SHOULDER],
  [MediaPipeBodyParts.LEFT_ELBOW, MediaPipeBodyParts.RIGHT_ELBOW],
  [MediaPipeBodyParts.LEFT_WRIST, MediaPipeBodyParts.RIGHT_WRIST],
  [MediaPipeBodyParts.LEFT_PINKY, MediaPipeBodyParts.RIGHT_PINKY],
  [MediaPipeBodyParts.LEFT_INDEX, MediaPipeBodyParts.RIGHT_INDEX],
  [MediaPipeBodyParts.LEFT_THUMB, MediaPipeBodyParts.RIGHT_THUMB],
  [MediaPipeBodyParts.LEFT_HIP, MediaPipeBodyParts.RIGHT_HIP],
  [MediaPipeBodyParts.LEFT_KNEE, MediaPipeBodyParts.RIGHT_KNEE],
  [MediaPipeBodyParts.LEFT_ANKLE, MediaPipeBodyParts.RIGHT_ANKLE],
  [MediaPipeBodyParts.LEFT_HEEL, MediaPipeBodyParts.RIGHT_HEEL],
  [MediaPipeBodyParts.LEFT_FOOT_INDEX, MediaPipeBodyParts.RIGHT_FOOT_INDEX],
];

/**
 * Mirror keypoints horizontally (as if video was flipped).
 * 1. Flip X coordinates: newX = videoWidth - oldX
 * 2. Swap left/right keypoint labels
 */
function mirrorKeypoints(
  keypoints: PoseKeypoint[],
  videoWidth: number
): PoseKeypoint[] {
  // First, flip X coordinates
  const flipped = keypoints.map((kp) => ({
    ...kp,
    x: videoWidth - kp.x,
  }));

  // Then swap left/right pairs
  const mirrored = [...flipped];
  for (const [leftIdx, rightIdx] of LEFT_RIGHT_PAIRS) {
    mirrored[leftIdx] = flipped[rightIdx];
    mirrored[rightIdx] = flipped[leftIdx];
  }

  return mirrored;
}

/**
 * Calculate spine angle from keypoints (same as CachedPoseSkeletonTransformer)
 */
function calculateSpineAngle(keypoints: PoseKeypoint[]): number {
  const leftShoulder = keypoints[MediaPipeBodyParts.LEFT_SHOULDER];
  const rightShoulder = keypoints[MediaPipeBodyParts.RIGHT_SHOULDER];
  const leftHip = keypoints[MediaPipeBodyParts.LEFT_HIP];
  const rightHip = keypoints[MediaPipeBodyParts.RIGHT_HIP];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return 0;
  }

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;

  const deltaX = shoulderMidX - hipMidX;
  const deltaY = hipMidY - shoulderMidY;

  return Math.abs((Math.atan2(deltaX, deltaY) * 180) / Math.PI);
}

interface PoseTrackFrame {
  keypoints: PoseKeypoint[];
  videoTime: number;
  angles?: { spineAngle?: number };
}

interface PoseTrack {
  metadata: {
    videoWidth: number;
    videoHeight: number;
    sourceVideoDuration: number;
  };
  frames: PoseTrackFrame[];
}

/**
 * Count reps from a posetrack, optionally mirroring the keypoints.
 */
function countRepsFromPosetrack(
  posetrack: PoseTrack,
  options: { mirrored?: boolean } = {}
): { repCount: number; repTimes: number[] } {
  const analyzer = new KettlebellSwingFormAnalyzer();
  const videoWidth = posetrack.metadata.videoWidth;
  const repTimes: number[] = [];
  let lastRepCount = 0;

  for (const frame of posetrack.frames) {
    if (!frame.keypoints || frame.keypoints.length === 0) continue;

    let keypoints = frame.keypoints;
    if (options.mirrored) {
      keypoints = mirrorKeypoints(keypoints, videoWidth);
    }

    const spineAngle = calculateSpineAngle(keypoints);
    const skeleton = new Skeleton(keypoints, spineAngle, true);
    const result = analyzer.processFrame(skeleton, Date.now(), frame.videoTime);

    if (result.repCount > lastRepCount) {
      repTimes.push(frame.videoTime);
      lastRepCount = result.repCount;
    }
  }

  return { repCount: analyzer.getRepCount(), repTimes };
}

/**
 * Load a posetrack fixture file.
 */
function loadPosetrack(filename: string): PoseTrack {
  const path = resolve(
    __dirname,
    '../../e2e-tests/fixtures/poses',
    filename
  );
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('KettlebellSwingFormAnalyzer with real posetrack data', () => {
  describe('mirrored video produces same rep count', () => {
    it('igor-1h-swing: mirrored video detects same reps as normal', () => {
      const posetrack = loadPosetrack('igor-1h-swing.posetrack.json');

      const normal = countRepsFromPosetrack(posetrack);
      const mirrored = countRepsFromPosetrack(posetrack, { mirrored: true });

      expect(mirrored.repCount).toBe(normal.repCount);
      // Rep times should be identical (within floating point tolerance)
      expect(mirrored.repTimes).toHaveLength(normal.repTimes.length);
      for (let i = 0; i < normal.repTimes.length; i++) {
        expect(mirrored.repTimes[i]).toBeCloseTo(normal.repTimes[i], 2);
      }
    });

    it('swing-sample: mirrored video detects same reps as normal', () => {
      const posetrack = loadPosetrack('swing-sample.posetrack.json');

      const normal = countRepsFromPosetrack(posetrack);
      const mirrored = countRepsFromPosetrack(posetrack, { mirrored: true });

      expect(mirrored.repCount).toBe(normal.repCount);
      expect(mirrored.repTimes).toHaveLength(normal.repTimes.length);
      for (let i = 0; i < normal.repTimes.length; i++) {
        expect(mirrored.repTimes[i]).toBeCloseTo(normal.repTimes[i], 2);
      }
    });

    it('swing-sample-4reps: mirrored video detects same reps as normal', () => {
      const posetrack = loadPosetrack('swing-sample-4reps.posetrack.json');

      const normal = countRepsFromPosetrack(posetrack);
      const mirrored = countRepsFromPosetrack(posetrack, { mirrored: true });

      expect(mirrored.repCount).toBe(normal.repCount);
      expect(mirrored.repTimes).toHaveLength(normal.repTimes.length);
      for (let i = 0; i < normal.repTimes.length; i++) {
        expect(mirrored.repTimes[i]).toBeCloseTo(normal.repTimes[i], 2);
      }
    });
  });

  describe('expected rep counts from known videos', () => {
    it('igor-1h-swing (~20s one-handed swing): detects ~9 reps', () => {
      const posetrack = loadPosetrack('igor-1h-swing.posetrack.json');
      const { repCount } = countRepsFromPosetrack(posetrack);

      // One-handed swing video, ~20 seconds, should have 8-10 reps
      expect(repCount).toBeGreaterThanOrEqual(8);
      expect(repCount).toBeLessThanOrEqual(11);
    });

    it('swing-sample (~20s browser-extracted): detects 9 reps', () => {
      const posetrack = loadPosetrack('swing-sample.posetrack.json');
      const { repCount } = countRepsFromPosetrack(posetrack);

      // Browser-extracted swing sample, ~20 seconds, should have exactly 9 reps
      expect(repCount).toBe(9);
    });

    it('swing-sample-4reps (~5.5s): detects exactly 4 reps', () => {
      const posetrack = loadPosetrack('swing-sample-4reps.posetrack.json');
      const { repCount } = countRepsFromPosetrack(posetrack);

      // Trimmed test video, should have exactly 4 reps
      expect(repCount).toBe(4);
    });
  });

  describe('dominant arm detection', () => {
    it('correctly detects right arm as dominant in igor-1h-swing', () => {
      const posetrack = loadPosetrack('igor-1h-swing.posetrack.json');
      const analyzer = new KettlebellSwingFormAnalyzer();

      // Process enough frames to trigger dominant arm detection
      for (const frame of posetrack.frames.slice(0, 200)) {
        if (!frame.keypoints || frame.keypoints.length === 0) continue;
        const spineAngle = calculateSpineAngle(frame.keypoints);
        const skeleton = new Skeleton(frame.keypoints, spineAngle, true);
        analyzer.processFrame(skeleton, Date.now(), frame.videoTime);
      }

      // Access private field for testing (not ideal but necessary for this test)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dominantArm = (analyzer as any).dominantArm;
      expect(dominantArm).toBe('right');
    });

    it('correctly detects left arm as dominant in mirrored igor-1h-swing', () => {
      const posetrack = loadPosetrack('igor-1h-swing.posetrack.json');
      const analyzer = new KettlebellSwingFormAnalyzer();
      const videoWidth = posetrack.metadata.videoWidth;

      // Process mirrored frames
      for (const frame of posetrack.frames.slice(0, 200)) {
        if (!frame.keypoints || frame.keypoints.length === 0) continue;
        const keypoints = mirrorKeypoints(frame.keypoints, videoWidth);
        const spineAngle = calculateSpineAngle(keypoints);
        const skeleton = new Skeleton(keypoints, spineAngle, true);
        analyzer.processFrame(skeleton, Date.now(), frame.videoTime);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dominantArm = (analyzer as any).dominantArm;
      expect(dominantArm).toBe('left');
    });
  });
});
