import * as fs from 'fs';
import { Skeleton } from '../src/models/Skeleton';
import { MediaPipeBodyParts, type PoseKeypoint } from '../src/types';

const data = JSON.parse(
  fs.readFileSync(
    './e2e-tests/fixtures/poses/pistol-squat-sample.posetrack.json',
    'utf8'
  )
);

// Calculate spine angle
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

// Check what's happening at different time points
console.log('=== VIDEO TIMELINE ANALYSIS ===');
const timePoints = [0, 1, 2, 3, 4, 5, 6, 10, 15, 20, 25, 30];
for (const t of timePoints) {
  const frameIdx = Math.floor(t * 30);
  if (frameIdx >= data.frames.length) continue;

  const frame = data.frames[frameIdx];
  if (frame.keypoints.length !== 33) {
    console.log(`t=${t}s (frame ${frameIdx}): NO POSE`);
    continue;
  }

  const spineAngle = calculateSpineAngle(frame.keypoints as PoseKeypoint[]);
  const skeleton = new Skeleton(
    frame.keypoints as PoseKeypoint[],
    spineAngle,
    true
  );
  const leftKnee = skeleton.getKneeAngleForSide('left');
  const rightKnee = skeleton.getKneeAngleForSide('right');
  const spine = skeleton.getSpineAngle();

  console.log(
    `t=${t}s (frame ${frameIdx}): leftKnee=${leftKnee.toFixed(0)}°, rightKnee=${rightKnee.toFixed(0)}°, spine=${spine.toFixed(0)}°`
  );
}

// Check frames 0-100 in detail to understand the early noise
console.log('\n=== EARLY FRAMES (0-4 seconds) ===');
for (let i = 0; i < 120; i++) {
  const frame = data.frames[i];
  if (frame.keypoints.length !== 33) {
    continue;
  }

  const spineAngle = calculateSpineAngle(frame.keypoints as PoseKeypoint[]);
  const skeleton = new Skeleton(
    frame.keypoints as PoseKeypoint[],
    spineAngle,
    true
  );
  const leftKnee = skeleton.getKneeAngleForSide('left');
  const spine = skeleton.getSpineAngle();

  // Only print if something interesting
  if (leftKnee < 80 || spine > 100) {
    console.log(
      `Frame ${i} (t=${frame.videoTime.toFixed(2)}s): leftKnee=${leftKnee.toFixed(0)}°, spine=${spine.toFixed(0)}°`
    );
  }
}
