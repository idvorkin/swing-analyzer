/**
 * FormAnalyzer Interface
 *
 * Plugin architecture for exercise-specific form analysis.
 * Each exercise (kettlebell swing, pull-up, pistol squat) gets its own
 * FormAnalyzer implementation with custom phase detection and peak tracking.
 *
 * Key insight: "Top" should be when arms reach their PEAK height,
 * not when a threshold is crossed. This requires peak detection, not threshold detection.
 */

import type { Skeleton } from '../models/Skeleton';

/**
 * A position captured at its peak during a rep.
 * Used for filmstrip thumbnails and form analysis.
 */
export interface RepPosition {
  /** Position name (e.g., 'top', 'bottom', 'connect', 'release') */
  name: string;
  /** The skeleton captured at this position's peak */
  skeleton: Skeleton;
  /** Timestamp when peak occurred (performance.now()) */
  timestamp: number;
  /** Video time in seconds (if available) */
  videoTime?: number;
  /** Angle values at the peak */
  angles: Record<string, number>;
  /** Quality score for this position (higher = better) */
  score: number;
  /** Frame thumbnail for filmstrip display (only available during extraction) */
  frameImage?: ImageData;
}

/**
 * Quality metrics for a completed rep
 */
export interface RepQuality {
  /** Overall score 0-100 */
  score: number;
  /** Exercise-specific metrics */
  metrics?: Record<string, number>;
  /** Feedback messages for the user */
  feedback: string[];
}

/**
 * Result from processing a single frame
 */
export interface FormAnalyzerResult {
  /** Current phase of the movement (e.g., 'top', 'bottom', 'connect', 'release') */
  phase: string;
  /** Whether a rep was just completed */
  repCompleted: boolean;
  /** Total rep count */
  repCount: number;
  /** Positions captured during the completed rep (only present when repCompleted=true) */
  repPositions?: RepPosition[];
  /** Quality metrics for the completed rep (only present when repCompleted=true) */
  repQuality?: RepQuality;
  /** Current angle values for display/debugging */
  angles: Record<string, number>;
}

/**
 * Interface for exercise-specific form analyzers.
 *
 * Implementations should:
 * - Use peak detection (not threshold detection) to find position peaks
 * - Track the skeleton at each phase peak
 * - Emit repPositions when a rep completes
 *
 * @example
 * // In Pipeline:
 * const result = formAnalyzer.processFrame(skeleton, timestamp);
 * if (result.repCompleted && result.repPositions) {
 *   // Emit filmstrip thumbnails
 *   this.thumbnailSubject.next({ repNumber: result.repCount, positions: result.repPositions });
 * }
 */
export interface FormAnalyzer {
  /**
   * Process a skeleton frame and detect rep completion.
   *
   * @param skeleton - The skeleton to analyze
   * @param timestamp - Frame timestamp (performance.now())
   * @param videoTime - Optional video time in seconds
   * @param frameImage - Optional frame thumbnail for filmstrip capture
   * @returns Analysis result with phase, rep count, and positions
   */
  processFrame(skeleton: Skeleton, timestamp: number, videoTime?: number, frameImage?: ImageData): FormAnalyzerResult;

  /** Get the current phase */
  getPhase(): string;

  /** Get the current rep count */
  getRepCount(): number;

  /** Get quality metrics for the last completed rep */
  getLastRepQuality(): RepQuality | null;

  /** Reset analyzer state for a new session */
  reset(): void;

  /** Get the exercise name */
  getExerciseName(): string;

  /** Get all valid phases for this exercise */
  getPhases(): string[];

  /** Get the working side for exercises that support it (e.g., pistol squat left/right leg) */
  getWorkingLeg?(): 'left' | 'right' | null;
}
