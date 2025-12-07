/**
 * Analyze the gap region in the user's session data where reps are being missed.
 */

import { readFileSync } from 'fs';
import { KettlebellSwingFormAnalyzer } from '../src/analyzers/KettlebellSwingFormAnalyzer.js';
import { Skeleton } from '../src/models/Skeleton.js';
import type { PoseKeypoint } from '../src/types.js';

// Read the TFLite extraction
const posetrack = JSON.parse(readFileSync('/tmp/igor-extracted.json', 'utf-8'));

const analyzer = new KettlebellSwingFormAnalyzer();
let lastRepCount = 0;
let lastPhase = 'top';

console.log('=== Analyzing gap region (5.0s - 12.0s) ===');
console.log('');
console.log('Time    | Phase    | ArmToVert | Spine  | Hip   | Rep | Note');
console.log('='.repeat(75));

for (const frame of posetrack.frames) {
  if (!frame.keypoints || frame.keypoints.length === 0) continue;

  const keypoints: PoseKeypoint[] = frame.keypoints;

  // BlazePose indices
  const LEFT_SHOULDER = 11;
  const RIGHT_SHOULDER = 12;
  const LEFT_HIP = 23;
  const RIGHT_HIP = 24;

  const leftShoulder = keypoints[LEFT_SHOULDER];
  const rightShoulder = keypoints[RIGHT_SHOULDER];
  const leftHip = keypoints[LEFT_HIP];
  const rightHip = keypoints[RIGHT_HIP];

  let spineAngle = 0;
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;
    const deltaX = shoulderMidX - hipMidX;
    const deltaY = hipMidY - shoulderMidY;
    spineAngle = Math.abs((Math.atan2(deltaX, deltaY) * 180) / Math.PI);
  }

  const skeleton = new Skeleton(keypoints, spineAngle, true);
  const result = analyzer.processFrame(skeleton, Date.now(), frame.videoTime);

  const t = frame.videoTime;

  // Focus on gap region
  if (t >= 5.0 && t <= 12.0) {
    const arm = skeleton.getArmToVerticalAngle();
    const spine = skeleton.getSpineAngle();
    const hip = skeleton.getHipAngle();
    const phase = result.phase;

    // Log phase transitions and significant arm angles
    const phaseChanged = phase !== lastPhase;
    const repDetected = result.repCount > lastRepCount;
    const armHigh = Math.abs(arm) > 50;

    if (phaseChanged || repDetected || (armHigh && t % 0.5 < 0.034)) {
      const note = phaseChanged ? lastPhase + ' -> ' + phase :
                   repDetected ? '** REP! **' : '';

      console.log(
        t.toFixed(2).padStart(6) + 's | ' + phase.padEnd(8) + ' | ' + arm.toFixed(1).padStart(9) + ' | ' + spine.toFixed(1).padStart(6) + ' | ' + hip.toFixed(0).padStart(5) + ' | ' + result.repCount + '   | ' + note
      );
    }

    lastPhase = phase;
  }

  if (result.repCount > lastRepCount) {
    lastRepCount = result.repCount;
  }
}

console.log('');
console.log('=== Summary ===');
console.log('Total reps detected: ' + analyzer.getRepCount());
