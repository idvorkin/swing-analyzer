/**
 * Integration tests for PistolSquatFormAnalyzer using real posetrack data.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PistolSquatFormAnalyzer } from './PistolSquatFormAnalyzer';
import { Skeleton } from '../models/Skeleton';
import { MediaPipeBodyParts, type PoseKeypoint } from '../types';

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

function analyzeReps(posetrack: PoseTrack) {
  const analyzer = new PistolSquatFormAnalyzer();
  const phaseChanges: { frame: number; time: number; from: string; to: string }[] = [];
  let lastPhase = '';
  let totalReps = 0;
  const repTimes: number[] = [];

  for (let i = 0; i < posetrack.frames.length; i++) {
    const frame = posetrack.frames[i];
    if (!frame.keypoints || frame.keypoints.length === 0) continue;

    const spineAngle = calculateSpineAngle(frame.keypoints);
    const skeleton = new Skeleton(frame.keypoints, spineAngle, true);

    const result = analyzer.processFrame(skeleton, Date.now(), frame.videoTime);

    if (result.phase !== lastPhase) {
      phaseChanges.push({
        frame: i,
        time: frame.videoTime,
        from: lastPhase || 'start',
        to: result.phase,
      });
      lastPhase = result.phase;
    }

    if (result.repCompleted) {
      totalReps++;
      repTimes.push(frame.videoTime);
    }
  }

  return {
    totalReps,
    repTimes,
    phaseChanges,
    finalPhase: analyzer.getPhase(),
  };
}

describe('PistolSquatFormAnalyzer with real posetrack data', () => {
  it('analyzes pistol squat from pistol-squat-sample.posetrack.json', () => {
    const posetrack = loadPosetrack('pistol-squat-sample.posetrack.json');
    const result = analyzeReps(posetrack);

    console.log('=== Pistol Squat Analysis ===');
    console.log('Total frames:', posetrack.frames.length);
    console.log('Total reps detected:', result.totalReps);
    console.log('Rep times:', result.repTimes.map(t => t.toFixed(2) + 's').join(', '));
    console.log('Final phase:', result.finalPhase);
    console.log('\nPhase changes:');
    result.phaseChanges.forEach(c => {
      console.log('  Frame ' + c.frame + ' (' + c.time.toFixed(2) + 's): ' + c.from + ' -> ' + c.to);
    });

    // The pistol squat sample video should detect at least 1 rep
    // This ensures the analyzer is working with real posetrack data
    expect(result.totalReps).toBeGreaterThanOrEqual(1);
  });
});
