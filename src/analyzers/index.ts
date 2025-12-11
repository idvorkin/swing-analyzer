/**
 * Form Analyzers
 *
 * Plugin architecture for exercise-specific form analysis.
 * Each exercise gets its own FormAnalyzer implementation.
 */

export {
  type DetectedExercise,
  type DetectionResult,
  ExerciseDetector,
  type ExerciseDetectorConfig,
} from './ExerciseDetector';
export {
  createAnalyzerForExercise,
  EXERCISE_REGISTRY,
  type ExerciseDefinition,
  getAvailableExercises,
  getDefaultSampleVideo,
  getExerciseDefinition,
  getExerciseDisplayName,
  getExerciseIcon,
  getSampleVideos,
  type SampleVideo,
} from './ExerciseRegistry';
export type {
  FormAnalyzer,
  FormAnalyzerResult,
  RepPosition,
  RepQuality,
} from './FormAnalyzer';
export {
  KettlebellSwingFormAnalyzer,
  type SwingPhase,
  type SwingThresholds,
} from './KettlebellSwingFormAnalyzer';
export {
  PistolSquatFormAnalyzer,
  type PistolSquatPhase,
  type PistolSquatThresholds,
} from './PistolSquatFormAnalyzer';
