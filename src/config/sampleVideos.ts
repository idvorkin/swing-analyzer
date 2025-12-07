/**
 * Configuration for sample videos hosted externally.
 *
 * Videos are hosted in a separate repo to keep this repo lightweight.
 * @see https://github.com/idvorkin-ai-tools/form-analyzer-samples
 */

// Note: This URL must support CORS for browser fetch() to work.
// raw.githubusercontent.com supports CORS by default.
const SAMPLES_BASE_URL =
  'https://raw.githubusercontent.com/idvorkin-ai-tools/form-analyzer-samples/main';

export const SAMPLE_VIDEOS = {
  kettlebellSwing: {
    good: `${SAMPLES_BASE_URL}/exercises/kettlebell-swing/good/swing-sample.webm`,
    igor1h: `${SAMPLES_BASE_URL}/exercises/kettlebell-swing/good/igor-1h-swing.webm`,
  },
} as const;

/**
 * Default sample video URL for the app.
 * Falls back to local path if remote fetch fails.
 */
export const DEFAULT_SAMPLE_VIDEO: string = SAMPLE_VIDEOS.kettlebellSwing.igor1h;

/**
 * Local fallback path (for development/offline use).
 */
export const LOCAL_SAMPLE_VIDEO: string = '/videos/swing-sample.webm';

/**
 * Short test video for E2E tests (4 reps, ~5.5 seconds).
 * This is a trimmed version of swing-sample.webm for faster test execution.
 */
export const TEST_SAMPLE_VIDEO: string = '/videos/swing-sample-4reps.webm';
