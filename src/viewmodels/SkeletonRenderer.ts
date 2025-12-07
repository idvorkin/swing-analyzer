import type { Skeleton } from '../models/Skeleton';
import { MediaPipeBodyParts, type PoseKeypoint } from '../types';

/**
 * Responsible for rendering skeleton and pose data on a canvas
 *
 * Performance optimizations (swing-8h3):
 * - Batched canvas operations (single beginPath for all keypoints)
 * - Cached canvas context
 * - No unnecessary keypoint copying
 * - Cached angle calculations
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

  // Cached canvas context for performance
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    // Cache the context on construction
    this.ctx = canvas.getContext('2d');
  }

  /**
   * Render a skeleton on the canvas
   *
   * Performance: Uses cached context and batched drawing operations
   */
  renderSkeleton(skeleton: Skeleton, timestamp: number): void {
    if (!skeleton) {
      return; // Silent return - no console.warn in hot path
    }

    // Get context (try cache first, then refresh if needed)
    let ctx = this.ctx;
    if (!ctx) {
      this.ctx = this.canvas.getContext('2d');
      ctx = this.ctx;
      if (!ctx) return;
    }

    // Clear previous drawing
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Get keypoints directly - no copying needed
    const keypoints = skeleton.getKeypoints();

    // Draw connections first (so they appear behind the points)
    this.drawConnections(ctx, keypoints);

    // Draw keypoints (batched)
    this.drawKeypoints(ctx, keypoints, timestamp);

    // Cache the angle calculation once for this frame
    const armToVerticalAngle = skeleton.getArmToVerticalAngle();

    // Draw angle visualization (uses cached angle)
    this.visualizeArmToVerticalAngle(ctx, skeleton, armToVerticalAngle);

    // Draw debug info if enabled (angle text is drawn in visualize, not duplicated here)
    if (this.debugMode) {
      this.drawDebugInfo(ctx, skeleton, armToVerticalAngle);
    }
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

    // Define the connections to draw (pairs of keypoint indices)
    // MediaPipe 33-point format includes hands and feet
    const connections = [
      // Torso
      [MediaPipeBodyParts.LEFT_SHOULDER, MediaPipeBodyParts.RIGHT_SHOULDER],
      [MediaPipeBodyParts.LEFT_SHOULDER, MediaPipeBodyParts.LEFT_HIP],
      [MediaPipeBodyParts.RIGHT_SHOULDER, MediaPipeBodyParts.RIGHT_HIP],
      [MediaPipeBodyParts.LEFT_HIP, MediaPipeBodyParts.RIGHT_HIP],

      // Arms
      [MediaPipeBodyParts.LEFT_SHOULDER, MediaPipeBodyParts.LEFT_ELBOW],
      [MediaPipeBodyParts.LEFT_ELBOW, MediaPipeBodyParts.LEFT_WRIST],
      [MediaPipeBodyParts.RIGHT_SHOULDER, MediaPipeBodyParts.RIGHT_ELBOW],
      [MediaPipeBodyParts.RIGHT_ELBOW, MediaPipeBodyParts.RIGHT_WRIST],

      // Hands (new in 33-point format)
      [MediaPipeBodyParts.LEFT_WRIST, MediaPipeBodyParts.LEFT_PINKY],
      [MediaPipeBodyParts.LEFT_WRIST, MediaPipeBodyParts.LEFT_INDEX],
      [MediaPipeBodyParts.LEFT_WRIST, MediaPipeBodyParts.LEFT_THUMB],
      [MediaPipeBodyParts.RIGHT_WRIST, MediaPipeBodyParts.RIGHT_PINKY],
      [MediaPipeBodyParts.RIGHT_WRIST, MediaPipeBodyParts.RIGHT_INDEX],
      [MediaPipeBodyParts.RIGHT_WRIST, MediaPipeBodyParts.RIGHT_THUMB],

      // Legs
      [MediaPipeBodyParts.LEFT_HIP, MediaPipeBodyParts.LEFT_KNEE],
      [MediaPipeBodyParts.LEFT_KNEE, MediaPipeBodyParts.LEFT_ANKLE],
      [MediaPipeBodyParts.RIGHT_HIP, MediaPipeBodyParts.RIGHT_KNEE],
      [MediaPipeBodyParts.RIGHT_KNEE, MediaPipeBodyParts.RIGHT_ANKLE],

      // Feet (new in 33-point format)
      [MediaPipeBodyParts.LEFT_ANKLE, MediaPipeBodyParts.LEFT_HEEL],
      [MediaPipeBodyParts.LEFT_HEEL, MediaPipeBodyParts.LEFT_FOOT_INDEX],
      [MediaPipeBodyParts.LEFT_ANKLE, MediaPipeBodyParts.LEFT_FOOT_INDEX],
      [MediaPipeBodyParts.RIGHT_ANKLE, MediaPipeBodyParts.RIGHT_HEEL],
      [MediaPipeBodyParts.RIGHT_HEEL, MediaPipeBodyParts.RIGHT_FOOT_INDEX],
      [MediaPipeBodyParts.RIGHT_ANKLE, MediaPipeBodyParts.RIGHT_FOOT_INDEX],

      // Face
      [MediaPipeBodyParts.LEFT_EYE, MediaPipeBodyParts.RIGHT_EYE],
      [MediaPipeBodyParts.NOSE, MediaPipeBodyParts.LEFT_EYE],
      [MediaPipeBodyParts.NOSE, MediaPipeBodyParts.RIGHT_EYE],
      [MediaPipeBodyParts.LEFT_EYE, MediaPipeBodyParts.LEFT_EAR],
      [MediaPipeBodyParts.RIGHT_EYE, MediaPipeBodyParts.RIGHT_EAR],
    ];

    // Draw spine with different color to highlight it
    ctx.beginPath();
    ctx.strokeStyle = '#ff0000'; // Red for spine
    ctx.lineWidth = 3;

    // Draw spine (mid-shoulders to mid-hips)
    const leftShoulder = keypoints[MediaPipeBodyParts.LEFT_SHOULDER];
    const rightShoulder = keypoints[MediaPipeBodyParts.RIGHT_SHOULDER];
    const leftHip = keypoints[MediaPipeBodyParts.LEFT_HIP];
    const rightHip = keypoints[MediaPipeBodyParts.RIGHT_HIP];

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

    let connectionsDrawn = 0;
    // Draw all connections
    for (const [i, j] of connections) {
      const pointA = keypoints[i];
      const pointB = keypoints[j];

      if (
        this.isPointVisible(pointA) &&
        this.isPointVisible(pointB)
      ) {
        ctx.moveTo(pointA.x, pointA.y);
        ctx.lineTo(pointB.x, pointB.y);
        connectionsDrawn++;
      }
    }

    ctx.stroke();
  }

  /**
   * Draw keypoints with optional labels
   *
   * Performance: Batches all keypoint circles into a single path operation
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

    // BATCHED: Draw all keypoint circles in a single path
    ctx.beginPath();
    ctx.fillStyle = this.keyPointColor;

    const visiblePoints: Array<{ point: PoseKeypoint; index: number }> = [];

    for (let index = 0; index < keypoints.length; index++) {
      const point = keypoints[index];
      if (this.isPointVisible(point)) {
        // Add arc to the current path (no beginPath per point!)
        ctx.moveTo(point.x + this.keyPointRadius, point.y);
        ctx.arc(point.x, point.y, this.keyPointRadius, 0, 2 * Math.PI);
        if (showLabels) {
          visiblePoints.push({ point, index });
        }
      }
    }

    // Single fill for all keypoints
    ctx.fill();

    // Draw labels separately (text can't be batched)
    if (showLabels && visiblePoints.length > 0) {
      ctx.font = `${this.fontSize}px Arial`;
      ctx.fillStyle = this.fontColor;
      ctx.textAlign = 'center';
      for (const { point, index } of visiblePoints) {
        const bodyPartName = this.getBodyPartName(index);
        ctx.fillText(bodyPartName, point.x, point.y - 10);
      }
    }
  }

  /**
   * Draw debug information on canvas
   *
   * Performance: Uses pre-calculated armToVerticalAngle instead of recalculating
   */
  private drawDebugInfo(
    ctx: CanvasRenderingContext2D,
    skeleton: Skeleton,
    armToVerticalAngle: number
  ): void {
    // Set text style for debug info
    ctx.font = '14px monospace';
    ctx.fillStyle = '#ffff00';
    ctx.textAlign = 'left';

    // Draw spine angle
    const spineAngle = skeleton.getSpineAngle().toFixed(1);
    ctx.fillText(`Spine Angle: ${spineAngle}°`, 10, 20);

    // Draw arm-to-vertical angle (using cached value)
    ctx.fillText(`Arm-Vertical Angle: ${armToVerticalAngle.toFixed(1)}°`, 10, 40);

    // Draw grid in debug mode
    this.drawDebugGrid(ctx);
  }

  /**
   * Visualize the arm-to-vertical angle calculation
   *
   * Performance: Uses pre-calculated angle, batched drawing operations
   */
  private visualizeArmToVerticalAngle(
    ctx: CanvasRenderingContext2D,
    skeleton: Skeleton,
    armToVerticalAngle: number
  ): void {
    // Get required keypoints
    const shoulder = skeleton.getKeypointByName('rightShoulder') || skeleton.getKeypointByName('leftShoulder');
    const elbow = skeleton.getKeypointByName('rightElbow') || skeleton.getKeypointByName('leftElbow');

    if (!shoulder || !elbow) {
      // Silent return - don't draw error text in hot path
      return;
    }

    // BATCHED: Draw both vectors in fewer operations
    // Draw vertical vector (cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(shoulder.x, shoulder.y + 100);
    ctx.stroke();

    // Draw arm vector (yellow, thicker)
    ctx.beginPath();
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 5;
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.stroke();

    // Draw vertical reference dot
    ctx.beginPath();
    ctx.fillStyle = '#00ffff';
    ctx.moveTo(shoulder.x + 6, shoulder.y + 100);
    ctx.arc(shoulder.x, shoulder.y + 100, 6, 0, 2 * Math.PI);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = '#ffff00';
    ctx.moveTo(shoulder.x + 6, shoulder.y);
    ctx.arc(shoulder.x, shoulder.y, 6, 0, 2 * Math.PI);
    ctx.moveTo(elbow.x + 6, elbow.y);
    ctx.arc(elbow.x, elbow.y, 6, 0, 2 * Math.PI);
    ctx.fill();

    // Draw labels and angle (text can't be batched)
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00ffff';
    ctx.fillText('Vertical', shoulder.x + 10, shoulder.y + 100);
    ctx.fillStyle = '#ffff00';
    ctx.fillText('Shoulder', shoulder.x + 10, shoulder.y);
    ctx.fillText('Elbow', elbow.x + 10, elbow.y);

    // Draw the angle value (using cached calculation)
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${armToVerticalAngle.toFixed(1)}°`, shoulder.x - 20, shoulder.y - 10);
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
   * Get human-readable name for a body part index (MediaPipe 33-point format)
   */
  private getBodyPartName(index: number): string {
    // Map index to readable name
    const bodyPartNames: { [key: number]: string } = {
      // Face (0-10)
      [MediaPipeBodyParts.NOSE]: 'Nose',
      [MediaPipeBodyParts.LEFT_EYE_INNER]: 'Left Eye Inner',
      [MediaPipeBodyParts.LEFT_EYE]: 'Left Eye',
      [MediaPipeBodyParts.LEFT_EYE_OUTER]: 'Left Eye Outer',
      [MediaPipeBodyParts.RIGHT_EYE_INNER]: 'Right Eye Inner',
      [MediaPipeBodyParts.RIGHT_EYE]: 'Right Eye',
      [MediaPipeBodyParts.RIGHT_EYE_OUTER]: 'Right Eye Outer',
      [MediaPipeBodyParts.LEFT_EAR]: 'Left Ear',
      [MediaPipeBodyParts.RIGHT_EAR]: 'Right Ear',
      [MediaPipeBodyParts.MOUTH_LEFT]: 'Mouth Left',
      [MediaPipeBodyParts.MOUTH_RIGHT]: 'Mouth Right',
      // Upper body (11-22)
      [MediaPipeBodyParts.LEFT_SHOULDER]: 'Left Shoulder',
      [MediaPipeBodyParts.RIGHT_SHOULDER]: 'Right Shoulder',
      [MediaPipeBodyParts.LEFT_ELBOW]: 'Left Elbow',
      [MediaPipeBodyParts.RIGHT_ELBOW]: 'Right Elbow',
      [MediaPipeBodyParts.LEFT_WRIST]: 'Left Wrist',
      [MediaPipeBodyParts.RIGHT_WRIST]: 'Right Wrist',
      [MediaPipeBodyParts.LEFT_PINKY]: 'Left Pinky',
      [MediaPipeBodyParts.RIGHT_PINKY]: 'Right Pinky',
      [MediaPipeBodyParts.LEFT_INDEX]: 'Left Index',
      [MediaPipeBodyParts.RIGHT_INDEX]: 'Right Index',
      [MediaPipeBodyParts.LEFT_THUMB]: 'Left Thumb',
      [MediaPipeBodyParts.RIGHT_THUMB]: 'Right Thumb',
      // Lower body (23-32)
      [MediaPipeBodyParts.LEFT_HIP]: 'Left Hip',
      [MediaPipeBodyParts.RIGHT_HIP]: 'Right Hip',
      [MediaPipeBodyParts.LEFT_KNEE]: 'Left Knee',
      [MediaPipeBodyParts.RIGHT_KNEE]: 'Right Knee',
      [MediaPipeBodyParts.LEFT_ANKLE]: 'Left Ankle',
      [MediaPipeBodyParts.RIGHT_ANKLE]: 'Right Ankle',
      [MediaPipeBodyParts.LEFT_HEEL]: 'Left Heel',
      [MediaPipeBodyParts.RIGHT_HEEL]: 'Right Heel',
      [MediaPipeBodyParts.LEFT_FOOT_INDEX]: 'Left Foot',
      [MediaPipeBodyParts.RIGHT_FOOT_INDEX]: 'Right Foot',
    };

    return bodyPartNames[index] || `Point ${index}`;
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
