#!/usr/bin/env node
/**
 * Update E2E test fixture hashes to match current video files.
 *
 * This script computes the quick hash (first 64KB + file size) for each video
 * and updates the corresponding fixture files.
 *
 * Usage:
 *   node scripts/update-fixture-hashes.js         # Check and update if needed
 *   node scripts/update-fixture-hashes.js --check # Check only, exit 1 if mismatch
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VIDEOS_DIR = path.join(__dirname, '../public/videos');
const FIXTURES_DIR = path.join(__dirname, '../e2e-tests/fixtures');
const POSE_FACTORY_PATH = path.join(FIXTURES_DIR, 'pose-factory.ts');

// Map of video files to their fixture files and hash constant names
const VIDEO_FIXTURE_MAP = {
  'swing-sample-4reps.webm': {
    fixtureFile: 'poses/swing-sample-4reps.posetrack.json',
    hashConstant: 'SWING_SAMPLE_4REPS_VIDEO_HASH',
  },
  'swing-sample.webm': {
    fixtureFile: 'poses/swing-sample.posetrack.json',
    hashConstant: 'SWING_SAMPLE_VIDEO_HASH',
  },
  'igor-1h-swing.webm': {
    fixtureFile: 'poses/igor-1h-swing.posetrack.json',
    hashConstant: null, // No constant for this one yet
  },
};

/**
 * Compute quick video hash (same algorithm as computeQuickVideoHash in videoHash.ts)
 */
function computeQuickVideoHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  const chunk = buffer.slice(0, 64 * 1024); // First 64KB
  return crypto.createHash('sha256')
    .update(chunk)
    .update(buffer.length.toString())
    .digest('hex');
}

/**
 * Get current hash from fixture file
 */
function getFixtureHash(fixturePath) {
  try {
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const fixture = JSON.parse(content);
    return fixture.metadata?.sourceVideoHash || null;
  } catch {
    return null;
  }
}

/**
 * Update hash in fixture JSON file
 */
function updateFixtureHash(fixturePath, newHash) {
  const content = fs.readFileSync(fixturePath, 'utf-8');
  const fixture = JSON.parse(content);
  fixture.metadata.sourceVideoHash = newHash;
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n');
}

/**
 * Get current hash constant value from pose-factory.ts
 */
function getHashConstantValue(constantName) {
  const content = fs.readFileSync(POSE_FACTORY_PATH, 'utf-8');
  const regex = new RegExp(`${constantName}\\s*=\\s*['"]([a-f0-9]+)['"]`);
  const match = content.match(regex);
  return match ? match[1] : null;
}

/**
 * Update hash constant in pose-factory.ts
 */
function updateHashConstant(constantName, newHash) {
  let content = fs.readFileSync(POSE_FACTORY_PATH, 'utf-8');
  const regex = new RegExp(`(${constantName}\\s*=\\s*['"])([a-f0-9]+)(['"])`);
  content = content.replace(regex, `$1${newHash}$3`);
  fs.writeFileSync(POSE_FACTORY_PATH, content);
}

// Main
const checkOnly = process.argv.includes('--check');
let hasChanges = false;
let hasErrors = false;

console.log(checkOnly ? 'Checking fixture hashes...\n' : 'Updating fixture hashes...\n');

for (const [videoFile, config] of Object.entries(VIDEO_FIXTURE_MAP)) {
  const videoPath = path.join(VIDEOS_DIR, videoFile);

  if (!fs.existsSync(videoPath)) {
    console.log(`⚠️  ${videoFile}: Video file not found (run 'just download-test-videos')`);
    continue;
  }

  const actualHash = computeQuickVideoHash(videoPath);

  // Check fixture file
  const fixturePath = path.join(FIXTURES_DIR, config.fixtureFile);
  if (fs.existsSync(fixturePath)) {
    const fixtureHash = getFixtureHash(fixturePath);
    if (fixtureHash !== actualHash) {
      hasChanges = true;
      if (checkOnly) {
        console.log(`❌ ${videoFile}: Fixture hash mismatch`);
        console.log(`   Expected: ${actualHash}`);
        console.log(`   Found:    ${fixtureHash}`);
        hasErrors = true;
      } else {
        updateFixtureHash(fixturePath, actualHash);
        console.log(`✅ ${videoFile}: Updated fixture hash`);
        console.log(`   ${fixtureHash} → ${actualHash}`);
      }
    } else {
      console.log(`✓  ${videoFile}: Fixture hash matches`);
    }
  }

  // Check hash constant
  if (config.hashConstant) {
    const constantHash = getHashConstantValue(config.hashConstant);
    if (constantHash !== actualHash) {
      hasChanges = true;
      if (checkOnly) {
        console.log(`❌ ${config.hashConstant}: Constant hash mismatch`);
        console.log(`   Expected: ${actualHash}`);
        console.log(`   Found:    ${constantHash}`);
        hasErrors = true;
      } else {
        updateHashConstant(config.hashConstant, actualHash);
        console.log(`✅ ${config.hashConstant}: Updated constant hash`);
        console.log(`   ${constantHash} → ${actualHash}`);
      }
    } else {
      console.log(`✓  ${config.hashConstant}: Constant hash matches`);
    }
  }

  console.log('');
}

if (checkOnly) {
  if (hasErrors) {
    console.log('\n❌ Hash mismatches found. Run "just update-fixture-hashes" to fix.');
    process.exit(1);
  } else {
    console.log('\n✅ All hashes match.');
  }
} else {
  if (hasChanges) {
    console.log('\n✅ Hashes updated. Remember to commit the changes.');
  } else {
    console.log('\n✅ All hashes already up to date.');
  }
}
