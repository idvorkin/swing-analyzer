/**
 * Script to count reps from a posetrack file using the KettlebellSwingFormAnalyzer.
 *
 * Usage: npx tsx scripts/count-reps.ts [path-to-posetrack.json]
 */
import { readFileSync } from 'node:fs';
import { KettlebellSwingFormAnalyzer } from '../src/analyzers/KettlebellSwingFormAnalyzer.js';
import { Skeleton } from '../src/models/Skeleton.js';
import { MediaPipeBodyParts, type PoseKeypoint } from '../src/types.js';

/**
 * Calculate spine angle from MediaPipe-format keypoints
 * (Copy from CachedPoseSkeletonTransformer for consistency)
 */
function calculateSpineAngle(keypoints: PoseKeypoint[]): number {
  const leftShoulder = keypoints[MediaPipeBodyParts.LEFT_SHOULDER];
  const rightShoulder = keypoints[MediaPipeBodyParts.RIGHT_SHOULDER];
  const leftHip = keypoints[MediaPipeBodyParts.LEFT_HIP];
  const rightHip = keypoints[MediaPipeBodyParts.RIGHT_HIP];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return 0;
  }

  // Calculate midpoints
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;

  // Calculate angle from vertical
  const deltaX = shoulderMidX - hipMidX;
  const deltaY = hipMidY - shoulderMidY; // Inverted for screen coordinates

  return Math.abs((Math.atan2(deltaX, deltaY) * 180) / Math.PI);
}

// Load posetrack
const posetrackPath =
  process.argv[2] || './e2e-tests/fixtures/poses/swing-sample.posetrack.json';
const posetrack = JSON.parse(readFileSync(posetrackPath, 'utf-8'));

console.log(`Analyzing: ${posetrackPath}`);
console.log(
  `Frames: ${posetrack.frames.length}, Duration: ${posetrack.metadata.sourceVideoDuration}s`
);
console.log(
  `Keypoints per frame: ${posetrack.frames[1]?.keypoints?.length || 'N/A'}`
);

const analyzer = new KettlebellSwingFormAnalyzer();
let lastRepCount = 0;
const repTimes: { repNum: number; videoTime: number; phase: string }[] = [];

let lastPhase = '';
const phaseChanges: { time: number; from: string; to: string; angles: any }[] =
  [];

for (const frame of posetrack.frames) {
  if (!frame.keypoints || frame.keypoints.length === 0) continue;

  // Use pre-computed spine angle if available, otherwise calculate
  const spineAngle =
    frame.angles?.spineAngle ?? calculateSpineAngle(frame.keypoints);

  // Create skeleton (keypoints are already in MediaPipe-33 format)
  const skeleton = new Skeleton(frame.keypoints, spineAngle, true);

  // Process frame through analyzer
  const result = analyzer.processFrame(skeleton, Date.now(), frame.videoTime);

  // Track rep completions
  if (result.repCount > lastRepCount) {
    repTimes.push({
      repNum: result.repCount,
      videoTime: frame.videoTime,
      phase: result.phase,
    });
    lastRepCount = result.repCount;
  }

  // Track phase changes for debugging
  if (result.phase !== lastPhase) {
    phaseChanges.push({
      time: frame.videoTime,
      from: lastPhase || 'start',
      to: result.phase,
      angles: result.angles,
    });
    lastPhase = result.phase;
  }
}

console.log(`\n========== RESULTS ==========`);
console.log(`Total reps detected: ${analyzer.getRepCount()}`);
console.log(`\nRep completion times:`);
repTimes.forEach((r) => {
  console.log(`  Rep ${r.repNum}: ${r.videoTime.toFixed(2)}s`);
});

console.log(`\n========== PHASE CHANGES (${phaseChanges.length}) ==========`);
phaseChanges.slice(0, 30).forEach((p) => {
  const spine = p.angles?.spine?.toFixed(1) ?? 'N/A';
  const arm = p.angles?.arm?.toFixed(1) ?? 'N/A';
  const hip = p.angles?.hip?.toFixed(0) ?? 'N/A';
  console.log(
    `  ${p.time.toFixed(2)}s: ${p.from.padEnd(8)} -> ${p.to.padEnd(8)} (spine=${spine}, arm=${arm}, hip=${hip})`
  );
});

if (phaseChanges.length > 30) {
  console.log(`  ... ${phaseChanges.length - 30} more`);
}
