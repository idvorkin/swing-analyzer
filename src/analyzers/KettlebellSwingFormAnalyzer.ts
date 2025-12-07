/**
 * Kettlebell Swing Form Analyzer
 *
 * Peak-based state machine for analyzing kettlebell swing form.
 * Tracks phases: TOP → CONNECT → BOTTOM → RELEASE → TOP (rep complete)
 *
 * Key insight: "Top" is detected when wrist height reaches its PEAK
 * (arms at apex) and starts descending. This is more accurate than
 * threshold-based detection which triggers at arbitrary angle crossings.
 *
 * Phase meanings:
 * - TOP: Arms at peak height, standing upright (lockout position)
 * - CONNECT: Hinge initiating, arms approaching body
 * - BOTTOM: Deepest hinge, arms behind body
 * - RELEASE: Arms leaving body after hip snap
 */

import type { Skeleton } from '../models/Skeleton';
import type {
  FormAnalyzer,
  FormAnalyzerResult,
  RepPosition,
  RepQuality,
} from './FormAnalyzer';

/**
 * Swing phases
 */
export type SwingPhase = 'top' | 'connect' | 'bottom' | 'release';

/**
 * Thresholds for phase transitions (in degrees)
 */
export interface SwingThresholds {
  // TOP position
  topSpineMax: number; // Spine must be below this (upright)
  topHipMin: number; // Hip must be above this (extended)

  // BOTTOM position
  bottomArmMax: number; // Arm must be below this (behind body)
  bottomSpineMin: number; // Spine must be above this (hinged)
  bottomHipMax: number; // Hip must be below this (hinged)

  // CONNECT thresholds (hinge initiation)
  connectArmMax: number; // Arm dropping toward body
  connectSpineMin: number; // Spine starting to tilt

  // RELEASE thresholds (arms leaving body)
  releaseArmMin: number; // Arm starting to rise
  releaseSpineMax: number; // Spine should be vertical
}

/**
 * Default thresholds based on analysis of real swing videos
 */
const DEFAULT_THRESHOLDS: SwingThresholds = {
  topSpineMax: 25,
  topHipMin: 150,
  bottomArmMax: 0,
  bottomSpineMin: 35,
  bottomHipMax: 140,
  connectArmMax: 30,
  connectSpineMin: 20,
  releaseArmMin: 10,
  releaseSpineMax: 25,
};

/**
 * Internal peak tracking during a phase
 */
interface PhasePeak {
  phase: SwingPhase;
  skeleton: Skeleton;
  timestamp: number;
  videoTime?: number;
  score: number;
  angles: { arm: number; spine: number; hip: number; knee: number };
}

/**
 * Kettlebell Swing Form Analyzer
 *
 * Implements the FormAnalyzer interface with peak-based phase detection.
 */
export class KettlebellSwingFormAnalyzer implements FormAnalyzer {
  private phase: SwingPhase = 'top';
  private repCount = 0;
  private thresholds: SwingThresholds;

  // Track quality metrics during the rep
  private currentRepMetrics = {
    maxSpineAngle: 0,
    minHipAngle: 180,
    maxArmAngle: 0,
    minArmAngle: 90,
    maxKneeFlexion: 0,
  };

  // Last completed rep quality
  private lastRepQuality: RepQuality | null = null;

  // Peak tracking for current phase
  private currentPhasePeak: PhasePeak | null = null;

  // Peaks from current rep (cleared after rep completes)
  private currentRepPeaks: {
    top?: PhasePeak;
    connect?: PhasePeak;
    bottom?: PhasePeak;
    release?: PhasePeak;
  } = {};

  // Debounce: minimum frames in a phase before transitioning
  private framesInPhase = 0;
  private readonly minFramesInPhase = 2;

  // Wrist height history for peak detection
  private wristHeightHistory: number[] = [];
  private readonly wristHeightWindowSize = 5;

  constructor(thresholds: Partial<SwingThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Process a skeleton frame through the state machine
   */
  processFrame(
    skeleton: Skeleton,
    timestamp: number = Date.now(),
    videoTime?: number
  ): FormAnalyzerResult {
    // Get all angles
    const arm = skeleton.getArmToVerticalAngle();
    const spine = skeleton.getSpineAngle();
    const hip = skeleton.getHipAngle();
    const knee = skeleton.getKneeAngle();
    const wristHeight = skeleton.getWristHeight();
    const angles = { arm, spine, hip, knee, wristHeight };

    // Track wrist height history for peak detection
    this.wristHeightHistory.push(wristHeight);
    if (this.wristHeightHistory.length > this.wristHeightWindowSize * 2) {
      this.wristHeightHistory = this.wristHeightHistory.slice(
        -this.wristHeightWindowSize * 2
      );
    }

    // Track metrics for quality scoring
    this.updateMetrics(arm, spine, hip, knee);

    // Update peak tracking for current phase
    this.updatePhasePeak(skeleton, timestamp, videoTime, { arm, spine, hip, knee });

    // Increment frames in current phase
    this.framesInPhase++;

    // Check for phase transitions
    let repCompleted = false;
    let repPositions: RepPosition[] | undefined;

    switch (this.phase) {
      case 'top':
        if (this.shouldTransitionToConnect(arm, spine)) {
          this.finalizePhasePeak('top');
          this.phase = 'connect';
          this.framesInPhase = 0;
        }
        break;

      case 'connect':
        if (this.shouldTransitionToBottom(arm, spine, hip)) {
          this.finalizePhasePeak('connect');
          this.phase = 'bottom';
          this.framesInPhase = 0;
        }
        break;

      case 'bottom':
        if (this.shouldTransitionToRelease(arm, spine)) {
          this.finalizePhasePeak('bottom');
          this.phase = 'release';
          this.framesInPhase = 0;
        }
        break;

      case 'release':
        if (this.shouldTransitionToTop(spine, hip)) {
          this.finalizePhasePeak('release');
          this.phase = 'top';
          this.framesInPhase = 0;
          repCompleted = true;
          this.repCount++;
          this.lastRepQuality = this.calculateRepQuality();

          // Convert peaks to RepPosition array
          repPositions = this.convertPeaksToPositions();

          this.resetMetrics();
          this.currentRepPeaks = {};
        }
        break;
    }

    return {
      phase: this.phase,
      repCompleted,
      repCount: this.repCount,
      repPositions,
      repQuality: repCompleted ? this.lastRepQuality ?? undefined : undefined,
      angles,
    };
  }

  /**
   * Convert internal peak tracking to RepPosition array
   */
  private convertPeaksToPositions(): RepPosition[] {
    const positions: RepPosition[] = [];

    for (const [phaseName, peak] of Object.entries(this.currentRepPeaks)) {
      if (!peak) continue;

      positions.push({
        name: phaseName,
        skeleton: peak.skeleton,
        timestamp: peak.timestamp,
        videoTime: peak.videoTime,
        angles: {
          arm: peak.angles.arm,
          spine: peak.angles.spine,
          hip: peak.angles.hip,
          knee: peak.angles.knee,
        },
        score: peak.score,
      });
    }

    return positions;
  }

  /**
   * Update peak tracking for current phase
   */
  private updatePhasePeak(
    skeleton: Skeleton,
    timestamp: number,
    videoTime: number | undefined,
    angles: { arm: number; spine: number; hip: number; knee: number }
  ): void {
    const score = this.calculatePeakScore(this.phase, angles);

    // For CONNECT and RELEASE, we want the FIRST qualifying frame (timing matters)
    // For TOP and BOTTOM, we want the BEST frame (extremes matter)
    const isTimingPhase = this.phase === 'connect' || this.phase === 'release';

    if (isTimingPhase) {
      if (!this.currentPhasePeak) {
        this.currentPhasePeak = {
          phase: this.phase,
          timestamp,
          videoTime,
          skeleton,
          score,
          angles: { ...angles },
        };
      }
    } else {
      if (!this.currentPhasePeak || score > this.currentPhasePeak.score) {
        this.currentPhasePeak = {
          phase: this.phase,
          timestamp,
          videoTime,
          skeleton,
          score,
          angles: { ...angles },
        };
      }
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
        return angles.arm; // Highest arm = best lockout
      case 'connect':
        return 90 - angles.arm; // Lower arm = better (arms down when hinge starts)
      case 'bottom':
        return angles.spine; // Highest spine = deepest hinge
      case 'release':
        return 90 - angles.spine; // Lower spine = better (vertical when arms release)
      default:
        return 0;
    }
  }

  /**
   * Finalize the current phase peak and store it
   */
  private finalizePhasePeak(phase: SwingPhase): void {
    const peak = this.currentPhasePeak;
    this.currentPhasePeak = null;

    if (peak) {
      this.currentRepPeaks[phase] = peak;
    }
  }

  /**
   * Check if we should transition from TOP to CONNECT
   */
  private shouldTransitionToConnect(arm: number, spine: number): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    return (
      arm < this.thresholds.connectArmMax && spine > this.thresholds.connectSpineMin
    );
  }

  /**
   * Check if we should transition from CONNECT to BOTTOM
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
   * Check if we should transition from BOTTOM to RELEASE
   */
  private shouldTransitionToRelease(arm: number, spine: number): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    return (
      arm > this.thresholds.releaseArmMin && spine < this.thresholds.releaseSpineMax
    );
  }

  /**
   * Check if we should transition from RELEASE to TOP (rep complete)
   *
   * Uses PEAK DETECTION: Top is when wrist height reaches its maximum
   * and starts descending. More accurate than threshold-based detection.
   */
  private shouldTransitionToTop(spine: number, hip: number): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    if (this.wristHeightHistory.length < 3) return false;

    // Check posture requirements (must be standing upright)
    if (spine > this.thresholds.topSpineMax || hip < this.thresholds.topHipMin) {
      return false;
    }

    // Peak detection: check if wrist height was increasing and is now decreasing
    const h = this.wristHeightHistory;
    const len = h.length;

    const prev2 = this.smoothedWristHeight(len - 3, 2);
    const prev1 = this.smoothedWristHeight(len - 2, 2);
    const curr = this.smoothedWristHeight(len - 1, 2);

    const isPeak = prev1 >= prev2 && prev1 > curr;
    const wristHighEnough = prev1 > -80;

    return isPeak && wristHighEnough;
  }

  /**
   * Get smoothed wrist height at an index
   */
  private smoothedWristHeight(centerIndex: number, radius: number): number {
    const h = this.wristHeightHistory;
    const start = Math.max(0, centerIndex - radius);
    const end = Math.min(h.length - 1, centerIndex + radius);

    if (start > end || start < 0 || end >= h.length) {
      return h[Math.max(0, Math.min(h.length - 1, centerIndex))] ?? 0;
    }

    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i++) {
      sum += h[i];
      count++;
    }
    return count > 0 ? sum / count : 0;
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

    const { maxSpineAngle, maxArmAngle, maxKneeFlexion } = this.currentRepMetrics;

    // Hinge depth scoring
    if (maxSpineAngle < 40) {
      feedback.push('Go deeper - hinge more at the hips');
      score -= 20;
    } else if (maxSpineAngle < 55) {
      feedback.push('Good depth, try to hinge a bit deeper');
      score -= 10;
    }

    // Lockout scoring
    if (maxArmAngle < 60) {
      feedback.push('Drive hips harder - get arms to horizontal');
      score -= 15;
    } else if (maxArmAngle < 75) {
      feedback.push('Almost there - squeeze glutes at the top');
      score -= 5;
    }

    // Squat vs hinge detection
    if (maxKneeFlexion > 30) {
      feedback.push("Hinge, don't squat - keep knees softer");
      score -= 15;
    }

    if (feedback.length === 0) {
      feedback.push('Great rep!');
    }

    return {
      score: Math.max(0, score),
      metrics: {
        hingeDepth: maxSpineAngle,
        lockoutAngle: maxArmAngle,
        kneeFlexion: maxKneeFlexion,
      },
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
    this.wristHeightHistory = [];
    this.resetMetrics();
  }

  getExerciseName(): string {
    return 'Kettlebell Swing';
  }

  getPhases(): string[] {
    return ['top', 'connect', 'bottom', 'release'];
  }
}
