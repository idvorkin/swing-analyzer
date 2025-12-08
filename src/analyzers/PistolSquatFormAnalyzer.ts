/**
 * Pistol Squat Form Analyzer
 *
 * Peak-based state machine for analyzing pistol squat (single-leg squat) form.
 * Tracks phases: STANDING → DESCENDING → BOTTOM → ASCENDING → STANDING (rep complete)
 *
 * Key insight: Working leg is detected by comparing knee angle variance between
 * left and right legs. The working leg has the leg that bends more.
 *
 * Phase meanings:
 * - STANDING: Both legs relatively straight, upright posture
 * - DESCENDING: Working knee angle decreasing, moving down
 * - BOTTOM: Deepest squat position, working knee maximally flexed
 * - ASCENDING: Working knee angle increasing, moving up
 */

import type { Skeleton } from '../models/Skeleton';
import type {
  FormAnalyzer,
  FormAnalyzerResult,
  RepPosition,
  RepQuality,
} from './FormAnalyzer';

/**
 * Pistol squat phases
 */
export type PistolSquatPhase = 'standing' | 'descending' | 'bottom' | 'ascending';

/**
 * Thresholds for phase transitions (in degrees)
 */
export interface PistolSquatThresholds {
  // STANDING position
  standingKneeMin: number;      // Working knee must be above this (nearly straight)
  standingSpineMax: number;     // Spine must be below this (relatively upright)

  // BOTTOM position
  bottomKneeMax: number;        // Working knee must be below this (deep squat)
  bottomHipMax: number;         // Working hip must be below this (flexed)

  // Transition thresholds
  descendingKneeThreshold: number; // Start descending when knee drops below this
  ascendingKneeThreshold: number;  // Start ascending when knee rises above this
}

/**
 * Default thresholds based on typical pistol squat biomechanics
 */
const DEFAULT_THRESHOLDS: PistolSquatThresholds = {
  standingKneeMin: 150,        // ~150° = slightly bent but mostly straight
  standingSpineMax: 25,        // ~25° = relatively upright
  bottomKneeMax: 80,           // ~80° = deep squat position
  bottomHipMax: 100,           // ~100° = hip flexed in squat
  descendingKneeThreshold: 140, // Start descending when knee < 140°
  ascendingKneeThreshold: 90,   // Start ascending when knee > 90°
};

/**
 * Internal peak tracking during a phase
 */
interface PhasePeak {
  phase: PistolSquatPhase;
  skeleton: Skeleton;
  timestamp: number;
  videoTime?: number;
  score: number;
  angles: { workingKnee: number; workingHip: number; spine: number; extendedKnee: number };
  frameImage?: ImageData;
}

/**
 * Pistol Squat Form Analyzer
 *
 * Implements the FormAnalyzer interface with peak-based phase detection.
 */
export class PistolSquatFormAnalyzer implements FormAnalyzer {
  private phase: PistolSquatPhase = 'standing';
  private repCount = 0;
  private thresholds: PistolSquatThresholds;

  // Track quality metrics during the rep
  private currentRepMetrics = {
    minWorkingKneeAngle: 180,   // Deepest squat (lower = better)
    maxSpineAngle: 0,          // Forward lean (too much = poor balance)
    minExtendedKneeAngle: 180, // Extended leg straightness (higher = better)
  };

  // Last completed rep quality
  private lastRepQuality: RepQuality | null = null;

  // Peak tracking for current phase
  private currentPhasePeak: PhasePeak | null = null;

  // Peaks from current rep (cleared after rep completes)
  private currentRepPeaks: {
    standing?: PhasePeak;
    descending?: PhasePeak;
    bottom?: PhasePeak;
    ascending?: PhasePeak;
  } = {};

  // Debounce: minimum frames in a phase before transitioning
  private framesInPhase = 0;
  private readonly minFramesInPhase = 2;

  // Working leg detection (which leg is doing the squat)
  private workingLeg: 'left' | 'right' | null = null;
  private legDetectionVotes = { left: 0, right: 0 };
  private readonly votesNeededForLock = 5;

  // Knee angle history for detecting direction changes
  private kneeAngleHistory: number[] = [];
  private readonly historySize = 5;

  // Smoothing for noise reduction
  private smoothedKneeAngle: number | null = null;
  private readonly emaAlpha = 0.3; // Exponential moving average factor
  private readonly minRealisticAngle = 30; // Clamp below this (unrealistic for human anatomy)

  // Trough detection for bottom position
  private troughCandidate: {
    angle: number;
    skeleton: Skeleton;
    timestamp: number;
    videoTime?: number;
    frameImage?: ImageData;
  } | null = null;
  private framesAscendingAfterTrough = 0;
  private readonly framesNeededToConfirmTrough = 3;

  constructor(thresholds: Partial<PistolSquatThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Detect which leg is the working (squatting) leg.
   * The working leg has more knee bend variance during the movement.
   */
  private detectWorkingLeg(skeleton: Skeleton): void {
    // Once locked, don't change
    if (this.workingLeg !== null) return;

    const leftKnee = skeleton.getKneeAngleForSide('left');
    const rightKnee = skeleton.getKneeAngleForSide('right');

    // The working leg is the one with the more bent knee
    // (during a pistol squat, one leg is bent, one is extended)
    const kneeDiff = Math.abs(leftKnee - rightKnee);

    // Need significant difference to determine working leg
    if (kneeDiff > 20) {
      const workingCandidate = leftKnee < rightKnee ? 'left' : 'right';
      this.legDetectionVotes[workingCandidate]++;

      const totalVotes = this.legDetectionVotes.left + this.legDetectionVotes.right;
      if (totalVotes >= this.votesNeededForLock) {
        this.workingLeg = this.legDetectionVotes.left >= this.legDetectionVotes.right ? 'left' : 'right';
        console.debug(`detectWorkingLeg: Locked in ${this.workingLeg} leg (votes: L=${this.legDetectionVotes.left}, R=${this.legDetectionVotes.right})`);
      }
    }
  }

  /**
   * Get angles for the current skeleton using detected working leg
   */
  private getAngles(skeleton: Skeleton): {
    workingKnee: number;
    workingHip: number;
    extendedKnee: number;
    extendedHip: number;
    spine: number;
  } {
    const working = this.workingLeg ?? 'left';
    const extended = working === 'left' ? 'right' : 'left';

    return {
      workingKnee: skeleton.getKneeAngleForSide(working),
      workingHip: skeleton.getHipAngleForSide(working),
      extendedKnee: skeleton.getKneeAngleForSide(extended),
      extendedHip: skeleton.getHipAngleForSide(extended),
      spine: skeleton.getSpineAngle(),
    };
  }

  /**
   * Smooth knee angle using exponential moving average with clamping.
   * Filters out noise and unrealistic readings.
   */
  private smoothAngle(rawAngle: number): number {
    // Clamp to realistic human range (knee can't bend below ~30°)
    const clamped = Math.max(this.minRealisticAngle, rawAngle);

    if (this.smoothedKneeAngle === null) {
      this.smoothedKneeAngle = clamped;
    } else {
      // EMA: new = α * current + (1-α) * previous
      this.smoothedKneeAngle =
        this.emaAlpha * clamped + (1 - this.emaAlpha) * this.smoothedKneeAngle;
    }
    return this.smoothedKneeAngle;
  }

  /**
   * Process a skeleton frame through the state machine
   */
  processFrame(
    skeleton: Skeleton,
    timestamp: number = Date.now(),
    videoTime?: number,
    frameImage?: ImageData
  ): FormAnalyzerResult {
    // Detect working leg during early frames
    this.detectWorkingLeg(skeleton);

    // Get all angles
    const angles = this.getAngles(skeleton);

    // Apply smoothing to working knee angle for trough detection
    const smoothedWorkingKnee = this.smoothAngle(angles.workingKnee);

    // Track smoothed knee angle history for direction detection
    this.kneeAngleHistory.push(smoothedWorkingKnee);
    if (this.kneeAngleHistory.length > this.historySize * 2) {
      this.kneeAngleHistory = this.kneeAngleHistory.slice(-this.historySize * 2);
    }

    // Track metrics for quality scoring
    this.updateMetrics(angles);

    // Update peak tracking for current phase
    this.updatePhasePeak(skeleton, timestamp, videoTime, angles, frameImage);

    // Increment frames in current phase
    this.framesInPhase++;

    // Check for phase transitions
    let repCompleted = false;
    let repPositions: RepPosition[] | undefined;

    switch (this.phase) {
      case 'standing':
        if (this.shouldTransitionToDescending(angles)) {
          this.finalizePhasePeak('standing');
          this.phase = 'descending';
          this.framesInPhase = 0;
          // Reset trough tracking for new descent
          this.troughCandidate = null;
          this.framesAscendingAfterTrough = 0;
        }
        break;

      case 'descending':
        // Track trough candidate during descent (use raw angle for responsiveness)
        this.updateTroughCandidate(
          angles.workingKnee, // Raw angle for direction detection
          skeleton,
          timestamp,
          videoTime,
          frameImage
        );

        if (this.shouldTransitionToBottom()) {
          // Trough confirmed! Capture the bottom position from the candidate
          this.finalizePhasePeak('descending');
          this.captureTroughAsBottom();
          this.phase = 'bottom';
          this.framesInPhase = 0;
        }
        break;

      case 'bottom':
        if (this.shouldTransitionToAscending(angles)) {
          this.finalizePhasePeak('bottom');
          this.phase = 'ascending';
          this.framesInPhase = 0;
        }
        break;

      case 'ascending':
        if (this.shouldTransitionToStanding(angles)) {
          this.finalizePhasePeak('ascending');
          this.phase = 'standing';
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
      angles: {
        workingKnee: angles.workingKnee,
        workingHip: angles.workingHip,
        extendedKnee: angles.extendedKnee,
        spine: angles.spine,
      },
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
          workingKnee: peak.angles.workingKnee,
          workingHip: peak.angles.workingHip,
          extendedKnee: peak.angles.extendedKnee,
          spine: peak.angles.spine,
        },
        score: peak.score,
        frameImage: peak.frameImage,
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
    angles: { workingKnee: number; workingHip: number; extendedKnee: number; spine: number },
    frameImage?: ImageData
  ): void {
    const score = this.calculatePeakScore(this.phase, angles);

    // For BOTTOM, we want the LOWEST knee angle (deepest squat)
    // For STANDING, we want the HIGHEST knee angle (most upright)
    // For DESCENDING/ASCENDING, we want the first qualifying frame (timing)
    const isTimingPhase = this.phase === 'descending' || this.phase === 'ascending';

    if (isTimingPhase) {
      if (!this.currentPhasePeak) {
        this.currentPhasePeak = {
          phase: this.phase,
          timestamp,
          videoTime,
          skeleton,
          score,
          angles: { ...angles },
          frameImage,
        };
      }
    } else {
      // For STANDING and BOTTOM, track the best frame
      if (!this.currentPhasePeak || score > this.currentPhasePeak.score) {
        this.currentPhasePeak = {
          phase: this.phase,
          timestamp,
          videoTime,
          skeleton,
          score,
          angles: { ...angles },
          frameImage,
        };
      }
    }
  }

  /**
   * Calculate how "peak" this frame is for the given phase
   */
  private calculatePeakScore(
    phase: PistolSquatPhase,
    angles: { workingKnee: number; workingHip: number; spine: number }
  ): number {
    switch (phase) {
      case 'standing':
        return angles.workingKnee; // Higher knee angle = more upright = better
      case 'descending':
        return 180 - angles.workingKnee; // Lower = better (going down)
      case 'bottom':
        return 180 - angles.workingKnee; // Lowest knee angle = deepest squat = best
      case 'ascending':
        return angles.workingKnee; // Higher = better (going up)
      default: {
        const _exhaustiveCheck: never = phase;
        console.error(`calculatePeakScore: Unhandled phase "${_exhaustiveCheck}"`);
        return 0;
      }
    }
  }

  /**
   * Finalize the current phase peak and store it
   */
  private finalizePhasePeak(phase: PistolSquatPhase): void {
    const peak = this.currentPhasePeak;
    this.currentPhasePeak = null;

    if (peak) {
      this.currentRepPeaks[phase] = peak;
    } else {
      console.debug(`finalizePhasePeak: No peak captured for "${phase}" phase`);
    }
  }

  /**
   * Check if we should transition from STANDING to DESCENDING
   */
  private shouldTransitionToDescending(angles: { workingKnee: number; spine: number }): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;

    // Working knee starting to bend significantly
    return angles.workingKnee < this.thresholds.descendingKneeThreshold;
  }

  /**
   * Update the trough candidate during descent.
   * Uses RAW angles for direction detection (more responsive),
   * but stores the actual skeleton at the lowest point.
   */
  private updateTroughCandidate(
    rawAngle: number,
    skeleton: Skeleton,
    timestamp: number,
    videoTime?: number,
    frameImage?: ImageData
  ): void {
    // Clamp raw angle to realistic range for trough tracking
    const clampedAngle = Math.max(this.minRealisticAngle, rawAngle);

    // Check direction using raw (clamped) angles - more responsive than smoothed
    if (this.kneeAngleHistory.length >= 2) {
      // Compare current raw to previous raw (both clamped)
      const currRaw = clampedAngle;
      const prevRaw = this.troughCandidate?.angle ?? currRaw;

      if (currRaw > prevRaw + 2) {
        // Raw angle increasing by >2° - we've passed the trough
        this.framesAscendingAfterTrough++;
      } else if (currRaw <= prevRaw) {
        // Still at or below previous - might still be descending
        this.framesAscendingAfterTrough = 0;
      }
      // Small increases (0-2°) could be noise, don't change count
    }

    // Update trough candidate if this is the lowest angle so far
    if (
      !this.troughCandidate ||
      clampedAngle < this.troughCandidate.angle
    ) {
      this.troughCandidate = {
        angle: clampedAngle,
        skeleton,
        timestamp,
        videoTime,
        frameImage,
      };
      // Reset ascending counter since we found a new low
      this.framesAscendingAfterTrough = 0;
    }
  }

  /**
   * Check if we should transition from DESCENDING to BOTTOM.
   * Uses trough detection: confirmed when angle has been increasing for N frames.
   */
  private shouldTransitionToBottom(): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    if (!this.troughCandidate) return false;

    // Trough is confirmed when we've been ascending for enough frames
    return this.framesAscendingAfterTrough >= this.framesNeededToConfirmTrough;
  }

  /**
   * Capture the confirmed trough as the bottom position peak.
   */
  private captureTroughAsBottom(): void {
    if (!this.troughCandidate) return;

    const angles = this.getAngles(this.troughCandidate.skeleton);

    // Store as the bottom peak
    this.currentRepPeaks.bottom = {
      phase: 'bottom',
      skeleton: this.troughCandidate.skeleton,
      timestamp: this.troughCandidate.timestamp,
      videoTime: this.troughCandidate.videoTime,
      score: 180 - this.troughCandidate.angle, // Lower angle = higher score
      angles: {
        workingKnee: angles.workingKnee,
        workingHip: angles.workingHip,
        extendedKnee: angles.extendedKnee,
        spine: angles.spine,
      },
      frameImage: this.troughCandidate.frameImage,
    };

    // Clear the candidate
    this.troughCandidate = null;
    this.framesAscendingAfterTrough = 0;
  }

  /**
   * Check if we should transition from BOTTOM to ASCENDING
   * Detects when knee angle is increasing and above the ascending threshold.
   */
  private shouldTransitionToAscending(angles: { workingKnee: number }): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    if (this.kneeAngleHistory.length < 2) return false;

    const h = this.kneeAngleHistory;
    const curr = h[h.length - 1];
    const prev = h[h.length - 2];

    // Knee is increasing AND above threshold
    const isIncreasing = curr > prev;
    return isIncreasing && angles.workingKnee > this.thresholds.ascendingKneeThreshold;
  }

  /**
   * Check if we should transition from ASCENDING to STANDING (rep complete)
   */
  private shouldTransitionToStanding(angles: { workingKnee: number; spine: number }): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;

    // Back to standing: knee nearly straight, relatively upright
    return (
      angles.workingKnee > this.thresholds.standingKneeMin &&
      angles.spine < this.thresholds.standingSpineMax
    );
  }

  /**
   * Update tracking metrics during rep
   */
  private updateMetrics(angles: { workingKnee: number; extendedKnee: number; spine: number }): void {
    this.currentRepMetrics.minWorkingKneeAngle = Math.min(
      this.currentRepMetrics.minWorkingKneeAngle,
      angles.workingKnee
    );
    this.currentRepMetrics.maxSpineAngle = Math.max(
      this.currentRepMetrics.maxSpineAngle,
      angles.spine
    );
    this.currentRepMetrics.minExtendedKneeAngle = Math.min(
      this.currentRepMetrics.minExtendedKneeAngle,
      angles.extendedKnee
    );
  }

  /**
   * Reset metrics for next rep
   */
  private resetMetrics(): void {
    this.currentRepMetrics = {
      minWorkingKneeAngle: 180,
      maxSpineAngle: 0,
      minExtendedKneeAngle: 180,
    };
  }

  /**
   * Calculate quality score for completed rep
   */
  private calculateRepQuality(): RepQuality {
    const feedback: string[] = [];
    let score = 100;

    const { minWorkingKneeAngle, maxSpineAngle, minExtendedKneeAngle } = this.currentRepMetrics;

    // Depth scoring - deeper is better (lower knee angle)
    if (minWorkingKneeAngle > 90) {
      feedback.push('Go deeper - aim for full depth');
      score -= 25;
    } else if (minWorkingKneeAngle > 70) {
      feedback.push('Good depth, try to get a bit lower');
      score -= 10;
    }

    // Balance scoring - too much forward lean indicates balance issues
    if (maxSpineAngle > 50) {
      feedback.push('Work on balance - too much forward lean');
      score -= 20;
    } else if (maxSpineAngle > 35) {
      feedback.push('Good balance, slight forward lean');
      score -= 5;
    }

    // Extended leg scoring - should stay relatively straight
    if (minExtendedKneeAngle < 140) {
      feedback.push('Keep extended leg straighter');
      score -= 15;
    } else if (minExtendedKneeAngle < 160) {
      feedback.push('Extended leg slightly bent');
      score -= 5;
    }

    if (feedback.length === 0) {
      feedback.push('Excellent pistol squat!');
    }

    return {
      score: Math.max(0, score),
      metrics: {
        depth: 180 - minWorkingKneeAngle, // Higher = deeper
        balance: 90 - maxSpineAngle,      // Higher = better balance
        extendedLeg: minExtendedKneeAngle, // Higher = straighter
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
    this.phase = 'standing';
    this.repCount = 0;
    this.framesInPhase = 0;
    this.lastRepQuality = null;
    this.currentPhasePeak = null;
    this.currentRepPeaks = {};
    this.kneeAngleHistory = [];
    this.workingLeg = null;
    this.legDetectionVotes = { left: 0, right: 0 };
    // Reset smoothing and trough detection
    this.smoothedKneeAngle = null;
    this.troughCandidate = null;
    this.framesAscendingAfterTrough = 0;
    this.resetMetrics();
  }

  getExerciseName(): string {
    return 'Pistol Squat';
  }

  getPhases(): string[] {
    return ['standing', 'descending', 'bottom', 'ascending'];
  }

  /**
   * Get the detected working leg (the leg doing the squat).
   * Returns null if not yet detected (needs a few frames of movement).
   */
  getWorkingLeg(): 'left' | 'right' | null {
    return this.workingLeg;
  }

  /**
   * Manually set the working leg (override auto-detection).
   * Useful when user knows which leg they're training.
   */
  setWorkingLeg(leg: 'left' | 'right'): void {
    this.workingLeg = leg;
    // Clear votes since we're manually overriding
    this.legDetectionVotes = { left: 0, right: 0 };
  }
}
