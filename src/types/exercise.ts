/**
 * Exercise Definition Types
 *
 * Generic types for defining exercises that can be analyzed by the FormAnalyzer.
 * Supports multiple exercises (kettlebell swings, pull-ups, pistol squats, etc.)
 * with configurable positions, angles, and rep counting criteria.
 */

/**
 * Supported exercise types
 */
export enum ExerciseType {
  KettlebellSwing = 'kettlebell_swing',
  PullUp = 'pull_up',
  PistolSquat = 'pistol_squat',
}

/**
 * Defines an angle measurement between three body points
 *
 * @example
 * // Elbow angle: shoulder-elbow-wrist
 * { point1: 'rightShoulder', vertex: 'rightElbow', point2: 'rightWrist' }
 *
 * // Hip angle: knee-hip-shoulder
 * { point1: 'rightKnee', vertex: 'rightHip', point2: 'rightShoulder' }
 */
export interface AngleDefinition {
  /** Name/identifier for this angle (e.g., 'elbow', 'hip', 'spine') */
  name: string;
  /** First point of the angle */
  point1: string;
  /** Vertex point where angle is measured */
  vertex: string;
  /** Second point of the angle */
  point2: string;
  /** Human-readable description */
  description?: string;
}

/**
 * Target angle with tolerance for scoring
 */
export interface AngleTarget {
  /** Ideal angle in degrees */
  ideal: number;
  /** Acceptable tolerance (+/- degrees) for "good" score */
  tolerance: number;
  /** Weight for this angle in position scoring (0-1) */
  weight: number;
}

/**
 * Scoring weights for position detection
 * All weights should sum to 1.0
 */
export interface ScoringWeights {
  /** Weight for angle-based scoring */
  angleScore: number;
  /** Weight for phase-appropriate timing */
  phaseScore: number;
  /** Weight for movement quality (e.g., hinge vs squat) */
  qualityScore: number;
}

/**
 * Configuration for a key angle tracked during the exercise
 */
export interface KeyAngleConfig {
  /** The angle definition */
  angle: AngleDefinition;
  /** Target values for each position (keyed by position name) */
  targets: Record<string, AngleTarget>;
  /** Whether this angle is required for analysis */
  required: boolean;
}

/**
 * Defines a position/phase within an exercise cycle
 *
 * @example
 * // Top position in kettlebell swing
 * {
 *   name: 'top',
 *   displayName: 'Top',
 *   description: 'Standing tall with arms extended',
 *   phase: 'ascend',
 *   angleTargets: { spine: { ideal: 0, tolerance: 15, weight: 0.5 }, ... }
 * }
 */
export interface PositionDefinition {
  /** Unique identifier for this position */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Description of proper form at this position */
  description: string;
  /** Which phase this position belongs to */
  phase: 'descend' | 'ascend' | 'any';
  /** Target angles for this position (keyed by angle name) */
  angleTargets: Record<string, AngleTarget>;
  /** Custom scoring weights for this position (optional) */
  scoringWeights?: ScoringWeights;
  /** Whether to capture a thumbnail at this position */
  captureThumbnail: boolean;
}

/**
 * Configuration for detecting exercise phases (e.g., downswing/upswing)
 */
export interface PhaseDetectionConfig {
  /** Which angle to use for phase detection */
  primaryAngle: string;
  /** Minimum angle change to register phase switch (degrees) */
  phaseChangeThreshold: number;
  /** Whether increasing angle means descending phase */
  increasingIsDescend: boolean;
}

/**
 * Configuration for cycle detection (when one rep starts/ends)
 */
export interface CycleDetectionConfig {
  /** Which angle to use for cycle detection */
  primaryAngle: string;
  /** Angle threshold to consider cycle reset (return to start) */
  resetThreshold: number;
  /** Minimum angle reached during cycle for it to be valid */
  minCycleAngle: number;
}

/**
 * Criteria for counting a complete rep
 */
export interface RepCriteria {
  /** Positions that must be detected for a valid rep */
  requiredPositions: string[];
  /** Position sequence that triggers rep count (e.g., ['release', 'top']) */
  completionSequence: string[];
  /** Minimum time between reps in milliseconds */
  minRepDuration: number;
  /** Maximum time for a single rep in milliseconds */
  maxRepDuration: number;
}

/**
 * Quality metrics specific to an exercise
 */
export interface QualityMetricDefinition {
  /** Metric identifier */
  name: string;
  /** Human-readable name */
  displayName: string;
  /** Description of what this metric measures */
  description: string;
  /** Range: [min, max] */
  range: [number, number];
  /** Higher is better (true) or lower is better (false) */
  higherIsBetter: boolean;
  /** Weight in overall quality score */
  weight: number;
}

/**
 * Complete definition of an exercise for form analysis
 */
export interface ExerciseDefinition {
  /** Exercise type identifier */
  type: ExerciseType;
  /** Human-readable name */
  name: string;
  /** Description of the exercise */
  description: string;

  /** Key angles to track during this exercise */
  keyAngles: KeyAngleConfig[];

  /** Positions/phases within one rep cycle */
  positions: PositionDefinition[];

  /** Configuration for detecting descend/ascend phases */
  phaseDetection: PhaseDetectionConfig;

  /** Configuration for detecting cycle boundaries */
  cycleDetection: CycleDetectionConfig;

  /** Criteria for counting reps */
  repCriteria: RepCriteria;

  /** Quality metrics for this exercise */
  qualityMetrics: QualityMetricDefinition[];

  /** Default scoring weights */
  defaultScoringWeights: ScoringWeights;
}

/**
 * Result of analyzing a single frame against an exercise definition
 */
export interface FrameAnalysisResult {
  /** Current values for each key angle */
  angles: Record<string, number>;
  /** Current phase */
  phase: 'descend' | 'ascend';
  /** Whether a cycle just completed */
  cycleCompleted: boolean;
  /** Position candidates from completed cycle (if cycleCompleted) */
  cyclePositions: Map<string, PositionCandidate> | null;
  /** Quality scores for this frame */
  qualityScores: Record<string, number>;
}

/**
 * Candidate for a position within a cycle
 */
export interface PositionCandidate {
  /** Position name */
  position: string;
  /** Frame timestamp */
  timestamp: number;
  /** Video time in seconds */
  videoTime?: number;
  /** All angle values at this frame */
  angles: Record<string, number>;
  /** Score indicating how well this matches the ideal position (lower = better) */
  score: number;
}

/**
 * Type guard to check if an exercise type is valid
 */
export function isValidExerciseType(type: string): type is ExerciseType {
  return Object.values(ExerciseType).includes(type as ExerciseType);
}
