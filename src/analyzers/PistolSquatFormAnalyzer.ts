/**
 * Pistol Squat Form Analyzer
 *
 * Ear-based state machine for analyzing pistol squat (single-leg squat) form.
 * Tracks phases: STANDING → DESCENDING → BOTTOM → ASCENDING → STANDING (rep complete)
 *
 * Key insight: Uses ear Y position (head height) for checkpoint detection instead of
 * noisy knee angles. The ear position is much more stable and directly measures
 * "how low did they go" which is what we actually care about.
 *
 * Checkpoint detection:
 * - STANDING: Captured when rep starts (lowest ear Y = highest physical position)
 * - DESCENDING: Captured at 50% of ear Y travel on the way down
 * - BOTTOM: Captured at highest ear Y (lowest physical position = deepest squat)
 * - ASCENDING: Captured at 50% of ear Y travel on the way up
 *
 * Working leg is detected by comparing knee angle variance between left and right legs.
 */

import type { Skeleton } from '../models/Skeleton';
import { MediaPipeBodyParts } from '../types';
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

  // Posture validation (reject horizontal/lying poses)
  maxValidSpineAngle: number;   // Reject frames with spine angle above this (person lying down)
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
  maxValidSpineAngle: 60,      // ~60° = reject horizontal/lying poses (>60° is not upright)
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
  earY: number;
  frameImage?: ImageData;
}

/**
 * Frame record for ear-based tracking
 */
interface EarFrameRecord {
  skeleton: Skeleton;
  timestamp: number;
  videoTime?: number;
  earY: number;
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

  // Knee angle history for detecting direction changes (still used for phase transitions)
  private kneeAngleHistory: number[] = [];
  private readonly historySize = 5;

  // Smoothing for noise reduction
  private smoothedKneeAngle: number | null = null;
  private readonly emaAlpha = 0.3; // Exponential moving average factor
  private readonly minRealisticAngle = 30; // Clamp below this (unrealistic for human anatomy)

  // Ear-based trough detection for bottom position
  // Uses ear Y position (head height) which is more stable than knee angles
  private standingEarY: number | null = null; // Ear Y at rep start (lowest Y = highest position)
  private bottomCandidate: EarFrameRecord | null = null; // Frame with highest ear Y (lowest position)
  private framesAscendingAfterBottom = 0; // Frames where ear Y has been decreasing (person rising)
  private readonly framesNeededToConfirmBottom = 3;
  private readonly earYThresholdForAscent = 5; // Min ear Y decrease to count as ascending

  // Frame history for capturing 50% checkpoints retroactively
  private frameHistory: EarFrameRecord[] = [];
  private readonly maxFrameHistory = 120; // ~4 seconds at 30fps

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
   * Get the average ear Y position from a skeleton.
   * Higher Y = lower physical position (image coordinates).
   */
  private getEarY(skeleton: Skeleton): number {
    const keypoints = skeleton.getKeypoints();
    const leftEar = keypoints[MediaPipeBodyParts.LEFT_EAR];
    const rightEar = keypoints[MediaPipeBodyParts.RIGHT_EAR];

    if (leftEar && rightEar) {
      return (leftEar.y + rightEar.y) / 2;
    } else if (leftEar) {
      return leftEar.y;
    } else if (rightEar) {
      return rightEar.y;
    }
    // Fallback: use nose if ears not available
    const nose = keypoints[MediaPipeBodyParts.NOSE];
    return nose?.y ?? 0;
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

    // Get all angles and ear position
    const angles = this.getAngles(skeleton);
    const earY = this.getEarY(skeleton);

    // Validate posture - reject horizontal/lying poses
    // This filters out warmup sections where person is lying down
    if (angles.spine > this.thresholds.maxValidSpineAngle) {
      // Invalid posture - return current state without processing
      return {
        phase: this.phase,
        repCompleted: false,
        repCount: this.repCount,
        angles: {
          workingKnee: angles.workingKnee,
          workingHip: angles.workingHip,
          extendedKnee: angles.extendedKnee,
          spine: angles.spine,
        },
      };
    }

    // Apply smoothing to working knee angle (still used for phase transitions)
    const smoothedWorkingKnee = this.smoothAngle(angles.workingKnee);

    // Track smoothed knee angle history for direction detection
    this.kneeAngleHistory.push(smoothedWorkingKnee);
    if (this.kneeAngleHistory.length > this.historySize * 2) {
      this.kneeAngleHistory = this.kneeAngleHistory.slice(-this.historySize * 2);
    }

    // Create frame record for history
    const frameRecord: EarFrameRecord = {
      skeleton,
      timestamp,
      videoTime,
      earY,
      angles: { ...angles },
      frameImage,
    };

    // Add to frame history (for capturing 50% checkpoints retroactively)
    this.frameHistory.push(frameRecord);
    if (this.frameHistory.length > this.maxFrameHistory) {
      this.frameHistory.shift();
    }

    // Track metrics for quality scoring
    this.updateMetrics(angles);

    // Increment frames in current phase
    this.framesInPhase++;

    // Check for phase transitions
    let repCompleted = false;
    let repPositions: RepPosition[] | undefined;

    switch (this.phase) {
      case 'standing':
        if (this.shouldTransitionToDescending(angles)) {
          // Capture standing checkpoint and ear Y baseline
          this.captureStandingCheckpoint(frameRecord);
          this.standingEarY = earY;
          this.phase = 'descending';
          this.framesInPhase = 0;
          // Reset bottom tracking for new descent
          this.bottomCandidate = null;
          this.framesAscendingAfterBottom = 0;
        }
        break;

      case 'descending':
        // Track bottom candidate using ear Y (highest Y = lowest position)
        this.updateBottomCandidate(frameRecord);

        if (this.shouldTransitionToBottom()) {
          // Bottom confirmed! Capture checkpoints
          this.captureBottomCheckpoint();
          this.captureDescendingCheckpoint();
          this.phase = 'bottom';
          this.framesInPhase = 0;
        }
        break;

      case 'bottom':
        if (this.shouldTransitionToAscending(angles)) {
          this.phase = 'ascending';
          this.framesInPhase = 0;
        }
        break;

      case 'ascending':
        if (this.shouldTransitionToStanding(angles)) {
          // Capture ascending checkpoint at 50% ear Y travel
          this.captureAscendingCheckpoint();
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

  // ============================================
  // Ear-based checkpoint capture methods
  // ============================================

  /**
   * Capture the standing checkpoint when rep starts
   */
  private captureStandingCheckpoint(frame: EarFrameRecord): void {
    this.currentRepPeaks.standing = {
      phase: 'standing',
      skeleton: frame.skeleton,
      timestamp: frame.timestamp,
      videoTime: frame.videoTime,
      score: frame.angles.workingKnee, // Higher = more upright
      angles: { ...frame.angles },
      earY: frame.earY,
      frameImage: frame.frameImage,
    };
  }

  /**
   * Update the bottom candidate during descent.
   * Tracks the frame with highest ear Y (lowest physical position).
   */
  private updateBottomCandidate(frame: EarFrameRecord): void {
    // Check if ear is now descending (person ascending physically)
    if (this.bottomCandidate && frame.earY < this.bottomCandidate.earY - this.earYThresholdForAscent) {
      this.framesAscendingAfterBottom++;
    } else if (!this.bottomCandidate || frame.earY >= this.bottomCandidate.earY) {
      this.framesAscendingAfterBottom = 0;
    }

    // Update bottom candidate if this is the highest ear Y (lowest position)
    if (!this.bottomCandidate || frame.earY > this.bottomCandidate.earY) {
      this.bottomCandidate = { ...frame };
      this.framesAscendingAfterBottom = 0;
    }
  }

  /**
   * Capture the bottom checkpoint from the confirmed bottom candidate
   */
  private captureBottomCheckpoint(): void {
    if (!this.bottomCandidate) {
      console.debug('[PistolSquatFormAnalyzer] captureBottomCheckpoint: No bottom candidate available');
      return;
    }

    this.currentRepPeaks.bottom = {
      phase: 'bottom',
      skeleton: this.bottomCandidate.skeleton,
      timestamp: this.bottomCandidate.timestamp,
      videoTime: this.bottomCandidate.videoTime,
      score: this.bottomCandidate.earY, // Higher ear Y = deeper squat = better
      angles: { ...this.bottomCandidate.angles },
      earY: this.bottomCandidate.earY,
      frameImage: this.bottomCandidate.frameImage,
    };
  }

  /**
   * Capture the descending checkpoint at 50% of ear Y travel (on the way down)
   */
  private captureDescendingCheckpoint(): void {
    if (!this.standingEarY) {
      console.debug('[PistolSquatFormAnalyzer] captureDescendingCheckpoint: No standing ear Y reference');
      return;
    }
    if (!this.bottomCandidate) {
      console.debug('[PistolSquatFormAnalyzer] captureDescendingCheckpoint: No bottom candidate');
      return;
    }

    const earTravel = this.bottomCandidate.earY - this.standingEarY;
    const target50EarY = this.standingEarY + earTravel * 0.5;

    // Find frame closest to 50% ear Y in history (before bottom)
    const bottomTime = this.bottomCandidate.timestamp;
    const candidateFrames = this.frameHistory.filter(f => f.timestamp < bottomTime);

    if (candidateFrames.length === 0) {
      console.debug(`[PistolSquatFormAnalyzer] captureDescendingCheckpoint: No frames in history before bottom (bottomTime=${bottomTime}, historySize=${this.frameHistory.length})`);
      return;
    }

    const closest = candidateFrames.reduce((best, f) =>
      Math.abs(f.earY - target50EarY) < Math.abs(best.earY - target50EarY) ? f : best
    );

    this.currentRepPeaks.descending = {
      phase: 'descending',
      skeleton: closest.skeleton,
      timestamp: closest.timestamp,
      videoTime: closest.videoTime,
      score: closest.earY,
      angles: { ...closest.angles },
      earY: closest.earY,
      frameImage: closest.frameImage,
    };
  }

  /**
   * Capture the ascending checkpoint at 50% of ear Y travel (on the way up)
   */
  private captureAscendingCheckpoint(): void {
    if (!this.standingEarY) {
      console.debug('[PistolSquatFormAnalyzer] captureAscendingCheckpoint: No standing ear Y reference');
      return;
    }
    if (!this.bottomCandidate) {
      console.debug('[PistolSquatFormAnalyzer] captureAscendingCheckpoint: No bottom candidate');
      return;
    }

    const earTravel = this.bottomCandidate.earY - this.standingEarY;
    const target50EarY = this.bottomCandidate.earY - earTravel * 0.5;

    // Find frame closest to 50% ear Y in history (after bottom)
    const bottomTime = this.bottomCandidate.timestamp;
    const candidateFrames = this.frameHistory.filter(f => f.timestamp > bottomTime);

    if (candidateFrames.length === 0) {
      console.debug(`[PistolSquatFormAnalyzer] captureAscendingCheckpoint: No frames in history after bottom (bottomTime=${bottomTime}, historySize=${this.frameHistory.length})`);
      return;
    }

    const closest = candidateFrames.reduce((best, f) =>
      Math.abs(f.earY - target50EarY) < Math.abs(best.earY - target50EarY) ? f : best
    );

    this.currentRepPeaks.ascending = {
      phase: 'ascending',
      skeleton: closest.skeleton,
      timestamp: closest.timestamp,
      videoTime: closest.videoTime,
      score: 180 - closest.angles.workingKnee, // Higher knee = further up
      angles: { ...closest.angles },
      earY: closest.earY,
      frameImage: closest.frameImage,
    };
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
   * Check if we should transition from DESCENDING to BOTTOM.
   * Uses ear-based trough detection: confirmed when ear Y has been decreasing
   * (person ascending) for N frames after reaching the lowest point.
   */
  private shouldTransitionToBottom(): boolean {
    if (this.framesInPhase < this.minFramesInPhase) return false;
    if (!this.bottomCandidate) return false;

    // Bottom is confirmed when ear has been descending (person rising) for enough frames
    return this.framesAscendingAfterBottom >= this.framesNeededToConfirmBottom;
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
    this.currentRepPeaks = {};
    this.kneeAngleHistory = [];
    this.workingLeg = null;
    this.legDetectionVotes = { left: 0, right: 0 };
    // Reset smoothing
    this.smoothedKneeAngle = null;
    // Reset ear-based bottom detection
    this.standingEarY = null;
    this.bottomCandidate = null;
    this.framesAscendingAfterBottom = 0;
    this.frameHistory = [];
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
