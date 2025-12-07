import { readFileSync } from 'fs';

const fixture = JSON.parse(readFileSync('e2e-tests/fixtures/poses/igor-1h-swing.posetrack.json', 'utf-8'));
const tflite = JSON.parse(readFileSync('/tmp/igor-extracted.json', 'utf-8'));

// BlazePose indices
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

function calculateSpineAngle(keypoints: any[]): number {
  const leftShoulder = keypoints[LEFT_SHOULDER];
  const rightShoulder = keypoints[RIGHT_SHOULDER];
  const leftHip = keypoints[LEFT_HIP];
  const rightHip = keypoints[RIGHT_HIP];
  
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0;
  
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;
  const deltaX = shoulderMidX - hipMidX;
  const deltaY = hipMidY - shoulderMidY;
  return Math.abs((Math.atan2(deltaX, deltaY) * 180) / Math.PI);
}

console.log('=== Spine Angle Comparison (Bottom of swing frames) ===');
console.log('');
console.log('Expected: spine should reach 40-60° during hinge');
console.log('');
console.log('Time    | Fixture Spine | TFLite Spine | Diff');
console.log('='.repeat(55));

// Find frames around 4.3s, 5.9s, 7.5s (should be bottom positions)
const bottomTimes = [3.2, 4.8, 6.4, 8.0, 9.6, 11.2, 12.8, 14.4, 16.0];

for (const targetTime of bottomTimes) {
  const fixtureFrame = fixture.frames.find((f: any) => Math.abs(f.videoTime - targetTime) < 0.1);
  const tfliteFrame = tflite.frames.find((f: any) => Math.abs(f.videoTime - targetTime) < 0.1);
  
  if (!fixtureFrame || !tfliteFrame) continue;
  
  const fixtureSpine = calculateSpineAngle(fixtureFrame.keypoints);
  const tfliteSpine = calculateSpineAngle(tfliteFrame.keypoints);
  const diff = Math.abs(fixtureSpine - tfliteSpine);
  
  console.log(
    targetTime.toFixed(1).padStart(6) + 's | ' +
    fixtureSpine.toFixed(1).padStart(13) + ' | ' +
    tfliteSpine.toFixed(1).padStart(12) + ' | ' +
    diff.toFixed(1).padStart(4)
  );
}

// Also show max spine for each
let fixtureMaxSpine = 0;
let tfliteMaxSpine = 0;
let fixtureMaxTime = 0;
let tfliteMaxTime = 0;

for (const frame of fixture.frames) {
  const spine = calculateSpineAngle(frame.keypoints);
  if (spine > fixtureMaxSpine) {
    fixtureMaxSpine = spine;
    fixtureMaxTime = frame.videoTime;
  }
}

for (const frame of tflite.frames) {
  const spine = calculateSpineAngle(frame.keypoints);
  if (spine > tfliteMaxSpine) {
    tfliteMaxSpine = spine;
    tfliteMaxTime = frame.videoTime;
  }
}

console.log('');
console.log('=== Maximum Spine Angles ===');
console.log('Fixture max: ' + fixtureMaxSpine.toFixed(1) + '° at ' + fixtureMaxTime.toFixed(2) + 's');
console.log('TFLite max:  ' + tfliteMaxSpine.toFixed(1) + '° at ' + tfliteMaxTime.toFixed(2) + 's');
