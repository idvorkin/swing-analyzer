import { FrameAcquisition, FrameEvent } from './PipelineInterfaces';
import { Observable, Subject, fromEvent } from 'rxjs';
import { map, takeUntil, share } from 'rxjs/operators';

/**
 * Handles acquiring frames from video or camera source using RxJS
 */
export class FrameProcessor implements FrameAcquisition {
  private frameSubject = new Subject<FrameEvent>();
  private stopSubject = new Subject<void>();
  private isProcessing = false;
  
  constructor(
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement
  ) {}
  
  /**
   * Get the current frame element
   */
  getCurrentFrame(): HTMLVideoElement {
    return this.videoElement;
  }
  
  /**
   * Start frame processing and return an Observable of frame events
   */
  start(): Observable<FrameEvent> {
    if (this.isProcessing) {
      // Return the existing subject if already processing
      return this.frameSubject.asObservable();
    }
    
    this.isProcessing = true;
    
    // Create an Observable from requestAnimationFrame
    const animationFrames = Observable.create((observer: any) => {
      const requestFrame = (timestamp: number) => {
        observer.next(timestamp);
        if (!this.isProcessing) {
          observer.complete();
          return;
        }
        requestAnimationFrame(requestFrame);
      };
      
      requestAnimationFrame(requestFrame);
      
      // Cleanup function
      return () => {
        this.isProcessing = false;
      };
    }).pipe(
      takeUntil(this.stopSubject),
      map((timestamp: number) => {
        return {
          frame: this.videoElement,
          timestamp
        } as FrameEvent;
      }),
      share() // Share the same observable with multiple subscribers
    );
    
    // Subscribe to animation frames and publish to our subject
    animationFrames.subscribe(
      (frameEvent: FrameEvent) => this.frameSubject.next(frameEvent),
      (error: any) => this.frameSubject.error(error),
      () => this.frameSubject.complete()
    );
    
    return this.frameSubject.asObservable();
  }
  
  /**
   * Stop frame processing
   */
  stop(): void {
    if (!this.isProcessing) return;
    
    this.isProcessing = false;
    this.stopSubject.next();
  }
  
  /**
   * Check if processing is active
   */
  isActive(): boolean {
    return this.isProcessing;
  }
} 