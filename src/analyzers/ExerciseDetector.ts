/**
 * Exercise Detector
 *
 * Automatically detects which exercise is being performed by analyzing
 * skeleton movement patterns over the first several frames.
 *
 * Key discriminating features:
 * - Knee angle asymmetry (primary)
 *   - Kettlebell Swing: Both legs work together (low asymmetry < 20°)
 *   - Pistol Squat: One leg bent, one extended (high asymmetry > 40°)
 *   - Bulgarian Split Squat: Asymmetric legs like the pistol, but the back
 *     foot rests on a stable bench → a sustained one-sided ankle-Y elevation
 *     (the bench is present even during standing) separates it from the
 *     pistol, whose extended foot dangles and varies. The asymmetry gate
 *     is required so a symmetric (side-stance) kettlebell swing — which can
 *     also show a one-sided ankle delta from perspective — is not misread.
 */

import type { Skeleton } from '../models/Skeleton';
import { MediaPipeBodyParts } from '../types';

export type DetectedExercise =
  | 'kettlebell-swing'
  | 'pistol-squat'
  | 'bulgarian-split-squat'
  | 'unknown';

export interface DetectionResult {
  exercise: DetectedExercise;
  confidence: number; // 0-100
  reason: string;
}

export interface ExerciseDetectorConfig {
  /** Minimum frames before making a detection (default: 10) */
  minFrames: number;
  /** Maximum frames to analyze before giving up (default: 60) */
  maxFrames: number;
  /** Knee asymmetry threshold for pistol squat detection in degrees (default: 35) */
  asymmetryThreshold: number;
  /** Confidence threshold to lock in detection (default: 70) */
  confidenceThreshold: number;
  /**
   * Minimum |leftAnkleY - rightAnkleY| in px for a single frame to count as
   * rear-foot-elevated evidence for Bulgarian split squat detection.
   * (default: 15)
   */
  rearFootElevationDeadzone: number;
  /**
   * Minimum number of frames with confident ankle data required before the
   * rear-foot-elevation signal is trusted. Guards against tiny samples.
   * (default: 15)
   */
  minRearFootElevationFrames: number;
  /**
   * Fraction of the detection window in which the SAME side must be
   * consistently elevated to classify a Bulgarian split squat. The bench is
   * a stable platform present throughout, whereas a pistol's extended foot
   * dangles and its elevation sign/consistency is much lower.
   * (default: 0.7)
   */
  rearFootElevationRatioThreshold: number;
  /**
   * Minimum average |leftAnkleY - rightAnkleY| in px across the detection
   * window to treat as a real (bench-height) elevation rather than noise.
   * (default: 25)
   */
  minRearFootElevationMagnitude: number;
}

const DEFAULT_CONFIG: ExerciseDetectorConfig = {
  minFrames: 60, // ~2 seconds at 30fps - need to see actual movement, not just standing
  maxFrames: 120, // ~4 seconds - see at least one full rep before deciding
  asymmetryThreshold: 35,
  confidenceThreshold: 70,
  rearFootElevationDeadzone: 15, // px; above ankle/pose noise
  minRearFootElevationFrames: 15, // ~0.5s at 30fps of ankle evidence
  rearFootElevationRatioThreshold: 0.7, // 70% of frames one-sided elevated
  minRearFootElevationMagnitude: 25, // px average; bench-height floor
};

/**
 * Detects exercise type from skeleton movement patterns.
 *
 * Usage:
 * ```typescript
 * const detector = new ExerciseDetector();
 * for (const skeleton of skeletons) {
 *   const result = detector.processFrame(skeleton);
 *   if (result.confidence >= 70) {
 *     console.log(`Detected: ${result.exercise}`);
 *     break;
 *   }
 * }
 * ```
 */
export class ExerciseDetector {
  private config: ExerciseDetectorConfig;
  private frameCount = 0;
  private maxKneeAsymmetry = 0;
  private kneeAsymmetryHistory: number[] = [];
  // Signed per-frame ankle-Y delta (leftAnkleY - rightAnkleY) for frames where
  // both ankles are confident. Image Y increases downward, so:
  //   dy < 0 → left ankle HIGHER (smaller Y) → left is the back/elevated foot
  //   dy > 0 → right ankle HIGHER → right is the back/elevated foot
  // Used by the Bulgarian split squat branch in calculateDetection().
  private ankleElevationHistory: number[] = [];
  private locked = false;
  private lockedResult: DetectionResult | null = null;

  constructor(config: Partial<ExerciseDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a skeleton frame and update detection
   */
  processFrame(skeleton: Skeleton): DetectionResult {
    // If already locked, return cached result
    if (this.locked && this.lockedResult) {
      return this.lockedResult;
    }

    this.frameCount++;

    // Calculate knee asymmetry using Skeleton's side-specific methods
    const leftKnee = skeleton.getKneeAngleForSide('left');
    const rightKnee = skeleton.getKneeAngleForSide('right');
    const asymmetry = Math.abs(leftKnee - rightKnee);

    this.kneeAsymmetryHistory.push(asymmetry);
    this.maxKneeAsymmetry = Math.max(this.maxKneeAsymmetry, asymmetry);

    // Cap history to prevent unbounded memory growth (only last 200 frames matter)
    if (this.kneeAsymmetryHistory.length > 200) {
      this.kneeAsymmetryHistory.shift(); // Remove oldest element efficiently
    }

    // Record the signed ankle-Y delta for Bulgarian split squat detection.
    // The bench is a stable platform: a one-sided elevation sustained across
    // the window (even during standing) separates Bulgarian from pistol
    // (whose extended foot dangles variably). Confidence-gated to mirror the
    // BulgarianSplitSquatFormAnalyzer.detectFrontLeg ankle read. We use
    // optional chaining so skeletons/mocks without getKeypoints() are safe
    // (the elevation signal simply stays empty and the branch never fires).
    const keypoints = skeleton.getKeypoints?.();
    if (keypoints && keypoints.length > MediaPipeBodyParts.RIGHT_ANKLE) {
      const leftAnkle = keypoints[MediaPipeBodyParts.LEFT_ANKLE];
      const rightAnkle = keypoints[MediaPipeBodyParts.RIGHT_ANKLE];
      if (leftAnkle && rightAnkle) {
        const lConf = leftAnkle.score ?? leftAnkle.visibility ?? 0;
        const rConf = rightAnkle.score ?? rightAnkle.visibility ?? 0;
        if (lConf >= 0.3 && rConf >= 0.3) {
          this.ankleElevationHistory.push(leftAnkle.y - rightAnkle.y);
        }
      }
    }
    if (this.ankleElevationHistory.length > 200) {
      this.ankleElevationHistory.shift();
    }

    // Not enough frames yet
    if (this.frameCount < this.config.minFrames) {
      return {
        exercise: 'unknown',
        confidence: 0,
        reason: `Collecting data (${this.frameCount}/${this.config.minFrames} frames)`,
      };
    }

    // Calculate detection
    const result = this.calculateDetection();

    // Lock in if confident enough or max frames reached
    if (
      result.confidence >= this.config.confidenceThreshold ||
      this.frameCount >= this.config.maxFrames
    ) {
      this.locked = true;
      this.lockedResult = result;
    }

    return result;
  }

  /**
   * Calculate the current detection based on accumulated data
   */
  private calculateDetection(): DetectionResult {
    // Calculate average asymmetry over recent frames
    const recentHistory = this.kneeAsymmetryHistory.slice(-20);
    const avgAsymmetry =
      recentHistory.reduce((a, b) => a + b, 0) / recentHistory.length;

    // Count frames with high asymmetry
    const highAsymmetryFrames = this.kneeAsymmetryHistory.filter(
      (a) => a > this.config.asymmetryThreshold
    ).length;
    const highAsymmetryRatio =
      highAsymmetryFrames / this.kneeAsymmetryHistory.length;

    // Decision logic
    // Key insight: Max asymmetry is the strongest signal
    // - Kettlebell swing: max asymmetry stays below ~25° (both legs work together)
    // - Pistol squat: max asymmetry spikes to 80-130° during the squat (one leg bent, one extended)

    // Bulgarian split squat: a back foot resting on a bench produces a
    // sustained, one-sided ankle-Y elevation present across the window (the
    // bench is there even while standing), while the front + back knees do
    // different work (high asymmetry). This MUST run before the pistol
    // branches below: Bulgarian split squats are highly asymmetric, so they
    // would otherwise be confidently misrouted to pistol-squat. The asymmetry
    // gate (maxKneeAsymmetry > asymmetryThreshold) rejects symmetric kettlebell
    // swings, whose side stance can also produce a one-sided ankle delta from
    // perspective alone; the sustained-elevation guard rejects pistol squats,
    // whose extended foot dangles and whose elevation sign/consistency is low.
    if (this.maxKneeAsymmetry > this.config.asymmetryThreshold) {
      const elevation = this.computeRearFootElevation();
      if (elevation.isElevated) {
        const elevationMargin =
          (elevation.ratio - this.config.rearFootElevationRatioThreshold) /
          (1 - this.config.rearFootElevationRatioThreshold);
        const confidence = Math.min(100, Math.round(70 + elevationMargin * 20));
        return {
          exercise: 'bulgarian-split-squat',
          confidence,
          reason: `Bulgarian split squat (rear-foot elevated (${elevation.elevatedSide}): ${(
            elevation.ratio * 100
          ).toFixed(
            0
          )}% of frames, max asymmetry: ${this.maxKneeAsymmetry.toFixed(0)}°)`,
        };
      }
    }

    // Very high max asymmetry (80°+) is definitive proof of pistol squat
    // No kettlebell swing would ever show 80°+ knee angle difference
    if (this.maxKneeAsymmetry > 80) {
      // Strong pistol squat signal - give high confidence
      const confidence = Math.min(
        100,
        Math.round(70 + (this.maxKneeAsymmetry - 80) / 2)
      );
      return {
        exercise: 'pistol-squat',
        confidence,
        reason: `Clear pistol squat (max asymmetry: ${this.maxKneeAsymmetry.toFixed(0)}°)`,
      };
    } else if (
      this.maxKneeAsymmetry > this.config.asymmetryThreshold &&
      highAsymmetryRatio > 0.3
    ) {
      // Moderate asymmetry with consistent pattern → Pistol Squat
      const confidence = Math.min(
        100,
        Math.round(50 + highAsymmetryRatio * 50)
      );
      return {
        exercise: 'pistol-squat',
        confidence,
        reason: `High knee asymmetry detected (max: ${this.maxKneeAsymmetry.toFixed(0)}°, avg: ${avgAsymmetry.toFixed(0)}°)`,
      };
    } else if (this.maxKneeAsymmetry < this.config.asymmetryThreshold * 0.7) {
      // Low asymmetry → Kettlebell Swing
      const confidence = Math.min(
        100,
        Math.round(70 + (1 - highAsymmetryRatio) * 30)
      );
      return {
        exercise: 'kettlebell-swing',
        confidence,
        reason: `Symmetric leg movement detected (max asymmetry: ${this.maxKneeAsymmetry.toFixed(0)}°)`,
      };
    } else {
      // Ambiguous - need more data
      const confidence = Math.round(30 + this.frameCount);
      return {
        exercise:
          this.maxKneeAsymmetry > this.config.asymmetryThreshold
            ? 'pistol-squat'
            : 'kettlebell-swing',
        confidence: Math.min(60, confidence),
        reason: `Analyzing movement pattern (asymmetry: ${avgAsymmetry.toFixed(0)}°)`,
      };
    }
  }

  /**
   * Inspect the accumulated ankle-Y history for a sustained, one-sided
   * rear-foot elevation (Bulgarian split squat's bench signature).
   *
   * Returns the dominant elevated side, the fraction of frames that side is
   * elevated by more than the deadzone, the average |dy| magnitude, and
   * whether the signal is strong enough to classify as Bulgarian. Pistol
   * squats dangle the extended foot (low/variable consistency); symmetric
   * side-stance swings can show a one-sided delta from perspective but are
   * gated out by the asymmetry check in calculateDetection, not here.
   */
  private computeRearFootElevation(): {
    isElevated: boolean;
    ratio: number;
    elevatedSide: 'left' | 'right';
    avgMagnitude: number;
    sampleFrames: number;
  } {
    const total = this.ankleElevationHistory.length;
    if (total < this.config.minRearFootElevationFrames) {
      return {
        isElevated: false,
        ratio: 0,
        elevatedSide: 'left',
        avgMagnitude: 0,
        sampleFrames: total,
      };
    }

    const deadzone = this.config.rearFootElevationDeadzone;
    let leftElevated = 0; // left ankle higher (smaller Y): dy < -deadzone
    let rightElevated = 0; // right ankle higher: dy > deadzone
    let absSum = 0;
    for (const dy of this.ankleElevationHistory) {
      absSum += Math.abs(dy);
      if (dy < -deadzone) leftElevated++;
      else if (dy > deadzone) rightElevated++;
    }

    const elevatedSide: 'left' | 'right' =
      leftElevated >= rightElevated ? 'left' : 'right';
    const dominantCount = Math.max(leftElevated, rightElevated);
    const ratio = dominantCount / total;
    const avgMagnitude = absSum / total;
    const isElevated =
      ratio >= this.config.rearFootElevationRatioThreshold &&
      avgMagnitude >= this.config.minRearFootElevationMagnitude;

    return {
      isElevated,
      ratio,
      elevatedSide,
      avgMagnitude,
      sampleFrames: total,
    };
  }

  /**
   * Get the current detection result without processing a new frame
   */
  getResult(): DetectionResult {
    if (this.lockedResult) {
      return this.lockedResult;
    }
    if (this.frameCount < this.config.minFrames) {
      return {
        exercise: 'unknown',
        confidence: 0,
        reason: `Need more frames (${this.frameCount}/${this.config.minFrames})`,
      };
    }
    return this.calculateDetection();
  }

  /**
   * Check if detection is locked (confident result)
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Manually lock the detector with a specific exercise (user override)
   */
  lock(exercise: DetectedExercise): void {
    this.locked = true;
    this.lockedResult = {
      exercise,
      confidence: 100,
      reason: 'User override',
    };
  }

  /**
   * Reset the detector for a new video
   */
  reset(): void {
    this.frameCount = 0;
    this.maxKneeAsymmetry = 0;
    this.kneeAsymmetryHistory = [];
    this.ankleElevationHistory = [];
    this.locked = false;
    this.lockedResult = null;
  }

  /**
   * Get detection statistics for debugging
   */
  getStats(): {
    frameCount: number;
    maxKneeAsymmetry: number;
    avgKneeAsymmetry: number;
    locked: boolean;
    rearFootElevationFrames: number;
    rearFootElevationRatio: number;
    rearFootElevatedSide: 'left' | 'right' | null;
  } {
    const avg =
      this.kneeAsymmetryHistory.length > 0
        ? this.kneeAsymmetryHistory.reduce((a, b) => a + b, 0) /
          this.kneeAsymmetryHistory.length
        : 0;
    const elevation = this.computeRearFootElevation();
    return {
      frameCount: this.frameCount,
      maxKneeAsymmetry: this.maxKneeAsymmetry,
      avgKneeAsymmetry: avg,
      locked: this.locked,
      rearFootElevationFrames: elevation.sampleFrames,
      rearFootElevationRatio: elevation.ratio,
      rearFootElevatedSide:
        elevation.sampleFrames === 0 ? null : elevation.elevatedSide,
    };
  }
}
