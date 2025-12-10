/**
 * Integration tests for ExerciseDetector using real posetrack data.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '../models/Skeleton';
import { MediaPipeBodyParts, type PoseKeypoint } from '../types';
import { ExerciseDetector } from './ExerciseDetector';

interface PoseTrackFrame {
  keypoints: PoseKeypoint[];
  videoTime: number;
}

interface PoseTrack {
  metadata: {
    model: string;
    frameCount: number;
  };
  frames: PoseTrackFrame[];
}

function calculateSpineAngle(keypoints: PoseKeypoint[]): number {
  const leftShoulder = keypoints[MediaPipeBodyParts.LEFT_SHOULDER];
  const rightShoulder = keypoints[MediaPipeBodyParts.RIGHT_SHOULDER];
  const leftHip = keypoints[MediaPipeBodyParts.LEFT_HIP];
  const rightHip = keypoints[MediaPipeBodyParts.RIGHT_HIP];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0;

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;

  const deltaX = shoulderMidX - hipMidX;
  const deltaY = hipMidY - shoulderMidY;

  return Math.abs((Math.atan2(deltaX, deltaY) * 180) / Math.PI);
}

function loadPosetrack(filename: string): PoseTrack {
  const path = resolve(__dirname, '../../e2e-tests/fixtures/poses', filename);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function detectExercise(posetrack: PoseTrack) {
  const detector = new ExerciseDetector();

  for (let i = 0; i < posetrack.frames.length; i++) {
    const frame = posetrack.frames[i];
    if (!frame.keypoints || frame.keypoints.length === 0) continue;

    const spineAngle = calculateSpineAngle(frame.keypoints);
    const skeleton = new Skeleton(frame.keypoints, spineAngle, true);
    detector.processFrame(skeleton);

    if (detector.isLocked()) {
      return {
        result: detector.getResult(),
        stats: detector.getStats(),
        lockedAtFrame: i,
      };
    }
  }

  return {
    result: detector.getResult(),
    stats: detector.getStats(),
    lockedAtFrame: null,
  };
}

describe('ExerciseDetector with real posetrack data', () => {
  describe('kettlebell swing detection', () => {
    it('detects kettlebell swing from igor-1h-swing.posetrack.json', () => {
      const posetrack = loadPosetrack('igor-1h-swing.posetrack.json');
      const { result, stats } = detectExercise(posetrack);

      console.log('Kettlebell Swing Stats:', stats);
      console.log('Result:', result);

      expect(result.exercise).toBe('kettlebell-swing');
      expect(result.confidence).toBeGreaterThan(50);
    });
  });

  describe('pistol squat detection', () => {
    it('detects pistol squat from pistol-squat-sample.posetrack.json', () => {
      const posetrack = loadPosetrack('pistol-squat-sample.posetrack.json');
      const { result, stats, lockedAtFrame } = detectExercise(posetrack);

      console.log('Pistol Squat Stats:', stats);
      console.log('Result:', result);
      console.log('Locked at frame:', lockedAtFrame);

      expect(result.exercise).toBe('pistol-squat');
      expect(result.confidence).toBeGreaterThan(50);
    });
  });
});
