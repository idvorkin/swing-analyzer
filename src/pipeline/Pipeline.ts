import { type Observable, Subject, type Subscription } from 'rxjs';
import { share, switchMap, tap } from 'rxjs/operators';
import type { Skeleton } from '../models/Skeleton';
import type { FormCheckpoint } from '../types';
import type { ExerciseDefinition } from '../types/exercise';
import { FormAnalyzer } from './FormAnalyzer';
import type {
  FormEvent,
  FrameAcquisition,
  SkeletonEvent,
  SkeletonTransformer,
} from './PipelineInterfaces';

/**
 * Orchestrates the entire processing pipeline from frame to rep analysis using RxJS
 *
 * Pipeline flow: Frame → Skeleton → FormAnalyzer.processFrame() → Results
 *
 * Simplified architecture: FormAnalyzer handles both position detection and rep counting.
 * Supports multiple exercises through ExerciseDefinition configuration.
 *
 * Note: Skeleton rendering during cached pose playback is handled separately
 * by video event listeners (timeupdate/seeked), not by this pipeline.
 */
export class Pipeline {
  // Latest data from the pipeline
  private latestSkeleton: Skeleton | null = null;
  private repCount = 0;

  // Processing state
  private isActive = false;
  private pipelineSubscription: Subscription | null = null;

  // Output subjects
  private resultSubject = new Subject<PipelineResult>();
  private checkpointSubject = new Subject<FormEvent>();
  private skeletonSubject = new Subject<SkeletonEvent>();

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
              checkpoint: null, // Simplified - no checkpoint capture in streaming mode
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
          this.checkpointSubject.error(error);
          this.skeletonSubject.error(error);
        },
        complete: () => {
          this.resultSubject.complete();
          this.checkpointSubject.complete();
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
   * Get an observable for checkpoint events
   */
  getCheckpointEvents(): Observable<FormEvent> {
    return this.checkpointSubject.asObservable();
  }

  /**
   * Get an observable for all skeleton events
   */
  getSkeletonEvents(): Observable<SkeletonEvent> {
    return this.skeletonSubject.asObservable();
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

      // Process through FormAnalyzer
      const result = this.formAnalyzer.processFrame(
        skeletonEvent.skeleton,
        skeletonEvent.poseEvent.frameEvent.timestamp,
        skeletonEvent.poseEvent.frameEvent.videoTime
      );

      // Update rep count
      this.repCount = result.repCount;

      // Emit result if rep completed
      if (result.repCompleted) {
        this.resultSubject.next({
          skeleton: skeletonEvent.skeleton,
          checkpoint: null,
          repCount: result.repCount,
        });
      }
    }

    return this.repCount;
  }
}

/**
 * Result from pipeline processing
 */
export interface PipelineResult {
  skeleton: Skeleton;
  checkpoint: FormCheckpoint | null;
  repCount: number;
}
