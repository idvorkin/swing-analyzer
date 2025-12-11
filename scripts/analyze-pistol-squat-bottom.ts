import * as fs from 'node:fs';
import { Skeleton } from '../src/models/Skeleton';
import { MediaPipeBodyParts, type PoseKeypoint } from '../src/types';

// Load pose data
const poseFile =
  './e2e-tests/fixtures/poses/pistol-squat-sample.posetrack.json';
const data = JSON.parse(fs.readFileSync(poseFile, 'utf8'));

console.log(`Loaded ${data.frames.length} frames from ${poseFile}`);
console.log(`Video duration: ${data.metadata?.duration ?? 'unknown'}s`);
console.log(`FPS: ${data.metadata?.fps ?? 30}`);

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

interface FrameData {
  frameIndex: number;
  timestamp: number;
  videoTime: number;
  leftKnee: number;
  rightKnee: number;
  leftHip: number;
  rightHip: number;
  spine: number;
}

const frames: FrameData[] = [];

for (const frame of data.frames) {
  const keypoints = frame.keypoints as PoseKeypoint[];
  const spineAngle = calculateSpineAngle(keypoints);
  const skeleton = new Skeleton(keypoints, spineAngle, true);

  frames.push({
    frameIndex: frame.frameIndex,
    timestamp: frame.timestamp,
    videoTime: frame.videoTime,
    leftKnee: skeleton.getKneeAngleForSide('left'),
    rightKnee: skeleton.getKneeAngleForSide('right'),
    leftHip: skeleton.getHipAngleForSide('left'),
    rightHip: skeleton.getHipAngleForSide('right'),
    spine: spineAngle,
  });
}

// Detect working leg (the one with more variance - bending more)
const leftKneeVariance =
  frames.reduce((sum, f) => sum + (f.leftKnee - 150) ** 2, 0) / frames.length;
const rightKneeVariance =
  frames.reduce((sum, f) => sum + (f.rightKnee - 150) ** 2, 0) / frames.length;
const workingLeg = leftKneeVariance > rightKneeVariance ? 'left' : 'right';
console.log(
  `\nWorking leg: ${workingLeg} (variance: L=${leftKneeVariance.toFixed(1)}, R=${rightKneeVariance.toFixed(1)})`
);

// Get working knee angles
const workingKneeKey = workingLeg === 'left' ? 'leftKnee' : 'rightKnee';

// Find actual local minima of working knee angle (potential bottom positions)
console.log('\n=== ACTUAL TROUGHS (local minima of working knee angle) ===');
const windowSize = 5;
const actualTroughs: { frame: number; angle: number; videoTime: number }[] = [];

for (let i = windowSize; i < frames.length - windowSize; i++) {
  const curr = frames[i];
  const currAngle = curr[workingKneeKey];
  let isLocalMin = true;

  for (let j = i - windowSize; j <= i + windowSize; j++) {
    if (j !== i && frames[j][workingKneeKey] <= currAngle) {
      isLocalMin = false;
      break;
    }
  }

  // Only consider reasonably low angles (below 120°)
  if (isLocalMin && currAngle < 120) {
    actualTroughs.push({
      frame: curr.frameIndex,
      angle: currAngle,
      videoTime: curr.videoTime,
    });
    console.log(
      `  Frame ${curr.frameIndex} (t=${curr.videoTime.toFixed(2)}s): knee=${currAngle.toFixed(1)}°, spine=${curr.spine.toFixed(1)}°`
    );
  }
}

// Simulate the algorithm's trough detection
console.log('\n=== ALGORITHM TROUGH DETECTION SIMULATION ===');

// Parameters from PistolSquatFormAnalyzer
const emaAlpha = 0.3;
const minRealisticAngle = 30;
const framesNeededToConfirmTrough = 3;
const descendingKneeThreshold = 140;
const maxValidSpineAngle = 60; // NEW: reject horizontal/lying poses

interface TroughCandidate {
  angle: number;
  frameIndex: number;
  videoTime: number;
}

let smoothedKneeAngle: number | null = null;
let troughCandidate: TroughCandidate | null = null;
let framesAscendingAfterTrough = 0;
let phase: 'standing' | 'descending' | 'bottom' | 'ascending' = 'standing';
const detectedBottoms: TroughCandidate[] = [];
let repCount = 0;

function smoothAngle(rawAngle: number): number {
  const clamped = Math.max(minRealisticAngle, rawAngle);
  if (smoothedKneeAngle === null) {
    smoothedKneeAngle = clamped;
  } else {
    smoothedKneeAngle = emaAlpha * clamped + (1 - emaAlpha) * smoothedKneeAngle;
  }
  return smoothedKneeAngle;
}

// Detailed logging for the first few reps
let detailedLogging = true;
let loggedReps = 0;

for (let i = 0; i < frames.length; i++) {
  const f = frames[i];
  const rawAngle = f[workingKneeKey];

  // NEW: Skip frames with invalid posture (person lying down)
  if (f.spine > maxValidSpineAngle) {
    continue;
  }

  const _smoothed = smoothAngle(rawAngle);

  // Phase transitions
  if (phase === 'standing') {
    if (rawAngle < descendingKneeThreshold) {
      if (detailedLogging) {
        console.log(
          `\n[Frame ${f.frameIndex}] STANDING -> DESCENDING (knee=${rawAngle.toFixed(1)}° < ${descendingKneeThreshold}°)`
        );
      }
      phase = 'descending';
      troughCandidate = null;
      framesAscendingAfterTrough = 0;
    }
  } else if (phase === 'descending') {
    const clampedAngle = Math.max(minRealisticAngle, rawAngle);

    // Check direction
    if (troughCandidate) {
      if (clampedAngle > troughCandidate.angle + 2) {
        framesAscendingAfterTrough++;
        if (detailedLogging) {
          console.log(
            `  [Frame ${f.frameIndex}] Ascending: ${clampedAngle.toFixed(1)}° > ${troughCandidate.angle.toFixed(1)}° + 2, count=${framesAscendingAfterTrough}`
          );
        }
      } else if (clampedAngle <= troughCandidate.angle) {
        if (detailedLogging && framesAscendingAfterTrough > 0) {
          console.log(
            `  [Frame ${f.frameIndex}] Reset ascending count (${clampedAngle.toFixed(1)}° <= ${troughCandidate.angle.toFixed(1)}°)`
          );
        }
        framesAscendingAfterTrough = 0;
      }
    }

    // Update trough candidate
    if (!troughCandidate || clampedAngle < troughCandidate.angle) {
      if (detailedLogging) {
        console.log(
          `  [Frame ${f.frameIndex}] New trough candidate: ${clampedAngle.toFixed(1)}° (t=${f.videoTime.toFixed(2)}s)`
        );
      }
      troughCandidate = {
        angle: clampedAngle,
        frameIndex: f.frameIndex,
        videoTime: f.videoTime,
      };
      framesAscendingAfterTrough = 0;
    }

    // Confirm trough
    if (
      framesAscendingAfterTrough >= framesNeededToConfirmTrough &&
      troughCandidate
    ) {
      if (detailedLogging) {
        console.log(
          `  [Frame ${f.frameIndex}] TROUGH CONFIRMED at frame ${troughCandidate.frameIndex} (${troughCandidate.angle.toFixed(1)}°)`
        );
      }
      detectedBottoms.push({ ...troughCandidate });
      phase = 'bottom';
    }
  } else if (phase === 'bottom') {
    // Transition to ascending when knee > 90° and increasing
    if (rawAngle > 90) {
      phase = 'ascending';
      if (detailedLogging) {
        console.log(
          `[Frame ${f.frameIndex}] BOTTOM -> ASCENDING (knee=${rawAngle.toFixed(1)}° > 90°)`
        );
      }
    }
  } else if (phase === 'ascending') {
    // Transition to standing when knee > 150° and spine < 25°
    if (rawAngle > 150 && f.spine < 25) {
      phase = 'standing';
      repCount++;
      if (detailedLogging) {
        console.log(
          `[Frame ${f.frameIndex}] ASCENDING -> STANDING (rep ${repCount} complete)`
        );
        loggedReps++;
        if (loggedReps >= 3) {
          detailedLogging = false;
          console.log('... (disabling detailed logging for remaining reps)');
        }
      }
      // Reset for next rep
      smoothedKneeAngle = null;
      troughCandidate = null;
      framesAscendingAfterTrough = 0;
    }
  }
}

console.log('\n=== COMPARISON: Algorithm vs Actual Troughs ===');
console.log(`Algorithm detected ${detectedBottoms.length} bottoms:`);
for (const b of detectedBottoms) {
  console.log(
    `  Frame ${b.frameIndex} (t=${b.videoTime.toFixed(2)}s): ${b.angle.toFixed(1)}°`
  );
}

console.log(`\nActual troughs: ${actualTroughs.length}`);
for (const t of actualTroughs) {
  console.log(
    `  Frame ${t.frame} (t=${t.videoTime.toFixed(2)}s): ${t.angle.toFixed(1)}°`
  );
}

// Compare timing accuracy
console.log('\n=== TIMING ACCURACY ===');
for (const detected of detectedBottoms) {
  // Find closest actual trough
  let closestTrough = actualTroughs[0];
  let minDiff = Math.abs(detected.frameIndex - closestTrough.frame);

  for (const actual of actualTroughs) {
    const diff = Math.abs(detected.frameIndex - actual.frame);
    if (diff < minDiff) {
      minDiff = diff;
      closestTrough = actual;
    }
  }

  const timeDiff = (detected.videoTime - closestTrough.videoTime) * 1000; // ms
  const frameDiff = detected.frameIndex - closestTrough.frame;
  const angleDiff = detected.angle - closestTrough.angle;

  console.log(
    `  Detected frame ${detected.frameIndex} vs actual ${closestTrough.frame}:`
  );
  console.log(`    Time diff: ${timeDiff.toFixed(0)}ms (${frameDiff} frames)`);
  console.log(
    `    Angle diff: ${angleDiff.toFixed(1)}° (detected: ${detected.angle.toFixed(1)}°, actual: ${closestTrough.angle.toFixed(1)}°)`
  );
}

// Show frame-by-frame around each actual trough
console.log('\n=== FRAME-BY-FRAME AROUND ACTUAL TROUGHS ===');
for (const trough of actualTroughs.slice(0, 3)) {
  // First 3 troughs only
  console.log(
    `\nTrough at frame ${trough.frame} (t=${trough.videoTime.toFixed(2)}s):`
  );
  for (let i = trough.frame - 8; i <= trough.frame + 8; i++) {
    if (i >= 0 && i < frames.length) {
      const f = frames[i];
      const rawKnee = f[workingKneeKey];
      const marker = i === trough.frame ? ' <-- ACTUAL TROUGH' : '';
      const detected = detectedBottoms.find((b) => b.frameIndex === i);
      const detectedMarker = detected ? ' <-- DETECTED' : '';
      console.log(
        `  ${i}: knee=${rawKnee.toFixed(1)}°, spine=${f.spine.toFixed(1)}°${marker}${detectedMarker}`
      );
    }
  }
}

// Analyze noise levels
console.log('\n=== NOISE ANALYSIS ===');
const kneeAngles = frames.map((f) => f[workingKneeKey]);
const diffs: number[] = [];
for (let i = 1; i < kneeAngles.length; i++) {
  diffs.push(Math.abs(kneeAngles[i] - kneeAngles[i - 1]));
}
const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
const maxDiff = Math.max(...diffs);
console.log(`Frame-to-frame angle changes:`);
console.log(`  Average: ${avgDiff.toFixed(2)}°`);
console.log(`  Max: ${maxDiff.toFixed(2)}°`);
console.log(`  Frames with >5° jump: ${diffs.filter((d) => d > 5).length}`);
console.log(`  Frames with >10° jump: ${diffs.filter((d) => d > 10).length}`);

// Test different framesNeededToConfirmTrough values
console.log('\n=== SENSITIVITY ANALYSIS: framesNeededToConfirmTrough ===');
for (const testFrames of [2, 3, 4, 5, 6]) {
  // Reset and run simulation
  smoothedKneeAngle = null;
  troughCandidate = null;
  framesAscendingAfterTrough = 0;
  phase = 'standing';
  const testDetected: TroughCandidate[] = [];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const rawAngle = f[workingKneeKey];
    smoothAngle(rawAngle);

    if (phase === 'standing') {
      if (rawAngle < descendingKneeThreshold) {
        phase = 'descending';
        troughCandidate = null;
        framesAscendingAfterTrough = 0;
      }
    } else if (phase === 'descending') {
      const clampedAngle = Math.max(minRealisticAngle, rawAngle);

      if (troughCandidate) {
        if (clampedAngle > troughCandidate.angle + 2) {
          framesAscendingAfterTrough++;
        } else if (clampedAngle <= troughCandidate.angle) {
          framesAscendingAfterTrough = 0;
        }
      }

      if (!troughCandidate || clampedAngle < troughCandidate.angle) {
        troughCandidate = {
          angle: clampedAngle,
          frameIndex: f.frameIndex,
          videoTime: f.videoTime,
        };
        framesAscendingAfterTrough = 0;
      }

      if (framesAscendingAfterTrough >= testFrames && troughCandidate) {
        testDetected.push({ ...troughCandidate });
        phase = 'bottom';
      }
    } else if (phase === 'bottom') {
      if (rawAngle > 90) phase = 'ascending';
    } else if (phase === 'ascending') {
      if (rawAngle > 150 && f.spine < 25) {
        phase = 'standing';
        smoothedKneeAngle = null;
        troughCandidate = null;
        framesAscendingAfterTrough = 0;
      }
    }
  }

  // Calculate average timing error
  let totalError = 0;
  for (const detected of testDetected) {
    let minDiff = Infinity;
    for (const actual of actualTroughs) {
      const diff = Math.abs(detected.frameIndex - actual.frame);
      if (diff < minDiff) minDiff = diff;
    }
    totalError += minDiff;
  }
  const avgError =
    testDetected.length > 0 ? totalError / testDetected.length : 0;

  console.log(
    `  framesNeededToConfirmTrough=${testFrames}: detected ${testDetected.length} bottoms, avg error: ${avgError.toFixed(1)} frames`
  );
}
