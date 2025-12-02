import type { Skeleton } from '../models/Skeleton';
import { CocoBodyParts, MediaPipeBodyParts, type PoseKeypoint } from '../types';

/**
 * Responsible for rendering skeleton and pose data on a canvas
 */
export class SkeletonRenderer {
  // Rendering configuration
  private keyPointRadius = 4;
  private keyPointColor = '#00ff00';
  private connectionColor = '#ffffff';
  private fontSize = 14;
  private fontColor = '#ffff00';
  private showBodyParts = true;
  private bodyPartDisplayTime = 0.5; // seconds
  private lastLabelTimestamp = 0;

  // Debug mode flag
  private debugMode = false;

  // Model type for keypoint index mapping
  private modelType: 'BlazePose' | 'MoveNet' = 'MoveNet';

  constructor(private canvas: HTMLCanvasElement) {}

  /**
   * Render a skeleton on the canvas
   */
  renderSkeleton(skeleton: Skeleton, timestamp: number): void {
    if (!skeleton) {
      console.warn('SkeletonRenderer: No skeleton provided');
      return;
    }

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      console.error('SkeletonRenderer: Could not get canvas context');
      return;
    }

    // Clear previous drawing
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Get keypoints from skeleton
    const keypoints = skeleton.getKeypoints();

    // Get normalized keypoints
    const normalizedKeypoints = this.normalizeKeypoints(keypoints);

    // Draw connections first (so they appear behind the points)
    this.drawConnections(ctx, normalizedKeypoints);

    // Draw keypoints
    this.drawKeypoints(ctx, normalizedKeypoints, timestamp);

    // Always draw the arm-to-vertical angle visualization
    this.visualizeArmToVerticalAngle(ctx, skeleton);

    // Draw debug info if enabled
    if (this.debugMode) {
      this.drawDebugInfo(ctx, skeleton);
    } else {
      // Even if debug mode is off, still show the arm-vertical angle
      const armToVerticalAngle = skeleton.getArmToVerticalAngle().toFixed(1);
      ctx.font = '14px monospace';
      ctx.fillStyle = '#ffff00';
      ctx.textAlign = 'left';
      ctx.fillText(`Arm-Vertical Angle: ${armToVerticalAngle}°`, 10, 40);
    }
  }

  /**
   * Normalize keypoints to match canvas dimensions
   * This ensures the skeleton is properly scaled and positioned on different screen sizes
   */
  private normalizeKeypoints(keypoints: PoseKeypoint[]): PoseKeypoint[] {
    // On mobile devices, the canvas display dimensions might be different from its internal dimensions
    // We need to scale the keypoints from the original video dimensions to the displayed canvas dimensions

    return keypoints.map((point) => {
      if (!point) return point;

      // Create a copy of the point with normalized coordinates
      return {
        ...point,
        // The original coordinates are in the internal canvas dimensions
        // We need to keep them as is and let the browser handle the scaling
        x: point.x,
        y: point.y,
      };
    });
  }

  /**
   * Check if a keypoint is visible with sufficient confidence
   * Supports both 'score' (MoveNet) and 'visibility' (BlazePose) properties
   */
  private isPointVisible(point: PoseKeypoint): boolean {
    if (!point) {
      return false;
    }

    // Different models use different confidence thresholds
    // MoveNet uses 'score', BlazePose uses 'visibility'
    const confidence =
      point.score !== undefined
        ? point.score
        : point.visibility !== undefined
          ? point.visibility
          : 0;

    return confidence > 0.2; // Threshold to consider a point visible
  }

  /**
   * Draw line connections between keypoints
   */
  private drawConnections(
    ctx: CanvasRenderingContext2D,
    keypoints: PoseKeypoint[]
  ): void {
    // Set line style
    ctx.strokeStyle = this.connectionColor;
    ctx.lineWidth = 2;

    // Get correct body part indices based on model type
    const BodyParts =
      this.modelType === 'BlazePose' ? MediaPipeBodyParts : CocoBodyParts;

    // Define the connections to draw (pairs of keypoint indices)
    const connections = [
      // Torso
      [BodyParts.LEFT_SHOULDER, BodyParts.RIGHT_SHOULDER],
      [BodyParts.LEFT_SHOULDER, BodyParts.LEFT_HIP],
      [BodyParts.RIGHT_SHOULDER, BodyParts.RIGHT_HIP],
      [BodyParts.LEFT_HIP, BodyParts.RIGHT_HIP],

      // Arms
      [BodyParts.LEFT_SHOULDER, BodyParts.LEFT_ELBOW],
      [BodyParts.LEFT_ELBOW, BodyParts.LEFT_WRIST],
      [BodyParts.RIGHT_SHOULDER, BodyParts.RIGHT_ELBOW],
      [BodyParts.RIGHT_ELBOW, BodyParts.RIGHT_WRIST],

      // Legs
      [BodyParts.LEFT_HIP, BodyParts.LEFT_KNEE],
      [BodyParts.LEFT_KNEE, BodyParts.LEFT_ANKLE],
      [BodyParts.RIGHT_HIP, BodyParts.RIGHT_KNEE],
      [BodyParts.RIGHT_KNEE, BodyParts.RIGHT_ANKLE],

      // Face
      [BodyParts.LEFT_EYE, BodyParts.RIGHT_EYE],
      [BodyParts.NOSE, BodyParts.LEFT_EYE],
      [BodyParts.NOSE, BodyParts.RIGHT_EYE],
      [BodyParts.LEFT_EYE, BodyParts.LEFT_EAR],
      [BodyParts.RIGHT_EYE, BodyParts.RIGHT_EAR],
    ];

    // Draw spine with different color to highlight it
    ctx.beginPath();
    ctx.strokeStyle = '#ff0000'; // Red for spine
    ctx.lineWidth = 3;

    // Draw spine (mid-shoulders to mid-hips)
    const leftShoulder = keypoints[BodyParts.LEFT_SHOULDER];
    const rightShoulder = keypoints[BodyParts.RIGHT_SHOULDER];
    const leftHip = keypoints[BodyParts.LEFT_HIP];
    const rightHip = keypoints[BodyParts.RIGHT_HIP];

    if (
      this.isPointVisible(leftShoulder) &&
      this.isPointVisible(rightShoulder) &&
      this.isPointVisible(leftHip) &&
      this.isPointVisible(rightHip)
    ) {
      // Calculate midpoints
      const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
      const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      const midHipX = (leftHip.x + rightHip.x) / 2;
      const midHipY = (leftHip.y + rightHip.y) / 2;

      // Draw the spine line
      ctx.moveTo(midShoulderX, midShoulderY);
      ctx.lineTo(midHipX, midHipY);
      ctx.stroke();
    }

    // Reset for normal connections
    ctx.beginPath();
    ctx.strokeStyle = this.connectionColor;
    ctx.lineWidth = 2;

    let _connectionsDrawn = 0;
    // Draw all connections
    for (const [i, j] of connections) {
      const pointA = keypoints[i];
      const pointB = keypoints[j];

      if (this.isPointVisible(pointA) && this.isPointVisible(pointB)) {
        ctx.moveTo(pointA.x, pointA.y);
        ctx.lineTo(pointB.x, pointB.y);
        _connectionsDrawn++;
      }
    }

    ctx.stroke();
  }

  /**
   * Draw keypoints with optional labels
   */
  private drawKeypoints(
    ctx: CanvasRenderingContext2D,
    keypoints: PoseKeypoint[],
    timestamp: number
  ): void {
    // Determine if we should show the body part labels
    const showLabels =
      this.showBodyParts &&
      timestamp - this.lastLabelTimestamp < this.bodyPartDisplayTime * 1000;

    // Set text style for labels
    if (showLabels) {
      ctx.font = `${this.fontSize}px Arial`;
      ctx.fillStyle = this.fontColor;
      ctx.textAlign = 'center';
    }

    // Draw each keypoint
    keypoints.forEach((point, index) => {
      if (this.isPointVisible(point)) {
        // Draw point circle
        ctx.beginPath();
        ctx.arc(point.x, point.y, this.keyPointRadius, 0, 2 * Math.PI);
        ctx.fillStyle = this.keyPointColor;
        ctx.fill();

        // Draw label if needed
        if (showLabels) {
          const bodyPartName = this.getBodyPartName(index);
          ctx.fillStyle = this.fontColor;
          ctx.fillText(bodyPartName, point.x, point.y - 10);
        }
      }
    });
  }

  /**
   * Draw debug information on canvas
   */
  private drawDebugInfo(
    ctx: CanvasRenderingContext2D,
    skeleton: Skeleton
  ): void {
    // Set text style for debug info
    ctx.font = '14px monospace';
    ctx.fillStyle = '#ffff00';
    ctx.textAlign = 'left';

    // Draw spine angle
    const spineAngle = skeleton.getSpineAngle().toFixed(1);
    ctx.fillText(`Spine Angle: ${spineAngle}°`, 10, 20);

    // Draw arm-to-vertical angle
    const armToVerticalAngle = skeleton.getArmToVerticalAngle().toFixed(1);
    ctx.fillText(`Arm-Vertical Angle: ${armToVerticalAngle}°`, 10, 40);

    // Always visualize the arm-to-vertical angle, regardless of debug mode
    this.visualizeArmToVerticalAngle(ctx, skeleton);

    // Draw grid if needed
    if (this.debugMode) {
      this.drawDebugGrid(ctx);
    }
  }

  /**
   * Visualize the arm-to-vertical angle calculation
   */
  private visualizeArmToVerticalAngle(
    ctx: CanvasRenderingContext2D,
    skeleton: Skeleton
  ): void {
    // Get required keypoints
    const shoulder =
      skeleton.getKeypointByName('rightShoulder') ||
      skeleton.getKeypointByName('leftShoulder');
    const elbow =
      skeleton.getKeypointByName('rightElbow') ||
      skeleton.getKeypointByName('leftElbow');

    if (!shoulder || !elbow) {
      // Draw error message if keypoints not found
      ctx.fillStyle = '#ff0000';
      ctx.fillText('Error: Missing keypoints for arm-vertical angle', 10, 60);

      // Log which keypoints are missing
      ctx.fillText(`  Shoulder: ${shoulder ? 'Found' : 'Missing'}`, 10, 80);
      ctx.fillText(`  Elbow: ${elbow ? 'Found' : 'Missing'}`, 10, 100);
      return;
    }

    // Set styles for vectors
    ctx.lineWidth = 3;

    // Draw vertical vector
    ctx.beginPath();
    ctx.strokeStyle = '#00ffff'; // Cyan
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(shoulder.x, shoulder.y + 100); // 100px down from shoulder
    ctx.stroke();

    // Draw arm vector in bright yellow - this is what we want to highlight
    ctx.beginPath();
    ctx.strokeStyle = '#ffff00'; // Bright yellow
    ctx.lineWidth = 5; // Make it thicker for emphasis
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.stroke();

    // Draw dots at the keypoints with labels
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(shoulder.x, shoulder.y + 100, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillText('Vertical', shoulder.x + 10, shoulder.y + 100);

    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(shoulder.x, shoulder.y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillText('Shoulder', shoulder.x + 10, shoulder.y);

    ctx.fillStyle = '#ffff00'; // Match the arm color
    ctx.beginPath();
    ctx.arc(elbow.x, elbow.y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillText('Elbow', elbow.x + 10, elbow.y);

    // Draw calculated arm-to-vertical angle
    const armToVerticalAngle = skeleton.getArmToVerticalAngle().toFixed(1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${armToVerticalAngle}°`, shoulder.x - 20, shoulder.y - 10);
  }

  /**
   * Set display options for body part labels
   */
  setBodyPartDisplay(show: boolean, displaySeconds: number): void {
    this.showBodyParts = show;
    this.bodyPartDisplayTime = displaySeconds;

    // Reset timer if turning on
    if (show) {
      this.lastLabelTimestamp = performance.now();
    }
  }

  /**
   * Set debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Set the model type for correct keypoint index mapping
   */
  setModelType(modelType: 'BlazePose' | 'MoveNet'): void {
    this.modelType = modelType;
  }

  /**
   * Get human-readable name for a body part index
   */
  private getBodyPartName(index: number): string {
    // Get correct body part mapping based on model type
    const BodyParts =
      this.modelType === 'BlazePose' ? MediaPipeBodyParts : CocoBodyParts;

    // Map index to readable name
    const bodyPartNames: { [key: number]: string } = {
      [BodyParts.NOSE]: 'Nose',
      [BodyParts.LEFT_EYE]: 'Left Eye',
      [BodyParts.RIGHT_EYE]: 'Right Eye',
      [BodyParts.LEFT_EAR]: 'Left Ear',
      [BodyParts.RIGHT_EAR]: 'Right Ear',
      [BodyParts.LEFT_SHOULDER]: 'Left Shoulder',
      [BodyParts.RIGHT_SHOULDER]: 'Right Shoulder',
      [BodyParts.LEFT_ELBOW]: 'Left Elbow',
      [BodyParts.RIGHT_ELBOW]: 'Right Elbow',
      [BodyParts.LEFT_WRIST]: 'Left Wrist',
      [BodyParts.RIGHT_WRIST]: 'Right Wrist',
      [BodyParts.LEFT_HIP]: 'Left Hip',
      [BodyParts.RIGHT_HIP]: 'Right Hip',
      [BodyParts.LEFT_KNEE]: 'Left Knee',
      [BodyParts.RIGHT_KNEE]: 'Right Knee',
      [BodyParts.LEFT_ANKLE]: 'Left Ankle',
      [BodyParts.RIGHT_ANKLE]: 'Right Ankle',
    };

    return bodyPartNames[index] || `Point ${index}`;
  }

  /**
   * Render a skeleton to a given canvas context
   */
  renderSkeletonToCanvas(
    skeleton: Skeleton,
    context: CanvasRenderingContext2D
  ): void {
    if (!skeleton) return;

    // Render the skeleton using existing methods
    // Get current timestamp for consistent rendering
    const timestamp = Date.now();

    // Draw connections and keypoints
    this.drawConnections(context, skeleton.getKeypoints());
    this.drawKeypoints(context, skeleton.getKeypoints(), timestamp);
  }

  /**
   * Render a simple debug grid on the canvas
   */
  private drawDebugGrid(context: CanvasRenderingContext2D): void {
    const height = context.canvas.height;
    const width = context.canvas.width;

    // Draw horizontal lines
    context.beginPath();
    context.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    context.lineWidth = 1;

    // Draw grid lines
    const gridSize = 50;

    // Horizontal lines
    for (let y = 0; y < height; y += gridSize) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }

    // Vertical lines
    for (let x = 0; x < width; x += gridSize) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }

    context.stroke();
  }
}
