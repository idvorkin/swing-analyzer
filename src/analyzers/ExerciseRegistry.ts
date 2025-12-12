/**
 * Exercise Registry
 *
 * Central registry for all exercise definitions. This eliminates hardcoded
 * exercise-specific logic scattered across the codebase by providing a single
 * source of truth for exercise metadata.
 *
 * To add a new exercise:
 * 1. Add the exercise ID to DetectedExercise type in ExerciseDetector.ts
 * 2. Create a FormAnalyzer implementation
 * 3. Add the exercise definition here
 */

import type { DetectedExercise } from './ExerciseDetector';
import type { FormAnalyzer } from './FormAnalyzer';
import { KettlebellSwingFormAnalyzer } from './KettlebellSwingFormAnalyzer';
import { PistolSquatFormAnalyzer } from './PistolSquatFormAnalyzer';

/**
 * Sample video configuration for an exercise
 */
export interface SampleVideo {
  /** Display name for the sample */
  name: string;
  /** Remote URL (must support CORS) */
  url: string;
  /** Local fallback path for offline/development use */
  localFallback: string;
  /**
   * Optional URL to a pre-extracted pose track file (.posetrack.json).
   * If provided, this will be loaded into the cache before processing,
   * allowing instant playback without ML extraction.
   */
  bundledPoseTrackUrl?: string;
  /**
   * Local fallback path for bundled pose track (for development/offline use).
   */
  bundledPoseTrackLocalFallback?: string;
}

/**
 * Complete definition of an exercise type
 */
export interface ExerciseDefinition {
  /** Unique identifier (matches DetectedExercise type) */
  id: DetectedExercise;
  /** Human-readable display name */
  displayName: string;
  /** Emoji icon for UI display */
  icon: string;
  /** Factory function to create the form analyzer */
  createAnalyzer: () => FormAnalyzer;
  /** Sample videos for this exercise */
  sampleVideos: SampleVideo[];
}

// Base URL for sample videos hosted externally
const SAMPLES_BASE_URL =
  'https://raw.githubusercontent.com/idvorkin-ai-tools/form-analyzer-samples/main';

/**
 * Registry of all supported exercises
 */
export const EXERCISE_REGISTRY: Record<
  Exclude<DetectedExercise, 'unknown'>,
  ExerciseDefinition
> = {
  'kettlebell-swing': {
    id: 'kettlebell-swing',
    displayName: 'Kettlebell Swing',
    icon: '\u{1F3CB}', // weight lifter
    createAnalyzer: () => new KettlebellSwingFormAnalyzer(),
    sampleVideos: [
      {
        name: 'Igor 1H Swing',
        url: `${SAMPLES_BASE_URL}/exercises/kettlebell-swing/good/igor-1h-swing.webm`,
        localFallback: '/videos/swing-sample.webm',
        bundledPoseTrackUrl: `${SAMPLES_BASE_URL}/exercises/kettlebell-swing/good/swing-sample.posetrack.json`,
        bundledPoseTrackLocalFallback: '/videos/swing-sample.posetrack.json',
      },
      {
        name: 'Good Form',
        url: `${SAMPLES_BASE_URL}/exercises/kettlebell-swing/good/swing-sample.webm`,
        localFallback: '/videos/swing-sample.webm',
        bundledPoseTrackUrl: `${SAMPLES_BASE_URL}/exercises/kettlebell-swing/good/swing-sample.posetrack.json`,
        bundledPoseTrackLocalFallback: '/videos/swing-sample.posetrack.json',
      },
    ],
  },
  'pistol-squat': {
    id: 'pistol-squat',
    displayName: 'Pistol Squat',
    icon: '\u{1F9CE}', // kneeling person
    createAnalyzer: () => new PistolSquatFormAnalyzer(),
    sampleVideos: [
      {
        name: 'Sample',
        url: `${SAMPLES_BASE_URL}/exercises/pistols/pistols.webm`,
        localFallback: '/videos/pistol-squat-sample.webm',
        bundledPoseTrackUrl: `${SAMPLES_BASE_URL}/exercises/pistols/pistol-squat-sample.posetrack.json`,
        bundledPoseTrackLocalFallback:
          '/videos/pistol-squat-sample.posetrack.json',
      },
    ],
  },
};

/**
 * Get the exercise definition for a detected exercise type.
 * Returns undefined for 'unknown' exercise type.
 */
export function getExerciseDefinition(
  exercise: DetectedExercise
): ExerciseDefinition | undefined {
  if (exercise === 'unknown') return undefined;
  return EXERCISE_REGISTRY[exercise];
}

/**
 * Create a FormAnalyzer for the given exercise type.
 * Returns a default KettlebellSwingFormAnalyzer for 'unknown'.
 */
export function createAnalyzerForExercise(
  exercise: DetectedExercise
): FormAnalyzer {
  const definition = getExerciseDefinition(exercise);
  if (!definition) {
    console.warn(
      `[ExerciseRegistry] Unknown exercise "${exercise}", defaulting to kettlebell swing. User should override manually.`
    );
    return new KettlebellSwingFormAnalyzer();
  }
  return definition.createAnalyzer();
}

/**
 * Get display name for an exercise type.
 */
export function getExerciseDisplayName(exercise: DetectedExercise): string {
  if (exercise === 'unknown') return 'Detecting...';
  return EXERCISE_REGISTRY[exercise].displayName;
}

/**
 * Get icon for an exercise type.
 */
export function getExerciseIcon(exercise: DetectedExercise): string {
  if (exercise === 'unknown') return '\u{1F50D}'; // magnifying glass
  return EXERCISE_REGISTRY[exercise].icon;
}

/**
 * Get all available exercise IDs (excluding 'unknown').
 */
export function getAvailableExercises(): Exclude<
  DetectedExercise,
  'unknown'
>[] {
  return Object.keys(EXERCISE_REGISTRY) as Exclude<
    DetectedExercise,
    'unknown'
  >[];
}

/**
 * Get the default sample video URL for an exercise.
 */
export function getDefaultSampleVideo(
  exercise: DetectedExercise
): string | undefined {
  const definition = getExerciseDefinition(exercise);
  return definition?.sampleVideos[0]?.url;
}

/**
 * Get all sample videos for an exercise.
 */
export function getSampleVideos(exercise: DetectedExercise): SampleVideo[] {
  const definition = getExerciseDefinition(exercise);
  return definition?.sampleVideos ?? [];
}
