/**
 * Pose Fixtures Index
 *
 * Exports all pose track fixtures for E2E tests.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { PoseTrackFile } from '../../src/types/posetrack';
import {
  createPoorDetectionPoseTrack,
  createPoseTrackWithReps,
  createSinglePhasePoseTrack,
  SWING_SAMPLE_VIDEO_HASH,
  SWING_SAMPLE_4REPS_VIDEO_HASH,
  SwingPhase,
} from './pose-factory';

// Re-export the factory functions
export {
  createPoorDetectionPoseTrack,
  createPoseTrackWithReps,
  createSinglePhasePoseTrack,
  SwingPhase,
  SWING_SAMPLE_VIDEO_HASH,
  SWING_SAMPLE_4REPS_VIDEO_HASH,
};

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load JSON file synchronously (for test fixtures)
 */
function loadJsonFile(filename: string): PoseTrackFile {
  const filePath = path.join(__dirname, 'poses', filename);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    // Basic validation to ensure required fields exist
    if (!parsed.metadata || !parsed.frames) {
      throw new Error('Invalid fixture format: missing metadata or frames');
    }
    return parsed as PoseTrackFile;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load fixture "${filename}" from ${filePath}: ${message}`
    );
  }
}

/**
 * Pre-generated fixtures
 * These match the JSON files in the poses/ directory
 */
export const FIXTURES = {
  /** Main swing sample fixture - matches swing-sample.webm hardcoded video */
  'swing-sample': () =>
    Promise.resolve(loadJsonFile('swing-sample.posetrack.json')),

  /** Short 4-rep fixture for fast E2E tests (~5.5 seconds, 4 reps) */
  'swing-sample-4reps': () =>
    Promise.resolve(loadJsonFile('swing-sample-4reps.posetrack.json')),

  /** Generate fixture with exactly 1 complete rep */
  'single-rep': () =>
    Promise.resolve(
      createPoseTrackWithReps(1, {
        videoHash: SWING_SAMPLE_VIDEO_HASH,
        videoName: 'single-rep.mp4',
      })
    ),

  /** Generate fixture with exactly 3 complete reps */
  'three-reps': () =>
    Promise.resolve(
      createPoseTrackWithReps(3, {
        videoHash: SWING_SAMPLE_VIDEO_HASH,
        videoName: 'three-reps.mp4',
      })
    ),

  /** Generate fixture with 2 complete reps + 1 partial */
  'partial-rep': () =>
    Promise.resolve(
      createPoseTrackWithReps(2, {
        videoHash: SWING_SAMPLE_VIDEO_HASH,
        videoName: 'partial-rep.mp4',
        includePartialRep: true,
      })
    ),

  /** Generate fixture with poor detection quality */
  'poor-detection': () => Promise.resolve(createPoorDetectionPoseTrack(90)),

  /** Generate fixture with only top position frames */
  'top-position-only': () =>
    Promise.resolve(createSinglePhasePoseTrack(SwingPhase.TOP, 30)),

  /** Generate fixture with only bottom position frames */
  'bottom-position-only': () =>
    Promise.resolve(createSinglePhasePoseTrack(SwingPhase.BOTTOM, 30)),
} as const;

export type FixtureName = keyof typeof FIXTURES;

/**
 * Load a fixture by name
 */
export async function loadFixture(name: FixtureName): Promise<PoseTrackFile> {
  const loader = FIXTURES[name];
  if (!loader) {
    throw new Error(`Unknown fixture: ${name}`);
  }
  return loader();
}

/**
 * Get all available fixture names
 */
export function getAvailableFixtures(): FixtureName[] {
  return Object.keys(FIXTURES) as FixtureName[];
}
