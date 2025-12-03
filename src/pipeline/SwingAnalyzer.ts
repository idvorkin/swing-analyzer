/**
 * SwingAnalyzer - Pure analysis logic for kettlebell swing position detection
 *
 * This class contains the core swing analysis algorithms without any
 * RxJS, video, or DOM dependencies. It can be used for:
 * - Real-time analysis during video playback
 * - Batch analysis of PoseTrack files
 * - Unit testing with hardcoded skeleton data
 *
 * The analyzer tracks swing cycles and detects four key positions:
 * - Top: Standing tall with arms extended overhead
 * - Connect: Arms connecting with body during downswing
 * - Bottom: Deepest hinge position
 * - Release: Arms releasing during upswing
 */

import type { AngularVelocity } from '../models/BiomechanicsAnalyzer';
import { Skeleton } from '../models/Skeleton';
import { SwingPositionName } from '../types';
import type { PoseTrackFrame } from '../types/posetrack';

/**
 * Result of analyzing a single frame
 */
export interface SwingAnalysisResult {
  /** Current spine angle */
  spineAngle: number;
  /** Current hip angle */
  hipAngle: number;
  /** Current knee angle */
  kneeAngle: number;
  /** Hinge vs squat score (-1 to 1, positive = hinge) */
  hingeScore: number;
  /** Whether currently in downswing phase */
  isDownswing: boolean;
  /** Maximum spine angle reached in current cycle */
  maxSpineAngleInCycle: number;
  /** Whether a cycle just completed */
  cycleCompleted: boolean;
  /** Best candidates found when cycle completes */
  cyclePositions: Map<SwingPositionName, PositionCandidate> | null;
}

/**
 * Candidate data for a position within a swing cycle
 */
export interface PositionCandidate {
  skeleton: Skeleton;
  timestamp: number;
  videoTime?: number;
  spineAngle: number;
  armToSpineAngle: number;
  armToVerticalAngle: number;
  angleDelta: number;
  hipAngle: number;
  kneeAngle: number;
  hingeScore: number;
  angularVelocity: AngularVelocity;
}

/**
 * Configuration for swing analysis thresholds
 */
export interface SwingAnalyzerConfig {
  /** Ideal spine angles for each position */
  idealAngles: Record<SwingPositionName, number>;
  /** Ideal hip angles for each position */
  idealHipAngles: Record<SwingPositionName, number>;
  /** Threshold to detect cycle reset (degrees from vertical) */
  cycleResetThreshold: number;
  /** Minimum angle to consider a valid cycle */
  minCycleAngle: number;
  /** Threshold for significant arm angle change */
  armAngleChangeThreshold: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_SWING_CONFIG: SwingAnalyzerConfig = {
  idealAngles: {
    [SwingPositionName.Top]: 0,
    [SwingPositionName.Connect]: 45,
    [SwingPositionName.Bottom]: 85,
    [SwingPositionName.Release]: 35,
  },
  idealHipAngles: {
    [SwingPositionName.Top]: 165,
    [SwingPositionName.Connect]: 140,
    [SwingPositionName.Bottom]: 100,
    [SwingPositionName.Release]: 130,
  },
  cycleResetThreshold: 35,
  minCycleAngle: 35,
  armAngleChangeThreshold: 15,
};

/**
 * Pure swing analysis class - no RxJS/video/DOM dependencies
 */
export class SwingAnalyzer {
  private config: SwingAnalyzerConfig;

  // Cycle tracking state
  private isDownswing = true;
  private prevSpineAngle = 0;
  private prevArmToVerticalAngle = 0;
  private maxSpineAngleInCycle = 0;

  // Best candidates for each position in current cycle
  private bestPositionCandidates = new Map<
    SwingPositionName,
    PositionCandidate
  >();

  constructor(config: Partial<SwingAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_SWING_CONFIG, ...config };
  }

  /**
   * Analyze a skeleton frame and return position detection results
   *
   * @param skeleton - The skeleton to analyze
   * @param timestamp - Frame timestamp in milliseconds
   * @param videoTime - Optional video time in seconds
   * @param angularVelocity - Optional angular velocity data
   * @returns Analysis result including cycle completion and position candidates
   */
  analyzeFrame(
    skeleton: Skeleton,
    timestamp: number,
    videoTime?: number,
    angularVelocity: AngularVelocity = { spine: 0, hip: 0, knee: 0, arm: 0 }
  ): SwingAnalysisResult {
    const spineAngle = Math.abs(skeleton.getSpineAngle());
    const hipAngle = skeleton.getHipAngle();
    const kneeAngle = skeleton.getKneeAngle();
    const hingeScore = skeleton.getHingeVsSquatScore();
    const armToSpineAngle = skeleton.getArmToSpineAngle();
    const armToVerticalAngle = skeleton.getArmToVerticalAngle();

    // Detect swing direction
    const isIncreasing = spineAngle > this.prevSpineAngle;
    if (Math.abs(spineAngle - this.prevSpineAngle) > 3) {
      this.isDownswing = isIncreasing;
    }
    this.prevSpineAngle = spineAngle;

    // Track max angle in cycle
    this.maxSpineAngleInCycle = Math.max(this.maxSpineAngleInCycle, spineAngle);

    // Check for cycle completion (going back to top)
    const cycleCompleted =
      this.maxSpineAngleInCycle > this.config.minCycleAngle &&
      spineAngle < this.config.cycleResetThreshold;

    let cyclePositions: Map<SwingPositionName, PositionCandidate> | null = null;

    if (cycleCompleted) {
      // Capture the positions from this cycle
      cyclePositions = new Map(this.bestPositionCandidates);

      // Reset for next cycle
      this.bestPositionCandidates.clear();
      this.maxSpineAngleInCycle = 0;
    } else {
      // Update position candidates
      this.updatePositionCandidate(
        SwingPositionName.Top,
        skeleton,
        timestamp,
        videoTime,
        spineAngle,
        armToSpineAngle,
        armToVerticalAngle,
        hipAngle,
        kneeAngle,
        hingeScore,
        angularVelocity
      );

      if (this.isDownswing) {
        this.updatePositionCandidate(
          SwingPositionName.Connect,
          skeleton,
          timestamp,
          videoTime,
          spineAngle,
          armToSpineAngle,
          armToVerticalAngle,
          hipAngle,
          kneeAngle,
          hingeScore,
          angularVelocity
        );
      }

      this.updatePositionCandidate(
        SwingPositionName.Bottom,
        skeleton,
        timestamp,
        videoTime,
        spineAngle,
        armToSpineAngle,
        armToVerticalAngle,
        hipAngle,
        kneeAngle,
        hingeScore,
        angularVelocity
      );

      if (!this.isDownswing) {
        this.updatePositionCandidate(
          SwingPositionName.Release,
          skeleton,
          timestamp,
          videoTime,
          spineAngle,
          armToSpineAngle,
          armToVerticalAngle,
          hipAngle,
          kneeAngle,
          hingeScore,
          angularVelocity
        );
      }
    }

    // Store current arm angle for next frame
    this.prevArmToVerticalAngle = armToVerticalAngle;

    return {
      spineAngle,
      hipAngle,
      kneeAngle,
      hingeScore,
      isDownswing: this.isDownswing,
      maxSpineAngleInCycle: this.maxSpineAngleInCycle,
      cycleCompleted,
      cyclePositions,
    };
  }

  /**
   * Update the best candidate for a position if this frame is better
   */
  private updatePositionCandidate(
    position: SwingPositionName,
    skeleton: Skeleton,
    timestamp: number,
    videoTime: number | undefined,
    spineAngle: number,
    armToSpineAngle: number,
    armToVerticalAngle: number,
    hipAngle: number,
    kneeAngle: number,
    hingeScore: number,
    angularVelocity: AngularVelocity
  ): void {
    const angleDelta = this.calculatePositionScore(
      position,
      spineAngle,
      hipAngle,
      hingeScore,
      armToVerticalAngle
    );

    const currentBest = this.bestPositionCandidates.get(position);

    if (!currentBest || angleDelta < currentBest.angleDelta) {
      this.bestPositionCandidates.set(position, {
        skeleton,
        timestamp,
        videoTime,
        spineAngle,
        armToSpineAngle,
        armToVerticalAngle,
        angleDelta,
        hipAngle,
        kneeAngle,
        hingeScore,
        angularVelocity,
      });
    }
  }

  /**
   * Calculate how well a frame matches a target position
   * Lower score = better match
   */
  private calculatePositionScore(
    position: SwingPositionName,
    spineAngle: number,
    hipAngle: number,
    hingeScore: number,
    armToVerticalAngle: number
  ): number {
    const idealSpineAngle = this.config.idealAngles[position];
    const idealHipAngle = this.config.idealHipAngles[position];

    const spineDelta = Math.abs(spineAngle - idealSpineAngle);
    const hipDelta = Math.abs(hipAngle - idealHipAngle);

    // Special scoring for each position
    switch (position) {
      case SwingPositionName.Top: {
        // Want spine close to vertical AND arm pointing up
        const normalizedSpineDelta = spineDelta / 90;
        const normalizedArmAngle = armToVerticalAngle / 180;
        return normalizedSpineDelta * 0.5 - normalizedArmAngle * 0.5;
      }

      case SwingPositionName.Connect: {
        // Focus on arm angle change during downswing
        const armAngleChange = Math.abs(
          armToVerticalAngle - this.prevArmToVerticalAngle
        );
        if (
          armAngleChange > this.config.armAngleChangeThreshold &&
          spineAngle > 20
        ) {
          return 100 / (armAngleChange + 1);
        }
        return 1000; // Poor candidate
      }

      case SwingPositionName.Bottom: {
        // Give more weight to hip angle (hinge indicator)
        let score = spineDelta * 0.5 + hipDelta * 0.5;
        if (hingeScore > 0.3) {
          score *= 0.8; // 20% bonus for good hinge
        } else if (hingeScore < -0.3) {
          score *= 1.3; // 30% penalty for squat pattern
        }
        return score;
      }

      case SwingPositionName.Release: {
        // Focus on arm angle change during upswing
        const armAngleChange = Math.abs(
          armToVerticalAngle - this.prevArmToVerticalAngle
        );
        if (armAngleChange > this.config.armAngleChangeThreshold) {
          return 100 / (armAngleChange + 1);
        }
        return 1000; // Poor candidate
      }

      default:
        return spineDelta * 0.7 + hipDelta * 0.3;
    }
  }

  /**
   * Reset analyzer state for a new analysis session
   */
  reset(): void {
    this.isDownswing = true;
    this.prevSpineAngle = 0;
    this.prevArmToVerticalAngle = 0;
    this.maxSpineAngleInCycle = 0;
    this.bestPositionCandidates.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): SwingAnalyzerConfig {
    return { ...this.config };
  }

  /**
   * Check if currently in downswing phase
   */
  getIsDownswing(): boolean {
    return this.isDownswing;
  }

  /**
   * Get max spine angle in current cycle
   */
  getMaxSpineAngleInCycle(): number {
    return this.maxSpineAngleInCycle;
  }

  /**
   * Batch analyze all frames from a PoseTrack and return rep count
   *
   * This enables instant rep counting without video playback:
   * - When cached poses are loaded, immediately get rep count
   * - During extraction, progressively update rep count
   *
   * @param frames - Array of PoseTrackFrames to analyze
   * @param config - Optional analyzer configuration
   * @returns Batch analysis result with rep count and detected cycles
   */
  static analyzeFrames(
    frames: PoseTrackFrame[],
    config?: Partial<SwingAnalyzerConfig>
  ): BatchAnalysisResult {
    const analyzer = new SwingAnalyzer(config);
    const cycles: DetectedCycle[] = [];

    for (const frame of frames) {
      if (!frame.keypoints || frame.keypoints.length === 0) {
        continue;
      }

      // Build skeleton from keypoints
      const spineAngle = frame.angles?.spineAngle ?? 0;
      const skeleton = new Skeleton(frame.keypoints, spineAngle, true);

      // Analyze the frame
      const result = analyzer.analyzeFrame(
        skeleton,
        frame.timestamp,
        frame.videoTime
      );

      // If a cycle completed, record it
      if (result.cycleCompleted && result.cyclePositions) {
        cycles.push({
          cycleNumber: cycles.length + 1,
          positions: result.cyclePositions,
          maxSpineAngle: result.maxSpineAngleInCycle,
        });
      }
    }

    return {
      repCount: cycles.length,
      cycles,
      framesAnalyzed: frames.length,
    };
  }
}

/**
 * Result of batch analyzing multiple frames
 */
export interface BatchAnalysisResult {
  /** Total number of completed reps */
  repCount: number;
  /** Details of each detected cycle */
  cycles: DetectedCycle[];
  /** Number of frames analyzed */
  framesAnalyzed: number;
}

/**
 * A detected swing cycle with position data
 */
export interface DetectedCycle {
  /** Cycle number (1-indexed) */
  cycleNumber: number;
  /** Best candidates for each position in this cycle */
  positions: Map<SwingPositionName, PositionCandidate>;
  /** Maximum spine angle reached in this cycle */
  maxSpineAngle: number;
}
