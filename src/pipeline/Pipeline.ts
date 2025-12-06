import { type Observable, Subject, type Subscription } from 'rxjs';
import { share, switchMap, tap } from 'rxjs/operators';
import type { Skeleton } from '../models/Skeleton';
import type { ExerciseDefinition, PositionCandidate } from '../types/exercise';
import type { CropRegion } from '../types/posetrack';
import { FormAnalyzer } from './FormAnalyzer';
import type {
  FrameAcquisition,
  FrameEvent,
  SkeletonEvent,
  SkeletonTransformer,
} from './PipelineInterfaces';
import { VideoFrameAcquisition } from './VideoFrameAcquisition';

/**
 * Event emitted when a rep/cycle completes with position thumbnails
 */
export interface ThumbnailEvent {
  /** Rep number (1-indexed) */
  repNumber: number;
  /** Best position candidates for this cycle, keyed by position name */
  positions: Map<string, PositionCandidate>;
}

/**
 * Orchestrates the processing pipeline from frame to rep analysis.
 *
 * Supports two processing modes:
 * 1. Video-event-driven (preferred): Call processFrameAsync() on video timeupdate events
 * 2. RxJS streaming (legacy): Call start() to begin Observable-based processing
 *
 * Pipeline flow: Frame → Skeleton → FormAnalyzer.processFrame() → Results
 */
export class Pipeline {
  // Latest data from the pipeline
  private latestSkeleton: Skeleton | null = null;
  private repCount = 0;

  // Processing state
  private isActive = false;
  private pipelineSubscription: Subscription | null = null;

  // Output subjects (for legacy RxJS streaming mode)
  private resultSubject = new Subject<PipelineResult>();
  private skeletonSubject = new Subject<SkeletonEvent>();
  private thumbnailSubject = new Subject<ThumbnailEvent>();

  // Form analyzer for position detection and rep counting
  private formAnalyzer: FormAnalyzer;

  // Current exercise definition
  private exerciseDefinition: ExerciseDefinition;

  constructor(
    private frameAcquisition: FrameAcquisition,
    private skeletonTransformer: SkeletonTransformer,
    exerciseDefinition: ExerciseDefinition
  ) {
    this.exerciseDefinition = exerciseDefinition;
    this.formAnalyzer = new FormAnalyzer(exerciseDefinition);
  }

  /**
   * Initialize the pipeline
   */
  async initialize(): Promise<void> {
    // Initialize skeleton transformer
    await this.skeletonTransformer.initialize();
  }

  /**
   * Start the pipeline processing and return an Observable of results
   */
  start(): Observable<PipelineResult> {
    if (this.isActive) {
      return this.resultSubject.asObservable();
    }

    this.isActive = true;

    // Build the RxJS pipeline
    const frameStream = this.frameAcquisition.start();

    // Pipeline: Frame → Skeleton → FormAnalyzer.processFrame()
    this.pipelineSubscription = frameStream
      .pipe(
        // Stage 1: Skeleton Transformation (combined pose detection and skeleton construction)
        switchMap((frameEvent) =>
          this.skeletonTransformer.transformToSkeleton(frameEvent)
        ),

        // Stage 2: Process skeleton through FormAnalyzer
        tap((skeletonEvent) => {
          // Emit the skeleton event to subscribers (for rendering)
          this.skeletonSubject.next(skeletonEvent);

          // Store latest skeleton
          if (skeletonEvent.skeleton) {
            this.latestSkeleton = skeletonEvent.skeleton;

            // Process through FormAnalyzer for position detection and rep counting
            const result = this.formAnalyzer.processFrame(
              skeletonEvent.skeleton,
              skeletonEvent.poseEvent.frameEvent.timestamp,
              skeletonEvent.poseEvent.frameEvent.videoTime
            );

            // Update rep count
            this.repCount = result.repCount;

            // Emit result
            this.resultSubject.next({
              skeleton: skeletonEvent.skeleton,
              repCount: result.repCount,
            });
          }
        }),

        // Share the pipeline with multiple subscribers
        share()
      )
      .subscribe({
        error: (error) => {
          console.error('Error in pipeline:', error);
          this.resultSubject.error(error);
          this.skeletonSubject.error(error);
        },
        complete: () => {
          this.resultSubject.complete();
          this.skeletonSubject.complete();
          this.isActive = false;
        }
      });

    return this.resultSubject.asObservable();
  }

  /**
   * Get an observable for pipeline results without starting frame acquisition.
   * Use this to listen for rep count updates from batch processing (processSkeletonEvent).
   */
  getResults(): Observable<PipelineResult> {
    return this.resultSubject.asObservable();
  }

  /**
   * Get an observable for all skeleton events
   */
  getSkeletonEvents(): Observable<SkeletonEvent> {
    return this.skeletonSubject.asObservable();
  }

  /**
   * Get an observable for thumbnail events (emitted when a rep/cycle completes)
   */
  getThumbnailEvents(): Observable<ThumbnailEvent> {
    return this.thumbnailSubject.asObservable();
  }

  /**
   * Stop the pipeline processing
   */
  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.frameAcquisition.stop();

    if (this.pipelineSubscription) {
      this.pipelineSubscription.unsubscribe();
      this.pipelineSubscription = null;
    }
  }

  /**
   * Reset the pipeline state
   */
  reset(): void {
    this.formAnalyzer.reset();
    this.latestSkeleton = null;
    this.repCount = 0;
  }

  /**
   * Get the current rep count
   */
  getRepCount(): number {
    return this.repCount;
  }

  /**
   * Get the latest skeleton
   */
  getLatestSkeleton(): Skeleton | null {
    return this.latestSkeleton;
  }

  /**
   * Get the form analyzer (for external access if needed)
   */
  getFormAnalyzer(): FormAnalyzer {
    return this.formAnalyzer;
  }

  /**
   * Get the current exercise definition
   */
  getExerciseDefinition(): ExerciseDefinition {
    return this.exerciseDefinition;
  }

  /**
   * Process the current video frame asynchronously (video-event-driven mode).
   * Call this from video timeupdate/seeked events for direct processing
   * without RxJS subscriptions.
   *
   * @returns The processing result, or null if no skeleton detected
   */
  async processFrameAsync(): Promise<PipelineProcessResult | null> {
    // Get current frame from frame acquisition
    const frame = this.frameAcquisition.getCurrentFrame();
    const frameEvent: FrameEvent = {
      frame,
      timestamp: performance.now(),
      videoTime: (frame as HTMLVideoElement).currentTime ?? 0,
    };

    // Transform to skeleton using async method
    const skeletonEvent = await this.skeletonTransformer.transformToSkeletonAsync(frameEvent);

    if (!skeletonEvent.skeleton) {
      return null;
    }

    // Store latest skeleton
    this.latestSkeleton = skeletonEvent.skeleton;

    // Process through FormAnalyzer
    const result = this.formAnalyzer.processFrame(
      skeletonEvent.skeleton,
      frameEvent.timestamp,
      frameEvent.videoTime
    );

    // Update rep count
    this.repCount = result.repCount;

    return {
      skeleton: skeletonEvent.skeleton,
      repCount: result.repCount,
      position: result.position,
      angles: result.angles,
      repCompleted: result.repCompleted,
    };
  }

  /**
   * Process a skeleton event directly, bypassing frame acquisition.
   * Used for batch/extraction mode where frames come from extraction
   * rather than video playback.
   *
   * @param skeletonEvent - The skeleton event to process
   * @returns The rep count after processing
   */
  processSkeletonEvent(skeletonEvent: SkeletonEvent): number {
    // Store latest skeleton
    if (skeletonEvent.skeleton) {
      this.latestSkeleton = skeletonEvent.skeleton;

      // Emit skeleton event for real-time rendering during extraction
      this.skeletonSubject.next(skeletonEvent);

      // Process through FormAnalyzer (pass frameImage for filmstrip thumbnails)
      const result = this.formAnalyzer.processFrame(
        skeletonEvent.skeleton,
        skeletonEvent.poseEvent.frameEvent.timestamp,
        skeletonEvent.poseEvent.frameEvent.videoTime,
        skeletonEvent.poseEvent.frameEvent.frameImage
      );

      // Update rep count
      this.repCount = result.repCount;

      // Emit thumbnail event when cycle completes (has position candidates)
      // This is based on angle thresholds and may happen BEFORE rep completes
      if (result.cyclePositions && result.cyclePositions.size > 0) {
        this.thumbnailSubject.next({
          repNumber: result.repCount + 1, // Next rep number since cycle just completed
          positions: result.cyclePositions,
        });
      }

      // Emit result when rep completes (position sequence detected)
      if (result.repCompleted) {
        this.resultSubject.next({
          skeleton: skeletonEvent.skeleton,
          repCount: result.repCount,
        });
      }
    }

    return this.repCount;
  }

  // ========================================
  // Crop Region Support
  // ========================================

  /**
   * Set the crop region for auto-centering on person
   * Only works if frameAcquisition is a VideoFrameAcquisition
   */
  setCropRegion(crop: CropRegion | null): void {
    if (this.frameAcquisition instanceof VideoFrameAcquisition) {
      this.frameAcquisition.setCropRegion(crop);
    }
  }

  /**
   * Get the current crop region
   */
  getCropRegion(): CropRegion | null {
    if (this.frameAcquisition instanceof VideoFrameAcquisition) {
      return this.frameAcquisition.getCropRegion();
    }
    return null;
  }

  /**
   * Enable or disable crop mode
   */
  setCropEnabled(enabled: boolean): void {
    if (this.frameAcquisition instanceof VideoFrameAcquisition) {
      this.frameAcquisition.setCropEnabled(enabled);
    }
  }

  /**
   * Check if crop is currently enabled
   */
  isCropEnabled(): boolean {
    if (this.frameAcquisition instanceof VideoFrameAcquisition) {
      return this.frameAcquisition.isCropEnabled();
    }
    return false;
  }
}

/**
 * Result from pipeline processing (legacy Observable mode)
 */
export interface PipelineResult {
  skeleton: Skeleton;
  repCount: number;
}

/**
 * Result from processFrameAsync (video-event-driven mode)
 * Contains full analysis result for direct state updates.
 */
export interface PipelineProcessResult {
  skeleton: Skeleton;
  repCount: number;
  position: string | null;
  angles: Record<string, number>;
  repCompleted: boolean;
}
