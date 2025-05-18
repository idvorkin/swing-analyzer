import {
  type FormCheckpoint,
  FormPosition,
  type PoseKeypoint,
  type RepData,
} from './types';

export class FormCheckpointLogic {
  private reps: RepData[] = [];
  private currentRep: RepData | null = null;
  private lastPosition = FormPosition.Top;
  private isRecording = true; // Always recording by default

  // Angle thresholds for position detection
  private readonly HINGE_THRESHOLD = 20; // Degrees from vertical
  private readonly BOTTOM_THRESHOLD = 60; // Degrees from vertical
  private readonly RELEASE_THRESHOLD = 45; // Degrees from vertical

  constructor(
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement
  ) {}

  /**
   * Reset all recorded data
   */
  reset(): void {
    this.reps = [];
    this.currentRep = null;
    this.lastPosition = FormPosition.Top;
    console.log('Reset form checkpoints');
  }

  /**
   * Process the current frame and try to detect key positions
   */
  processFrame(
    keypoints: PoseKeypoint[],
    spineAngle: number,
    repCount: number
  ): void {
    // Always recording

    // Check if we're starting a new rep
    if (!this.currentRep || this.currentRep.repNumber !== repCount) {
      // If we have a current rep and it's different from the new rep count
      if (this.currentRep && this.currentRep.checkpoints.size > 0) {
        // Save the completed rep
        this.reps.push(this.currentRep);
      }

      // Create a new rep
      this.currentRep = {
        repNumber: repCount,
        checkpoints: new Map(),
      };
      this.lastPosition = FormPosition.Top;

      // Capture the top position at the start of a new rep
      this.capturePosition(FormPosition.Top, keypoints, spineAngle);
    }

    // Determine current position based on spine angle and previous position
    this.detectAndCapturePositions(keypoints, spineAngle);
  }

  /**
   * Detect positions and capture frames when appropriate
   */
  private detectAndCapturePositions(
    keypoints: PoseKeypoint[],
    spineAngle: number
  ): void {
    if (!this.currentRep) return;

    const absSpineAngle = Math.abs(spineAngle);

    // State machine for position detection
    switch (this.lastPosition) {
      case FormPosition.Top:
        // From Top, we can only go to Hinge
        if (
          absSpineAngle > this.HINGE_THRESHOLD &&
          !this.currentRep.checkpoints.has(FormPosition.Hinge)
        ) {
          this.capturePosition(FormPosition.Hinge, keypoints, spineAngle);
          this.lastPosition = FormPosition.Hinge;
        }
        break;

      case FormPosition.Hinge:
        // From Hinge, we can go to Bottom
        if (
          absSpineAngle > this.BOTTOM_THRESHOLD &&
          !this.currentRep.checkpoints.has(FormPosition.Bottom)
        ) {
          this.capturePosition(FormPosition.Bottom, keypoints, spineAngle);
          this.lastPosition = FormPosition.Bottom;
        }
        break;

      case FormPosition.Bottom:
        // From Bottom, we can go to Release
        // Release is detected when the spine angle starts decreasing from bottom position
        if (
          absSpineAngle < this.RELEASE_THRESHOLD &&
          !this.currentRep.checkpoints.has(FormPosition.Release)
        ) {
          this.capturePosition(FormPosition.Release, keypoints, spineAngle);
          this.lastPosition = FormPosition.Release;
        }
        break;

      case FormPosition.Release:
        // From Release, we go back to Top for the next rep
        // This happens automatically when the rep counter increases
        break;
    }
  }

  /**
   * Capture a frame for a specific position
   */
  private capturePosition(
    position: FormPosition,
    keypoints: PoseKeypoint[],
    spineAngle: number
  ): void {
    if (!this.currentRep) return;

    console.log(
      `Capturing position: ${position}, spine angle: ${spineAngle.toFixed(2)}`
    );

    // Create a temporary canvas to blend video and skeleton
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvasElement.width;
    tempCanvas.height = this.canvasElement.height;
    const tempCtx = tempCanvas.getContext('2d');

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
      const imageData = tempCtx.getImageData(
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
      );

      // Create a checkpoint
      const checkpoint: FormCheckpoint = {
        position,
        timestamp: Date.now(),
        image: imageData,
        spineAngle,
      };

      // Add to the current rep
      this.currentRep.checkpoints.set(position, checkpoint);
    }
  }

  /**
   * Navigate to a specific rep
   */
  navigateToRep(repIndex: number): boolean {
    if (repIndex < 0 || repIndex >= this.reps.length) {
      return false;
    }

    this.currentRep = this.reps[repIndex];
    return true;
  }

  /**
   * Get the total number of recorded reps
   */
  getRepCount(): number {
    return this.reps.length;
  }

  /**
   * Get the current rep data
   */
  getCurrentRep(): RepData | null {
    return this.currentRep;
  }

  /**
   * Get all recorded reps
   */
  getAllReps(): RepData[] {
    return this.reps;
  }

  /**
   * Format position name for display (capitalize first letter)
   */
  formatPositionName(position: FormPosition): string {
    return position.charAt(0).toUpperCase() + position.slice(1);
  }
}
