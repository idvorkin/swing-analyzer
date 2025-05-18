import { Pipeline, PipelineResult } from '../pipeline/Pipeline';
import { AppState, FormPosition } from '../types';
import { Skeleton } from '../models/Skeleton';
import { Subscription } from 'rxjs';
import { SkeletonRenderer } from './SkeletonRenderer';

/**
 * ViewModel that coordinates between the processing pipeline and the UI
 * using RxJS for reactive updates
 */
export class SwingAnalyzerViewModel {
  // Application state
  private appState: AppState;
  
  // Subscription to pipeline results
  private pipelineSubscription: Subscription | null = null;
  
  // Skeleton renderer
  private skeletonRenderer: SkeletonRenderer;
  
  // Throttle logging
  private lastPipelineLogTime = 0;
  private lastRenderLogTime = 0;
  private logThrottleMs = 1000; // 1 second
  
  constructor(
    private pipeline: Pipeline,
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement,
    private repCounterElement: HTMLElement,
    private spineAngleElement: HTMLElement,
    initialState?: Partial<AppState>
  ) {
    // Initialize app state with defaults and any provided overrides
    this.appState = {
      usingCamera: false,
      cameraMode: 'environment',
      displayMode: 'both',
      isModelLoaded: false,
      isProcessing: false,
      repCounter: {
        count: 0,
        isHinge: false,
        lastHingeState: false,
        hingeThreshold: 45
      },
      showBodyParts: true,
      bodyPartDisplayTime: 0.5,
      currentRepIndex: 0,
      ...initialState
    };
    
    // Initialize skeleton renderer
    this.skeletonRenderer = new SkeletonRenderer(this.canvasElement);
    this.skeletonRenderer.setBodyPartDisplay(
      this.appState.showBodyParts,
      this.appState.bodyPartDisplayTime
    );
  }
  
  /**
   * Initialize the analyzer
   */
  async initialize(): Promise<void> {
    try {
      await this.pipeline.initialize();
      this.appState.isModelLoaded = true;
      return Promise.resolve();
    } catch (error) {
      console.error("Failed to initialize swing analyzer:", error);
      return Promise.reject(error);
    }
  }
  
  /**
   * Start processing
   */
  startProcessing(): void {
    if (!this.appState.isModelLoaded) {
      console.warn("Model not loaded, cannot start processing");
      return;
    }
    
    this.appState.isProcessing = true;
    
    // Subscribe to pipeline results
    this.pipelineSubscription = this.pipeline.start().subscribe(
      (result: PipelineResult) => this.handlePipelineUpdate(result),
      (error: any) => console.error("Pipeline error:", error),
      () => {
        console.log("Pipeline processing completed");
        this.appState.isProcessing = false;
      }
    );
  }
  
  /**
   * Stop processing
   */
  stopProcessing(): void {
    this.appState.isProcessing = false;
    this.pipeline.stop();
    
    if (this.pipelineSubscription) {
      this.pipelineSubscription.unsubscribe();
      this.pipelineSubscription = null;
    }
  }
  
  /**
   * Reset state
   */
  reset(): void {
    this.pipeline.reset();
    
    // Reset UI state
    this.appState.repCounter.count = 0;
    this.appState.repCounter.isHinge = false;
    this.appState.repCounter.lastHingeState = false;
    this.appState.currentRepIndex = 0;
    
    // Update UI
    this.updateRepCounterDisplay();
    this.updateSpineAngleDisplay(0);
  }
  
  /**
   * Handle updates from the pipeline
   */
  private handlePipelineUpdate(result: PipelineResult): void {
    const currentTime = performance.now();
    if (currentTime - this.lastPipelineLogTime >= this.logThrottleMs) {
      this.lastPipelineLogTime = currentTime;
      console.log("===== SwingAnalyzerViewModel: PIPELINE UPDATE RECEIVED =====");
      console.log("SwingAnalyzerViewModel: RepCount:", this.pipeline.getRepCount());
      console.log("SwingAnalyzerViewModel: Has Skeleton:", !!result.skeleton);
      
      if (result.skeleton) {
        console.log("SwingAnalyzerViewModel: Skeleton angle:", result.skeleton.getSpineAngle().toFixed(2));
        console.log("SwingAnalyzerViewModel: Keypoints:", result.skeleton.getKeypoints().length);
      }
      
      console.log("===== SwingAnalyzerViewModel: PIPELINE UPDATE PROCESSED =====");
    }
    
    // Update UI with new data (always do this regardless of logging)
    this.updateRepCounterDisplay();
    this.updateSpineAngleDisplay(result.skeleton.getSpineAngle());
    
    // Render skeleton on canvas (always do this regardless of logging)
    this.renderSkeleton(result.skeleton);
  }
  
  /**
   * Update the rep counter display
   */
  private updateRepCounterDisplay(): void {
    if (this.repCounterElement) {
      this.repCounterElement.textContent = this.pipeline.getRepCount().toString();
    }
  }
  
  /**
   * Update the spine angle display
   */
  private updateSpineAngleDisplay(angle: number): void {
    if (this.spineAngleElement) {
      this.spineAngleElement.textContent = Math.abs(angle).toFixed(1) + '°';
    }
  }
  
  /**
   * Render skeleton on canvas
   */
  private renderSkeleton(skeleton: Skeleton): void {
    // Always render the skeleton, regardless of logging
    if (skeleton) {
      const currentTime = performance.now();
      
      // Only log if we're past the throttle time
      if (currentTime - this.lastRenderLogTime >= this.logThrottleMs) {
        this.lastRenderLogTime = currentTime;
        console.log("===== SwingAnalyzerViewModel: RENDERING SKELETON =====");
        console.log("SwingAnalyzerViewModel: Rendering skeleton with", skeleton.getKeypoints().length, "keypoints");
        console.log("SwingAnalyzerViewModel: Canvas dimensions:", this.canvasElement.width, "x", this.canvasElement.height);
        console.log("SwingAnalyzerViewModel: Skeleton visibility:", skeleton.hasRequiredKeypoints());
      }
      
      // Always call the renderer
      this.skeletonRenderer.renderSkeleton(skeleton, performance.now());
      
      // Only log completion if we're logging the start
      if (currentTime - this.lastRenderLogTime >= this.logThrottleMs) {
        console.log("===== SwingAnalyzerViewModel: SKELETON RENDERING COMPLETE =====");
      }
    } else {
      // Only log warnings about missing skeleton if we're past the throttle time
      const currentTime = performance.now();
      if (currentTime - this.lastRenderLogTime >= this.logThrottleMs) {
        this.lastRenderLogTime = currentTime;
        console.warn("SwingAnalyzerViewModel: No skeleton to render");
      }
    }
  }
  
  /**
   * Set body part display options
   */
  setBodyPartDisplay(show: boolean, displaySeconds: number): void {
    this.appState.showBodyParts = show;
    this.appState.bodyPartDisplayTime = displaySeconds;
    this.skeletonRenderer.setBodyPartDisplay(show, displaySeconds);
  }
  
  /**
   * Set debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.skeletonRenderer.setDebugMode(enabled);
  }
  
  /**
   * Set display mode
   */
  setDisplayMode(mode: 'both' | 'video' | 'overlay'): void {
    this.appState.displayMode = mode;
    
    switch (mode) {
      case 'both':
        this.videoElement.style.opacity = '1';
        this.canvasElement.style.display = 'block';
        break;
      case 'video':
        this.videoElement.style.opacity = '1';
        this.canvasElement.style.display = 'none';
        break;
      case 'overlay':
        this.videoElement.style.opacity = '0.1';
        this.canvasElement.style.display = 'block';
        
        // Set canvas background to black
        const ctx = this.canvasElement.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }
        break;
    }
  }
  
  /**
   * Get current app state
   */
  getAppState(): AppState {
    return { ...this.appState };
  }
} 