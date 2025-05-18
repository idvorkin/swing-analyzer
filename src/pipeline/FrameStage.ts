import { FrameAcquisition, FrameEvent } from './PipelineInterfaces';
import { Observable, fromEvent, interval, Subject, NEVER } from 'rxjs';
import { map, takeUntil, switchMap, tap } from 'rxjs/operators';

/**
 * Frame acquisition stage - handles frame acquisition from video element or camera
 */
export class FrameStage implements FrameAcquisition {
  private stop$ = new Subject<void>();
  private frameRate = 30; // Default frame rate in fps
  
  constructor(
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement
  ) {}
  
  /**
   * Get the current frame
   */
  getCurrentFrame(): HTMLVideoElement {
    return this.videoElement;
  }
  
  /**
   * Start frame acquisition and return an Observable of frame events
   */
  start(): Observable<FrameEvent> {
    // Reset stop subject
    this.stop$.next();
    this.stop$ = new Subject<void>();
    
    // Check if video is ready
    if (this.videoElement.readyState < 2) {
      console.log('Video not ready, waiting for loadeddata event');
      
      // Wait for video to be loaded before starting
      return fromEvent(this.videoElement, 'loadeddata').pipe(
        switchMap(() => this.createFrameStream())
      );
    }
    
    // Video is already loaded, start immediately
    return this.createFrameStream();
  }
  
  /**
   * Stop frame acquisition
   */
  stop(): void {
    this.stop$.next();
  }
  
  /**
   * Start camera with specified mode
   * @param mode 'user' for front camera, 'environment' for back camera
   */
  async startCamera(mode: 'user' | 'environment' = 'environment'): Promise<void> {
    try {
      const constraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Stop any existing stream
      this.stopCamera();
      
      // Connect stream to video element
      this.videoElement.srcObject = stream;
      this.videoElement.play();
      
      // Wait for video to be ready
      return new Promise<void>((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          // Update canvas dimensions
          this.updateCanvasDimensions();
          resolve();
        };
      });
    } catch (error) {
      console.error('Error starting camera:', error);
      throw error;
    }
  }
  
  /**
   * Stop camera stream
   */
  stopCamera(): void {
    const stream = this.videoElement.srcObject as MediaStream;
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
  }
  
  /**
   * Load a video file
   */
  loadVideo(file: File): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Stop camera if running
      this.stopCamera();
      
      // Create object URL for the file
      const videoURL = URL.createObjectURL(file);
      
      // Clean up previous URL if exists
      if (this.videoElement.src) {
        URL.revokeObjectURL(this.videoElement.src);
      }
      
      // Set up event listeners
      const handleError = () => {
        URL.revokeObjectURL(videoURL);
        reject(new Error('Failed to load video file'));
      };
      
      const handleLoaded = () => {
        this.updateCanvasDimensions();
        console.log(`Video loaded: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`);
        resolve();
        
        // Remove listeners
        this.videoElement.removeEventListener('error', handleError);
        this.videoElement.removeEventListener('loadedmetadata', handleLoaded);
      };
      
      // Set up listeners
      this.videoElement.addEventListener('error', handleError);
      this.videoElement.addEventListener('loadedmetadata', handleLoaded);
      
      // Load the video
      this.videoElement.src = videoURL;
    });
  }
  
  /**
   * Load a video from URL
   */
  loadVideoFromURL(url: string): Promise<void> {
    console.log(`[DEBUG] FrameStage.loadVideoFromURL: Called with URL: ${url}`);
    
    return new Promise<void>((resolve, reject) => {
      // Stop camera if running
      this.stopCamera();
      
      // Set up event listeners
      const handleError = () => {
        console.error(`[DEBUG] FrameStage.loadVideoFromURL: Error event triggered for ${url}`);
        reject(new Error(`Failed to load video from URL: ${url}`));
      };
      
      const handleLoaded = () => {
        console.log(`[DEBUG] FrameStage.loadVideoFromURL: loadedmetadata event triggered`);
        this.updateCanvasDimensions();
        console.log(`[DEBUG] FrameStage.loadVideoFromURL: Video loaded: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`);
        resolve();
        
        // Remove listeners
        this.videoElement.removeEventListener('error', handleError);
        this.videoElement.removeEventListener('loadedmetadata', handleLoaded);
      };
      
      // Set up listeners
      console.log(`[DEBUG] FrameStage.loadVideoFromURL: Setting up event listeners`);
      this.videoElement.addEventListener('error', handleError);
      this.videoElement.addEventListener('loadedmetadata', handleLoaded);
      
      // Load the video
      console.log(`[DEBUG] FrameStage.loadVideoFromURL: Setting video.src to ${url}`);
      this.videoElement.src = url;
    });
  }
  
  /**
   * Create frame stream from video element
   */
  private createFrameStream(): Observable<FrameEvent> {
    // Calculate interval based on frame rate
    const frameInterval = 1000 / this.frameRate;
    
    // If video is paused, don't emit frames
    if (this.videoElement.paused) {
      return NEVER;
    }
    
    // Create observable that emits on each frame interval
    return interval(frameInterval).pipe(
      takeUntil(this.stop$),
      map(() => ({
        frame: this.videoElement,
        timestamp: performance.now()
      }))
    );
  }
  
  /**
   * Update canvas dimensions to match video
   */
  private updateCanvasDimensions(): void {
    if (this.videoElement.videoWidth && this.videoElement.videoHeight) {
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;
      
      // Check if video is portrait orientation
      const isPortrait = this.videoElement.videoHeight > this.videoElement.videoWidth;
      
      // Update container class based on orientation
      const videoContainer = this.videoElement.parentElement;
      if (videoContainer) {
        videoContainer.classList.remove('video-portrait', 'video-landscape');
        videoContainer.classList.add(isPortrait ? 'video-portrait' : 'video-landscape');
      }
    }
  }
} 