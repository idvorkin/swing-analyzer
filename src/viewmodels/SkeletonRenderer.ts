import type { Skeleton } from '../models/Skeleton';
import { CocoBodyParts, type PoseKeypoint } from '../types';

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

    // Draw connections first (so they appear behind the points)
    this.drawConnections(ctx, keypoints);

    // Draw keypoints
    this.drawKeypoints(ctx, keypoints, timestamp);

    // Draw debug info if enabled
    if (this.debugMode) {
      this.drawDebugInfo(ctx, skeleton);
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
   * Gets the confidence value of a keypoint, handling different model outputs
   */
  private getConfidence(point: PoseKeypoint): number {
    if (!point) return 0;
    return point.score !== undefined ? point.score : 
           point.visibility !== undefined ? point.visibility : 0;
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
    const width = this.canvas.width;
    const height = this.canvas.height;
    const padding = 10;
    const lineHeight = 20;

    // Set debug text style
    ctx.font = '14px monospace';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';

    // Draw spine angle
    const spineAngle = skeleton.getSpineAngle();
    ctx.fillText(
      `Spine Angle: ${spineAngle.toFixed(1)}°`,
      padding,
      height - padding - lineHeight * 3
    );

    // Draw visibility scores for key joints
    const keypoints = skeleton.getKeypoints();

    // Left shoulder visibility
    const leftShoulder = keypoints[CocoBodyParts.LEFT_SHOULDER];
    if (leftShoulder) {
      ctx.fillText(
        `L.Shoulder: ${this.getConfidence(leftShoulder).toFixed(2)}`,
        padding,
        height - padding - lineHeight * 2
      );
    }

    // Right shoulder visibility
    const rightShoulder = keypoints[CocoBodyParts.RIGHT_SHOULDER];
    if (rightShoulder) {
      ctx.fillText(
        `R.Shoulder: ${this.getConfidence(rightShoulder).toFixed(2)}`,
        padding,
        height - padding - lineHeight
      );
    }
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
}
