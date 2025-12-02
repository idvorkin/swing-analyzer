import type { Skeleton } from './Skeleton';

/**
 * Frame data stored for temporal analysis
 */
interface FrameData {
  timestamp: number;
  spineAngle: number;
  hipAngle: number;
  kneeAngle: number;
  armToVerticalAngle: number;
}

/**
 * Angular velocity data (degrees per second)
 */
export interface AngularVelocity {
  spine: number; // Spine angular velocity
  hip: number; // Hip angular velocity
  knee: number; // Knee angular velocity
  arm: number; // Arm angular velocity
}

/**
 * Form quality metrics
 */
export interface FormQuality {
  hingeScore: number; // -1 (squat) to +1 (hinge)
  powerScore: number; // 0-100, based on angular velocity at key points
  consistencyScore: number; // 0-100, based on rep-to-rep variation
  lockoutScore: number; // 0-100, quality of top position
  depthScore: number; // 0-100, quality of bottom position
  overallScore: number; // 0-100, weighted average
}

/**
 * BiomechanicsAnalyzer provides advanced swing analysis:
 * - Temporal smoothing to reduce noise
 * - Angular velocity calculations for power assessment
 * - Form quality scoring
 * - Pattern recognition (hinge vs squat)
 */
export class BiomechanicsAnalyzer {
  // Frame buffer for temporal analysis (stores last N frames)
  private frameBuffer: FrameData[] = [];
  private readonly BUFFER_SIZE = 10; // ~333ms at 30fps

  // Standing reference angles (calibrated at start)
  private standingHipAngle = 170;
  private standingKneeAngle = 175;
  private standingSpineAngle = 5;

  // Rep history for consistency analysis
  private repMetrics: {
    bottomSpineAngle: number;
    bottomHipAngle: number;
    bottomKneeAngle: number;
    peakVelocity: number;
  }[] = [];

  /**
   * Add a new frame to the analysis buffer
   */
  addFrame(skeleton: Skeleton, timestamp: number): void {
    const frameData: FrameData = {
      timestamp,
      spineAngle: skeleton.getSpineAngle(),
      hipAngle: skeleton.getHipAngle(),
      kneeAngle: skeleton.getKneeAngle(),
      armToVerticalAngle: skeleton.getArmToVerticalAngle(),
    };

    this.frameBuffer.push(frameData);

    // Keep buffer at fixed size
    if (this.frameBuffer.length > this.BUFFER_SIZE) {
      this.frameBuffer.shift();
    }
  }

  /**
   * Get smoothed angles using exponential moving average
   * This reduces frame-to-frame noise from pose estimation
   */
  getSmoothedAngles(): {
    spineAngle: number;
    hipAngle: number;
    kneeAngle: number;
    armToVerticalAngle: number;
  } {
    if (this.frameBuffer.length === 0) {
      return {
        spineAngle: 0,
        hipAngle: 0,
        kneeAngle: 0,
        armToVerticalAngle: 0,
      };
    }

    // Exponential moving average weights (more recent frames weighted higher)
    const alpha = 0.3; // Smoothing factor
    let smoothedSpine = this.frameBuffer[0].spineAngle;
    let smoothedHip = this.frameBuffer[0].hipAngle;
    let smoothedKnee = this.frameBuffer[0].kneeAngle;
    let smoothedArm = this.frameBuffer[0].armToVerticalAngle;

    for (let i = 1; i < this.frameBuffer.length; i++) {
      smoothedSpine =
        alpha * this.frameBuffer[i].spineAngle + (1 - alpha) * smoothedSpine;
      smoothedHip =
        alpha * this.frameBuffer[i].hipAngle + (1 - alpha) * smoothedHip;
      smoothedKnee =
        alpha * this.frameBuffer[i].kneeAngle + (1 - alpha) * smoothedKnee;
      smoothedArm =
        alpha * this.frameBuffer[i].armToVerticalAngle +
        (1 - alpha) * smoothedArm;
    }

    return {
      spineAngle: smoothedSpine,
      hipAngle: smoothedHip,
      kneeAngle: smoothedKnee,
      armToVerticalAngle: smoothedArm,
    };
  }

  /**
   * Calculate angular velocities (degrees per second)
   *
   * BIOMECHANICS: Angular velocity indicates power output.
   * In a powerful kettlebell swing:
   * - Peak hip extension velocity: 200-400°/s
   * - Peak spine extension velocity: 150-300°/s
   *
   * Low velocities indicate "muscling" the bell rather than using hip drive.
   */
  getAngularVelocity(): AngularVelocity {
    if (this.frameBuffer.length < 2) {
      return { spine: 0, hip: 0, knee: 0, arm: 0 };
    }

    // Use the last two frames for instantaneous velocity
    const current = this.frameBuffer[this.frameBuffer.length - 1];
    const previous = this.frameBuffer[this.frameBuffer.length - 2];

    const dt = (current.timestamp - previous.timestamp) / 1000; // Convert to seconds
    if (dt <= 0) {
      return { spine: 0, hip: 0, knee: 0, arm: 0 };
    }

    return {
      spine: (current.spineAngle - previous.spineAngle) / dt,
      hip: (current.hipAngle - previous.hipAngle) / dt,
      knee: (current.kneeAngle - previous.kneeAngle) / dt,
      arm: (current.armToVerticalAngle - previous.armToVerticalAngle) / dt,
    };
  }

  /**
   * Get smoothed angular velocity (reduces noise in velocity signal)
   */
  getSmoothedAngularVelocity(): AngularVelocity {
    if (this.frameBuffer.length < 3) {
      return { spine: 0, hip: 0, knee: 0, arm: 0 };
    }

    // Use central difference for smoother velocity estimate
    // v(t) ≈ (x(t+1) - x(t-1)) / (2*dt)
    const velocities: AngularVelocity[] = [];

    for (let i = 1; i < this.frameBuffer.length - 1; i++) {
      const next = this.frameBuffer[i + 1];
      const prev = this.frameBuffer[i - 1];
      const dt = (next.timestamp - prev.timestamp) / 1000;

      if (dt > 0) {
        velocities.push({
          spine: (next.spineAngle - prev.spineAngle) / dt,
          hip: (next.hipAngle - prev.hipAngle) / dt,
          knee: (next.kneeAngle - prev.kneeAngle) / dt,
          arm: (next.armToVerticalAngle - prev.armToVerticalAngle) / dt,
        });
      }
    }

    if (velocities.length === 0) {
      return { spine: 0, hip: 0, knee: 0, arm: 0 };
    }

    // Average the velocities
    const avgVel = velocities.reduce(
      (acc, v) => ({
        spine: acc.spine + v.spine,
        hip: acc.hip + v.hip,
        knee: acc.knee + v.knee,
        arm: acc.arm + v.arm,
      }),
      { spine: 0, hip: 0, knee: 0, arm: 0 }
    );

    return {
      spine: avgVel.spine / velocities.length,
      hip: avgVel.hip / velocities.length,
      knee: avgVel.knee / velocities.length,
      arm: avgVel.arm / velocities.length,
    };
  }

  /**
   * Calibrate standing reference angles from current pose
   * Call this when user is standing upright before starting swings
   */
  calibrateStanding(skeleton: Skeleton): void {
    this.standingHipAngle = skeleton.getHipAngle();
    this.standingKneeAngle = skeleton.getKneeAngle();
    this.standingSpineAngle = skeleton.getSpineAngle();
    console.log(
      `Calibrated standing angles: hip=${this.standingHipAngle.toFixed(1)}°, knee=${this.standingKneeAngle.toFixed(1)}°, spine=${this.standingSpineAngle.toFixed(1)}°`
    );
  }

  /**
   * Record metrics at the bottom of a rep for consistency tracking
   */
  recordRepBottom(skeleton: Skeleton, peakVelocity: number): void {
    this.repMetrics.push({
      bottomSpineAngle: skeleton.getSpineAngle(),
      bottomHipAngle: skeleton.getHipAngle(),
      bottomKneeAngle: skeleton.getKneeAngle(),
      peakVelocity,
    });
  }

  /**
   * Calculate comprehensive form quality score
   */
  calculateFormQuality(skeleton: Skeleton): FormQuality {
    const velocity = this.getSmoothedAngularVelocity();
    const smoothed = this.getSmoothedAngles();

    // 1. Hinge Score: Based on hip vs knee flexion ratio
    const hingeScore = skeleton.getHingeVsSquatScore(
      this.standingHipAngle,
      this.standingKneeAngle
    );

    // 2. Power Score: Based on hip extension velocity at release
    // Normalize to 0-100 scale (300°/s = 100%)
    const hipVelocityMagnitude = Math.abs(velocity.hip);
    const powerScore = Math.min(100, (hipVelocityMagnitude / 300) * 100);

    // 3. Consistency Score: Based on rep-to-rep variation
    let consistencyScore = 100;
    if (this.repMetrics.length >= 3) {
      const spineAngles = this.repMetrics.map((r) => r.bottomSpineAngle);
      const stdDev = this.calculateStdDev(spineAngles);
      // Lower std dev = higher consistency (5° std dev = 100%, 20° = 0%)
      consistencyScore = Math.max(
        0,
        Math.min(100, 100 - (stdDev - 5) * (100 / 15))
      );
    }

    // 4. Lockout Score: Quality of top position
    // Good lockout: spine angle < 10°, hip angle > 160°
    let lockoutScore = 100;
    if (smoothed.spineAngle < 15) {
      lockoutScore = 100;
    } else if (smoothed.spineAngle < 25) {
      lockoutScore = 70;
    } else {
      lockoutScore = 40;
    }

    // 5. Depth Score: Quality of bottom position
    // Good depth: spine angle 70-85°, hip angle 90-120°
    const bottomSpineIdeal = 80;
    const bottomHipIdeal = 105;
    const spineDeviation = Math.abs(smoothed.spineAngle - bottomSpineIdeal);
    const hipDeviation = Math.abs(smoothed.hipAngle - bottomHipIdeal);
    const depthScore = Math.max(0, 100 - spineDeviation * 2 - hipDeviation);

    // Overall Score: Weighted average
    const overallScore =
      hingeScore > 0
        ? hingeScore * 20 + // Hinge pattern is most important (40% when positive)
          powerScore * 0.25 +
          consistencyScore * 0.15 +
          lockoutScore * 0.1 +
          depthScore * 0.1 +
          20 // Base score
        : // Penalty for squat pattern
          Math.max(0, 50 + hingeScore * 30);

    return {
      hingeScore,
      powerScore,
      consistencyScore,
      lockoutScore,
      depthScore,
      overallScore: Math.min(100, Math.max(0, overallScore)),
    };
  }

  /**
   * Detect the current phase of the swing based on velocity and position
   */
  detectSwingPhase(): 'standing' | 'backswing' | 'bottom' | 'upswing' | 'top' {
    const velocity = this.getSmoothedAngularVelocity();
    const angles = this.getSmoothedAngles();

    // Standing: low spine angle, low velocity
    if (Math.abs(angles.spineAngle) < 15 && Math.abs(velocity.spine) < 30) {
      return angles.armToVerticalAngle > 90 ? 'top' : 'standing';
    }

    // Backswing: spine angle increasing (positive velocity)
    if (velocity.spine > 50) {
      return 'backswing';
    }

    // Upswing: spine angle decreasing (negative velocity)
    if (velocity.spine < -50) {
      return 'upswing';
    }

    // Bottom: high spine angle, velocity near zero (transition point)
    if (angles.spineAngle > 60 && Math.abs(velocity.spine) < 50) {
      return 'bottom';
    }

    // Top: low spine angle, velocity near zero
    if (angles.spineAngle < 20 && Math.abs(velocity.spine) < 30) {
      return 'top';
    }

    // Default based on spine angle
    return angles.spineAngle > 45 ? 'bottom' : 'standing';
  }

  /**
   * Generate coaching cues based on current form analysis
   */
  generateCoachingCues(skeleton: Skeleton): string[] {
    const cues: string[] = [];
    const hingeScore = skeleton.getHingeVsSquatScore(
      this.standingHipAngle,
      this.standingKneeAngle
    );
    const velocity = this.getSmoothedAngularVelocity();
    const angles = this.getSmoothedAngles();

    // Check for squat pattern
    if (hingeScore < -0.2) {
      cues.push('Push your hips BACK, not DOWN');
      cues.push('Imagine closing a car door with your butt');
    }

    // Check for insufficient depth
    if (angles.spineAngle < 60 && this.detectSwingPhase() === 'bottom') {
      cues.push('Hinge deeper - chest toward the floor');
    }

    // Check for low power
    if (Math.abs(velocity.hip) < 100 && this.detectSwingPhase() === 'upswing') {
      cues.push('Snap your hips! Drive through the heels');
    }

    // Check for hyperextension at top
    if (angles.spineAngle < -5) {
      cues.push("Don't lean back at the top - squeeze glutes instead");
    }

    return cues;
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.frameBuffer = [];
    this.repMetrics = [];
  }

  /**
   * Calculate standard deviation of an array of numbers
   */
  private calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b) / values.length;
    const squareDiffs = values.map((v) => (v - mean) ** 2);
    const avgSquareDiff =
      squareDiffs.reduce((a, b) => a + b) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }
}
