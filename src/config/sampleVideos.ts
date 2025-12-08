/**
 * Configuration for sample videos hosted externally.
 *
 * Videos are hosted in a separate repo to keep this repo lightweight.
 * @see https://github.com/idvorkin-ai-tools/form-analyzer-samples
 *
 * NOTE: The primary source of truth for sample videos is now ExerciseRegistry.
 * These exports are kept for backwards compatibility but delegate to the registry.
 */

import { EXERCISE_REGISTRY, getDefaultSampleVideo } from '../analyzers';

// Re-export legacy constants that delegate to the registry
// This maintains backwards compatibility while using a single source of truth

/**
 * Default sample video URL for the app (kettlebell swing).
 * @deprecated Use getDefaultSampleVideo('kettlebell-swing') instead
 */
export const DEFAULT_SAMPLE_VIDEO: string =
  getDefaultSampleVideo('kettlebell-swing') ?? '/videos/swing-sample.webm';

/**
 * Local fallback path (for development/offline use).
 */
export const LOCAL_SAMPLE_VIDEO: string =
  EXERCISE_REGISTRY['kettlebell-swing'].sampleVideos[0]?.localFallback ?? '/videos/swing-sample.webm';

/**
 * Pistol squat sample video URL.
 * @deprecated Use getDefaultSampleVideo('pistol-squat') instead
 */
export const PISTOL_SQUAT_SAMPLE_VIDEO: string =
  getDefaultSampleVideo('pistol-squat') ?? '/videos/pistol-squat-sample.webm';

/**
 * Local fallback for pistol squat (for development/offline use).
 */
export const LOCAL_PISTOL_SQUAT_VIDEO: string =
  EXERCISE_REGISTRY['pistol-squat'].sampleVideos[0]?.localFallback ?? '/videos/pistol-squat-sample.webm';

/**
 * Short test video for E2E tests (4 reps, ~5.5 seconds).
 * This is a trimmed version of swing-sample.webm for faster test execution.
 */
export const TEST_SAMPLE_VIDEO: string = '/videos/swing-sample-4reps.webm';

// Legacy SAMPLE_VIDEOS object - kept for backwards compatibility
// @deprecated Use EXERCISE_REGISTRY instead
const SAMPLES_BASE_URL =
  'https://raw.githubusercontent.com/idvorkin-ai-tools/form-analyzer-samples/main';

export const SAMPLE_VIDEOS = {
  kettlebellSwing: {
    good: `${SAMPLES_BASE_URL}/exercises/kettlebell-swing/good/swing-sample.webm`,
    igor1h: `${SAMPLES_BASE_URL}/exercises/kettlebell-swing/good/igor-1h-swing.webm`,
  },
  pistolSquat: {
    sample: `${SAMPLES_BASE_URL}/exercises/pistols/pistols.webm`,
  },
} as const;
