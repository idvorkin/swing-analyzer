/**
 * InputSession - State machine for managing video/camera input
 *
 * This is the single source of truth for input state. It manages:
 * - Which input source is active (camera or video file)
 * - State transitions (idle → starting → active, etc.)
 * - Cleanup when switching sources
 *
 * The session emits skeleton events that the pipeline consumes.
 * It also provides getSkeletonAtTime() for playback/seeking.
 */

import { BehaviorSubject, type Observable, Subject, type Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type { ModelConfig } from '../config/modelConfig';
import { CameraSkeletonSource } from './CameraSkeletonSource';
import type { SkeletonEvent } from './PipelineInterfaces';
import type {
  ExtractionProgress,
  SkeletonSource,
  SkeletonSourceState,
} from './SkeletonSource';
import { VideoFileSkeletonSource } from './VideoFileSkeletonSource';

/**
 * Overall session state
 */
export type InputSessionState =
  | { type: 'idle' }
  | { type: 'camera'; facingMode: 'user' | 'environment'; sourceState: SkeletonSourceState }
  | { type: 'video-file'; fileName: string; sourceState: SkeletonSourceState }
  | { type: 'error'; message: string };

/**
 * Events emitted by the session
 */
export interface InputSessionEvents {
  /** Skeleton detected (from either source) */
  skeleton: SkeletonEvent;
  /** State changed */
  stateChange: InputSessionState;
  /** Extraction progress (video file only) */
  extractionProgress: ExtractionProgress;
}

/**
 * Configuration for InputSession
 */
export interface InputSessionConfig {
  videoElement: HTMLVideoElement;
  canvasElement: HTMLCanvasElement;
  modelConfig?: ModelConfig;
}

/**
 * Manages input sources (camera or video file) as a state machine
 */
export class InputSession {
  private readonly stateSubject: BehaviorSubject<InputSessionState>;
  private readonly skeletonSubject = new Subject<SkeletonEvent>();
  private readonly progressSubject = new Subject<ExtractionProgress>();
  private readonly dispose$ = new Subject<void>();

  private source: SkeletonSource | null = null;
  private sourceSubscription: Subscription | null = null;
  private stateSubscription: Subscription | null = null;

  private readonly videoElement: HTMLVideoElement;
  private readonly canvasElement: HTMLCanvasElement;
  private readonly modelConfig?: ModelConfig;

  constructor(config: InputSessionConfig) {
    this.videoElement = config.videoElement;
    this.canvasElement = config.canvasElement;
    this.modelConfig = config.modelConfig;
    this.stateSubject = new BehaviorSubject<InputSessionState>({ type: 'idle' });
  }

  /**
   * Current session state
   */
  get state(): InputSessionState {
    return this.stateSubject.getValue();
  }

  /**
   * Observable of state changes
   */
  get state$(): Observable<InputSessionState> {
    return this.stateSubject.asObservable();
  }

  /**
   * Observable of skeleton events from active source
   */
  get skeletons$(): Observable<SkeletonEvent> {
    return this.skeletonSubject.asObservable();
  }

  /**
   * Observable of extraction progress (video file only)
   */
  get extractionProgress$(): Observable<ExtractionProgress> {
    return this.progressSubject.asObservable();
  }

  /**
   * Get the current source (for direct access if needed)
   */
  getSource(): SkeletonSource | null {
    return this.source;
  }

  /**
   * Get the video file source (if current source is a video file)
   */
  getVideoFileSource(): VideoFileSkeletonSource | null {
    if (this.source?.type === 'video-file') {
      return this.source as VideoFileSkeletonSource;
    }
    return null;
  }

  /**
   * Get the camera source (if current source is a camera)
   */
  getCameraSource(): CameraSkeletonSource | null {
    if (this.source?.type === 'camera') {
      return this.source as CameraSkeletonSource;
    }
    return null;
  }

  /**
   * Start camera input
   */
  async startCamera(facingMode: 'user' | 'environment' = 'environment'): Promise<void> {
    // Clean up previous source
    await this.cleanup();

    // Create camera source
    const cameraSource = new CameraSkeletonSource(
      {
        facingMode,
        videoElement: this.videoElement,
        canvasElement: this.canvasElement,
      },
      this.modelConfig
    );

    this.source = cameraSource;
    this.subscribeToSource(cameraSource, { type: 'camera', facingMode });

    try {
      await cameraSource.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start camera';
      this.stateSubject.next({ type: 'error', message });
      throw error;
    }
  }

  /**
   * Switch camera facing mode
   */
  async switchCamera(): Promise<void> {
    const currentState = this.state;
    if (currentState.type !== 'camera') {
      throw new Error('Cannot switch camera: not in camera mode');
    }

    const newFacingMode = currentState.facingMode === 'user' ? 'environment' : 'user';
    await this.startCamera(newFacingMode);
  }

  /**
   * Start video file input
   */
  async startVideoFile(videoFile: File): Promise<void> {
    // Clean up previous source
    await this.cleanup();

    // Create video file source
    const videoSource = new VideoFileSkeletonSource({
      videoFile,
      videoElement: this.videoElement,
      canvasElement: this.canvasElement,
      autoExtract: true,
      model: 'movenet-lightning', // TODO: make configurable
    });

    this.source = videoSource;
    this.subscribeToSource(videoSource, { type: 'video-file', fileName: videoFile.name });

    try {
      await videoSource.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process video';
      this.stateSubject.next({ type: 'error', message });
      throw error;
    }
  }

  /**
   * Stop the current source
   */
  stop(): void {
    if (this.source) {
      this.source.stop();
    }
    this.stateSubject.next({ type: 'idle' });
  }

  /**
   * Get skeleton at a specific video time
   * Delegates to the current source (only works for video file source)
   */
  getSkeletonAtTime(videoTime: number): SkeletonEvent | null {
    return this.source?.getSkeletonAtTime(videoTime) ?? null;
  }

  /**
   * Check if skeleton is available at time
   */
  hasSkeletonAtTime(videoTime: number): boolean {
    return this.source?.hasSkeletonAtTime(videoTime) ?? false;
  }

  /**
   * Save current video file's pose track to storage
   */
  async save(): Promise<void> {
    const videoSource = this.getVideoFileSource();
    if (!videoSource) {
      throw new Error('Cannot save: not in video file mode');
    }
    await videoSource.save();
  }

  /**
   * Clean up and release all resources
   */
  dispose(): void {
    this.dispose$.next();
    this.dispose$.complete();

    this.cleanup();

    this.stateSubject.complete();
    this.skeletonSubject.complete();
    this.progressSubject.complete();
  }

  /**
   * Clean up current source
   */
  private async cleanup(): Promise<void> {
    // Unsubscribe from source events
    if (this.sourceSubscription) {
      this.sourceSubscription.unsubscribe();
      this.sourceSubscription = null;
    }

    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe();
      this.stateSubscription = null;
    }

    // Dispose source
    if (this.source) {
      this.source.dispose();
      this.source = null;
    }
  }

  /**
   * Subscribe to source events and map to session state
   */
  private subscribeToSource(
    source: SkeletonSource,
    sessionType: { type: 'camera'; facingMode: 'user' | 'environment' } | { type: 'video-file'; fileName: string }
  ): void {
    // Subscribe to skeleton events
    this.sourceSubscription = source.skeletons$
      .pipe(takeUntil(this.dispose$))
      .subscribe({
        next: (skeleton) => {
          this.skeletonSubject.next(skeleton);
        },
        error: (err) => {
          console.error('Error in skeleton stream:', err);
          const message = err instanceof Error ? err.message : 'Skeleton detection failed';
          this.stateSubject.next({ type: 'error', message });
        },
      });

    // Subscribe to state changes and map to session state
    this.stateSubscription = source.state$
      .pipe(takeUntil(this.dispose$))
      .subscribe({
        next: (sourceState) => {
          // Emit extraction progress if available
          if (sourceState.type === 'extracting') {
            this.progressSubject.next(sourceState.progress);
          }

          // Map source state to session state
          if (sessionType.type === 'camera') {
            this.stateSubject.next({
              type: 'camera',
              facingMode: sessionType.facingMode,
              sourceState,
            });
          } else {
            this.stateSubject.next({
              type: 'video-file',
              fileName: sessionType.fileName,
              sourceState,
            });
          }
        },
        error: (err) => {
          console.error('Error in state stream:', err);
          this.stateSubject.next({
            type: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        },
      });
  }
}
