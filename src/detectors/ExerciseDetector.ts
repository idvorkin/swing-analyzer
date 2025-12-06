/**
 * Exercise Detector Interface
 *
 * Base interface for exercise-specific state machine detectors.
 * Each exercise (kettlebell swing, pull-up, pistol squat) gets its own
 * detector with custom phases and transition logic.
 */

import type { Skeleton } from '../models/Skeleton';

/**
 * Quality metrics for a single rep
 */
export interface RepQuality {
  /** Overall score 0-100 */
  score: number;
  /** Hinge depth in degrees (higher = deeper) */
  hingeDepth?: number;
  /** Lockout quality - hip extension at top */
  lockoutAngle?: number;
  /** Whether knees bent too much (squat vs hinge) */
  kneesBentTooMuch?: boolean;
  /** Specific feedback messages */
  feedback: string[];
}

/**
 * Peak (best frame) detected within a phase
 */
export interface PhasePeak {
  /** Phase this peak was detected in */
  phase: string;
  /** Timestamp when peak occurred */
  timestamp: number;
  /** The skeleton at the peak */
  skeleton: Skeleton;
  /** Score indicating how "peak" this frame is (higher = better) */
  score: number;
  /** Angles at the peak */
  angles: {
    arm: number;
    spine: number;
    hip: number;
    knee: number;
  };
}

/**
 * Result from processing a single frame
 */
export interface DetectorResult {
  /** Current phase of the movement */
  phase: string;
  /** Whether a rep was just completed */
  repCompleted: boolean;
  /** Total rep count */
  repCount: number;
  /** Quality metrics for current frame/rep */
  quality: RepQuality;
  /** Angles used for this detection */
  angles: {
    arm: number;
    spine: number;
    hip: number;
    knee: number;
  };
  /** Peak detected in previous phase (emitted on phase transition) */
  phasePeak?: PhasePeak;
  /** All peaks from the completed rep (emitted when repCompleted=true) */
  repPeaks?: {
    top?: PhasePeak;
    bottom?: PhasePeak;
  };
}

/**
 * Interface for exercise-specific detectors
 */
export interface ExerciseDetector {
  /** Process a skeleton frame and return detection result */
  processFrame(skeleton: Skeleton, timestamp?: number): DetectorResult;

  /** Get current phase */
  getPhase(): string;

  /** Get current rep count */
  getRepCount(): number;

  /** Get quality metrics for the last completed rep */
  getLastRepQuality(): RepQuality | null;

  /** Reset detector state */
  reset(): void;

  /** Get the exercise name */
  getExerciseName(): string;

  /** Get all valid phases for this exercise */
  getPhases(): string[];
}
