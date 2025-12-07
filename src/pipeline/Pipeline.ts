import { type Observable, Subject, type Subscription } from 'rxjs';
import { share, switchMap, tap } from 'rxjs/operators';
import {
  type FormAnalyzer,
  type RepPosition,
  KettlebellSwingFormAnalyzer,
  PistolSquatFormAnalyzer,
  ExerciseDetector,
  type DetectionResult,
  type DetectedExercise,
} from '../analyzers';
import type { Skeleton } from '../models/Skeleton';
import type { CropRegion } from '../types/posetrack';
import type {
  FrameAcquisition,
  FrameEvent,
  SkeletonEvent,
  SkeletonTransformer,
} from './PipelineInterfaces';
import { VideoFrameAcquisition } from './VideoFrameAcquisition';

/**
 * Event emitted when a rep completes with position thumbnails
 */
export interface ThumbnailEvent {
  /** Rep number (1-indexed) */
  repNumber: number;
  /** Position captures from the completed rep (skeleton at each phase peak) */
  positions: RepPosition[];
}

/**
 * Orchestrates the processing pipeline from frame to rep analysis.
 *
 * Supports two processing modes:
 * 1. Video-event-driven (preferred): Call processFrameAsync() on video timeupdate events
 * 2. RxJS streaming (legacy): Call start() to begin Observable-based processing
 *
 * Pipeline flow: Frame → Skeleton → FormAnalyzer.processFrame() → Results
 *
 * The FormAnalyzer is a plugin interface - different exercises get different analyzers:
 * - KettlebellSwingFormAnalyzer: peak-based state machine for swings
 * - PullUpFormAnalyzer: (future) for pull-ups
 * - MockFormAnalyzer: (testing) deterministic behavior
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
  private exerciseDetectionSubject = new Subject<DetectionResult>();

  // Form analyzer - plugin for exercise-specific analysis
  private formAnalyzer: FormAnalyzer;

  // Exercise detection
  private exerciseDetector = new ExerciseDetector();
  private detectedExercise: DetectedExercise = 'unknown';
  private autoSwitchAnalyzer = true; // Auto-switch analyzer when exercise detected

  constructor(
    private frameAcquisition: FrameAcquisition,
    private skeletonTransformer: SkeletonTransformer,
    formAnalyzer?: FormAnalyzer
  ) {
    // Default to kettlebell swing analyzer if none provided
    this.formAnalyzer = formAnalyzer ?? new KettlebellSwingFormAnalyzer();
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

        // Stage 2: Process skeleton through form analyzer
        tap((skeletonEvent) => {
          // Emit the skeleton event to subscribers (for rendering)
          this.skeletonSubject.next(skeletonEvent);

          // Store latest skeleton
          if (skeletonEvent.skeleton) {
            this.latestSkeleton = skeletonEvent.skeleton;

            // Process through form analyzer
            try {
              const result = this.formAnalyzer.processFrame(
                skeletonEvent.skeleton,
                skeletonEvent.poseEvent.frameEvent.timestamp,
                skeletonEvent.poseEvent.frameEvent.videoTime,
                skeletonEvent.poseEvent.frameEvent.frameImage
              );

              // Update rep count
              this.repCount = result.repCount;

              // Emit result
              this.resultSubject.next({
                skeleton: skeletonEvent.skeleton,
                repCount: result.repCount,
              });

              // Emit thumbnail event when rep completes
              if (result.repCompleted && result.repPositions) {
                this.thumbnailSubject.next({
                  repNumber: result.repCount,
                  positions: result.repPositions,
                });
              }
            } catch (error) {
              console.error('Error in form analyzer processFrame:', error);
            }
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
        },
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
   * Get an observable for thumbnail events (emitted when a rep completes)
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
    this.exerciseDetector.reset();
    this.detectedExercise = 'unknown';
    this.autoSwitchAnalyzer = true;
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
    const skeletonEvent =
      await this.skeletonTransformer.transformToSkeletonAsync(frameEvent);

    if (!skeletonEvent.skeleton) {
      return null;
    }

    // Store latest skeleton
    this.latestSkeleton = skeletonEvent.skeleton;

    // Process through form analyzer
    try {
      const result = this.formAnalyzer.processFrame(
        skeletonEvent.skeleton,
        frameEvent.timestamp,
        frameEvent.videoTime,
        frameEvent.frameImage
      );

      // Update rep count
      this.repCount = result.repCount;

      return {
        skeleton: skeletonEvent.skeleton,
        repCount: result.repCount,
        position: result.phase,
        angles: result.angles,
        repCompleted: result.repCompleted,
      };
    } catch (error) {
      console.error('Error in form analyzer processFrame:', error);
      return null;
    }
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

      // Run exercise detection (only until locked)
      if (!this.exerciseDetector.isLocked()) {
        const detection = this.exerciseDetector.processFrame(skeletonEvent.skeleton);
        this.exerciseDetectionSubject.next(detection);

        // Auto-switch analyzer when detection is confident
        if (this.autoSwitchAnalyzer && detection.confidence >= 70) {
          this.switchToExercise(detection.exercise);
        }
      }

      // Process through form analyzer
      try {
        const result = this.formAnalyzer.processFrame(
          skeletonEvent.skeleton,
          skeletonEvent.poseEvent.frameEvent.timestamp,
          skeletonEvent.poseEvent.frameEvent.videoTime,
          skeletonEvent.poseEvent.frameEvent.frameImage
        );

        // Update rep count
        this.repCount = result.repCount;

        // Emit thumbnail event when rep completes (with positions at each phase peak)
        if (result.repCompleted && result.repPositions) {
          this.thumbnailSubject.next({
            repNumber: result.repCount,
            positions: result.repPositions,
          });
        }

        // Emit result when rep completes
        if (result.repCompleted) {
          this.resultSubject.next({
            skeleton: skeletonEvent.skeleton,
            repCount: result.repCount,
          });
        }
      } catch (error) {
        console.error('Error in form analyzer processFrame:', error);
      }
    }

    return this.repCount;
  }

  /**
   * Switch to the appropriate FormAnalyzer for the detected exercise
   */
  private switchToExercise(exercise: DetectedExercise): void {
    // Don't switch if already using the right analyzer
    if (exercise === this.detectedExercise) return;
    if (exercise === 'unknown') return;

    this.detectedExercise = exercise;

    // Create the appropriate analyzer
    const newAnalyzer = exercise === 'pistol-squat'
      ? new PistolSquatFormAnalyzer()
      : new KettlebellSwingFormAnalyzer();

    // Swap in the new analyzer (keeps any rep count from old analyzer)
    this.formAnalyzer = newAnalyzer;

    console.log(`[Pipeline] Switched to ${exercise} analyzer`);
  }

  // ========================================
  // Exercise Detection API
  // ========================================

  /**
   * Get an observable for exercise detection events
   */
  getExerciseDetectionEvents(): Observable<DetectionResult> {
    return this.exerciseDetectionSubject.asObservable();
  }

  /**
   * Get the currently detected exercise type
   */
  getDetectedExercise(): DetectedExercise {
    return this.detectedExercise;
  }

  /**
   * Get the current detection result (without processing a new frame)
   */
  getDetectionResult(): DetectionResult {
    return this.exerciseDetector.getResult();
  }

  /**
   * Manually set the exercise type (user override)
   * This locks the detector and switches the analyzer immediately.
   */
  setExerciseType(exercise: DetectedExercise): void {
    this.autoSwitchAnalyzer = false; // Disable auto-switch since user chose
    this.switchToExercise(exercise);
  }

  /**
   * Check if exercise detection is locked (confident or user-set)
   */
  isExerciseDetectionLocked(): boolean {
    return this.exerciseDetector.isLocked();
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
