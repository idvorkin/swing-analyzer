/**
 * Exercise Detector
 *
 * Automatically detects which exercise is being performed by analyzing
 * skeleton movement patterns over the first several frames.
 *
 * Key discriminating feature: knee angle asymmetry
 * - Kettlebell Swing: Both legs work together (low asymmetry < 20°)
 * - Pistol Squat: One leg bent, one extended (high asymmetry > 40°)
 */

import type { Skeleton } from '../models/Skeleton';

export type DetectedExercise = 'kettlebell-swing' | 'pistol-squat' | 'unknown';

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
}

const DEFAULT_CONFIG: ExerciseDetectorConfig = {
  minFrames: 60,  // ~2 seconds at 30fps - need to see actual movement, not just standing
  maxFrames: 120, // ~4 seconds - see at least one full rep before deciding
  asymmetryThreshold: 35,
  confidenceThreshold: 70,
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
    if (result.confidence >= this.config.confidenceThreshold || this.frameCount >= this.config.maxFrames) {
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
    const avgAsymmetry = recentHistory.reduce((a, b) => a + b, 0) / recentHistory.length;

    // Count frames with high asymmetry
    const highAsymmetryFrames = this.kneeAsymmetryHistory.filter(
      (a) => a > this.config.asymmetryThreshold
    ).length;
    const highAsymmetryRatio = highAsymmetryFrames / this.kneeAsymmetryHistory.length;

    // Decision logic
    // Key insight: Max asymmetry is the strongest signal
    // - Kettlebell swing: max asymmetry stays below ~25° (both legs work together)
    // - Pistol squat: max asymmetry spikes to 80-130° during the squat (one leg bent, one extended)

    // Very high max asymmetry (80°+) is definitive proof of pistol squat
    // No kettlebell swing would ever show 80°+ knee angle difference
    if (this.maxKneeAsymmetry > 80) {
      // Strong pistol squat signal - give high confidence
      const confidence = Math.min(100, Math.round(70 + (this.maxKneeAsymmetry - 80) / 2));
      return {
        exercise: 'pistol-squat',
        confidence,
        reason: `Clear pistol squat (max asymmetry: ${this.maxKneeAsymmetry.toFixed(0)}°)`,
      };
    } else if (this.maxKneeAsymmetry > this.config.asymmetryThreshold && highAsymmetryRatio > 0.3) {
      // Moderate asymmetry with consistent pattern → Pistol Squat
      const confidence = Math.min(100, Math.round(50 + highAsymmetryRatio * 50));
      return {
        exercise: 'pistol-squat',
        confidence,
        reason: `High knee asymmetry detected (max: ${this.maxKneeAsymmetry.toFixed(0)}°, avg: ${avgAsymmetry.toFixed(0)}°)`,
      };
    } else if (this.maxKneeAsymmetry < this.config.asymmetryThreshold * 0.7) {
      // Low asymmetry → Kettlebell Swing
      const confidence = Math.min(100, Math.round(70 + (1 - highAsymmetryRatio) * 30));
      return {
        exercise: 'kettlebell-swing',
        confidence,
        reason: `Symmetric leg movement detected (max asymmetry: ${this.maxKneeAsymmetry.toFixed(0)}°)`,
      };
    } else {
      // Ambiguous - need more data
      const confidence = Math.round(30 + this.frameCount);
      return {
        exercise: this.maxKneeAsymmetry > this.config.asymmetryThreshold ? 'pistol-squat' : 'kettlebell-swing',
        confidence: Math.min(60, confidence),
        reason: `Analyzing movement pattern (asymmetry: ${avgAsymmetry.toFixed(0)}°)`,
      };
    }
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
  } {
    const avg =
      this.kneeAsymmetryHistory.length > 0
        ? this.kneeAsymmetryHistory.reduce((a, b) => a + b, 0) / this.kneeAsymmetryHistory.length
        : 0;
    return {
      frameCount: this.frameCount,
      maxKneeAsymmetry: this.maxKneeAsymmetry,
      avgKneeAsymmetry: avg,
      locked: this.locked,
    };
  }
}
