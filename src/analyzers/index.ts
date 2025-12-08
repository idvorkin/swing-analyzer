/**
 * Form Analyzers
 *
 * Plugin architecture for exercise-specific form analysis.
 * Each exercise gets its own FormAnalyzer implementation.
 */

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

export {
  ExerciseDetector,
  type DetectedExercise,
  type DetectionResult,
  type ExerciseDetectorConfig,
} from './ExerciseDetector';

export {
  EXERCISE_REGISTRY,
  createAnalyzerForExercise,
  getExerciseDefinition,
  getExerciseDisplayName,
  getExerciseIcon,
  getAvailableExercises,
  getDefaultSampleVideo,
  getSampleVideos,
  type ExerciseDefinition,
  type SampleVideo,
} from './ExerciseRegistry';
