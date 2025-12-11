import * as fs from 'fs';
import { Skeleton } from '../src/models/Skeleton';
import { MediaPipeBodyParts, type PoseKeypoint } from '../src/types';

// Load pose data
const poseFile = './e2e-tests/fixtures/poses/swing-sample-4reps.posetrack.json';
const data = JSON.parse(fs.readFileSync(poseFile, 'utf8'));

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
  arm: number;
  spine: number;
  hip: number;
  knee: number;
  wristHeight: number;
}

const frames: FrameData[] = [];

for (const frame of data.frames) {
  const keypoints = frame.keypoints as PoseKeypoint[];
  const spineAngle = calculateSpineAngle(keypoints);
  const skeleton = new Skeleton(keypoints, spineAngle, true);
  const arm = skeleton.getArmToVerticalAngle('right');
  const spine = skeleton.getSpineAngle();
  const hip = skeleton.getHipAngle();
  const knee = skeleton.getKneeAngle();
  const wristHeight = skeleton.getWristHeight('right');

  frames.push({
    frameIndex: frame.frameIndex,
    timestamp: frame.timestamp,
    videoTime: frame.videoTime,
    arm,
    spine,
    hip,
    knee,
    wristHeight,
  });
}

// Find local maxima of spine angle (potential bottom positions)
console.log('\n=== Frames with HIGHEST spine angle (deepest hinge) ===');
const sortedBySpine = [...frames].sort((a, b) => b.spine - a.spine);
console.log('Top 10 frames by spine angle:');
for (const f of sortedBySpine.slice(0, 10)) {
  console.log(
    `  Frame ${f.frameIndex} (t=${f.videoTime.toFixed(2)}s): spine=${f.spine.toFixed(1)} deg, arm=${f.arm.toFixed(1)} deg, hip=${f.hip.toFixed(1)} deg`
  );
}

// Find local minima of hip angle (also indicates bottom)
console.log('\n=== Frames with LOWEST hip angle (deepest hinge by hip) ===');
const sortedByHip = [...frames].sort((a, b) => a.hip - b.hip);
console.log('Top 10 frames by hip angle (ascending):');
for (const f of sortedByHip.slice(0, 10)) {
  console.log(
    `  Frame ${f.frameIndex} (t=${f.videoTime.toFixed(2)}s): hip=${f.hip.toFixed(1)} deg, spine=${f.spine.toFixed(1)} deg, arm=${f.arm.toFixed(1)} deg`
  );
}

// Find local minima of wrist height (lowest point)
console.log('\n=== Frames with LOWEST wrist height ===');
const sortedByWrist = [...frames].sort((a, b) => a.wristHeight - b.wristHeight);
console.log('Top 10 frames by wrist height (ascending):');
for (const f of sortedByWrist.slice(0, 10)) {
  console.log(
    `  Frame ${f.frameIndex} (t=${f.videoTime.toFixed(2)}s): wristH=${f.wristHeight.toFixed(1)}, spine=${f.spine.toFixed(1)} deg, arm=${f.arm.toFixed(1)} deg`
  );
}

// Find troughs (local minima of wrist height)
console.log('\n=== TROUGHS (local minima of wrist height) ===');
const windowSize = 5;
for (let i = windowSize; i < frames.length - windowSize; i++) {
  const curr = frames[i];
  let isLocalMin = true;
  for (let j = i - windowSize; j <= i + windowSize; j++) {
    if (j !== i && frames[j].wristHeight <= curr.wristHeight) {
      isLocalMin = false;
      break;
    }
  }
  if (isLocalMin && curr.wristHeight < -100) {
    // Only consider low enough points
    console.log(
      `  Frame ${curr.frameIndex} (t=${curr.videoTime.toFixed(2)}s): wristH=${curr.wristHeight.toFixed(1)}, spine=${curr.spine.toFixed(1)} deg, arm=${curr.arm.toFixed(1)} deg, hip=${curr.hip.toFixed(1)} deg`
    );
  }
}

// Now simulate what the current algorithm would detect as "bottom"
console.log('\n=== Current algorithm phase transitions ===');
console.log('CONNECT->BOTTOM: |arm| < 55 && spine > 35 && hip < 140');
let phase = 'top';
let framesInPhase = 0;
const minFrames = 2;
const bottomArmMax = 40;
const bottomSpineMin = 35;
const bottomHipMax = 140;
const connectArmMax = 25;
const connectSpineMax = 25;
const releaseArmMax = 25;
const releaseSpineMax = 25;
const topArmMin = 55;
const topSpineMax = 25;
const topHipMin = 150;

const transitions: Array<{
  frame: number;
  time: number;
  from: string;
  to: string;
  angles: string;
}> = [];

for (const f of frames) {
  framesInPhase++;

  if (phase === 'top') {
    if (
      framesInPhase >= minFrames &&
      Math.abs(f.arm) < connectArmMax &&
      f.spine < connectSpineMax
    ) {
      transitions.push({
        frame: f.frameIndex,
        time: f.videoTime,
        from: 'TOP',
        to: 'CONNECT',
        angles: `arm=${f.arm.toFixed(1)}, spine=${f.spine.toFixed(1)}, hip=${f.hip.toFixed(1)}`,
      });
      phase = 'connect';
      framesInPhase = 0;
    }
  } else if (phase === 'connect') {
    const bottomCondition =
      Math.abs(f.arm) < Math.abs(bottomArmMax) + 15 &&
      f.spine > bottomSpineMin &&
      f.hip < bottomHipMax;
    if (framesInPhase >= minFrames && bottomCondition) {
      transitions.push({
        frame: f.frameIndex,
        time: f.videoTime,
        from: 'CONNECT',
        to: 'BOTTOM',
        angles: `arm=${f.arm.toFixed(1)}, spine=${f.spine.toFixed(1)}, hip=${f.hip.toFixed(1)}`,
      });
      phase = 'bottom';
      framesInPhase = 0;
    }
  } else if (phase === 'bottom') {
    if (
      framesInPhase >= minFrames &&
      Math.abs(f.arm) < releaseArmMax &&
      f.spine < releaseSpineMax
    ) {
      transitions.push({
        frame: f.frameIndex,
        time: f.videoTime,
        from: 'BOTTOM',
        to: 'RELEASE',
        angles: `arm=${f.arm.toFixed(1)}, spine=${f.spine.toFixed(1)}, hip=${f.hip.toFixed(1)}`,
      });
      phase = 'release';
      framesInPhase = 0;
    }
  } else if (phase === 'release') {
    if (
      framesInPhase >= minFrames &&
      Math.abs(f.arm) > topArmMin &&
      f.spine < topSpineMax &&
      f.hip > topHipMin
    ) {
      transitions.push({
        frame: f.frameIndex,
        time: f.videoTime,
        from: 'RELEASE',
        to: 'TOP',
        angles: `arm=${f.arm.toFixed(1)}, spine=${f.spine.toFixed(1)}, hip=${f.hip.toFixed(1)}`,
      });
      phase = 'top';
      framesInPhase = 0;
    }
  }
}

for (const t of transitions) {
  console.log(
    `  Frame ${t.frame} (t=${t.time.toFixed(2)}s): ${t.from} -> ${t.to} (${t.angles})`
  );
}

// Compare detected bottom frames with actual troughs
console.log('\n=== COMPARISON: Algorithm vs Actual Troughs ===');
const bottomTransitions = transitions.filter((t) => t.to === 'BOTTOM');
console.log(
  'Algorithm detected BOTTOM at frames:',
  bottomTransitions.map((t) => t.frame).join(', ')
);

// Find actual troughs by wrist height
const actualTroughs: number[] = [];
for (let i = windowSize; i < frames.length - windowSize; i++) {
  const curr = frames[i];
  let isLocalMin = true;
  for (let j = i - windowSize; j <= i + windowSize; j++) {
    if (j !== i && frames[j].wristHeight <= curr.wristHeight) {
      isLocalMin = false;
      break;
    }
  }
  if (isLocalMin && curr.wristHeight < -100) {
    actualTroughs.push(curr.frameIndex);
  }
}
console.log('Actual wrist height troughs at frames:', actualTroughs.join(', '));

// Simulate trough-based bottom detection
console.log('\n=== TROUGH-BASED Bottom Detection (what it would find) ===');
interface TroughCandidate {
  frame: number;
  wristHeight: number;
}
let troughCandidate: TroughCandidate | null = null;
let framesAscendingAfterTrough = 0;
const framesNeededToConfirmTrough = 3;
const detectedTroughBottoms: number[] = [];
let inSwing = false;

for (let i = 0; i < frames.length; i++) {
  const f = frames[i];

  // Detect swing start (wrist descending below -100)
  if (!inSwing && f.wristHeight < -100) {
    inSwing = true;
    troughCandidate = null;
    framesAscendingAfterTrough = 0;
  }

  if (inSwing) {
    // Track direction
    if (troughCandidate && f.wristHeight > troughCandidate.wristHeight + 5) {
      framesAscendingAfterTrough++;
    } else if (
      !troughCandidate ||
      f.wristHeight <= troughCandidate.wristHeight
    ) {
      framesAscendingAfterTrough = 0;
    }

    // Update trough candidate
    if (!troughCandidate || f.wristHeight < troughCandidate.wristHeight) {
      troughCandidate = { frame: f.frameIndex, wristHeight: f.wristHeight };
      framesAscendingAfterTrough = 0;
    }

    // Confirm trough
    if (
      framesAscendingAfterTrough >= framesNeededToConfirmTrough &&
      troughCandidate
    ) {
      detectedTroughBottoms.push(troughCandidate.frame);
      console.log(
        `  Confirmed trough at frame ${troughCandidate.frame} (wristH=${troughCandidate.wristHeight.toFixed(1)})`
      );
      inSwing = false;
      troughCandidate = null;
    }

    // End swing when wrist rises above threshold
    if (f.wristHeight > -50) {
      inSwing = false;
      troughCandidate = null;
    }
  }
}

console.log(
  '\nTrough-based would detect BOTTOM at frames:',
  detectedTroughBottoms.join(', ')
);

// Also try spine angle trough detection
console.log('\n=== SPINE PEAK Detection (max spine angle per swing) ===');
let spineCandidate: { frame: number; spine: number } | null = null;
let framesDescendingAfterPeak = 0;
const detectedSpinePeaks: number[] = [];
let inSpineSwing = false;

for (let i = 0; i < frames.length; i++) {
  const f = frames[i];

  // Detect swing start (spine increasing above 30)
  if (!inSpineSwing && f.spine > 30) {
    inSpineSwing = true;
    spineCandidate = null;
    framesDescendingAfterPeak = 0;
  }

  if (inSpineSwing) {
    // Track direction
    if (spineCandidate && f.spine < spineCandidate.spine - 3) {
      framesDescendingAfterPeak++;
    } else if (!spineCandidate || f.spine >= spineCandidate.spine) {
      framesDescendingAfterPeak = 0;
    }

    // Update peak candidate
    if (!spineCandidate || f.spine > spineCandidate.spine) {
      spineCandidate = { frame: f.frameIndex, spine: f.spine };
      framesDescendingAfterPeak = 0;
    }

    // Confirm peak
    if (
      framesDescendingAfterPeak >= framesNeededToConfirmTrough &&
      spineCandidate
    ) {
      detectedSpinePeaks.push(spineCandidate.frame);
      const sf = frames[spineCandidate.frame];
      console.log(
        `  Confirmed spine peak at frame ${spineCandidate.frame} (spine=${spineCandidate.spine.toFixed(1)}, arm=${sf.arm.toFixed(1)}, hip=${sf.hip.toFixed(1)})`
      );
      inSpineSwing = false;
      spineCandidate = null;
    }

    // End swing when spine returns to upright
    if (f.spine < 15) {
      inSpineSwing = false;
      spineCandidate = null;
    }
  }
}

console.log(
  '\nSpine peak would detect BOTTOM at frames:',
  detectedSpinePeaks.join(', ')
);

// Show frame-by-frame around each trough
console.log('\n=== Frame-by-frame around each trough ===');
for (const troughFrame of actualTroughs) {
  console.log(`\nAround frame ${troughFrame}:`);
  for (let i = troughFrame - 5; i <= troughFrame + 5; i++) {
    if (i >= 0 && i < frames.length) {
      const f = frames[i];
      const marker = i === troughFrame ? ' <-- TROUGH' : '';
      console.log(
        `  ${i}: wristH=${f.wristHeight.toFixed(1)}, spine=${f.spine.toFixed(1)}, arm=${f.arm.toFixed(1)}, hip=${f.hip.toFixed(1)}${marker}`
      );
    }
  }
}
