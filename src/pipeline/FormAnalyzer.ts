/**
 * FormAnalyzer - Generic exercise form analysis
 *
 * A configurable analyzer that supports multiple exercises through
 * ExerciseDefinition configurations. This replaces exercise-specific
 * analyzers with a single, flexible implementation.
 *
 * Supports:
 * - Kettlebell swings, pull-ups, pistol squats, etc.
 * - Configurable position detection via angle targets
 * - Configurable phase/cycle detection
 * - Configurable rep counting criteria
 */

import type { Skeleton } from '../models/Skeleton';
import type {
  ExerciseDefinition,
  FrameAnalysisResult,
  PositionCandidate,
} from '../types/exercise';

/**
 * Complete result from processFrame()
 */
export interface FormAnalysisFrameResult {
  /** The skeleton that was analyzed */
  skeleton: Skeleton;
  /** Current detected position (best match) */
  position: string | null;
  /** Current rep count */
  repCount: number;
  /** Whether a rep was just completed */
  repCompleted: boolean;
  /** Current angle values */
  angles: Record<string, number>;
  /** Quality scores for this frame */
  qualityScores: Record<string, number>;
  /** Position candidates from completed cycle (if repCompleted) */
  cyclePositions: Map<string, PositionCandidate> | null;
}

/**
 * Internal position candidate with more details
 */
interface InternalPositionCandidate extends PositionCandidate {
  skeleton: Skeleton;
}

/**
 * Generic form analyzer that works with any ExerciseDefinition
 */
export class FormAnalyzer {
  private readonly exercise: ExerciseDefinition;

  // Cycle tracking state
  private isDescending = true;
  private prevPrimaryAngle = 0;
  private maxPrimaryAngleInCycle = 0;

  // Best candidates for each position in current cycle
  private bestPositionCandidates = new Map<string, InternalPositionCandidate>();

  // Rep counting state
  private repCount = 0;
  private detectedPositions = new Set<string>();
  private lastPosition: string | null = null;
  private lastRepTimestamp = 0;

  constructor(exercise: ExerciseDefinition) {
    this.exercise = exercise;
  }

  /**
   * Process a skeleton frame and return complete analysis with rep counting.
   *
   * @param skeleton - The skeleton to analyze
   * @param timestamp - Frame timestamp in milliseconds
   * @param videoTime - Optional video time in seconds
   * @returns Complete frame result including position, rep count, and angles
   */
  processFrame(
    skeleton: Skeleton,
    timestamp: number = Date.now(),
    videoTime?: number
  ): FormAnalysisFrameResult {
    // Calculate all configured angles
    const angles = this.calculateAngles(skeleton);

    // Run the core analysis
    const analysis = this.analyzeFrame(skeleton, timestamp, videoTime, angles);

    // Determine current position based on angles
    const currentPosition = this.detectCurrentPosition(angles, analysis.phase);

    // Calculate quality scores
    const qualityScores = this.calculateQualityScores(skeleton, angles);

    // Track positions and count reps
    let repCompleted = false;
    if (currentPosition) {
      this.detectedPositions.add(currentPosition);

      // Check for rep completion based on criteria
      const criteria = this.exercise.repCriteria;
      const sequence = criteria.completionSequence;

      if (
        sequence.length >= 2 &&
        this.lastPosition === sequence[0] &&
        currentPosition === sequence[1] &&
        this.hasRequiredPositions()
      ) {
        // Check timing constraints
        const timeSinceLastRep = timestamp - this.lastRepTimestamp;
        if (
          timeSinceLastRep >= criteria.minRepDuration &&
          (this.lastRepTimestamp === 0 ||
            timeSinceLastRep <= criteria.maxRepDuration)
        ) {
          this.repCount++;
          repCompleted = true;
          this.lastRepTimestamp = timestamp;
          this.detectedPositions.clear();
          this.detectedPositions.add(currentPosition);
        }
      }

      this.lastPosition = currentPosition;
    }

    return {
      skeleton,
      position: currentPosition,
      repCount: this.repCount,
      repCompleted,
      angles,
      qualityScores,
      cyclePositions: analysis.cyclePositions,
    };
  }

  /**
   * Calculate all configured angles from the skeleton
   */
  private calculateAngles(skeleton: Skeleton): Record<string, number> {
    const angles: Record<string, number> = {};

    for (const keyAngle of this.exercise.keyAngles) {
      const { angle } = keyAngle;

      // Handle special angle names that have dedicated methods
      if (angle.name === 'spine') {
        angles[angle.name] = Math.abs(skeleton.getSpineAngle());
      } else if (angle.name === 'hip') {
        angles[angle.name] = skeleton.getHipAngle();
      } else if (angle.name === 'knee') {
        angles[angle.name] = skeleton.getKneeAngle();
      } else if (angle.name === 'elbow') {
        angles[angle.name] = skeleton.getElbowAngle();
      } else if (angle.name === 'armToVertical') {
        angles[angle.name] = skeleton.getArmToVerticalAngle();
      } else {
        // Use generic angle calculation
        const value = skeleton.getAngle(
          angle.point1,
          angle.vertex,
          angle.point2
        );
        angles[angle.name] = value ?? 0;
      }
    }

    return angles;
  }

  /**
   * Analyze a frame and return cycle/phase information
   */
  private analyzeFrame(
    skeleton: Skeleton,
    timestamp: number,
    videoTime: number | undefined,
    angles: Record<string, number>
  ): FrameAnalysisResult {
    const { phaseDetection, cycleDetection } = this.exercise;
    const primaryAngle = angles[phaseDetection.primaryAngle] ?? 0;

    // Detect phase direction
    const isIncreasing = primaryAngle > this.prevPrimaryAngle;
    if (
      Math.abs(primaryAngle - this.prevPrimaryAngle) >
      phaseDetection.phaseChangeThreshold
    ) {
      // Phase change detected
      if (phaseDetection.increasingIsDescend) {
        this.isDescending = isIncreasing;
      } else {
        this.isDescending = !isIncreasing;
      }
    }
    this.prevPrimaryAngle = primaryAngle;

    // Track max angle in cycle
    this.maxPrimaryAngleInCycle = Math.max(
      this.maxPrimaryAngleInCycle,
      primaryAngle
    );

    // Check for cycle completion
    const cycleAngle = angles[cycleDetection.primaryAngle] ?? 0;
    const cycleCompleted =
      this.maxPrimaryAngleInCycle > cycleDetection.minCycleAngle &&
      cycleAngle < cycleDetection.resetThreshold;

    let cyclePositions: Map<string, PositionCandidate> | null = null;

    if (cycleCompleted) {
      // Capture the positions from this cycle
      cyclePositions = new Map();
      for (const [name, candidate] of this.bestPositionCandidates) {
        // Strip skeleton from the exported version
        const { skeleton: _s, ...rest } = candidate;
        cyclePositions.set(name, rest);
      }

      // Reset for next cycle
      this.bestPositionCandidates.clear();
      this.maxPrimaryAngleInCycle = 0;
    } else {
      // Update position candidates
      this.updatePositionCandidates(skeleton, timestamp, videoTime, angles);
    }

    return {
      angles,
      phase: this.isDescending ? 'descend' : 'ascend',
      cycleCompleted,
      cyclePositions,
      qualityScores: {},
    };
  }

  /**
   * Update best candidates for each position
   */
  private updatePositionCandidates(
    skeleton: Skeleton,
    timestamp: number,
    videoTime: number | undefined,
    angles: Record<string, number>
  ): void {
    const currentPhase = this.isDescending ? 'descend' : 'ascend';

    for (const position of this.exercise.positions) {
      // Skip positions that don't match current phase
      if (position.phase !== 'any' && position.phase !== currentPhase) {
        continue;
      }

      const score = this.calculatePositionScore(position.name, angles);
      const currentBest = this.bestPositionCandidates.get(position.name);

      if (!currentBest || score < currentBest.score) {
        this.bestPositionCandidates.set(position.name, {
          skeleton,
          position: position.name,
          timestamp,
          videoTime,
          angles: { ...angles },
          score,
        });
      }
    }
  }

  /**
   * Calculate how well current angles match a target position
   * Lower score = better match
   */
  private calculatePositionScore(
    positionName: string,
    angles: Record<string, number>
  ): number {
    const position = this.exercise.positions.find(
      (p) => p.name === positionName
    );
    if (!position) return 1000;

    let totalScore = 0;
    let totalWeight = 0;

    for (const [angleName, target] of Object.entries(position.angleTargets)) {
      const currentAngle = angles[angleName];
      if (currentAngle === undefined) continue;

      const delta = Math.abs(currentAngle - target.ideal);
      const normalizedDelta = delta / (target.tolerance || 15);
      totalScore += normalizedDelta * target.weight;
      totalWeight += target.weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 1000;
  }

  /**
   * Detect the current position based on angles and phase
   */
  private detectCurrentPosition(
    angles: Record<string, number>,
    phase: 'descend' | 'ascend'
  ): string | null {
    let bestPosition: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const position of this.exercise.positions) {
      // Check phase compatibility
      if (position.phase !== 'any' && position.phase !== phase) {
        continue;
      }

      const score = this.calculatePositionScore(position.name, angles);

      // Only consider if score is reasonable (within tolerance)
      if (score < 2.0 && score < bestScore) {
        bestScore = score;
        bestPosition = position.name;
      }
    }

    return bestPosition;
  }

  /**
   * Check if we've detected all required positions for a valid rep
   */
  private hasRequiredPositions(): boolean {
    const required = this.exercise.repCriteria.requiredPositions;
    return required.every((pos) => this.detectedPositions.has(pos));
  }

  /**
   * Calculate quality scores based on exercise-specific metrics
   */
  private calculateQualityScores(
    skeleton: Skeleton,
    angles: Record<string, number>
  ): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const metric of this.exercise.qualityMetrics) {
      // Calculate metric-specific score
      switch (metric.name) {
        case 'hingeScore':
          scores[metric.name] = skeleton.getHingeVsSquatScore();
          break;
        case 'depthScore': {
          // Calculate based on spine angle at bottom
          const spineAngle = angles['spine'] ?? 0;
          const idealBottom = 85;
          const delta = Math.abs(spineAngle - idealBottom);
          scores[metric.name] = Math.max(0, 100 - delta * 2);
          break;
        }
        case 'lockoutScore': {
          // Calculate based on hip angle at top
          const hipAngle = angles['hip'] ?? 0;
          const idealTop = 170;
          const delta = Math.abs(hipAngle - idealTop);
          scores[metric.name] = Math.max(0, 100 - delta * 2);
          break;
        }
        default:
          scores[metric.name] = 0;
      }
    }

    return scores;
  }

  /**
   * Get the current rep count
   */
  getRepCount(): number {
    return this.repCount;
  }

  /**
   * Get the exercise definition
   */
  getExercise(): ExerciseDefinition {
    return this.exercise;
  }

  /**
   * Check if currently in descending phase
   */
  getIsDescending(): boolean {
    return this.isDescending;
  }

  /**
   * Get max primary angle in current cycle
   */
  getMaxPrimaryAngleInCycle(): number {
    return this.maxPrimaryAngleInCycle;
  }

  /**
   * Reset analyzer state for a new analysis session
   */
  reset(): void {
    this.isDescending = true;
    this.prevPrimaryAngle = 0;
    this.maxPrimaryAngleInCycle = 0;
    this.bestPositionCandidates.clear();
    this.repCount = 0;
    this.detectedPositions.clear();
    this.lastPosition = null;
    this.lastRepTimestamp = 0;
  }
}
