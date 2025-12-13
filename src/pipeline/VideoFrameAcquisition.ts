import {
  fromEvent,
  interval,
  merge,
  NEVER,
  type Observable,
  Subject,
} from 'rxjs';
import { map, startWith, switchMap, takeUntil } from 'rxjs/operators';
import type { CropRegion } from '../types/posetrack';
import type { FrameAcquisition, FrameEvent } from './PipelineInterfaces';

/**
 * Video frame acquisition - handles frame acquisition from video element
 */
export class VideoFrameAcquisition implements FrameAcquisition {
  private stop$ = new Subject<void>();
  private frameRate = 30; // Default frame rate in fps
  private cropRegion: CropRegion | null = null;
  private cropEnabled = false;

  constructor(
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement
  ) {}

  /**
   * Set the crop region for auto-centering on person
   * @param crop The crop region, or null to disable cropping
   */
  setCropRegion(crop: CropRegion | null): void {
    this.cropRegion = crop;
    if (crop) {
      console.log(
        `[VideoFrameAcquisition] Crop region set: ${crop.width}x${crop.height} at (${crop.x}, ${crop.y})`
      );
    }
    this.applyCropTransform();
  }

  /**
   * Get the current crop region
   */
  getCropRegion(): CropRegion | null {
    return this.cropRegion;
  }

  /**
   * Enable or disable crop mode
   */
  setCropEnabled(enabled: boolean): void {
    this.cropEnabled = enabled;
    this.applyCropTransform();
  }

  /**
   * Check if crop is currently enabled
   */
  isCropEnabled(): boolean {
    return this.cropEnabled && this.cropRegion !== null;
  }

  /**
   * Apply CSS transform to video and canvas for cropping
   * Both elements get the same transform so skeleton stays aligned
   */
  private applyCropTransform(): void {
    const crop = this.cropRegion;
    const video = this.videoElement;
    const canvas = this.canvasElement;

    if (!crop || !this.cropEnabled) {
      // Reset transforms
      video.style.transform = '';
      video.style.transformOrigin = '';
      canvas.style.transform = '';
      canvas.style.transformOrigin = '';
      return;
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (!videoWidth || !videoHeight) {
      return;
    }

    // Calculate scale to zoom into crop region
    const scaleX = videoWidth / crop.width;
    const scaleY = videoHeight / crop.height;
    const scale = Math.min(scaleX, scaleY);

    // Calculate crop center as percentage of video dimensions
    const cropCenterX = crop.x + crop.width / 2;
    const cropCenterY = crop.y + crop.height / 2;
    const originX = (cropCenterX / videoWidth) * 100;
    const originY = (cropCenterY / videoHeight) * 100;

    // Apply same transform to both video and canvas
    const transform = `scale(${scale})`;
    const transformOrigin = `${originX}% ${originY}%`;

    video.style.transform = transform;
    video.style.transformOrigin = transformOrigin;
    canvas.style.transform = transform;
    canvas.style.transformOrigin = transformOrigin;

    console.log(
      `[VideoFrameAcquisition] Applied crop transform: scale=${scale.toFixed(2)}, origin=(${originX.toFixed(1)}%, ${originY.toFixed(1)}%)`
    );
  }

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
    const HAVE_CURRENT_DATA = 2;
    if (this.videoElement.readyState < HAVE_CURRENT_DATA) {
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
    this.stop$.complete();
  }

  /**
   * Load a video file
   */
  loadVideo(file: File): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Create object URL for the file
      const videoURL = URL.createObjectURL(file);

      // Clean up previous URL if exists
      if (this.videoElement.src) {
        URL.revokeObjectURL(this.videoElement.src);
      }

      // Cleanup function to remove listeners
      const cleanup = () => {
        this.videoElement.removeEventListener('error', handleError);
        this.videoElement.removeEventListener('loadedmetadata', handleLoaded);
      };

      // Set up event listeners
      const handleError = () => {
        cleanup();
        URL.revokeObjectURL(videoURL);
        reject(new Error('Failed to load video file'));
      };

      const handleLoaded = () => {
        cleanup();
        this.updateCanvasDimensions();
        console.log(
          `Video loaded: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`
        );
        resolve();
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
    console.log(
      `[DEBUG] VideoFrameAcquisition.loadVideoFromURL: Called with URL: ${url}`
    );

    // Check for empty URL
    if (!url || url.trim() === '') {
      console.error(
        '[DEBUG] VideoFrameAcquisition.loadVideoFromURL: Empty URL provided'
      );
      return Promise.reject(new Error('Empty URL provided'));
    }

    return new Promise<void>((resolve, reject) => {
      // Cleanup function to remove listeners
      const cleanup = () => {
        this.videoElement.removeEventListener('error', handleError);
        this.videoElement.removeEventListener('loadedmetadata', handleLoaded);
      };

      // Set up event listeners
      const handleError = () => {
        cleanup();
        console.error(
          `[DEBUG] VideoFrameAcquisition.loadVideoFromURL: Error event triggered for ${url}`
        );
        reject(new Error(`Failed to load video from URL: ${url}`));
      };

      const handleLoaded = () => {
        cleanup();
        console.log(
          '[DEBUG] VideoFrameAcquisition.loadVideoFromURL: loadedmetadata event triggered'
        );
        this.updateCanvasDimensions();
        console.log(
          `[DEBUG] VideoFrameAcquisition.loadVideoFromURL: Video loaded: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`
        );
        resolve();
      };

      // Set up listeners
      console.log(
        '[DEBUG] VideoFrameAcquisition.loadVideoFromURL: Setting up event listeners'
      );
      this.videoElement.addEventListener('error', handleError);
      this.videoElement.addEventListener('loadedmetadata', handleLoaded);

      // Load the video
      console.log(
        `[DEBUG] VideoFrameAcquisition.loadVideoFromURL: Setting video.src to ${url}`
      );
      this.videoElement.src = url;
    });
  }

  /**
   * Create frame stream from video element
   */
  private createFrameStream(): Observable<FrameEvent> {
    const frameInterval = 1000 / this.frameRate;

    // Listen to play and pause events
    const play$ = fromEvent(this.videoElement, 'play');
    const pause$ = fromEvent(this.videoElement, 'pause');

    // Emit frame on seek (even when paused) for skeleton redraw
    const seeked$ = fromEvent(this.videoElement, 'seeked').pipe(
      map(() => ({
        frame: this.videoElement,
        timestamp: performance.now(),
        videoTime: this.videoElement.currentTime,
      })),
      takeUntil(this.stop$)
    );

    // Playback frames (only when playing)
    const playback$ = merge(play$, pause$).pipe(
      startWith(this.videoElement.paused ? 'pause' : 'play'),
      switchMap(() =>
        this.videoElement.paused
          ? NEVER
          : interval(frameInterval).pipe(
              takeUntil(this.stop$),
              map(() => ({
                frame: this.videoElement,
                timestamp: performance.now(),
                videoTime: this.videoElement.currentTime,
              }))
            )
      ),
      takeUntil(this.stop$)
    );

    // Merge seeked events with playback events
    return merge(seeked$, playback$);
  }

  /**
   * Update canvas dimensions to match video
   */
  private updateCanvasDimensions(): void {
    if (this.videoElement.videoWidth && this.videoElement.videoHeight) {
      // Set the internal dimensions of the canvas to match the video dimensions exactly
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;

      // Check if video is portrait orientation
      const isPortrait =
        this.videoElement.videoHeight > this.videoElement.videoWidth;

      // Update container class based on orientation
      const videoContainer = this.videoElement.parentElement;
      if (videoContainer) {
        if (isPortrait) {
          videoContainer.classList.add('portrait-video');
          videoContainer.classList.remove('landscape-video');
        } else {
          videoContainer.classList.add('landscape-video');
          videoContainer.classList.remove('portrait-video');
        }
        // Ensure video container has overflow hidden for crop to work
        videoContainer.style.overflow = 'hidden';
      }

      // Log dimensions for debugging
      console.log(
        `Canvas dimensions updated: ${this.canvasElement.width}x${this.canvasElement.height} (video: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight})`
      );

      // Ensure the canvas element style position is absolute and covers the video exactly
      this.canvasElement.style.position = 'absolute';
      this.canvasElement.style.top = '0';
      this.canvasElement.style.left = '0';
      this.canvasElement.style.width = '100%';
      this.canvasElement.style.height = '100%';

      // Re-apply crop transform if enabled
      this.applyCropTransform();
    }
  }
}
