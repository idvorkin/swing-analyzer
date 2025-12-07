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
