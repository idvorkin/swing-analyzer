import type { Skeleton } from '../models/Skeleton';
import { CocoBodyParts, type PoseKeypoint } from '../types';

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
    const connections = [
      // Torso
      [CocoBodyParts.LEFT_SHOULDER, CocoBodyParts.RIGHT_SHOULDER],
      [CocoBodyParts.LEFT_SHOULDER, CocoBodyParts.LEFT_HIP],
      [CocoBodyParts.RIGHT_SHOULDER, CocoBodyParts.RIGHT_HIP],
      [CocoBodyParts.LEFT_HIP, CocoBodyParts.RIGHT_HIP],

      // Arms
      [CocoBodyParts.LEFT_SHOULDER, CocoBodyParts.LEFT_ELBOW],
      [CocoBodyParts.LEFT_ELBOW, CocoBodyParts.LEFT_WRIST],
      [CocoBodyParts.RIGHT_SHOULDER, CocoBodyParts.RIGHT_ELBOW],
      [CocoBodyParts.RIGHT_ELBOW, CocoBodyParts.RIGHT_WRIST],

      // Legs
      [CocoBodyParts.LEFT_HIP, CocoBodyParts.LEFT_KNEE],
      [CocoBodyParts.LEFT_KNEE, CocoBodyParts.LEFT_ANKLE],
      [CocoBodyParts.RIGHT_HIP, CocoBodyParts.RIGHT_KNEE],
      [CocoBodyParts.RIGHT_KNEE, CocoBodyParts.RIGHT_ANKLE],

      // Face
      [CocoBodyParts.LEFT_EYE, CocoBodyParts.RIGHT_EYE],
      [CocoBodyParts.NOSE, CocoBodyParts.LEFT_EYE],
      [CocoBodyParts.NOSE, CocoBodyParts.RIGHT_EYE],
      [CocoBodyParts.LEFT_EYE, CocoBodyParts.LEFT_EAR],
      [CocoBodyParts.RIGHT_EYE, CocoBodyParts.RIGHT_EAR],
    ];

    // Draw spine with different color to highlight it
    ctx.beginPath();
    ctx.strokeStyle = '#ff0000'; // Red for spine
    ctx.lineWidth = 3;

    // Draw spine (mid-shoulders to mid-hips)
    const leftShoulder = keypoints[CocoBodyParts.LEFT_SHOULDER];
    const rightShoulder = keypoints[CocoBodyParts.RIGHT_SHOULDER];
    const leftHip = keypoints[CocoBodyParts.LEFT_HIP];
    const rightHip = keypoints[CocoBodyParts.RIGHT_HIP];

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

    // BATCHED: Draw all dots in a single path
    ctx.beginPath();
    ctx.fillStyle = '#00ffff';
    ctx.moveTo(shoulder.x + 106, shoulder.y + 100);
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
   * Get human-readable name for a body part index
   */
  private getBodyPartName(index: number): string {
    // Map index to readable name
    const bodyPartNames: { [key: number]: string } = {
      [CocoBodyParts.NOSE]: 'Nose',
      [CocoBodyParts.LEFT_EYE]: 'Left Eye',
      [CocoBodyParts.RIGHT_EYE]: 'Right Eye',
      [CocoBodyParts.LEFT_EAR]: 'Left Ear',
      [CocoBodyParts.RIGHT_EAR]: 'Right Ear',
      [CocoBodyParts.LEFT_SHOULDER]: 'Left Shoulder',
      [CocoBodyParts.RIGHT_SHOULDER]: 'Right Shoulder',
      [CocoBodyParts.LEFT_ELBOW]: 'Left Elbow',
      [CocoBodyParts.RIGHT_ELBOW]: 'Right Elbow',
      [CocoBodyParts.LEFT_WRIST]: 'Left Wrist',
      [CocoBodyParts.RIGHT_WRIST]: 'Right Wrist',
      [CocoBodyParts.LEFT_HIP]: 'Left Hip',
      [CocoBodyParts.RIGHT_HIP]: 'Right Hip',
      [CocoBodyParts.LEFT_KNEE]: 'Left Knee',
      [CocoBodyParts.RIGHT_KNEE]: 'Right Knee',
      [CocoBodyParts.LEFT_ANKLE]: 'Left Ankle',
      [CocoBodyParts.RIGHT_ANKLE]: 'Right Ankle',
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
