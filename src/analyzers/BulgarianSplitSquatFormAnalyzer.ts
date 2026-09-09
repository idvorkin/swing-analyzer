/**
 * Bulgarian Split Squat Form Analyzer
 *
 * Front-knee-angle state machine for analyzing Bulgarian split squat form.
 * Tracks phases: STANDING → DESCENDING → BOTTOM → ASCENDING → STANDING (rep complete)
 *
 * Movement model:
 * - The FRONT leg is planted on the floor (its ankle sits LOWER in the frame =
 *   larger image Y). The BACK foot is elevated on a bench behind (its ankle sits
 *   HIGHER = smaller Y). We lock onto the front leg by voting on ankle height.
 * - Rep counting is driven by the FRONT knee angle (hip-knee-ankle): the front
 *   knee flexes on the way down and re-extends on the way up. A rep is only
 *   counted once the knee has flexed past `downKneeThreshold` (so shallow bobs
 *   don't count) and then re-extends past `standingKneeMin`.
 *
 * Stop-sign flags (from Igor's health.md canon: "knee cave, low-back arch"):
 * - Knee cave / valgus is a FRONTAL-plane fault. It can only be measured when the
 *   camera sees the athlete roughly head-on; from a side view it degrades to
 *   "not assessable" (kneeCave = NOT_ASSESSABLE), the same way the swing tool
 *   copes with occlusion.
 * - Low-back arch is a SAGITTAL-plane fault (trunk hyper-extension / leaning
 *   backward past vertical), so it is assessable from the usual side view.
 *
 * ponytail: thresholds below are a first pass tuned against Igor's side-view
 * sample (front-knee depth ~69-81°). They are exposed via the constructor so
 * they can be re-tuned per-camera without touching the state machine.
 */

import type { Skeleton } from '../models/Skeleton';
import { MediaPipeBodyParts } from '../types';
import {
  type AngleDegrees,
  asAngleDegrees,
  asFrameCount,
  asQualityScore,
  asTimestampMs,
  type TimestampMs,
  type VideoTimeSeconds,
} from '../utils/brandedTypes';
import type {
  FormAnalyzerResult,
  RepPosition,
  RepQuality,
} from './FormAnalyzer';
import { type BasePhasePeak, FormAnalyzerBase } from './FormAnalyzerBase';

/**
 * Bulgarian split squat phases (shared shape with the pistol squat)
 */
export type BulgarianSplitSquatPhase =
  | 'standing'
  | 'descending'
  | 'bottom'
  | 'ascending';

/** Sentinel for a flag that cannot be measured from the current camera angle */
export const NOT_ASSESSABLE = -1;

/**
 * Thresholds for phase transitions (front-knee angle, in degrees)
 */
export interface BulgarianSplitSquatThresholds {
  /** Enter DESCENDING when the front knee drops below this (starting to bend) */
  descendingKneeThreshold: AngleDegrees;
  /** Front knee must flex past this to arm a rep ("down") — rejects shallow bobs */
  downKneeThreshold: AngleDegrees;
  /** Leave BOTTOM for ASCENDING once the rising front knee passes this */
  ascendingKneeThreshold: AngleDegrees;
  /** Complete the rep when the front knee re-extends past this ("up") */
  standingKneeMin: AngleDegrees;
  /** Ideal bottom depth for the front knee (scoring target) */
  bottomTargetAngle: AngleDegrees;
  /** Reject frames whose spine angle exceeds this (person lying / horizontal) */
  maxValidSpineAngle: AngleDegrees;
  /** Frontalness ratio at/above which knee valgus is assessable (below = side view) */
  frontalnessThreshold: number;
  /** Normalized medial knee drift (fraction of hip width) that counts as valgus */
  valgusRatioThreshold: number;
  /** Backward trunk lean past vertical (deg) that counts as low-back arch */
  archLeanThreshold: AngleDegrees;
}

const DEFAULT_THRESHOLDS: BulgarianSplitSquatThresholds = {
  descendingKneeThreshold: asAngleDegrees(140),
  downKneeThreshold: asAngleDegrees(110),
  ascendingKneeThreshold: asAngleDegrees(120),
  standingKneeMin: asAngleDegrees(150),
  bottomTargetAngle: asAngleDegrees(90),
  maxValidSpineAngle: asAngleDegrees(60),
  frontalnessThreshold: 0.34,
  valgusRatioThreshold: 0.18,
  archLeanThreshold: asAngleDegrees(12),
};

/**
 * Angles tracked during the movement
 */
interface BulgarianSplitSquatAngles {
  frontKnee: AngleDegrees;
  backKnee: AngleDegrees;
  frontHip: AngleDegrees;
  spine: AngleDegrees;
}

interface BulgarianSplitSquatPhasePeak
  extends BasePhasePeak<BulgarianSplitSquatPhase, BulgarianSplitSquatAngles> {
  frontKnee: AngleDegrees;
}

/**
 * Per-frame record used for trough detection and retroactive 50% captures.
 */
interface FrameRecord {
  skeleton: Skeleton;
  timestamp: TimestampMs;
  videoTime?: VideoTimeSeconds;
  frontKnee: AngleDegrees;
  angles: BulgarianSplitSquatAngles;
  frameImage?: ImageData;
}

/**
 * Metrics accumulated over one rep for quality scoring.
 */
interface BulgarianSplitSquatRepMetrics {
  minFrontKneeAngle: AngleDegrees; // deepest front-knee bend (lower = deeper)
  maxSpineAngle: AngleDegrees; // forward lean
  worstValgusRatio: number; // most medial knee drift seen (frontal view only)
  valgusAssessable: boolean; // was any frame frontal enough to judge valgus?
  maxBackwardLean: AngleDegrees; // most trunk hyper-extension (low-back arch)
}

/**
 * Bulgarian Split Squat Form Analyzer.
 *
 * Implements FormAnalyzer via FormAnalyzerBase, mirroring the PistolSquat
 * analyzer's structure but keyed off the FRONT knee angle rather than ear Y.
 */
export class BulgarianSplitSquatFormAnalyzer extends FormAnalyzerBase<
  BulgarianSplitSquatPhase,
  BulgarianSplitSquatAngles,
  BulgarianSplitSquatPhasePeak
> {
  private thresholds: BulgarianSplitSquatThresholds;

  private currentRepMetrics: BulgarianSplitSquatRepMetrics =
    this.createInitialMetrics();

  // Front-leg detection (planted leg with the lower ankle)
  private frontLeg: 'left' | 'right' | null = null;
  private legDetectionVotes = { left: 0, right: 0 };
  private readonly votesNeededForLock = 5;
  private readonly ankleYDeadzone = 6; // px separation to count an ankle-height vote

  // Front-knee smoothing + direction history
  private smoothedFrontKnee: number | null = null;
  private readonly emaAlpha = 0.3;
  private readonly minRealisticAngle = 25;
  private frontKneeHistory: number[] = [];
  private readonly historySize = 5;

  // Trough (bottom) detection on the front-knee angle
  private standingKneeAtStart: AngleDegrees | null = null;
  private bottomCandidate: FrameRecord | null = null;
  private framesRisingAfterBottom = 0;
  private readonly framesNeededToConfirmBottom = 3;
  private readonly kneeRiseThresholdForAscent = 3; // deg increase counted as rising
  private repArmed = false; // front knee dipped below downKneeThreshold this rep

  // Frame history for retroactive 50% checkpoint capture
  private frameHistory: FrameRecord[] = [];
  private readonly maxFrameHistory = 120; // ~4s at 30fps

  constructor(thresholds: Partial<BulgarianSplitSquatThresholds> = {}) {
    super('standing');
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  // ============================================
  // Front-leg detection
  // ============================================

  /**
   * Lock onto the front (planted) leg. The planted foot sits lower in the frame
   * (larger image Y) than the elevated back foot on the bench.
   */
  private detectFrontLeg(skeleton: Skeleton): void {
    if (this.frontLeg !== null) return;

    const kp = skeleton.getKeypoints();
    const leftAnkle = kp[MediaPipeBodyParts.LEFT_ANKLE];
    const rightAnkle = kp[MediaPipeBodyParts.RIGHT_ANKLE];
    if (!leftAnkle || !rightAnkle) return;

    const lConf = leftAnkle.score ?? leftAnkle.visibility ?? 0;
    const rConf = rightAnkle.score ?? rightAnkle.visibility ?? 0;
    if (lConf < 0.3 || rConf < 0.3) return;

    const dy = leftAnkle.y - rightAnkle.y; // >0 => left ankle lower => left is front
    if (Math.abs(dy) < this.ankleYDeadzone) return;

    const candidate = dy > 0 ? 'left' : 'right';
    this.legDetectionVotes[candidate]++;

    const total = this.legDetectionVotes.left + this.legDetectionVotes.right;
    if (total >= this.votesNeededForLock) {
      this.frontLeg =
        this.legDetectionVotes.left >= this.legDetectionVotes.right
          ? 'left'
          : 'right';
    }
  }

  private getAngles(skeleton: Skeleton): BulgarianSplitSquatAngles {
    const front = this.frontLeg ?? skeleton.getPreferredSide();
    const back = front === 'left' ? 'right' : 'left';
    return {
      frontKnee: skeleton.getKneeAngleForSide(front),
      backKnee: skeleton.getKneeAngleForSide(back),
      frontHip: skeleton.getHipAngleForSide(front),
      spine: skeleton.getSpineAngle(),
    };
  }

  private smoothAngle(rawAngle: number): number {
    const clamped = Math.max(this.minRealisticAngle, rawAngle);
    if (this.smoothedFrontKnee === null) {
      this.smoothedFrontKnee = clamped;
    } else {
      this.smoothedFrontKnee =
        this.emaAlpha * clamped + (1 - this.emaAlpha) * this.smoothedFrontKnee;
    }
    return this.smoothedFrontKnee;
  }

  // ============================================
  // Frame processing / state machine
  // ============================================

  processFrame(
    skeleton: Skeleton,
    timestamp: TimestampMs = asTimestampMs(Date.now()),
    videoTime?: VideoTimeSeconds,
    frameImage?: ImageData
  ): FormAnalyzerResult {
    this.detectFrontLeg(skeleton);

    const angles = this.getAngles(skeleton);
    const depth = this.depthPercent(angles.frontKnee);

    // Reject lying/horizontal poses (e.g. warmup on the floor)
    if (angles.spine > this.thresholds.maxValidSpineAngle) {
      return {
        phase: this.phase,
        repCompleted: false,
        repCount: this.repCount,
        angles: { ...angles, depth } as Record<string, number>,
      };
    }

    const smoothedFrontKnee = this.smoothAngle(angles.frontKnee);
    this.frontKneeHistory.push(smoothedFrontKnee);
    if (this.frontKneeHistory.length > this.historySize * 2) {
      this.frontKneeHistory = this.frontKneeHistory.slice(
        -this.historySize * 2
      );
    }

    const frameRecord: FrameRecord = {
      skeleton,
      timestamp,
      videoTime,
      frontKnee: angles.frontKnee,
      angles,
      frameImage,
    };
    this.frameHistory.push(frameRecord);
    if (this.frameHistory.length > this.maxFrameHistory) {
      this.frameHistory.shift();
    }

    this.updateMetrics(skeleton, angles);
    this.framesInPhase = asFrameCount(this.framesInPhase + 1);

    // Arm the rep the moment the front knee dips past the "down" threshold at any
    // point after leaving STANDING. Checking only during DESCENDING would miss it
    // when trough detection transitions to BOTTOM before the true deepest frame.
    if (
      this.phase !== 'standing' &&
      angles.frontKnee <= this.thresholds.downKneeThreshold
    ) {
      this.repArmed = true;
    }

    let repCompleted = false;
    let repPositions: RepPosition[] | undefined;
    let repQuality: RepQuality | undefined;

    switch (this.phase) {
      case 'standing':
        if (this.shouldTransitionToDescending(angles)) {
          this.captureStandingCheckpoint(frameRecord);
          this.standingKneeAtStart = angles.frontKnee;
          this.bottomCandidate = null;
          this.framesRisingAfterBottom = 0;
          this.repArmed = false;
          this.transitionTo('descending');
        }
        break;

      case 'descending':
        this.updateBottomCandidate(frameRecord);
        if (this.shouldTransitionToBottom()) {
          this.captureBottomCheckpoint();
          this.captureDescendingCheckpoint();
          this.transitionTo('bottom');
        }
        break;

      case 'bottom':
        if (this.shouldTransitionToAscending()) {
          this.transitionTo('ascending');
        }
        break;

      case 'ascending':
        if (this.shouldTransitionToStanding(angles)) {
          if (this.repArmed) {
            this.captureAscendingCheckpoint();
            const result = this.completeRep();
            repCompleted = true;
            repPositions = result.repPositions;
            repQuality = result.repQuality;
          }
          this.transitionTo('standing');
          this.currentRepMetrics = this.createInitialMetrics();
          this.repArmed = false;
        }
        break;
    }

    return {
      phase: this.phase,
      repCompleted,
      repCount: this.repCount,
      repPositions,
      repQuality,
      angles: { ...angles, depth } as Record<string, number>,
    };
  }

  // ============================================
  // Transition predicates
  // ============================================

  private shouldTransitionToDescending(
    angles: BulgarianSplitSquatAngles
  ): boolean {
    if (!this.canTransition()) return false;
    return angles.frontKnee < this.thresholds.descendingKneeThreshold;
  }

  private shouldTransitionToBottom(): boolean {
    if (!this.canTransition()) return false;
    if (!this.bottomCandidate) return false;
    return this.framesRisingAfterBottom >= this.framesNeededToConfirmBottom;
  }

  private shouldTransitionToAscending(): boolean {
    if (!this.canTransition()) return false;
    if (this.frontKneeHistory.length < 2) return false;
    const h = this.frontKneeHistory;
    const curr = h[h.length - 1];
    const prev = h[h.length - 2];
    const rising = curr > prev;
    return rising && curr > this.thresholds.ascendingKneeThreshold;
  }

  private shouldTransitionToStanding(
    angles: BulgarianSplitSquatAngles
  ): boolean {
    if (!this.canTransition()) return false;
    return angles.frontKnee > this.thresholds.standingKneeMin;
  }

  /**
   * Track the deepest frame of the descent (lowest front-knee angle) and count
   * how many frames the knee has been rising since — that confirms the trough.
   */
  private updateBottomCandidate(frame: FrameRecord): void {
    if (
      this.bottomCandidate &&
      frame.frontKnee >
        this.bottomCandidate.frontKnee + this.kneeRiseThresholdForAscent
    ) {
      this.framesRisingAfterBottom++;
    } else if (
      !this.bottomCandidate ||
      frame.frontKnee <= this.bottomCandidate.frontKnee
    ) {
      this.framesRisingAfterBottom = 0;
    }

    if (
      !this.bottomCandidate ||
      frame.frontKnee < this.bottomCandidate.frontKnee
    ) {
      this.bottomCandidate = { ...frame };
      this.framesRisingAfterBottom = 0;
    }
  }

  // ============================================
  // Checkpoint capture
  // ============================================

  private captureStandingCheckpoint(frame: FrameRecord): void {
    this.storePeak('standing', {
      phase: 'standing',
      skeleton: frame.skeleton,
      timestamp: frame.timestamp,
      videoTime: frame.videoTime,
      score: asQualityScore(frame.angles.frontKnee), // higher = more upright
      angles: { ...frame.angles },
      frontKnee: frame.frontKnee,
      frameImage: frame.frameImage,
    });
  }

  private captureBottomCheckpoint(): void {
    if (!this.bottomCandidate) return;
    this.storePeak('bottom', {
      phase: 'bottom',
      skeleton: this.bottomCandidate.skeleton,
      timestamp: this.bottomCandidate.timestamp,
      videoTime: this.bottomCandidate.videoTime,
      score: asQualityScore(180 - this.bottomCandidate.frontKnee), // deeper = better
      angles: { ...this.bottomCandidate.angles },
      frontKnee: this.bottomCandidate.frontKnee,
      frameImage: this.bottomCandidate.frameImage,
    });
  }

  private captureDescendingCheckpoint(): void {
    if (this.standingKneeAtStart === null || !this.bottomCandidate) return;
    const travel = this.standingKneeAtStart - this.bottomCandidate.frontKnee;
    const target = this.standingKneeAtStart - travel * 0.5;
    const bottomTime = this.bottomCandidate.timestamp;
    const candidates = this.frameHistory.filter(
      (f) => f.timestamp < bottomTime
    );
    if (candidates.length === 0) return;
    const closest = candidates.reduce((best, f) =>
      Math.abs(f.frontKnee - target) < Math.abs(best.frontKnee - target)
        ? f
        : best
    );
    this.storePeak('descending', {
      phase: 'descending',
      skeleton: closest.skeleton,
      timestamp: closest.timestamp,
      videoTime: closest.videoTime,
      score: asQualityScore(180 - closest.frontKnee),
      angles: { ...closest.angles },
      frontKnee: closest.frontKnee,
      frameImage: closest.frameImage,
    });
  }

  private captureAscendingCheckpoint(): void {
    if (this.standingKneeAtStart === null || !this.bottomCandidate) return;
    const travel = this.standingKneeAtStart - this.bottomCandidate.frontKnee;
    const target = this.bottomCandidate.frontKnee + travel * 0.5;
    const bottomTime = this.bottomCandidate.timestamp;
    const candidates = this.frameHistory.filter(
      (f) => f.timestamp > bottomTime
    );
    if (candidates.length === 0) return;
    const closest = candidates.reduce((best, f) =>
      Math.abs(f.frontKnee - target) < Math.abs(best.frontKnee - target)
        ? f
        : best
    );
    this.storePeak('ascending', {
      phase: 'ascending',
      skeleton: closest.skeleton,
      timestamp: closest.timestamp,
      videoTime: closest.videoTime,
      score: asQualityScore(closest.frontKnee),
      angles: { ...closest.angles },
      frontKnee: closest.frontKnee,
      frameImage: closest.frameImage,
    });
  }

  // ============================================
  // Metrics + stop-sign flags
  // ============================================

  private updateMetrics(
    skeleton: Skeleton,
    angles: BulgarianSplitSquatAngles
  ): void {
    this.currentRepMetrics.minFrontKneeAngle = asAngleDegrees(
      Math.min(this.currentRepMetrics.minFrontKneeAngle, angles.frontKnee)
    );
    this.currentRepMetrics.maxSpineAngle = asAngleDegrees(
      Math.max(this.currentRepMetrics.maxSpineAngle, angles.spine)
    );

    // Knee cave / valgus — frontal-plane, only when the view supports it
    const frontalness = this.computeFrontalness(skeleton);
    if (frontalness >= this.thresholds.frontalnessThreshold) {
      this.currentRepMetrics.valgusAssessable = true;
      const ratio = this.computeValgusRatio(skeleton);
      if (ratio !== null) {
        this.currentRepMetrics.worstValgusRatio = Math.max(
          this.currentRepMetrics.worstValgusRatio,
          ratio
        );
      }
    }

    // Low-back arch — sagittal-plane trunk hyper-extension (backward lean)
    const backwardLean = this.computeBackwardLean(skeleton);
    if (backwardLean !== null) {
      this.currentRepMetrics.maxBackwardLean = asAngleDegrees(
        Math.max(this.currentRepMetrics.maxBackwardLean, backwardLean)
      );
    }
  }

  /**
   * Frontalness ≈ (shoulder width + hip width) / torso length. Near 0 in a pure
   * side view (left/right joints overlap in X); larger when the camera is head-on.
   */
  private computeFrontalness(skeleton: Skeleton): number {
    const kp = skeleton.getKeypoints();
    const ls = kp[MediaPipeBodyParts.LEFT_SHOULDER];
    const rs = kp[MediaPipeBodyParts.RIGHT_SHOULDER];
    const lh = kp[MediaPipeBodyParts.LEFT_HIP];
    const rh = kp[MediaPipeBodyParts.RIGHT_HIP];
    if (!ls || !rs || !lh || !rh) return 0;
    const shoulderSep = Math.abs(ls.x - rs.x);
    const hipSep = Math.abs(lh.x - rh.x);
    const torsoLen = Math.abs((ls.y + rs.y) / 2 - (lh.y + rh.y) / 2) || 1;
    return (shoulderSep + hipSep) / 2 / torsoLen;
  }

  /**
   * Medial drift of the front knee relative to the ankle, as a fraction of hip
   * width. Positive = knee is closer to the body midline than the ankle (cave).
   * Returns null if required keypoints are missing.
   */
  private computeValgusRatio(skeleton: Skeleton): number | null {
    const front = this.frontLeg ?? skeleton.getPreferredSide();
    const kp = skeleton.getKeypoints();
    const lh = kp[MediaPipeBodyParts.LEFT_HIP];
    const rh = kp[MediaPipeBodyParts.RIGHT_HIP];
    const kneeIdx =
      front === 'left'
        ? MediaPipeBodyParts.LEFT_KNEE
        : MediaPipeBodyParts.RIGHT_KNEE;
    const ankleIdx =
      front === 'left'
        ? MediaPipeBodyParts.LEFT_ANKLE
        : MediaPipeBodyParts.RIGHT_ANKLE;
    const knee = kp[kneeIdx];
    const ankle = kp[ankleIdx];
    if (!lh || !rh || !knee || !ankle) return null;

    const hipWidth = Math.abs(lh.x - rh.x);
    if (hipWidth < 1) return null;

    const midX = (lh.x + rh.x) / 2;
    const kneeToMid = Math.abs(knee.x - midX);
    const ankleToMid = Math.abs(ankle.x - midX);
    // Knee closer to midline than the ankle => medial drift (valgus)
    return (ankleToMid - kneeToMid) / hipWidth;
  }

  /**
   * Trunk lean backward past vertical, in degrees (0 = upright/forward).
   * Uses facing direction so that "behind the hips" is measured with the correct
   * sign. Returns null when facing can't be resolved.
   */
  private computeBackwardLean(skeleton: Skeleton): number | null {
    const facing = skeleton.getFacingDirection();
    if (!facing) return null;
    const kp = skeleton.getKeypoints();
    const ls = kp[MediaPipeBodyParts.LEFT_SHOULDER];
    const rs = kp[MediaPipeBodyParts.RIGHT_SHOULDER];
    const lh = kp[MediaPipeBodyParts.LEFT_HIP];
    const rh = kp[MediaPipeBodyParts.RIGHT_HIP];
    if (!ls || !rs || !lh || !rh) return null;
    const shoulderMidX = (ls.x + rs.x) / 2;
    const shoulderMidY = (ls.y + rs.y) / 2;
    const hipMidX = (lh.x + rh.x) / 2;
    const hipMidY = (lh.y + rh.y) / 2;
    const dy = hipMidY - shoulderMidY; // >0: shoulders above hips
    if (dy <= 1) return null;
    // Horizontal shoulder offset, signed so "backward" (behind facing) is positive
    const dxForward =
      facing === 'right' ? shoulderMidX - hipMidX : hipMidX - shoulderMidX;
    const backward = -dxForward; // shoulders behind hips => backward lean
    const leanDeg = (Math.atan2(backward, dy) * 180) / Math.PI;
    return Math.max(0, leanDeg);
  }

  /** Depth as a 0-100% mapping from the front-knee angle (160°→0%, target→100%). */
  private depthPercent(frontKnee: number): number {
    const top = 160;
    const target = this.thresholds.bottomTargetAngle;
    const pct = ((top - frontKnee) / (top - target)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  private createInitialMetrics(): BulgarianSplitSquatRepMetrics {
    return {
      minFrontKneeAngle: asAngleDegrees(180),
      maxSpineAngle: asAngleDegrees(0),
      worstValgusRatio: 0,
      valgusAssessable: false,
      maxBackwardLean: asAngleDegrees(0),
    };
  }

  protected calculateRepQuality(): RepQuality {
    const feedback: string[] = [];
    let score = 100;

    const {
      minFrontKneeAngle,
      maxSpineAngle,
      worstValgusRatio,
      valgusAssessable,
      maxBackwardLean,
    } = this.currentRepMetrics;

    // Depth (front-knee bend). Target ~90°.
    if (minFrontKneeAngle > 110) {
      feedback.push('Go deeper — aim for the front thigh near parallel');
      score -= 25;
    } else if (minFrontKneeAngle > 95) {
      feedback.push('Good depth, a touch lower gets you to parallel');
      score -= 8;
    }

    // Torso lean (too much forward lean loses the front-leg emphasis)
    if (maxSpineAngle > 45) {
      feedback.push('Keep the torso taller — a lot of forward lean');
      score -= 15;
    } else if (maxSpineAngle > 30) {
      feedback.push('Slight forward lean');
      score -= 5;
    }

    // Stop sign: knee cave / valgus (frontal-plane)
    const kneeCaveFlag =
      valgusAssessable &&
      worstValgusRatio >= this.thresholds.valgusRatioThreshold;
    if (!valgusAssessable) {
      feedback.push(
        'Knee cave not assessable from this camera angle (side view)'
      );
    } else if (kneeCaveFlag) {
      feedback.push('Stop sign: front knee caving in — drive it over the toes');
      score -= 20;
    }

    // Stop sign: low-back arch (sagittal-plane trunk hyper-extension)
    const archFlag = maxBackwardLean >= this.thresholds.archLeanThreshold;
    if (archFlag) {
      feedback.push('Stop sign: low-back arching — brace and tuck the ribs');
      score -= 20;
    }

    if (feedback.length === 0) {
      feedback.push('Excellent Bulgarian split squat!');
    }

    return {
      score: asQualityScore(Math.max(0, score)),
      metrics: {
        depth: 180 - minFrontKneeAngle, // higher = deeper
        frontKneeMinAngle: minFrontKneeAngle,
        torsoLean: maxSpineAngle,
        // kneeCave: 1 flagged, 0 ok, NOT_ASSESSABLE (-1) if the view can't judge it
        kneeCave: !valgusAssessable ? NOT_ASSESSABLE : kneeCaveFlag ? 1 : 0,
        lowBackArch: archFlag ? 1 : 0,
      },
      feedback,
    };
  }

  getExerciseName(): string {
    return 'Bulgarian Split Squat';
  }

  getPhases(): string[] {
    return ['standing', 'descending', 'bottom', 'ascending'];
  }

  getHudConfig() {
    return {
      metrics: [
        { key: 'frontKnee', label: 'F.KNEE', unit: '°', decimals: 0 },
        { key: 'depth', label: 'DEPTH', unit: '%', decimals: 0 },
        { key: 'spine', label: 'LEAN', unit: '°', decimals: 0 },
      ],
    };
  }

  /** The front (working) leg, or null until locked. Satisfies FormAnalyzer. */
  getWorkingLeg(): 'left' | 'right' | null {
    return this.frontLeg;
  }

  /** Manually override which leg is the front/planted leg. */
  setFrontLeg(leg: 'left' | 'right'): void {
    this.frontLeg = leg;
    this.legDetectionVotes = { left: 0, right: 0 };
  }

  protected resetExerciseState(): void {
    this.phase = 'standing';
    this.frontLeg = null;
    this.legDetectionVotes = { left: 0, right: 0 };
    this.smoothedFrontKnee = null;
    this.frontKneeHistory = [];
    this.standingKneeAtStart = null;
    this.bottomCandidate = null;
    this.framesRisingAfterBottom = 0;
    this.repArmed = false;
    this.frameHistory = [];
    this.currentRepMetrics = this.createInitialMetrics();
  }
}
