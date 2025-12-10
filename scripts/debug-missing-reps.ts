import { readFileSync } from 'node:fs';
import { KettlebellSwingFormAnalyzer } from './src/analyzers/KettlebellSwingFormAnalyzer.js';
import { Skeleton } from './src/models/Skeleton.js';
import { MediaPipeBodyParts, type PoseKeypoint } from './src/types.js';

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

const posetrack = JSON.parse(
  readFileSync('e2e-tests/fixtures/poses/igor-1h-swing.posetrack.json', 'utf-8')
);

const analyzer = new KettlebellSwingFormAnalyzer();
let lastRepCount = 0;

console.log('Analyzing frames in gap region (5.5s - 11s):');
console.log('='.repeat(80));

for (const frame of posetrack.frames) {
  if (!frame.keypoints || frame.keypoints.length === 0) continue;

  const spineAngle =
    frame.angles?.spineAngle ?? calculateSpineAngle(frame.keypoints);
  const skeleton = new Skeleton(frame.keypoints, spineAngle, true);
  const result = analyzer.processFrame(skeleton, Date.now(), frame.videoTime);

  // Log frames in the gap region
  if (frame.videoTime >= 5.5 && frame.videoTime <= 11) {
    const armToVert = skeleton.getArmToVerticalAngle();
    const phase = result.phase;

    // Only log phase transitions and near-top positions
    if (result.repCount > lastRepCount || Math.abs(armToVert) > 55) {
      const t = frame.videoTime.toFixed(2);
      const arm = armToVert.toFixed(1).padStart(6);
      console.log(
        't=' +
          t +
          's phase=' +
          phase.padEnd(8) +
          ' armToVert=' +
          arm +
          ' rep=' +
          result.repCount
      );
    }
  }

  if (result.repCount > lastRepCount) {
    lastRepCount = result.repCount;
  }
}

console.log('\nTotal reps:', analyzer.getRepCount());
