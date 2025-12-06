/**
 * Kettlebell Swing Detector
 *
 * State machine-based detector for kettlebell swings using multiple bone angles.
 * Tracks phases: TOP → DESCENDING → BOTTOM → ASCENDING → TOP (rep complete)
 *
 * Uses three primary signals:
 * - Arm angle: shoulder-elbow angle from vertical (0=down, 90=horizontal)
 * - Spine angle: hip-shoulder angle from vertical (0=upright, 90=horizontal)
 * - Hip angle: knee-hip-shoulder angle (180=standing, 90=deep hinge)
 */

import type { Skeleton } from '../models/Skeleton';
import type {
  DetectorResult,
  ExerciseDetector,
  PhasePeak,
  RepQuality,
} from './ExerciseDetector';

/**
 * Swing phases
 */
export type SwingPhase = 'top' | 'descending' | 'bottom' | 'ascending';

/**
 * Thresholds for phase transitions (in degrees)
 */
export interface SwingThresholds {
  // TOP position
  topArmMin: number; // Arm must be above this (horizontal-ish)
  topSpineMax: number; // Spine must be below this (upright)
  topHipMin: number; // Hip must be above this (extended)

  // BOTTOM position
  bottomArmMax: number; // Arm must be below this (behind body)
  bottomSpineMin: number; // Spine must be above this (hinged)
  bottomHipMax: number; // Hip must be below this (hinged)

  // Transition thresholds
  descendingArmMax: number; // Arm dropping
  descendingSpineMin: number; // Spine tilting
  ascendingArmMin: number; // Arm rising
  ascendingSpineMax: number; // Spine straightening
}

/**
 * Default thresholds based on analysis of real swing videos
 */
const DEFAULT_THRESHOLDS: SwingThresholds = {
  // TOP: arm near horizontal, standing upright, hips extended
  topArmMin: 50, // Arm at least 50° from vertical
  topSpineMax: 25, // Spine within 25° of vertical
  topHipMin: 150, // Hip angle > 150° (nearly straight)

  // BOTTOM: arm behind, bent over, hips back
  bottomArmMax: 0, // Arm behind vertical (negative)
  bottomSpineMin: 35, // Spine at least 35° forward
  bottomHipMax: 140, // Hip angle < 140° (hinged)

  // Transitions
  descendingArmMax: 30, // Arm dropping below 30°
  descendingSpineMin: 25, // Spine starting to tilt
  ascendingArmMin: 10, // Arm starting to rise
  ascendingSpineMax: 45, // Spine starting to straighten
};

/**
 * State machine detector for kettlebell swings
 */
export class KettlebellSwingDetector implements ExerciseDetector {
  private phase: SwingPhase = 'top';
  private repCount = 0;
  private thresholds: SwingThresholds;

  // Track quality metrics during the rep
  private currentRepMetrics = {
    maxSpineAngle: 0, // Deepest hinge
    minHipAngle: 180, // Most closed hip
    maxArmAngle: 0, // Highest arm position
    minArmAngle: 90, // Lowest arm position (most behind)
    maxKneeFlexion: 0, // How much knee bent (squat detection)
  };

  // Last completed rep quality
  private lastRepQuality: RepQuality | null = null;

  // Peak tracking for current phase
  private currentPhasePeak: PhasePeak | null = null;

  // Peaks from current rep (cleared after rep completes)
  private currentRepPeaks: {
    top?: PhasePeak;
    bottom?: PhasePeak;
  } = {};

  // Last emitted peaks
  private lastPhasePeak: PhasePeak | null = null;
  private lastRepPeaks: { top?: PhasePeak; bottom?: PhasePeak } | null = null;

  // Debounce: minimum frames in a phase before transitioning
  private framesInPhase = 0;
  private readonly minFramesInPhase = 2;

  constructor(thresholds: Partial<SwingThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Process a skeleton frame through the state machine
   */
  processFrame(skeleton: Skeleton, timestamp: number = Date.now()): DetectorResult {
    // Get all angles
    const arm = skeleton.getArmToVerticalAngle();
    const spine = skeleton.getSpineAngle();
    const hip = skeleton.getHipAngle();
    const knee = skeleton.getKneeAngle();
    const angles = { arm, spine, hip, knee };

    // Track metrics for quality scoring
    this.updateMetrics(arm, spine, hip, knee);

    // Update peak tracking for current phase
    this.updatePhasePeak(skeleton, timestamp, angles);

    // Increment frames in current phase
    this.framesInPhase++;

    // Check for phase transitions
    let repCompleted = false;
    let phasePeak: PhasePeak | undefined;
    let repPeaks: { top?: PhasePeak; bottom?: PhasePeak } | undefined;

    switch (this.phase) {
      case 'top':
        if (this.shouldTransitionToDescending(arm, spine)) {
          phasePeak = this.finalizePhasePeak('top');
          this.phase = 'descending';
          this.framesInPhase = 0;
        }
        break;

      case 'descending':
        if (this.shouldTransitionToBottom(arm, spine, hip)) {
          phasePeak = this.finalizePhasePeak('descending');
          this.phase = 'bottom';
          this.framesInPhase = 0;
        }
        break;

      case 'bottom':
        if (this.shouldTransitionToAscending(arm, spine)) {
          phasePeak = this.finalizePhasePeak('bottom');
          this.phase = 'ascending';
          this.framesInPhase = 0;
        }
        break;

      case 'ascending':
        if (this.shouldTransitionToTop(arm, spine, hip)) {
          phasePeak = this.finalizePhasePeak('ascending');
          this.phase = 'top';
          this.framesInPhase = 0;
          repCompleted = true;
          this.repCount++;
          this.lastRepQuality = this.calculateRepQuality();

          // Capture rep peaks before resetting
          repPeaks = { ...this.currentRepPeaks };
          this.lastRepPeaks = repPeaks;

          this.resetMetrics();
          this.currentRepPeaks = {};
        }
        break;
    }

    // Store last phase peak for queries
    if (phasePeak) {
      this.lastPhasePeak = phasePeak;
    }

    // Build feedback for current frame
    const quality = repCompleted
      ? this.lastRepQuality!
      : this.buildCurrentFeedback(arm, spine, hip, knee);

    return {
      phase: this.phase,
      repCompleted,
      repCount: this.repCount,
      quality,
      angles,
      phasePeak,
      repPeaks,
    };
  }

  /**
   * Update peak tracking for current phase
   * Peak criteria varies by phase:
   * - TOP: highest arm angle (most horizontal)
   * - BOTTOM: highest spine angle (deepest hinge)
   * - DESCENDING/ASCENDING: not tracked (transition phases)
   */
  private updatePhasePeak(
    skeleton: Skeleton,
    timestamp: number,
    angles: { arm: number; spine: number; hip: number; knee: number }
  ): void {
    // Only track peaks for TOP and BOTTOM phases
    if (this.phase !== 'top' && this.phase !== 'bottom') {
      return;
    }

    // Calculate peak score based on phase
    const score = this.calculatePeakScore(this.phase, angles);

    // Update if this is a better peak
    if (!this.currentPhasePeak || score > this.currentPhasePeak.score) {
      this.currentPhasePeak = {
        phase: this.phase,
        timestamp,
        skeleton,
        score,
        angles: { ...angles },
      };
    }
  }

  /**
   * Calculate how "peak" this frame is for the given phase
   */
  private calculatePeakScore(
    phase: SwingPhase,
    angles: { arm: number; spine: number; hip: number; knee: number }
  ): number {
    switch (phase) {
      case 'top':
        // TOP peak: highest arm angle (most horizontal)
        return angles.arm;
      case 'bottom':
        // BOTTOM peak: highest spine angle (deepest hinge)
        return angles.spine;
      default:
        return 0;
    }
  }

  /**
   * Finalize the current phase peak and store it
   */
  private finalizePhasePeak(phase: SwingPhase): PhasePeak | undefined {
    const peak = this.currentPhasePeak;
    this.currentPhasePeak = null;

    if (peak) {
      // Store in rep peaks for TOP and BOTTOM
      if (phase === 'top') {
        this.currentRepPeaks.top = peak;
      } else if (phase === 'bottom') {
        this.currentRepPeaks.bottom = peak;
      }
    }

    return peak ?? undefined;
  }

  /**
   * Get the last detected phase peak
   */
  getLastPhasePeak(): PhasePeak | null {
    return this.lastPhasePeak;
  }

  /**
   * Get peaks from the last completed rep
   */
  getLastRepPeaks(): { top?: PhasePeak; bottom?: PhasePeak } | null {
    return this.lastRepPeaks;
  }

  /**
   * Check if we should transition from TOP to DESCENDING
   */
  private shouldTransitionToDescending(arm: number, spine: number): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    return (
      arm < this.thresholds.descendingArmMax &&
      spine > this.thresholds.descendingSpineMin
    );
  }

  /**
   * Check if we should transition from DESCENDING to BOTTOM
   */
  private shouldTransitionToBottom(
    arm: number,
    spine: number,
    hip: number
  ): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    return (
      arm < this.thresholds.bottomArmMax &&
      spine > this.thresholds.bottomSpineMin &&
      hip < this.thresholds.bottomHipMax
    );
  }

  /**
   * Check if we should transition from BOTTOM to ASCENDING
   */
  private shouldTransitionToAscending(arm: number, spine: number): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    return (
      arm > this.thresholds.ascendingArmMin &&
      spine < this.thresholds.ascendingSpineMax
    );
  }

  /**
   * Check if we should transition from ASCENDING to TOP (rep complete)
   */
  private shouldTransitionToTop(
    arm: number,
    spine: number,
    hip: number
  ): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    return (
      arm > this.thresholds.topArmMin &&
      spine < this.thresholds.topSpineMax &&
      hip > this.thresholds.topHipMin
    );
  }

  /**
   * Update tracking metrics during rep
   */
  private updateMetrics(
    arm: number,
    spine: number,
    hip: number,
    knee: number
  ): void {
    this.currentRepMetrics.maxSpineAngle = Math.max(
      this.currentRepMetrics.maxSpineAngle,
      spine
    );
    this.currentRepMetrics.minHipAngle = Math.min(
      this.currentRepMetrics.minHipAngle,
      hip
    );
    this.currentRepMetrics.maxArmAngle = Math.max(
      this.currentRepMetrics.maxArmAngle,
      arm
    );
    this.currentRepMetrics.minArmAngle = Math.min(
      this.currentRepMetrics.minArmAngle,
      arm
    );

    // Track knee flexion from standing (175°)
    const kneeFlexion = 175 - knee;
    this.currentRepMetrics.maxKneeFlexion = Math.max(
      this.currentRepMetrics.maxKneeFlexion,
      kneeFlexion
    );
  }

  /**
   * Reset metrics for next rep
   */
  private resetMetrics(): void {
    this.currentRepMetrics = {
      maxSpineAngle: 0,
      minHipAngle: 180,
      maxArmAngle: 0,
      minArmAngle: 90,
      maxKneeFlexion: 0,
    };
  }

  /**
   * Calculate quality score for completed rep
   */
  private calculateRepQuality(): RepQuality {
    const feedback: string[] = [];
    let score = 100;

    const { maxSpineAngle, minHipAngle, maxArmAngle, maxKneeFlexion } =
      this.currentRepMetrics;

    // Hinge depth scoring (ideal: 60-85°)
    if (maxSpineAngle < 40) {
      feedback.push('Go deeper - hinge more at the hips');
      score -= 20;
    } else if (maxSpineAngle < 55) {
      feedback.push('Good depth, try to hinge a bit deeper');
      score -= 10;
    }

    // Lockout scoring (ideal: arm > 70°, near horizontal)
    if (maxArmAngle < 60) {
      feedback.push('Drive hips harder - get arms to horizontal');
      score -= 15;
    } else if (maxArmAngle < 75) {
      feedback.push('Almost there - squeeze glutes at the top');
      score -= 5;
    }

    // Squat vs hinge detection (knee flexion)
    // In a proper hinge, knees shouldn't bend more than ~25°
    const kneesBentTooMuch = maxKneeFlexion > 30;
    if (kneesBentTooMuch) {
      feedback.push('Hinge, don\'t squat - keep knees softer');
      score -= 15;
    }

    // Hip extension at top
    if (minHipAngle > 160) {
      // Good hip extension
    } else if (minHipAngle > 140) {
      feedback.push('Extend hips more at the bottom');
      score -= 5;
    }

    if (feedback.length === 0) {
      feedback.push('Great rep!');
    }

    return {
      score: Math.max(0, score),
      hingeDepth: maxSpineAngle,
      lockoutAngle: maxArmAngle,
      kneesBentTooMuch,
      feedback,
    };
  }

  /**
   * Build feedback for current frame (not a completed rep)
   */
  private buildCurrentFeedback(
    arm: number,
    spine: number,
    hip: number,
    _knee: number
  ): RepQuality {
    const feedback: string[] = [];

    // Phase-specific coaching cues
    switch (this.phase) {
      case 'descending':
        if (spine < 30) {
          feedback.push('Push hips back');
        }
        break;
      case 'bottom':
        if (spine < 50) {
          feedback.push('Deeper hinge');
        }
        break;
      case 'ascending':
        if (arm < 40 && spine < 20) {
          feedback.push('Snap those hips!');
        }
        break;
      case 'top':
        if (hip < 160) {
          feedback.push('Squeeze glutes');
        }
        break;
    }

    return {
      score: 0, // Not scored until rep completes
      feedback,
    };
  }

  getPhase(): string {
    return this.phase;
  }

  getRepCount(): number {
    return this.repCount;
  }

  getLastRepQuality(): RepQuality | null {
    return this.lastRepQuality;
  }

  reset(): void {
    this.phase = 'top';
    this.repCount = 0;
    this.framesInPhase = 0;
    this.lastRepQuality = null;
    this.currentPhasePeak = null;
    this.currentRepPeaks = {};
    this.lastPhasePeak = null;
    this.lastRepPeaks = null;
    this.resetMetrics();
  }

  getExerciseName(): string {
    return 'Kettlebell Swing';
  }

  getPhases(): string[] {
    return ['top', 'descending', 'bottom', 'ascending'];
  }
}
