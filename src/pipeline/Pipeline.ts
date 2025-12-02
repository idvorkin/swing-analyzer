import { type Observable, Subject, type Subscription } from 'rxjs';
import { share, switchMap, tap } from 'rxjs/operators';
import type { Skeleton } from '../models/Skeleton';
import type { FormCheckpoint } from '../types';
import type {
  FormEvent,
  FormProcessor,
  FrameAcquisition,
  RepEvent,
  RepProcessor,
  SkeletonEvent,
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
  private checkpointSubject = new Subject<FormEvent>();
  private skeletonSubject = new Subject<SkeletonEvent>();

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
      console.log('Pipeline already active, returning existing result subject');
      return this.resultSubject.asObservable();
    }

    console.log('Starting pipeline...');
    this.isActive = true;

    // Build the RxJS pipeline
    const frameStream = this.frameAcquisition.start();
    console.log('Frame acquisition started');

    // Set up the reactive pipeline
    this.pipelineSubscription = frameStream
      .pipe(
        // Stage 1: Skeleton Transformation (combined pose detection and skeleton construction)
        switchMap((frameEvent) =>
          this.skeletonTransformer.transformToSkeleton(frameEvent)
        ),

        // Emit every skeleton event regardless of whether it results in a checkpoint
        tap((skeletonEvent) => {
          // Emit the skeleton event to subscribers
          this.skeletonSubject.next(skeletonEvent);

          // Store latest skeleton
          if (skeletonEvent.skeleton) {
            this.latestSkeleton = skeletonEvent.skeleton;
          }
        }),

        // Stage 2: Form Processing
        switchMap((skeletonEvent) => {
          return this.formProcessor.processFrame(skeletonEvent);
        }),

        // Emit checkpoint events
        tap((checkpointEvent) => {
          console.log(
            `Pipeline: Form processor emitted checkpoint for position ${checkpointEvent.position}`
          );

          // Pass checkpoint event to subscribers
          this.checkpointSubject.next(checkpointEvent);
        }),

        // Stage 3: Rep Processing
        switchMap((checkpointEvent) => {
          console.log('Pipeline: Passing checkpoint to rep processor');
          return this.repProcessor.updateRepCount(checkpointEvent);
        }),

        // Update rep count and emit result
        tap((repEvent) => {
          console.log(
            `Pipeline: Rep processor finished, rep count = ${repEvent.repCount}, incremented = ${repEvent.repIncremented || false}`
          );

          this.repCount = repEvent.repCount;

          // Pass result to observers
          if (repEvent.checkpointEvent.skeletonEvent.skeleton) {
            this.resultSubject.next({
              skeleton: repEvent.checkpointEvent.skeletonEvent.skeleton,
              checkpoint: repEvent.checkpointEvent.checkpoint,
              repCount: repEvent.repCount,
            });
            console.log(
              `Pipeline: Emitted result with rep count ${repEvent.repCount}`
            );
          }
        }),

        // Share the pipeline with multiple subscribers
        share()
      )
      .subscribe({
        next: (_: RepEvent) => {
          console.log(
            `Pipeline subscription: Processing complete for rep event`
          );
        },
        error: (error) => {
          console.error('Error in pipeline:', error);
          this.resultSubject.error(error);
          this.checkpointSubject.error(error);
          this.skeletonSubject.error(error);
        },
        complete: () => {
          console.log('Pipeline complete');
          this.resultSubject.complete();
          this.checkpointSubject.complete();
          this.skeletonSubject.complete();
          this.isActive = false;
        },
      });

    console.log('Pipeline subscriptions set up and active');
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

  /**
   * Get the rep processor
   */
  getRepProcessor(): RepProcessor {
    return this.repProcessor;
  }

  /**
   * Get the model type currently being used
   */
  getModelType(): string {
    return this.skeletonTransformer.getModelType();
  }

  /**
   * Switch to a different pose detection model
   */
  async switchModel(modelType: 'BlazePose' | 'MoveNet'): Promise<void> {
    await this.skeletonTransformer.setModelType(modelType);
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
