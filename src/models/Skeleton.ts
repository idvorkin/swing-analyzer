import { type PoseKeypoint, MediaPipeBodyParts, CocoBodyParts } from '../types';

/**
 * Represents a skeleton constructed from keypoints
 * with calculated angles and derived metrics
 */
export class Skeleton {
  // Mapping for keypoint lookup by name
  private keypointMapping: Record<string, number> = {};
  
  // Arm-to-spine angle cache (computed lazily)
  private _armToSpineAngle: number | null = null;

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
   * Initialize keypoint name -> index mapping
   */
  private initKeypointMapping(): void {
    console.log('Initializing keypoint mapping...');
    
    // Create a mapping from all body part names to their indices
    Object.entries(MediaPipeBodyParts).forEach(([name, index]) => {
      const lowerName = name.toLowerCase();
      this.keypointMapping[lowerName] = index;
      // Add without prefix for easier lookup
      const withoutPrefix = lowerName.replace('left_', '').replace('right_', '');
      if (withoutPrefix !== lowerName) {
        this.keypointMapping[withoutPrefix] = index;
      }
    });

    Object.entries(CocoBodyParts).forEach(([name, index]) => {
      const lowerName = name.toLowerCase();
      this.keypointMapping[lowerName] = index;
      // Add without prefix for easier lookup
      const withoutPrefix = lowerName.replace('left_', '').replace('right_', '');
      if (withoutPrefix !== lowerName) {
        this.keypointMapping[withoutPrefix] = index;
      }
    });
    
    console.log('Keypoint mapping created:', Object.keys(this.keypointMapping).length, 'entries');
    // Log some important keypoints
    console.log('rightshoulder index:', this.keypointMapping['rightshoulder']);
    console.log('leftshoulder index:', this.keypointMapping['leftshoulder']);
    console.log('shoulder index:', this.keypointMapping['shoulder']);
    console.log('rightelbow index:', this.keypointMapping['rightelbow']);
    console.log('leftelbow index:', this.keypointMapping['leftelbow']);
    console.log('elbow index:', this.keypointMapping['elbow']);
  }

  /**
   * Debug method to log all available keypoints
   */
  debugKeypoints(): void {
    console.log('=== DEBUG KEYPOINTS ===');
    console.log(`Total keypoints: ${this.keypoints.length}`);
    
    this.keypoints.forEach((kp, i) => {
      console.log(`Keypoint #${i}: x=${kp.x.toFixed(2)}, y=${kp.y.toFixed(2)}, score=${kp.score?.toFixed(2) || 'N/A'}`);
    });
    
    // Try to find the important keypoints by index
    const rightShoulderIndex = this.keypointMapping['rightshoulder'];
    const leftShoulderIndex = this.keypointMapping['leftshoulder'];
    const rightElbowIndex = this.keypointMapping['rightelbow'];
    const leftElbowIndex = this.keypointMapping['leftelbow'];
    const rightHipIndex = this.keypointMapping['righthip'];
    const leftHipIndex = this.keypointMapping['lefthip'];
    
    console.log('Important keypoints:');
    if (rightShoulderIndex !== undefined) {
      const kp = this.keypoints[rightShoulderIndex];
      console.log(`- Right Shoulder (${rightShoulderIndex}): ${kp ? `(${kp.x.toFixed(2)}, ${kp.y.toFixed(2)})` : 'not found'}`);
    } else {
      console.log('- Right Shoulder: Index not mapped');
    }
    
    if (leftShoulderIndex !== undefined) {
      const kp = this.keypoints[leftShoulderIndex];
      console.log(`- Left Shoulder (${leftShoulderIndex}): ${kp ? `(${kp.x.toFixed(2)}, ${kp.y.toFixed(2)})` : 'not found'}`);
    } else {
      console.log('- Left Shoulder: Index not mapped');
    }
    
    if (rightElbowIndex !== undefined) {
      const kp = this.keypoints[rightElbowIndex];
      console.log(`- Right Elbow (${rightElbowIndex}): ${kp ? `(${kp.x.toFixed(2)}, ${kp.y.toFixed(2)})` : 'not found'}`);
    } else {
      console.log('- Right Elbow: Index not mapped');
    }
    
    if (leftElbowIndex !== undefined) {
      const kp = this.keypoints[leftElbowIndex];
      console.log(`- Left Elbow (${leftElbowIndex}): ${kp ? `(${kp.x.toFixed(2)}, ${kp.y.toFixed(2)})` : 'not found'}`);
    } else {
      console.log('- Left Elbow: Index not mapped');
    }
    
    if (rightHipIndex !== undefined) {
      const kp = this.keypoints[rightHipIndex];
      console.log(`- Right Hip (${rightHipIndex}): ${kp ? `(${kp.x.toFixed(2)}, ${kp.y.toFixed(2)})` : 'not found'}`);
    } else {
      console.log('- Right Hip: Index not mapped');
    }
    
    if (leftHipIndex !== undefined) {
      const kp = this.keypoints[leftHipIndex];
      console.log(`- Left Hip (${leftHipIndex}): ${kp ? `(${kp.x.toFixed(2)}, ${kp.y.toFixed(2)})` : 'not found'}`);
    } else {
      console.log('- Left Hip: Index not mapped');
    }
    
    console.log('=== END DEBUG KEYPOINTS ===');
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
      const hip = this.getKeypointByName('rightHip') || this.getKeypointByName('leftHip');
      const shoulder = this.getKeypointByName('rightShoulder') || this.getKeypointByName('leftShoulder');
      
      // Get arm vector (from shoulder to elbow)
      const elbow = this.getKeypointByName('rightElbow') || this.getKeypointByName('leftElbow');

      console.log('DEBUG keypoints for arm-to-spine angle:');
      console.log('- hip:', hip ? `found (${hip.x.toFixed(2)}, ${hip.y.toFixed(2)})` : 'not found');
      console.log('- shoulder:', shoulder ? `found (${shoulder.x.toFixed(2)}, ${shoulder.y.toFixed(2)})` : 'not found');
      console.log('- elbow:', elbow ? `found (${elbow.x.toFixed(2)}, ${elbow.y.toFixed(2)})` : 'not found');
      
      if (hip && shoulder && elbow) {
        // Calculate vectors
        const spineVector = {
          x: shoulder.x - hip.x,
          y: shoulder.y - hip.y
        };
        
        const armVector = {
          x: elbow.x - shoulder.x,
          y: elbow.y - shoulder.y
        };

        console.log('Vector calculations:');
        console.log('- spineVector:', spineVector);
        console.log('- armVector:', armVector);
        
        // Calculate dot product
        const dotProduct = spineVector.x * armVector.x + spineVector.y * armVector.y;
        
        // Calculate magnitudes
        const spineMag = Math.sqrt(spineVector.x * spineVector.x + spineVector.y * spineVector.y);
        const armMag = Math.sqrt(armVector.x * armVector.x + armVector.y * armVector.y);
        
        console.log('Angle calculations:');
        console.log('- dotProduct:', dotProduct);
        console.log('- spineMag:', spineMag);
        console.log('- armMag:', armMag);
        console.log('- cos(angle):', dotProduct / (spineMag * armMag));

        // Calculate angle in radians and convert to degrees
        const cosAngle = Math.min(Math.max(dotProduct / (spineMag * armMag), -1), 1); // Clamp to [-1, 1]
        const angleRad = Math.acos(cosAngle);
        const angleDeg = angleRad * (180 / Math.PI);
        
        console.log('Final angle:', angleDeg.toFixed(2), 'degrees');
        
        this._armToSpineAngle = angleDeg;
        return angleDeg;
      } else {
        console.warn('Missing required keypoints for arm-to-spine angle calculation');
      }
      
      this._armToSpineAngle = 0; // Default if keypoints not available
      return 0;
    } catch (e) {
      console.error('Error calculating arm-to-spine angle:', e);
      this._armToSpineAngle = 0;
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
      name.replace(/([A-Z])/g, '_$1').toUpperCase(),
      // Convert camelCase to snake_case
      name.replace(/([A-Z])/g, '_$1').toLowerCase()
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
        // @ts-ignore - We're checking if the key exists
        const cocoIndex = CocoBodyParts[variant];
        if (this.keypoints[cocoIndex]) {
          return this.keypoints[cocoIndex];
        }
      }
      
      // Check if it's a key in MediaPipeBodyParts
      if (variant in MediaPipeBodyParts) {
        // @ts-ignore - We're checking if the key exists
        const mediaPipeIndex = MediaPipeBodyParts[variant];
        if (this.keypoints[mediaPipeIndex]) {
          return this.keypoints[mediaPipeIndex];
        }
      }
    }
    
    // Direct access for common points by their standard names
    if (name === 'rightShoulder' || name === 'RIGHT_SHOULDER') {
      return this.keypoints[CocoBodyParts.RIGHT_SHOULDER] || this.keypoints[MediaPipeBodyParts.RIGHT_SHOULDER];
    }
    
    if (name === 'leftShoulder' || name === 'LEFT_SHOULDER') {
      return this.keypoints[CocoBodyParts.LEFT_SHOULDER] || this.keypoints[MediaPipeBodyParts.LEFT_SHOULDER];
    }
    
    if (name === 'rightElbow' || name === 'RIGHT_ELBOW') {
      return this.keypoints[CocoBodyParts.RIGHT_ELBOW] || this.keypoints[MediaPipeBodyParts.RIGHT_ELBOW];
    }
    
    if (name === 'leftElbow' || name === 'LEFT_ELBOW') {
      return this.keypoints[CocoBodyParts.LEFT_ELBOW] || this.keypoints[MediaPipeBodyParts.LEFT_ELBOW];
    }
    
    if (name === 'rightHip' || name === 'RIGHT_HIP') {
      return this.keypoints[CocoBodyParts.RIGHT_HIP] || this.keypoints[MediaPipeBodyParts.RIGHT_HIP];
    }
    
    if (name === 'leftHip' || name === 'LEFT_HIP') {
      return this.keypoints[CocoBodyParts.LEFT_HIP] || this.keypoints[MediaPipeBodyParts.LEFT_HIP];
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
