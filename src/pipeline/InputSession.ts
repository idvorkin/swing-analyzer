/**
 * InputSession - State machine for managing video input
 *
 * This is the single source of truth for input state. It manages:
 * - State transitions (idle → starting → active, etc.)
 * - Cleanup when switching sources
 *
 * The session emits skeleton events that the pipeline consumes.
 * It also provides getSkeletonAtTime() for playback/seeking.
 */

import {
  BehaviorSubject,
  type Observable,
  Subject,
  type Subscription,
} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
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
}

/**
 * Manages video input as a state machine
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

  constructor(config: InputSessionConfig) {
    this.videoElement = config.videoElement;
    this.canvasElement = config.canvasElement;
    this.stateSubject = new BehaviorSubject<InputSessionState>({
      type: 'idle',
    });
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
   * Start video file input
   * @param videoFile - The video file to process
   * @param signal - Optional AbortSignal to cancel the operation
   */
  async startVideoFile(videoFile: File, signal?: AbortSignal): Promise<void> {
    // Tear down the previous owner SYNCHRONOUSLY. There must be no await
    // between here and taking ownership below: with an await, two
    // overlapping calls would each observe a null source, and the earlier
    // call's source would leak when the later call overwrote it — still
    // subscribed, never disposed, forwarding its frames into the session.
    this.cleanup();

    // Check if already aborted before starting
    if (signal?.aborted) {
      return;
    }

    // Create video file source
    const videoSource = new VideoFileSkeletonSource({
      videoFile,
      videoElement: this.videoElement,
      canvasElement: this.canvasElement,
      autoExtract: true,
      model: 'blazepose', // TODO: make configurable
    });

    this.source = videoSource;
    this.subscribeToSource(videoSource, {
      type: 'video-file',
      fileName: videoFile.name,
    });

    try {
      await videoSource.start(signal);
    } catch (error) {
      // A newer startVideoFile call may have replaced (and disposed) this
      // source while we were awaiting. Only the owner of the CURRENT
      // source may mutate session state — a stale failure has already
      // been superseded. Hidden from the UI, but keep a console trace so
      // a genuine decode failure isn't silently unobservable.
      if (this.source !== videoSource) {
        console.warn('[InputSession] superseded load failed:', error);
        return;
      }
      // Don't report abort as an error, but do clean up
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.cleanup();
        this.stateSubject.next({ type: 'idle' });
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to process video';
      this.stateSubject.next({ type: 'error', message });
      throw error;
    }
  }

  /**
   * Stop the current source.
   *
   * NOTE: 'idle' here means "no STREAMING source" — the stopped source is
   * deliberately kept assigned, so getSource()/getSkeletonAtTime() still
   * answer from its cache. The upload path relies on this half-state: it
   * stops the old source immediately (so it can't stream into the reset
   * pipeline) but keeps queries working until startVideoFile() replaces it.
   */
  stop(): void {
    if (this.source) {
      this.source.stop();
    }
    // Once stopped, the source must no longer feed the session: its in-flight
    // extraction can still emit one frame + one progress/idle state AFTER
    // abortController.abort() resolves (the abort signal is not forwarded
    // into estimatePoses/seekToTime awaits in extractPosesFromVideo). Keep
    // this.source assigned so getSource()/getSkeletonAtTime() still answer
    // from the cache.
    this.sourceSubscription?.unsubscribe();
    this.sourceSubscription = null;
    this.stateSubscription?.unsubscribe();
    this.stateSubscription = null;
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
  async dispose(): Promise<void> {
    this.dispose$.next();
    this.dispose$.complete();

    this.cleanup();

    this.stateSubject.complete();
    this.skeletonSubject.complete();
    this.progressSubject.complete();
  }

  /**
   * Clean up current source. Deliberately synchronous — startVideoFile
   * relies on there being no suspension point between teardown and taking
   * ownership of the next source.
   */
  private cleanup(): void {
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
    sessionType: { type: 'video-file'; fileName: string }
  ): void {
    // Defensive: never overwrite a live subscription — cleanup() runs
    // first in every current path, but an overwrite here would leak the
    // old source's stream into the session silently.
    this.sourceSubscription?.unsubscribe();
    this.stateSubscription?.unsubscribe();

    // Subscribe to skeleton events
    this.sourceSubscription = source.skeletons$
      .pipe(takeUntil(this.dispose$))
      .subscribe({
        next: (skeleton) => {
          this.skeletonSubject.next(skeleton);
        },
        error: (err) => {
          console.error('Error in skeleton stream:', err);
          const message =
            err instanceof Error ? err.message : 'Skeleton detection failed';
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
          this.stateSubject.next({
            type: 'video-file',
            fileName: sessionType.fileName,
            sourceState,
          });
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
