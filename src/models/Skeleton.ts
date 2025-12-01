import { MediaPipeBodyParts, type PoseKeypoint } from '../types';

/**
 * Represents a skeleton constructed from keypoints
 * with calculated angles and derived metrics
 */
export class Skeleton {
  // Mapping for keypoint lookup by name
  private keypointMapping: Record<string, number> = {};

  // Arm-to-spine angle cache (computed lazily)
  private _armToSpineAngle: number | null = null;

  // Arm-to-vertical angle cache (computed lazily)
  private _armToVerticalAngle: number | null = null;

  constructor(
    // Raw keypoints from the pose detection
    private readonly keypoints: PoseKeypoint[],
    // Calculated angles
    private readonly spineAngle: number,
    // Whether all required points are visible
    private readonly hasVisibleKeypoints: boolean
  ) {
    // Create mapping for all keypoint names
    this.initKeypointMapping();
  }

  /**
   * Initialize keypoint name -> index mapping (MediaPipe format for BlazePose)
   */
  private initKeypointMapping(): void {
    // Create a mapping from MediaPipe body part names to their indices
    // BlazePose uses MediaPipe format with 33 keypoints
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

    // Try each variant (MediaPipe format for BlazePose)
    for (const variant of variants) {
      // Check direct mapping
      const index = this.keypointMapping[variant];
      if (index !== undefined && this.keypoints[index]) {
        return this.keypoints[index];
      }

      // Check if it's a key in MediaPipeBodyParts (BlazePose uses MediaPipe format)
      if (variant in MediaPipeBodyParts) {
        // @ts-expect-error - We're checking if the key exists
        const mediaPipeIndex = MediaPipeBodyParts[variant];
        if (this.keypoints[mediaPipeIndex]) {
          return this.keypoints[mediaPipeIndex];
        }
      }
    }

    // Direct access for common points by their standard names (MediaPipe format for BlazePose)
    if (name === 'rightShoulder' || name === 'RIGHT_SHOULDER') {
      return this.keypoints[MediaPipeBodyParts.RIGHT_SHOULDER];
    }

    if (name === 'leftShoulder' || name === 'LEFT_SHOULDER') {
      return this.keypoints[MediaPipeBodyParts.LEFT_SHOULDER];
    }

    if (name === 'rightElbow' || name === 'RIGHT_ELBOW') {
      return this.keypoints[MediaPipeBodyParts.RIGHT_ELBOW];
    }

    if (name === 'leftElbow' || name === 'LEFT_ELBOW') {
      return this.keypoints[MediaPipeBodyParts.LEFT_ELBOW];
    }

    if (name === 'rightHip' || name === 'RIGHT_HIP') {
      return this.keypoints[MediaPipeBodyParts.RIGHT_HIP];
    }

    if (name === 'leftHip' || name === 'LEFT_HIP') {
      return this.keypoints[MediaPipeBodyParts.LEFT_HIP];
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
}
