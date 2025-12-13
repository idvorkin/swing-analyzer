#!/usr/bin/env node
/**
 * Verify Pose Track File
 *
 * Checks that a pose track file is valid and matches its video:
 * 1. Hash match - sourceVideoHash matches computed video hash
 * 2. Coordinate space - keypoints are in full video coordinates (not cropped)
 * 3. Metadata consistency - dimensions, frame count, etc.
 *
 * Usage:
 *   node scripts/verify-posetrack.cjs <posetrack.json> [video.webm]
 *   node scripts/verify-posetrack.cjs --url <posetrack-url> [video-url]
 *
 * Examples:
 *   node scripts/verify-posetrack.cjs public/videos/pistols.posetrack.json
 *   node scripts/verify-posetrack.cjs --url https://raw.githubusercontent.com/.../pistols.posetrack.json https://raw.githubusercontent.com/.../pistols.webm
 */

const fs = require('node:fs');
const crypto = require('node:crypto');
const https = require('node:https');

// Compute video hash using same algorithm as app
function computeQuickVideoHash(buffer) {
  const size = buffer.length;
  const chunkSize = 1024 * 1024; // 1MB

  if (size <= chunkSize * 2) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  const firstChunk = buffer.slice(0, chunkSize);
  const lastChunk = buffer.slice(size - chunkSize, size);
  const sizeBuffer = Buffer.alloc(8);
  sizeBuffer.writeBigUInt64LE(BigInt(size), 0);
  const combined = Buffer.concat([firstChunk, lastChunk, sizeBuffer]);
  return crypto.createHash('sha256').update(combined).digest('hex');
}

// Fetch URL content
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          fetchUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

// Load pose track from file or URL
async function loadPoseTrack(source) {
  let content;
  if (source.startsWith('http')) {
    console.log(`Fetching pose track from ${source}...`);
    content = await fetchUrl(source);
    content = content.toString('utf8');
  } else {
    content = fs.readFileSync(source, 'utf8');
  }
  return JSON.parse(content);
}

// Load video from file or URL
async function loadVideo(source) {
  if (source.startsWith('http')) {
    console.log(`Fetching video from ${source}...`);
    return await fetchUrl(source);
  } else {
    return fs.readFileSync(source);
  }
}

// Analyze keypoint coordinate space
function analyzeCoordinateSpace(poseTrack) {
  const { metadata, frames } = poseTrack;
  const { videoWidth, videoHeight, cropRegion } = metadata;

  // Find frames with keypoints
  const framesWithKeypoints = frames.filter(
    (f) => f.keypoints && f.keypoints.length > 0
  );
  if (framesWithKeypoints.length === 0) {
    return { valid: false, error: 'No frames with keypoints found' };
  }

  // Sample keypoints from multiple frames
  const sampleSize = Math.min(10, framesWithKeypoints.length);
  const sampleFrames = framesWithKeypoints.slice(0, sampleSize);

  let maxX = 0,
    maxY = 0,
    minX = Infinity,
    minY = Infinity;
  let totalKeypoints = 0;

  for (const frame of sampleFrames) {
    for (const kp of frame.keypoints) {
      if (kp.score > 0.5) {
        maxX = Math.max(maxX, kp.x);
        maxY = Math.max(maxY, kp.y);
        minX = Math.min(minX, kp.x);
        minY = Math.min(minY, kp.y);
        totalKeypoints++;
      }
    }
  }

  const result = {
    sampleFrames: sampleSize,
    totalKeypoints,
    xRange: { min: minX.toFixed(0), max: maxX.toFixed(0) },
    yRange: { min: minY.toFixed(0), max: maxY.toFixed(0) },
    videoWidth,
    videoHeight,
    cropRegion,
  };

  // Check if coordinates are in full video space or cropped space
  if (cropRegion) {
    const cropWidth = cropRegion.width;

    // If max coordinates exceed crop dimensions, they're in full video space (correct)
    // If max coordinates are within crop dimensions, they might be in cropped space (wrong)
    const likelyFullCoords =
      maxX > cropWidth * 0.9 || maxX > cropRegion.x + cropWidth * 0.5;
    const likelyCroppedCoords =
      maxX < cropWidth && minX >= 0 && maxX < videoWidth * 0.7;

    result.coordinateSpace = likelyFullCoords
      ? 'FULL_VIDEO (correct)'
      : likelyCroppedCoords
        ? 'CROPPED (likely wrong!)'
        : 'UNCERTAIN';

    // Additional check: if person is within crop bounds when interpreted as full coords
    if (cropRegion.x > 0) {
      const withinCropX =
        minX >= cropRegion.x && maxX <= cropRegion.x + cropWidth;
      result.personWithinCrop = withinCropX;
    }
  } else {
    result.coordinateSpace = 'FULL_VIDEO (no crop)';
  }

  return result;
}

// Main verification
async function verify(poseTrackSource, videoSource) {
  console.log('\n=== Pose Track Verification ===\n');

  // Load pose track
  const poseTrack = await loadPoseTrack(poseTrackSource);
  const { metadata } = poseTrack;

  console.log('📋 Metadata:');
  console.log(`   Source video: ${metadata.sourceVideoName}`);
  console.log(`   Dimensions: ${metadata.videoWidth}x${metadata.videoHeight}`);
  console.log(`   Frames: ${metadata.frameCount}`);
  console.log(`   FPS: ${metadata.fps}`);
  console.log(`   Duration: ${metadata.sourceVideoDuration?.toFixed(2)}s`);
  console.log(`   Model: ${metadata.model}`);
  console.log(`   Extracted: ${metadata.extractedAt}`);
  if (metadata.cropRegion) {
    const c = metadata.cropRegion;
    console.log(`   Crop region: ${c.width}x${c.height} at (${c.x}, ${c.y})`);
  }
  console.log(`   Expected hash: ${metadata.sourceVideoHash}`);

  // Analyze coordinate space
  console.log('\n📐 Coordinate Space Analysis:');
  const coordAnalysis = analyzeCoordinateSpace(poseTrack);
  console.log(`   Sample frames: ${coordAnalysis.sampleFrames}`);
  console.log(`   Keypoints analyzed: ${coordAnalysis.totalKeypoints}`);
  console.log(
    `   X range: ${coordAnalysis.xRange.min} - ${coordAnalysis.xRange.max}`
  );
  console.log(
    `   Y range: ${coordAnalysis.yRange.min} - ${coordAnalysis.yRange.max}`
  );
  console.log(`   Coordinate space: ${coordAnalysis.coordinateSpace}`);
  if (coordAnalysis.personWithinCrop !== undefined) {
    console.log(
      `   Person within crop bounds: ${coordAnalysis.personWithinCrop ? 'Yes ✓' : 'No ⚠️'}`
    );
  }

  // Verify video hash if video provided
  if (videoSource) {
    console.log('\n🎬 Video Hash Verification:');
    const videoBuffer = await loadVideo(videoSource);
    const computedHash = computeQuickVideoHash(videoBuffer);
    const expectedHash = metadata.sourceVideoHash;

    console.log(`   Computed: ${computedHash}`);
    console.log(`   Expected: ${expectedHash}`);

    if (computedHash === expectedHash) {
      console.log('   ✅ HASH MATCH');
    } else {
      console.log(
        '   ❌ HASH MISMATCH - pose track does not match this video!'
      );
    }
  } else {
    console.log('\n⚠️  No video provided - skipping hash verification');
    console.log('   Provide video path/URL as second argument to verify hash');
  }

  // Summary
  console.log('\n=== Summary ===');
  const issues = [];

  if (coordAnalysis.coordinateSpace.includes('wrong')) {
    issues.push(
      'Coordinates appear to be in cropped space instead of full video space'
    );
  }
  if (coordAnalysis.coordinateSpace === 'UNCERTAIN') {
    issues.push(
      'Could not determine coordinate space - manual verification recommended'
    );
  }

  if (issues.length === 0) {
    console.log('✅ Pose track appears valid');
  } else {
    console.log('⚠️  Potential issues:');
    for (const issue of issues) {
      console.log(`   - ${issue}`);
    }
  }

  console.log('');
}

// Parse args and run
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(
    'Usage: node scripts/verify-posetrack.cjs <posetrack.json> [video.webm]'
  );
  console.log(
    '       node scripts/verify-posetrack.cjs --url <posetrack-url> [video-url]'
  );
  process.exit(1);
}

let poseTrackSource, videoSource;
if (args[0] === '--url') {
  poseTrackSource = args[1];
  videoSource = args[2];
} else {
  poseTrackSource = args[0];
  videoSource = args[1];
}

verify(poseTrackSource, videoSource).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
