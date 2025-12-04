import { CocoBodyParts, MediaPipeBodyParts, type PoseKeypoint } from '../types';

/**
 * Represents a skeleton constructed from keypoints
 * with calculated angles and derived metrics.
 *
 * BIOMECHANICS REFERENCE for Kettlebell Swing:
 * - Spine Angle: 0° = vertical (standing), ~85° = max hinge
 * - Hip Angle: Knee-Hip-Shoulder angle. ~180° = standing, ~90° = deep hinge
 * - Knee Angle: Hip-Knee-Ankle angle. ~180° = straight leg
 *
 * A proper HINGE pattern shows:
 *   - Hip angle decreases significantly (hips push back)
 *   - Knee angle stays relatively constant (soft knee, not squatting)
 *   - Spine angle increases (torso tilts forward)
 *
 * A SQUAT pattern (common fault) shows:
 *   - Knee angle decreases significantly (knees bend forward)
 *   - Hip angle doesn't decrease as much
 */
export class Skeleton {
  // Mapping for keypoint lookup by name
  private keypointMapping: Record<string, number> = {};

  // Arm-to-spine angle cache (computed lazily)
  private _armToSpineAngle: number | null = null;

  // Arm-to-vertical angle cache (computed lazily)
  private _armToVerticalAngle: number | null = null;

  // Hip angle cache (knee-hip-shoulder angle)
  private _hipAngle: number | null = null;

  // Knee angle cache (hip-knee-ankle angle)
  private _kneeAngle: number | null = null;

  // Elbow angle cache (shoulder-elbow-wrist angle)
  private _elbowAngle: number | null = null;

  // Timestamp for velocity calculations
  private _timestamp: number = 0;

  constructor(
    // Raw keypoints from the pose detection
    private readonly keypoints: PoseKeypoint[],
    // Calculated angles
    private readonly spineAngle: number,
    // Whether all required points are visible
    private readonly hasVisibleKeypoints: boolean,
    // Optional timestamp for velocity tracking
    timestamp: number = 0
  ) {
    // Create mapping for all keypoint names
    this.initKeypointMapping();
    this._timestamp = timestamp;
  }

  /**
   * Get the timestamp for this skeleton frame
   */
  getTimestamp(): number {
    return this._timestamp;
  }

  /**
   * Initialize keypoint name -> index mapping
   */
  private initKeypointMapping(): void {
    // Create a mapping from all body part names to their indices
    Object.entries(MediaPipeBodyParts).forEach(([name, index]) => {
      const lowerName = name.toLowerCase();
      this.keypointMapping[lowerName] = index;
      // Add without prefix for easier lookup
      const withoutPrefix = lowerName
        .replace('left_', '')
        .replace('right_', '');
      if (withoutPrefix !== lowerName) {
        this.keypointMapping[withoutPrefix] = index;
      }
    });

    Object.entries(CocoBodyParts).forEach(([name, index]) => {
      const lowerName = name.toLowerCase();
      this.keypointMapping[lowerName] = index;
      // Add without prefix for easier lookup
      const withoutPrefix = lowerName
        .replace('left_', '')
        .replace('right_', '');
      if (withoutPrefix !== lowerName) {
        this.keypointMapping[withoutPrefix] = index;
      }
    });
  }

  /**
   * Get the raw keypoints
   */
  getKeypoints(): PoseKeypoint[] {
    return this.keypoints;
  }

  /**
   * Get the spine angle from vertical (0 is upright)
   */
  getSpineAngle(): number {
    return this.spineAngle;
  }

  /**
   * Get the arm-to-spine angle
   * This is the angle between the arm vector (shoulder to elbow) and
   * spine vector (hip to shoulder)
   */
  getArmToSpineAngle(): number {
    // If already calculated, return cached value
    if (this._armToSpineAngle !== null) {
      return this._armToSpineAngle;
    }

    try {
      // Get spine vector (from hip to shoulder)
      const hip =
        this.getKeypointByName('rightHip') || this.getKeypointByName('leftHip');
      const shoulder =
        this.getKeypointByName('rightShoulder') ||
        this.getKeypointByName('leftShoulder');

      // Get arm vector (from shoulder to elbow)
      const elbow =
        this.getKeypointByName('rightElbow') ||
        this.getKeypointByName('leftElbow');

      if (hip && shoulder && elbow) {
        // Calculate vectors
        const spineVector = {
          x: shoulder.x - hip.x,
          y: shoulder.y - hip.y,
        };

        const armVector = {
          x: elbow.x - shoulder.x,
          y: elbow.y - shoulder.y,
        };

        // Calculate dot product
        const dotProduct =
          spineVector.x * armVector.x + spineVector.y * armVector.y;

        // Calculate magnitudes
        const spineMag = Math.sqrt(
          spineVector.x * spineVector.x + spineVector.y * spineVector.y
        );
        const armMag = Math.sqrt(
          armVector.x * armVector.x + armVector.y * armVector.y
        );

        // Calculate angle in radians and convert to degrees
        const cosAngle = Math.min(
          Math.max(dotProduct / (spineMag * armMag), -1),
          1
        ); // Clamp to [-1, 1]
        const angleRad = Math.acos(cosAngle);
        const angleDeg = angleRad * (180 / Math.PI);

        // Use exterior angle instead of interior angle for more intuitive visual representation
        // When vectors are almost aligned, this will give a small angle
        const exteriorAngleDeg = 180 - angleDeg;

        this._armToSpineAngle = exteriorAngleDeg;
        return exteriorAngleDeg;
      } else {
        this._armToSpineAngle = 0; // Default if keypoints not available
        return 0;
      }
    } catch (e) {
      console.error('Error calculating arm-to-spine angle:', e);
      this._armToSpineAngle = 0;
      return 0;
    }
  }

  /**
   * Get the arm-to-vertical angle
   * This is the angle between the arm vector (shoulder to elbow) and
   * a vertical line pointing downward (0° is arm pointing straight down, 90° is horizontal, 180° is pointing up)
   * Negative values indicate the arm is pointing to the left, positive to the right
   */
  getArmToVerticalAngle(): number {
    // If already calculated, return cached value
    if (this._armToVerticalAngle !== null) {
      return this._armToVerticalAngle;
    }

    try {
      // Get shoulder and elbow keypoints
      const shoulder =
        this.getKeypointByName('rightShoulder') ||
        this.getKeypointByName('leftShoulder');
      const elbow =
        this.getKeypointByName('rightElbow') ||
        this.getKeypointByName('leftElbow');

      if (shoulder && elbow) {
        // Calculate arm vector (from shoulder to elbow)
        const armVector = {
          x: elbow.x - shoulder.x,
          y: elbow.y - shoulder.y,
        };

        // Vertical vector pointing downward
        const verticalVector = {
          x: 0,
          y: 1, // Pointing down (Y increases downward in image coordinates)
        };

        // Calculate dot product
        const dotProduct =
          armVector.x * verticalVector.x + armVector.y * verticalVector.y;

        // Calculate magnitudes
        const armMag = Math.sqrt(
          armVector.x * armVector.x + armVector.y * armVector.y
        );
        const verticalMag = Math.sqrt(
          verticalVector.x * verticalVector.x +
            verticalVector.y * verticalVector.y
        ); // Will be 1

        // Calculate angle in radians and convert to degrees
        const cosAngle = Math.min(
          Math.max(dotProduct / (armMag * verticalMag), -1),
          1
        ); // Clamp to [-1, 1]
        const angleRad = Math.acos(cosAngle);
        let angleDeg = angleRad * (180 / Math.PI);

        // Make the angle signed: negative if arm is pointing left (x < 0), positive if pointing right
        if (armVector.x < 0) {
          angleDeg = -angleDeg;
        }

        this._armToVerticalAngle = angleDeg;
        return angleDeg;
      } else {
        console.warn('Missing keypoints for arm-to-vertical angle calculation');
        this._armToVerticalAngle = 0; // Default if keypoints not available
        return 0;
      }
    } catch (e) {
      console.error('Error calculating arm-to-vertical angle:', e);
      this._armToVerticalAngle = 0;
      return 0;
    }
  }

  /**
   * Check if this skeleton has all required visible keypoints
   */
  hasRequiredKeypoints(): boolean {
    return this.hasVisibleKeypoints;
  }

  /**
   * Get a specific keypoint by index
   */
  getKeypoint(index: number): PoseKeypoint | undefined {
    return this.keypoints[index];
  }

  /**
   * Get a specific keypoint by name
   * This supports names like "rightShoulder", "leftElbow", etc.
   */
  getKeypointByName(name: string): PoseKeypoint | undefined {
    // Try different casing variations
    const variants = [
      name.toLowerCase(),
      name,
      name.toUpperCase(),
      // Convert camelCase to SNAKE_CASE
      name
        .replace(/([A-Z])/g, '_$1')
        .toUpperCase(),
      // Convert camelCase to snake_case
      name
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase(),
    ];

    // Try each variant
    for (const variant of variants) {
      // Check direct mapping
      const index = this.keypointMapping[variant];
      if (index !== undefined && this.keypoints[index]) {
        return this.keypoints[index];
      }

      // Check if it's a key in CocoBodyParts
      if (variant in CocoBodyParts) {
        // @ts-expect-error - We're checking if the key exists
        const cocoIndex = CocoBodyParts[variant];
        if (this.keypoints[cocoIndex]) {
          return this.keypoints[cocoIndex];
        }
      }

      // Check if it's a key in MediaPipeBodyParts
      if (variant in MediaPipeBodyParts) {
        // @ts-expect-error - We're checking if the key exists
        const mediaPipeIndex = MediaPipeBodyParts[variant];
        if (this.keypoints[mediaPipeIndex]) {
          return this.keypoints[mediaPipeIndex];
        }
      }
    }

    // Direct access for common points by their standard names
    if (name === 'rightShoulder' || name === 'RIGHT_SHOULDER') {
      return (
        this.keypoints[CocoBodyParts.RIGHT_SHOULDER] ||
        this.keypoints[MediaPipeBodyParts.RIGHT_SHOULDER]
      );
    }

    if (name === 'leftShoulder' || name === 'LEFT_SHOULDER') {
      return (
        this.keypoints[CocoBodyParts.LEFT_SHOULDER] ||
        this.keypoints[MediaPipeBodyParts.LEFT_SHOULDER]
      );
    }

    if (name === 'rightElbow' || name === 'RIGHT_ELBOW') {
      return (
        this.keypoints[CocoBodyParts.RIGHT_ELBOW] ||
        this.keypoints[MediaPipeBodyParts.RIGHT_ELBOW]
      );
    }

    if (name === 'leftElbow' || name === 'LEFT_ELBOW') {
      return (
        this.keypoints[CocoBodyParts.LEFT_ELBOW] ||
        this.keypoints[MediaPipeBodyParts.LEFT_ELBOW]
      );
    }

    if (name === 'rightHip' || name === 'RIGHT_HIP') {
      return (
        this.keypoints[CocoBodyParts.RIGHT_HIP] ||
        this.keypoints[MediaPipeBodyParts.RIGHT_HIP]
      );
    }

    if (name === 'leftHip' || name === 'LEFT_HIP') {
      return (
        this.keypoints[CocoBodyParts.LEFT_HIP] ||
        this.keypoints[MediaPipeBodyParts.LEFT_HIP]
      );
    }

    console.warn(`Keypoint not found by name: ${name}`);
    return undefined;
  }

  /**
   * Get the average confidence score of keypoints
   */
  getConfidence(): number {
    const scores = this.keypoints
      .filter((kp) => kp.score !== undefined)
      .map((kp) => kp.score || 0);

    if (scores.length === 0) return 0;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Calculate the angle between three points (vertex at middle point)
   * Returns angle in degrees
   */
  private calculateAngleBetweenPoints(
    point1: PoseKeypoint,
    vertex: PoseKeypoint,
    point2: PoseKeypoint
  ): number {
    // Vector from vertex to point1
    const v1 = {
      x: point1.x - vertex.x,
      y: point1.y - vertex.y,
    };

    // Vector from vertex to point2
    const v2 = {
      x: point2.x - vertex.x,
      y: point2.y - vertex.y,
    };

    // Calculate dot product
    const dotProduct = v1.x * v2.x + v1.y * v2.y;

    // Calculate magnitudes
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    // Avoid division by zero
    if (mag1 === 0 || mag2 === 0) return 0;

    // Calculate angle in radians and convert to degrees
    const cosAngle = Math.min(Math.max(dotProduct / (mag1 * mag2), -1), 1);
    return Math.acos(cosAngle) * (180 / Math.PI);
  }

  /**
   * Get the hip angle (knee-hip-shoulder angle)
   *
   * BIOMECHANICS: This angle measures the hip flexion/extension.
   * - ~180° = fully extended (standing upright)
   * - ~90° = deep hip hinge
   *
   * In a proper kettlebell swing:
   * - At Top: ~160-175° (slight hip flexion with glute squeeze)
   * - At Bottom: ~90-120° (deep hinge, not squat)
   *
   * This is the PRIMARY indicator of hinge vs squat pattern.
   */
  getHipAngle(): number {
    if (this._hipAngle !== null) {
      return this._hipAngle;
    }

    try {
      // Get keypoints - prefer right side, fall back to left
      const knee =
        this.getKeypointByName('rightKnee') ||
        this.getKeypointByName('leftKnee');
      const hip =
        this.getKeypointByName('rightHip') || this.getKeypointByName('leftHip');
      const shoulder =
        this.getKeypointByName('rightShoulder') ||
        this.getKeypointByName('leftShoulder');

      if (knee && hip && shoulder) {
        this._hipAngle = this.calculateAngleBetweenPoints(knee, hip, shoulder);
        return this._hipAngle;
      }

      this._hipAngle = 0;
      return 0;
    } catch (e) {
      console.error('Error calculating hip angle:', e);
      this._hipAngle = 0;
      return 0;
    }
  }

  /**
   * Get the knee angle (hip-knee-ankle angle)
   *
   * BIOMECHANICS: This angle measures knee flexion/extension.
   * - ~180° = fully extended (straight leg)
   * - ~90° = deep squat position
   *
   * In a proper kettlebell swing:
   * - At Top: ~170-180° (nearly straight, locked out)
   * - At Bottom: ~140-160° (soft knee, NOT squatting)
   *
   * If knee angle drops below ~130° at bottom, it indicates SQUATTING not HINGING.
   */
  getKneeAngle(): number {
    if (this._kneeAngle !== null) {
      return this._kneeAngle;
    }

    try {
      // Get keypoints - prefer right side, fall back to left
      const hip =
        this.getKeypointByName('rightHip') || this.getKeypointByName('leftHip');
      const knee =
        this.getKeypointByName('rightKnee') ||
        this.getKeypointByName('leftKnee');
      const ankle =
        this.getKeypointByName('rightAnkle') ||
        this.getKeypointByName('leftAnkle');

      if (hip && knee && ankle) {
        this._kneeAngle = this.calculateAngleBetweenPoints(hip, knee, ankle);
        return this._kneeAngle;
      }

      this._kneeAngle = 0;
      return 0;
    } catch (e) {
      console.error('Error calculating knee angle:', e);
      this._kneeAngle = 0;
      return 0;
    }
  }

  /**
   * Get the elbow angle (shoulder-elbow-wrist angle)
   *
   * BIOMECHANICS: This angle measures elbow flexion/extension.
   * - ~180° = fully extended (straight arm)
   * - ~90° = right angle
   * - ~45° = tightly bent
   *
   * In a proper pull-up:
   * - At Hang: ~170-180° (arms nearly straight)
   * - At Top: ~45-70° (chin over bar)
   */
  getElbowAngle(): number {
    if (this._elbowAngle !== null) {
      return this._elbowAngle;
    }

    try {
      // Get keypoints - prefer right side, fall back to left
      const shoulder =
        this.getKeypointByName('rightShoulder') ||
        this.getKeypointByName('leftShoulder');
      const elbow =
        this.getKeypointByName('rightElbow') ||
        this.getKeypointByName('leftElbow');
      const wrist =
        this.getKeypointByName('rightWrist') ||
        this.getKeypointByName('leftWrist');

      if (shoulder && elbow && wrist) {
        this._elbowAngle = this.calculateAngleBetweenPoints(
          shoulder,
          elbow,
          wrist
        );
        return this._elbowAngle;
      }

      this._elbowAngle = 0;
      return 0;
    } catch (e) {
      console.error('Error calculating elbow angle:', e);
      this._elbowAngle = 0;
      return 0;
    }
  }

  /**
   * Get a generic angle between any three keypoints
   *
   * This is the configurable version that allows specifying arbitrary
   * keypoints by name. Useful for exercise-specific angle calculations.
   *
   * @param point1Name - First point name (e.g., 'rightShoulder')
   * @param vertexName - Vertex point name where angle is measured (e.g., 'rightElbow')
   * @param point2Name - Second point name (e.g., 'rightWrist')
   * @returns Angle in degrees, or null if keypoints not found
   */
  getAngle(
    point1Name: string,
    vertexName: string,
    point2Name: string
  ): number | null {
    try {
      const point1 = this.getKeypointByName(point1Name);
      const vertex = this.getKeypointByName(vertexName);
      const point2 = this.getKeypointByName(point2Name);

      if (point1 && vertex && point2) {
        return this.calculateAngleBetweenPoints(point1, vertex, point2);
      }

      return null;
    } catch (e) {
      console.error(
        `Error calculating angle between ${point1Name}, ${vertexName}, ${point2Name}:`,
        e
      );
      return null;
    }
  }

  /**
   * Get the bounding box of the person based on visible keypoints
   * Returns the min/max coordinates and center point for cropping
   *
   * @param minConfidence - Minimum confidence score to include a keypoint (default 0.2)
   * @param padding - Padding factor to add around the bounding box (default 0.2 = 20%)
   */
  getBoundingBox(
    minConfidence: number = 0.2,
    padding: number = 0.2
  ): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  } | null {
    // Filter keypoints with sufficient confidence
    const visibleKeypoints = this.keypoints.filter((kp) => {
      const confidence = kp.score ?? kp.visibility ?? 0;
      return confidence >= minConfidence && kp.x !== 0 && kp.y !== 0;
    });

    if (visibleKeypoints.length < 3) {
      // Not enough keypoints to calculate meaningful bounding box
      return null;
    }

    // Calculate raw bounding box
    const xs = visibleKeypoints.map((kp) => kp.x);
    const ys = visibleKeypoints.map((kp) => kp.y);

    const rawMinX = Math.min(...xs);
    const rawMaxX = Math.max(...xs);
    const rawMinY = Math.min(...ys);
    const rawMaxY = Math.max(...ys);

    const rawWidth = rawMaxX - rawMinX;
    const rawHeight = rawMaxY - rawMinY;

    // Add padding
    const padX = rawWidth * padding;
    const padY = rawHeight * padding;

    const minX = rawMinX - padX;
    const maxX = rawMaxX + padX;
    const minY = rawMinY - padY;
    const maxY = rawMaxY + padY;

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return { minX, minY, maxX, maxY, width, height, centerX, centerY };
  }

  /**
   * Detect if the movement pattern is a HINGE or SQUAT
   *
   * Returns a score from -1 (squat) to +1 (hinge):
   * - Positive values: Hinge-dominant pattern (good)
   * - Negative values: Squat-dominant pattern (needs correction)
   * - Near zero: Mixed/transitional pattern
   *
   * The analysis compares:
   * - Hip angle change (should be large in hinge)
   * - Knee angle change (should be small in hinge)
   */
  getHingeVsSquatScore(
    standingHipAngle: number = 170,
    standingKneeAngle: number = 175
  ): number {
    const currentHipAngle = this.getHipAngle();
    const currentKneeAngle = this.getKneeAngle();

    // Calculate how much each joint has flexed from standing
    const hipFlexion = standingHipAngle - currentHipAngle; // Higher = more hip bend
    const kneeFlexion = standingKneeAngle - currentKneeAngle; // Higher = more knee bend

    // Avoid division by zero
    const totalFlexion = hipFlexion + kneeFlexion;
    if (totalFlexion < 5) {
      return 0; // Not enough flexion to determine pattern
    }

    // Hinge ratio: how much of the total flexion is at the hip
    // In a perfect hinge: hipFlexion >> kneeFlexion, ratio approaches 1
    // In a perfect squat: kneeFlexion >> hipFlexion, ratio approaches 0
    const hingeRatio = hipFlexion / totalFlexion;

    // Convert to -1 to +1 scale
    // hingeRatio of 0.7+ = good hinge (+1)
    // hingeRatio of 0.3- = squat (-1)
    // hingeRatio of 0.5 = neutral (0)
    return (hingeRatio - 0.5) * 2;
  }
}
