import { Pipeline, PipelineResult } from '../pipeline/Pipeline';
import { AppState, FormPosition } from '../types';
import { Skeleton } from '../models/Skeleton';
import { Subscription } from 'rxjs';

/**
 * ViewModel that coordinates between the processing pipeline and the UI
 * using RxJS for reactive updates
 */
export class SwingAnalyzerViewModel {
  // Application state
  private appState: AppState;
  
  // Subscription to pipeline results
  private pipelineSubscription: Subscription | null = null;
  
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
    // Update UI with new data
    this.updateRepCounterDisplay();
    this.updateSpineAngleDisplay(result.skeleton.getSpineAngle());
    
    // Render skeleton on canvas
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
   * This is a placeholder - in phase 2 we'll implement the full visualization
   */
  private renderSkeleton(skeleton: Skeleton): void {
    // This will be implemented in phase 2
    // Will draw the skeleton connections and keypoints
  }
  
  /**
   * Get current app state
   */
  getAppState(): AppState {
    return { ...this.appState };
  }
} 