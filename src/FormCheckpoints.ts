import { FormPosition, PoseKeypoint } from './types';
import { FormCheckpointUX } from './FormCheckpointUX';

// This class is kept for backward compatibility but now delegates to the new classes
export class FormCheckpoints {
  private ux: FormCheckpointUX;

  constructor(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement,
    checkpointGridElement: HTMLElement
  ) {
    // Initialize the UX component which also initializes the logic component
    this.ux = new FormCheckpointUX(videoElement, canvasElement, checkpointGridElement);
  }

  // Forward all methods to the UX component
  
  processFrame(keypoints: PoseKeypoint[], spineAngle: number, repCount: number): void {
    this.ux.processFrame(keypoints, spineAngle, repCount);
  }

  reset(): void {
    this.ux.reset();
  }

  navigateToRep(repIndex: number): boolean {
    return this.ux.navigateToRep(repIndex);
  }

  getRepCount(): number {
    return this.ux.getRepCount();
  }
} 