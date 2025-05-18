import { FrameAcquisition, PoseDetection, SkeletonConstruction, FormCheckpointDetection, SwingRepAnalysis } from './PipelineInterfaces';
import { Skeleton } from '../models/Skeleton';
import { FormCheckpoint } from '../types';
import { Observable, Subject, Subscription } from 'rxjs';
import { switchMap, tap, share } from 'rxjs/operators';

/**
 * Orchestrates the entire processing pipeline from frame to swing rep analysis using RxJS
 */
export class Pipeline {
  // Latest data from the pipeline
  private latestSkeleton: Skeleton | null = null;
  private latestCheckpoint: FormCheckpoint | null = null;
  private repCount = 0;
  
  // Processing state
  private isActive = false;
  private pipelineSubscription: Subscription | null = null;
  
  // Output subjects
  private resultSubject = new Subject<PipelineResult>();
  
  constructor(
    private frameAcquisition: FrameAcquisition,
    private poseDetector: PoseDetection,
    private skeletonBuilder: SkeletonConstruction,
    private formAnalyzer: FormCheckpointDetection,
    private repDetector: SwingRepAnalysis
  ) {}
  
  /**
   * Initialize the pipeline
   */
  async initialize(): Promise<void> {
    // Initialize pose detector
    await this.poseDetector.initialize();
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
    this.pipelineSubscription = frameStream.pipe(
      // Stage 1: Pose Detection
      switchMap(frameEvent => this.poseDetector.detectPose(frameEvent)),
      
      // Stage 2: Skeleton Construction
      switchMap(poseEvent => this.skeletonBuilder.buildSkeleton(poseEvent)),
      
      // Stage 3: Form Checkpoint Detection
      switchMap(skeletonEvent => {
        // Store latest skeleton
        if (skeletonEvent.skeleton) {
          this.latestSkeleton = skeletonEvent.skeleton;
        }
        
        return this.formAnalyzer.processFrame(skeletonEvent, this.repCount);
      }),
      
      // Stage 4: Swing Rep Analysis
      switchMap(checkpointEvent => {
        // Store latest checkpoint
        if (checkpointEvent.checkpoint) {
          this.latestCheckpoint = checkpointEvent.checkpoint;
        }
        
        return this.repDetector.updateRepCount(checkpointEvent);
      }),
      
      // Update rep count and emit result
      tap(repEvent => {
        this.repCount = repEvent.repCount;
        
        // Pass result to observers
        if (repEvent.checkpointEvent.skeletonEvent.skeleton) {
          this.resultSubject.next({
            skeleton: repEvent.checkpointEvent.skeletonEvent.skeleton,
            checkpoint: repEvent.checkpointEvent.checkpoint,
            repCount: repEvent.repCount
          });
        }
      }),
      
      // Share the pipeline with multiple subscribers
      share()
      
    ).subscribe(
      // The tap operator above handles the next notification
      undefined,
      error => {
        console.error('Error in pipeline:', error);
        this.resultSubject.error(error);
      },
      () => {
        this.resultSubject.complete();
        this.isActive = false;
      }
    );
    
    return this.resultSubject.asObservable();
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
    this.repDetector.reset();
    this.formAnalyzer.reset();
    this.latestSkeleton = null;
    this.latestCheckpoint = null;
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