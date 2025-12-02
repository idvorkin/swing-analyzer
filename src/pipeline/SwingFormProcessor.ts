import { EMPTY, from, type Observable } from 'rxjs';
import {
  type AngularVelocity,
  BiomechanicsAnalyzer,
} from '../models/BiomechanicsAnalyzer';
import type { Skeleton } from '../models/Skeleton';
import { type FormCheckpoint as SwingForm, SwingPositionName } from '../types';
import type {
  FormEvent,
  FormProcessor,
  SkeletonEvent,
} from './PipelineInterfaces';

/**
 * Extended candidate data including biomechanics metrics
 */
interface PositionCandidate {
  skeleton: Skeleton;
  timestamp: number;
  spineAngle: number;
  armToSpineAngle: number;
  armToVerticalAngle: number;
  angleDelta: number;
  image: ImageData;
  // Enhanced biomechanics
  hipAngle: number;
  kneeAngle: number;
  hingeScore: number;
  angularVelocity: AngularVelocity;
}

/**
 * Swing form processor - processes skeletons to identify swing form positions and checkpoints
 *
 * BIOMECHANICS ANALYSIS:
 * This processor now includes enhanced movement analysis:
 * - Hip angle tracking (crucial for hinge vs squat detection)
 * - Knee angle tracking (should stay relatively constant in proper swing)
 * - Angular velocity for power assessment
 * - Temporal smoothing to reduce pose estimation noise
 */
export class SwingFormProcessor implements FormProcessor {
  // Map of detected positions in current rep
  private detectedPositions = new Map<SwingPositionName, SwingForm>();

  // Track best candidates for each position within a swing cycle
  private bestPositionCandidates = new Map<
    SwingPositionName,
    PositionCandidate
  >();

  // Biomechanics analyzer for advanced metrics
  private biomechanicsAnalyzer = new BiomechanicsAnalyzer();

  // Ideal target angles for each position
  private readonly IDEAL_ANGLES = {
    [SwingPositionName.Top]: 0, // Most vertical
    [SwingPositionName.Connect]: 45, // Mid-point down
    [SwingPositionName.Bottom]: 85, // Most horizontal
    [SwingPositionName.Release]: 35, // Mid-point up
  };

  // Ideal HIP angles for each position (knee-hip-shoulder angle)
  private readonly IDEAL_HIP_ANGLES = {
    [SwingPositionName.Top]: 165, // Nearly extended at lockout
    [SwingPositionName.Connect]: 140, // Starting to hinge
    [SwingPositionName.Bottom]: 100, // Deep hinge position
    [SwingPositionName.Release]: 130, // Driving through
  };

  // Threshold to detect a new cycle starting - lowered even more for easier detection
  private readonly CYCLE_RESET_THRESHOLD = 35; // Degrees from vertical (was 25)

  // Lower the minimum angle for cycle detection to make testing easier
  private readonly MIN_CYCLE_ANGLE = 35; // Was 40

  // Tracking swing direction
  private isDownswing = true;
  private prevSpineAngle = 0;

  // Track previous arm-to-vertical angle for release detection
  private prevArmToVerticalAngle = 0;

  // Track maximum angle in the current cycle
  private maxSpineAngleInCycle = 0;

  // Track last logged spine angle to reduce console noise
  private lastLoggedAngle = 0;

  // Threshold for significant arm angle change during release (in degrees)
  private readonly ARM_ANGLE_CHANGE_THRESHOLD = 15;

  // Track if standing calibration has been done
  private isCalibrated = false;

  constructor(
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement
  ) {}

  /**
   * Get the biomechanics analyzer for external access (e.g., UI display)
   */
  getBiomechanicsAnalyzer(): BiomechanicsAnalyzer {
    return this.biomechanicsAnalyzer;
  }

  /**
   * Process a skeleton to identify checkpoints
   * Returns an Observable that emits checkpoint events only when transitions occur
   */
  processFrame(skeletonEvent: SkeletonEvent): Observable<FormEvent> {
    // If no skeleton was detected, return empty observable
    if (!skeletonEvent.skeleton) {
      return EMPTY;
    }

    const skeleton = skeletonEvent.skeleton;
    const spineAngle = Math.abs(skeleton.getSpineAngle());
    const timestamp = skeletonEvent.poseEvent.frameEvent.timestamp;

    // Add frame to biomechanics analyzer for temporal analysis
    this.biomechanicsAnalyzer.addFrame(skeleton, timestamp);

    // Auto-calibrate standing position on first frame with low spine angle
    if (!this.isCalibrated && spineAngle < 15) {
      this.biomechanicsAnalyzer.calibrateStanding(skeleton);
      this.isCalibrated = true;
      console.log('Auto-calibrated standing position');
    }

    // Log only significant angle changes to reduce noise (>5 degrees)
    const lastLoggedAngle = this.lastLoggedAngle || 0;
    if (Math.abs(spineAngle - lastLoggedAngle) > 5) {
      this.lastLoggedAngle = spineAngle;
    }

    // Get arm angles from skeleton
    const armToSpineAngle = skeleton.getArmToSpineAngle();
    const armToVerticalAngle = skeleton.getArmToVerticalAngle();

    // Get enhanced biomechanics metrics
    const hipAngle = skeleton.getHipAngle();
    const kneeAngle = skeleton.getKneeAngle();
    const hingeScore = skeleton.getHingeVsSquatScore();
    const angularVelocity =
      this.biomechanicsAnalyzer.getSmoothedAngularVelocity();

    // Detect swing direction
    const isIncreasing = spineAngle > this.prevSpineAngle;
    if (Math.abs(spineAngle - this.prevSpineAngle) > 3) {
      // Only change direction on significant changes
      this.isDownswing = isIncreasing;
    }
    this.prevSpineAngle = spineAngle;

    // Track max angle in cycle for cycle detection
    const oldMax = this.maxSpineAngleInCycle;
    this.maxSpineAngleInCycle = Math.max(this.maxSpineAngleInCycle, spineAngle);

    // Only log when max angle increases significantly
    if (this.maxSpineAngleInCycle > oldMax + 5) {
      console.log(
        `New cycle max angle: ${this.maxSpineAngleInCycle.toFixed(1)}°, direction: ${this.isDownswing ? 'down' : 'up'}`
      );
    }

    // Check for cycle reset (going back to top)
    if (
      this.maxSpineAngleInCycle > this.MIN_CYCLE_ANGLE &&
      spineAngle < this.CYCLE_RESET_THRESHOLD
    ) {
      console.log(
        `===== CYCLE COMPLETE: Max=${this.maxSpineAngleInCycle.toFixed(1)}°, current=${spineAngle.toFixed(1)}° =====`
      );

      // We've completed a cycle, process the best candidates
      const formEvents: FormEvent[] = [];

      // Process positions in the correct sequence
      const sequence = [
        SwingPositionName.Top,
        SwingPositionName.Connect,
        SwingPositionName.Bottom,
        SwingPositionName.Release,
      ];

      for (const position of sequence) {
        const candidate = this.bestPositionCandidates.get(position);
        if (candidate) {
          console.log(
            `Found ${position}: spine=${candidate.spineAngle.toFixed(1)}°, hip=${candidate.hipAngle.toFixed(1)}°, knee=${candidate.kneeAngle.toFixed(1)}°, hinge=${candidate.hingeScore.toFixed(2)}`
          );
          // Create a checkpoint from the best candidate with enhanced biomechanics
          const checkpoint = this.createCheckpoint(
            position,
            candidate.skeleton,
            candidate.timestamp,
            candidate.spineAngle,
            candidate.armToSpineAngle,
            candidate.armToVerticalAngle,
            candidate.image,
            candidate.hipAngle,
            candidate.kneeAngle,
            candidate.hingeScore,
            candidate.angularVelocity
          );

          // Store in detected positions map
          this.detectedPositions.set(position, checkpoint);

          // Create form event
          formEvents.push({
            checkpoint,
            position,
            skeletonEvent: {
              ...skeletonEvent,
              skeleton: candidate.skeleton,
            },
          });
        } else {
          console.warn(`No candidate found for position ${position}`);
        }
      }

      // Reset for next cycle
      this.bestPositionCandidates.clear();
      this.maxSpineAngleInCycle = 0;

      // Emit all form events for the cycle
      if (formEvents.length > 0) {
        console.log(
          `Emitting ${formEvents.length} form events for positions: ${formEvents.map((e) => e.position).join(', ')}`
        );
        return from(formEvents); // Emit all events sequentially
      } else {
        console.warn('No form events to emit after cycle completion');
      }

      return EMPTY;
    }

    // Update best candidates for each position based on how close we are to the ideal angle
    this.updatePositionCandidate(
      SwingPositionName.Top,
      skeleton,
      timestamp,
      spineAngle,
      armToSpineAngle,
      armToVerticalAngle,
      hipAngle,
      kneeAngle,
      hingeScore,
      angularVelocity
    );

    // Only consider Connect in the downswing
    if (this.isDownswing) {
      this.updatePositionCandidate(
        SwingPositionName.Connect,
        skeleton,
        timestamp,
        spineAngle,
        armToSpineAngle,
        armToVerticalAngle,
        hipAngle,
        kneeAngle,
        hingeScore,
        angularVelocity
      );
    }

    // Consider Bottom position at any time (will be constrained by angle)
    this.updatePositionCandidate(
      SwingPositionName.Bottom,
      skeleton,
      timestamp,
      spineAngle,
      armToSpineAngle,
      armToVerticalAngle,
      hipAngle,
      kneeAngle,
      hingeScore,
      angularVelocity
    );

    // Only consider Release in the upswing
    if (!this.isDownswing) {
      this.updatePositionCandidate(
        SwingPositionName.Release,
        skeleton,
        timestamp,
        spineAngle,
        armToSpineAngle,
        armToVerticalAngle,
        hipAngle,
        kneeAngle,
        hingeScore,
        angularVelocity
      );
    }

    // Store the current arm-to-vertical angle for next frame comparison
    this.prevArmToVerticalAngle = armToVerticalAngle;

    // No new checkpoint detected, return empty observable
    return EMPTY;
  }

  /**
   * Update the best candidate for a position if this frame is better
   *
   * ENHANCED SCORING: Now uses a composite score that considers:
   * - Spine angle proximity to ideal (primary)
   * - Hip angle proximity to ideal (secondary)
   * - Hinge pattern quality (bonus/penalty)
   */
  private updatePositionCandidate(
    position: SwingPositionName,
    skeleton: Skeleton,
    timestamp: number,
    spineAngle: number,
    armToSpineAngle: number,
    armToVerticalAngle: number,
    hipAngle: number,
    kneeAngle: number,
    hingeScore: number,
    angularVelocity: AngularVelocity
  ): void {
    const idealSpineAngle = this.IDEAL_ANGLES[position];
    const idealHipAngle = this.IDEAL_HIP_ANGLES[position];

    // Calculate composite angle delta
    const spineDelta = Math.abs(spineAngle - idealSpineAngle);
    const hipDelta = Math.abs(hipAngle - idealHipAngle);

    // Combined score: spine is primary (70%), hip is secondary (30%)
    // For Bottom position, give more weight to hip angle (hinge indicator)
    let angleDelta: number;
    if (position === SwingPositionName.Bottom) {
      angleDelta = spineDelta * 0.5 + hipDelta * 0.5;
      // Bonus for good hinge pattern at bottom
      if (hingeScore > 0.3) {
        angleDelta *= 0.8; // 20% bonus
      } else if (hingeScore < -0.3) {
        angleDelta *= 1.3; // 30% penalty for squat pattern
      }
    } else {
      angleDelta = spineDelta * 0.7 + hipDelta * 0.3;
    }

    // Special case for Top position: consider both spine angle and arm-to-vertical angle
    if (position === SwingPositionName.Top) {
      // We want spine close to vertical (0°) AND arm angle close to vertical but pointing up (180°)
      // Normalize spine angle delta to 0-1 range (assuming max spine angle is around 90°)
      const normalizedSpineDelta = angleDelta / 90;

      // Normalize arm angle to 0-1 range where 1 is arm pointing straight up (180°)
      // and 0 is arm pointing straight down (0°)
      const normalizedArmAngle = armToVerticalAngle / 180;

      // Combined metric: balance between vertical spine and arm pointing up
      // Lower value is better (0 would be perfect)
      // Weight spine angle and arm angle equally (50% each)
      angleDelta = normalizedSpineDelta * 0.5 - normalizedArmAngle * 0.5;
    }
    // Special case for Connect position: focus on arm angle change during downswing
    else if (position === SwingPositionName.Connect && this.isDownswing) {
      // Calculate how much the arm angle has changed since the last frame
      const armAngleChange = Math.abs(
        armToVerticalAngle - this.prevArmToVerticalAngle
      );

      // We want to capture the moment with the most significant arm angle change
      // during the early to mid downswing phase
      if (armAngleChange > this.ARM_ANGLE_CHANGE_THRESHOLD && spineAngle > 20) {
        // Use inverse of angle change as our metric (smaller is better)
        angleDelta = 100 / (armAngleChange + 1);

        // Log significant arm angle changes
        console.log(
          `Connect candidate: arm angle change=${armAngleChange.toFixed(1)}°, arm-vertical=${armToVerticalAngle.toFixed(1)}°, spine=${spineAngle.toFixed(1)}°, metric=${angleDelta.toFixed(3)}`
        );
      } else {
        // For insignificant changes, make this a poor candidate
        angleDelta = 1000;
      }
    }
    // Special case for Release position: focus on arm angle change during upswing
    else if (position === SwingPositionName.Release && !this.isDownswing) {
      // Calculate how much the arm angle has changed since the last frame
      const armAngleChange = Math.abs(
        armToVerticalAngle - this.prevArmToVerticalAngle
      );

      // We want to capture the moment with the most significant arm angle change
      // Invert the metric so that a larger change gets a smaller delta (better score)
      if (armAngleChange > this.ARM_ANGLE_CHANGE_THRESHOLD) {
        // Use inverse of angle change as our metric (smaller is better)
        angleDelta = 100 / (armAngleChange + 1);

        // Log significant arm angle changes
        console.log(
          `Release candidate: arm angle change=${armAngleChange.toFixed(1)}°, arm-vertical=${armToVerticalAngle.toFixed(1)}°, metric=${angleDelta.toFixed(3)}`
        );
      } else {
        // For insignificant changes, make this a poor candidate
        angleDelta = 1000;
      }
    }

    const currentBest = this.bestPositionCandidates.get(position);

    // Special comparison for Top position
    if (position === SwingPositionName.Top) {
      // For Top position, we want to minimize our combined metric
      // Only update if this is the first candidate or better than existing
      if (!currentBest || angleDelta < currentBest.angleDelta) {
        // Capture the image right away to ensure it matches the angles
        const image = this.captureCurrentFrame();

        this.bestPositionCandidates.set(position, {
          skeleton,
          timestamp,
          spineAngle,
          armToSpineAngle,
          armToVerticalAngle,
          angleDelta,
          image,
          hipAngle,
          kneeAngle,
          hingeScore,
          angularVelocity,
        });

        // Log when we find a better candidate for top position
        console.log(
          `Better Top candidate: spine=${spineAngle.toFixed(1)}°, hip=${hipAngle.toFixed(1)}°, arm-vertical=${armToVerticalAngle.toFixed(1)}°, metric=${angleDelta.toFixed(3)}`
        );
      }
    } else {
      // For other positions, use the enhanced composite scoring
      if (!currentBest || angleDelta < currentBest.angleDelta) {
        // Capture the image right away to ensure it matches the angles
        const image = this.captureCurrentFrame();

        this.bestPositionCandidates.set(position, {
          skeleton,
          timestamp,
          spineAngle,
          armToSpineAngle,
          armToVerticalAngle,
          angleDelta,
          image,
          hipAngle,
          kneeAngle,
          hingeScore,
          angularVelocity,
        });

        // Log enhanced metrics for Bottom position
        if (position === SwingPositionName.Bottom) {
          console.log(
            `Better Bottom candidate: spine=${spineAngle.toFixed(1)}°, hip=${hipAngle.toFixed(1)}°, knee=${kneeAngle.toFixed(1)}°, hinge=${hingeScore.toFixed(2)}`
          );
        }
      }
    }
  }

  /**
   * Capture the current frame with skeleton overlay
   */
  private captureCurrentFrame(): ImageData {
    // Create a temporary canvas to blend video and skeleton
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvasElement.width;
    tempCanvas.height = this.canvasElement.height;
    const tempCtx = tempCanvas.getContext('2d');

    let imageData = new ImageData(1, 1); // Default

    if (tempCtx) {
      // First draw the video frame
      tempCtx.drawImage(
        this.videoElement,
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
      );

      // Then draw the canvas with the skeleton overlay
      tempCtx.drawImage(
        this.canvasElement,
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
      );

      // Get the combined image data
      imageData = tempCtx.getImageData(
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
      );
    }

    return imageData;
  }

  /**
   * Reset the form processor state
   */
  reset(): void {
    this.detectedPositions.clear();
    this.bestPositionCandidates.clear();
    this.maxSpineAngleInCycle = 0;
    this.prevSpineAngle = 0;
    this.prevArmToVerticalAngle = 0;
    this.isDownswing = true;
    this.biomechanicsAnalyzer.reset();
    this.isCalibrated = false;
  }

  /**
   * Create a checkpoint from skeleton data with enhanced biomechanics
   */
  private createCheckpoint(
    position: SwingPositionName,
    skeleton: Skeleton,
    timestamp: number,
    spineAngle: number,
    armToSpineAngle: number,
    armToVerticalAngle: number,
    image: ImageData,
    hipAngle: number,
    kneeAngle: number,
    hingeScore: number,
    angularVelocity: AngularVelocity
  ): SwingForm {
    // Create a checkpoint with the pre-captured image and enhanced biomechanics
    return {
      position,
      timestamp,
      image,
      spineAngle,
      armToSpineAngle,
      armToVerticalAngle,
      skeleton,
      // Enhanced biomechanics
      hipAngle,
      kneeAngle,
      hingeScore,
      angularVelocity: {
        spine: angularVelocity.spine,
        hip: angularVelocity.hip,
      },
    };
  }

  /**
   * Get all detected positions for the current rep
   */
  getDetectedPositions(): Map<SwingPositionName, SwingForm> {
    return this.detectedPositions;
  }

  /**
   * Check if a specific position has been detected in the current rep
   */
  hasDetectedPosition(position: SwingPositionName): boolean {
    return this.detectedPositions.has(position);
  }
}
