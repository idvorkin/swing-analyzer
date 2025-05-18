import { type Observable, Subject, type Subscription } from 'rxjs';
import { share, switchMap, tap } from 'rxjs/operators';
import type { Skeleton } from '../models/Skeleton';
import type { FormCheckpoint } from '../types';
import type {
  CheckpointEvent,
  FormProcessor,
  FrameAcquisition,
  RepProcessor,
  SkeletonTransformer,
} from './PipelineInterfaces';

/**
 * Orchestrates the entire processing pipeline from frame to swing rep analysis using RxJS
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
  private checkpointSubject = new Subject<CheckpointEvent>();

  constructor(
    private frameAcquisition: FrameAcquisition,
    private skeletonTransformer: SkeletonTransformer,
    private formProcessor: FormProcessor,
    private repProcessor: RepProcessor
  ) {}

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

    // Set up the reactive pipeline
    this.pipelineSubscription = frameStream
      .pipe(
        // Stage 1: Skeleton Transformation (combined pose detection and skeleton construction)
        switchMap((frameEvent) =>
          this.skeletonTransformer.transformToSkeleton(frameEvent)
        ),

        // Stage 2: Form Processing
        switchMap((skeletonEvent) => {
          // Store latest skeleton
          if (skeletonEvent.skeleton) {
            this.latestSkeleton = skeletonEvent.skeleton;
          }

          return this.formProcessor.processFrame(skeletonEvent, this.repCount);
        }),

        // Emit checkpoint events
        tap((checkpointEvent) => {
          // Pass checkpoint event to subscribers
          this.checkpointSubject.next(checkpointEvent);
        }),

        // Stage 3: Rep Processing
        switchMap((checkpointEvent) => {
          return this.repProcessor.updateRepCount(checkpointEvent);
        }),

        // Update rep count and emit result
        tap((repEvent) => {
          this.repCount = repEvent.repCount;

          // Pass result to observers
          if (repEvent.checkpointEvent.skeletonEvent.skeleton) {
            this.resultSubject.next({
              skeleton: repEvent.checkpointEvent.skeletonEvent.skeleton,
              checkpoint: repEvent.checkpointEvent.checkpoint,
              repCount: repEvent.repCount,
            });
          }
        }),

        // Share the pipeline with multiple subscribers
        share()
      )
      .subscribe(
        // The tap operator above handles the next notification
        undefined,
        (error) => {
          console.error('Error in pipeline:', error);
          this.resultSubject.error(error);
          this.checkpointSubject.error(error);
        },
        () => {
          this.resultSubject.complete();
          this.checkpointSubject.complete();
          this.isActive = false;
        }
      );

    return this.resultSubject.asObservable();
  }

  /**
   * Get an observable for checkpoint events
   */
  getCheckpointEvents(): Observable<CheckpointEvent> {
    return this.checkpointSubject.asObservable();
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
    this.repProcessor.reset();
    this.formProcessor.reset();
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
}

/**
 * Result from pipeline processing
 */
export interface PipelineResult {
  skeleton: Skeleton;
  checkpoint: FormCheckpoint | null;
  repCount: number;
}
