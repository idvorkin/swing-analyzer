/**
 * Configuration for sample videos hosted externally.
 *
 * Videos are hosted in a separate repo to keep this repo lightweight.
 * @see https://github.com/idvorkin-ai-tools/form-analyzer-samples
 */

const SAMPLES_BASE_URL =
  'https://raw.githubusercontent.com/idvorkin-ai-tools/form-analyzer-samples/main';

export const SAMPLE_VIDEOS = {
  kettlebellSwing: {
    good: `${SAMPLES_BASE_URL}/exercises/kettlebell-swing/good/swing-sample.webm`,
  },
} as const;

/**
 * Default sample video URL for the app.
 * Falls back to local path if remote fetch fails.
 */
export const DEFAULT_SAMPLE_VIDEO: string = SAMPLE_VIDEOS.kettlebellSwing.good;

/**
 * Local fallback path (for development/offline use).
 */
export const LOCAL_SAMPLE_VIDEO: string = '/videos/swing-sample.webm';
