/**
 * CameraSkeletonSource - Real-time skeleton detection from camera
 *
 * Wraps camera capture + ML inference into a unified SkeletonSource interface.
 * Each frame from the camera is processed through the pose detector in real-time.
 * No caching is performed since camera input is live.
 */

import {
  BehaviorSubject,
  type Observable,
  Subject,
} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type { ModelConfig } from '../config/modelConfig';
import { DEFAULT_MODEL_CONFIG } from '../config/modelConfig';
import type { SkeletonEvent } from './PipelineInterfaces';
import { PoseSkeletonTransformer } from './PoseSkeletonTransformer';
import type {
  CameraSourceConfig,
  SkeletonSource,
  SkeletonSourceState,
} from './SkeletonSource';

/**
 * Real-time skeleton source from camera feed
 */
export class CameraSkeletonSource implements SkeletonSource {
  readonly type = 'camera' as const;

  private readonly stateSubject: BehaviorSubject<SkeletonSourceState>;
  private readonly skeletonSubject = new Subject<SkeletonEvent>();
  private readonly stop$ = new Subject<void>();

  private transformer: PoseSkeletonTransformer | null = null;
  private stream: MediaStream | null = null;
  private frameInterval: number | null = null;
  private consecutiveErrors = 0;
  private readonly ERROR_THRESHOLD = 5;

  private readonly videoElement: HTMLVideoElement;
  private readonly canvasElement: HTMLCanvasElement;
  private facingMode: 'user' | 'environment';
  private readonly modelConfig: ModelConfig;

  constructor(
    config: CameraSourceConfig,
    modelConfig: ModelConfig = DEFAULT_MODEL_CONFIG
  ) {
    this.videoElement = config.videoElement;
    this.canvasElement = config.canvasElement;
    this.facingMode = config.facingMode;
    this.modelConfig = modelConfig;
    this.stateSubject = new BehaviorSubject<SkeletonSourceState>({
      type: 'idle',
    });
  }

  get state(): SkeletonSourceState {
    return this.stateSubject.getValue();
  }

  get state$(): Observable<SkeletonSourceState> {
    return this.stateSubject.asObservable();
  }

  get skeletons$(): Observable<SkeletonEvent> {
    return this.skeletonSubject.asObservable();
  }

  /**
   * Start camera capture and ML inference
   */
  async start(): Promise<void> {
    // Clean up any previous session
    this.stop();

    this.stateSubject.next({ type: 'starting' });

    try {
      // Initialize the pose detector
      this.transformer = new PoseSkeletonTransformer(this.modelConfig);
      await this.transformer.initialize();

      // Get camera stream
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Connect stream to video element
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      // Wait for video metadata to be ready
      await this.waitForVideoReady();

      // Update canvas dimensions
      this.updateCanvasDimensions();

      // Start frame processing
      this.startFrameProcessing();

      this.stateSubject.next({ type: 'active' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to start camera';
      this.stateSubject.next({ type: 'error', message });
      throw error;
    }
  }

  /**
   * Stop camera capture
   */
  stop(): void {
    // Signal stop to frame processing
    this.stop$.next();

    // Clear frame interval
    if (this.frameInterval !== null) {
      window.clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    // Stop camera stream
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    // Clear video source
    if (this.videoElement.srcObject) {
      this.videoElement.srcObject = null;
    }

    this.stateSubject.next({ type: 'idle' });
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.stop();

    // Clear transformer reference (PoseSkeletonTransformer doesn't need explicit disposal)
    this.transformer = null;

    this.stateSubject.complete();
    this.skeletonSubject.complete();
    this.stop$.complete();
  }

  /**
   * Switch camera facing mode
   */
  async switchCamera(): Promise<void> {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    await this.start();
  }

  /**
   * Get skeleton at a specific time - always returns null for camera
   * (no caching for live input)
   */
  getSkeletonAtTime(_videoTime: number): SkeletonEvent | null {
    return null;
  }

  /**
   * Check if skeleton is available at time - always false for camera
   */
  hasSkeletonAtTime(_videoTime: number): boolean {
    return false;
  }

  /**
   * Wait for video element to have metadata loaded
   */
  private waitForVideoReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const HAVE_METADATA = 1;
      if (this.videoElement.readyState >= HAVE_METADATA) {
        resolve();
        return;
      }

      const onLoadedMetadata = () => {
        this.videoElement.removeEventListener(
          'loadedmetadata',
          onLoadedMetadata
        );
        this.videoElement.removeEventListener('error', onError);
        resolve();
      };

      const onError = () => {
        this.videoElement.removeEventListener(
          'loadedmetadata',
          onLoadedMetadata
        );
        this.videoElement.removeEventListener('error', onError);
        reject(new Error('Failed to load video metadata'));
      };

      this.videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
      this.videoElement.addEventListener('error', onError);
    });
  }

  /**
   * Update canvas dimensions to match video
   */
  private updateCanvasDimensions(): void {
    if (this.videoElement.videoWidth && this.videoElement.videoHeight) {
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;
    }
  }

  /**
   * Start processing frames from the camera
   */
  private startFrameProcessing(): void {
    if (!this.transformer) return;

    const frameRate = 30;
    const frameInterval = 1000 / frameRate;

    // Process frames at regular interval
    this.frameInterval = window.setInterval(() => {
      if (
        this.videoElement.paused ||
        this.videoElement.ended ||
        !this.transformer
      ) {
        return;
      }

      const frameEvent = {
        frame: this.videoElement,
        timestamp: performance.now(),
        videoTime: this.videoElement.currentTime,
      };

      // Transform frame to skeleton
      this.transformer
        .transformToSkeleton(frameEvent)
        .pipe(takeUntil(this.stop$))
        .subscribe({
          next: (skeletonEvent) => {
            // Reset error counter on success
            this.consecutiveErrors = 0;
            if (skeletonEvent?.skeleton) {
              this.skeletonSubject.next(skeletonEvent);
            }
          },
          error: (err) => {
            console.error('Error processing camera frame:', err);
            this.consecutiveErrors++;
            if (this.consecutiveErrors >= this.ERROR_THRESHOLD) {
              const message = 'Pose detection repeatedly failing. Please restart camera.';
              this.stateSubject.next({ type: 'error', message });
              this.stop();
            }
          },
        });
    }, frameInterval);
  }
}
