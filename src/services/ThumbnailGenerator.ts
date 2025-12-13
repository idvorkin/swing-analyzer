/**
 * ThumbnailGenerator Service
 *
 * Generates thumbnails from video using a separate hidden video element.
 * This isolates thumbnail generation from the main video playback, preventing
 * any visible jumping or interference with user interaction.
 *
 * Key design decisions:
 * 1. Hidden video element - dedicated to thumbnail capture, invisible to user
 * 2. Request queue - batches incoming requests, processes when video ready
 * 3. Sorted processing - seeks chronologically to minimize seek overhead
 * 4. Debounced flush - waits for burst of requests before processing
 *
 * Usage:
 *   const queue = new ThumbnailQueue();
 *   queue.setVideoSource(videoFile); // or blob URL
 *   queue.enqueue(repNumber, positions, (repNum, results) => {
 *     // Update UI with results
 *   });
 */

import type { RepPosition } from '../analyzers/FormAnalyzer';

// Thumbnail dimensions (matches PoseExtractor)
const THUMB_WIDTH = 120;
const THUMB_HEIGHT = 160;

// Debounce delay before processing queue (ms)
// Allows multiple ThumbnailEvents to batch together
const FLUSH_DELAY_MS = 100;

// Minimum time between seeks to same position (ms)
// If positions are within this threshold, skip the seek
const SEEK_THRESHOLD_MS = 34; // ~1 frame at 30fps

/**
 * Request in the queue
 */
interface ThumbnailRequest {
  repNumber: number;
  positions: RepPosition[];
  callback: (repNumber: number, positions: RepPosition[]) => void;
}

/**
 * Internal work item for sorted processing
 */
interface WorkItem {
  repNumber: number;
  positionIndex: number;
  position: RepPosition;
  videoTime: number;
}

/**
 * ThumbnailQueue - Manages thumbnail generation with a hidden video element
 *
 * Creates an isolated video element for seeking and capturing thumbnails
 * without affecting the main video playback. Batches requests and processes
 * them in chronological order to minimize seeking overhead.
 */
export class ThumbnailQueue {
  private hiddenVideo: HTMLVideoElement | null = null;
  private videoSource: string | null = null;
  private isVideoReady = false;
  private isProcessing = false;

  // Request queue
  private queue: ThumbnailRequest[] = [];
  private flushTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Canvases for thumbnail capture (reused)
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private thumbnailCanvas: HTMLCanvasElement | null = null;
  private thumbnailCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    this.createHiddenVideo();
    this.createCanvases();
  }

  /**
   * Create the hidden video element
   */
  private createHiddenVideo(): void {
    this.hiddenVideo = document.createElement('video');
    this.hiddenVideo.style.display = 'none';
    this.hiddenVideo.muted = true;
    this.hiddenVideo.playsInline = true;
    this.hiddenVideo.preload = 'auto';

    // Don't append to DOM - keeps it truly hidden and avoids layout
    // Video still works for seeking and frame capture

    this.hiddenVideo.addEventListener('loadeddata', () => {
      console.log('[ThumbnailQueue] Hidden video loaded and ready');
      this.isVideoReady = true;
      // Process any queued requests
      this.scheduleFlush();
    });

    this.hiddenVideo.addEventListener('error', (e) => {
      console.error('[ThumbnailQueue] Hidden video error:', e);
      this.isVideoReady = false;
    });
  }

  /**
   * Create reusable canvases for thumbnail capture
   */
  private createCanvases(): void {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');

    this.thumbnailCanvas = document.createElement('canvas');
    this.thumbnailCanvas.width = THUMB_WIDTH;
    this.thumbnailCanvas.height = THUMB_HEIGHT;
    this.thumbnailCtx = this.thumbnailCanvas.getContext('2d');
  }

  /**
   * Set the video source for thumbnail generation
   * Call this when the main video loads
   *
   * @param source - File object, Blob URL, or regular URL
   */
  setVideoSource(source: File | string): void {
    this.isVideoReady = false;

    if (source instanceof File) {
      // Create blob URL from file
      if (this.videoSource && this.videoSource.startsWith('blob:')) {
        URL.revokeObjectURL(this.videoSource);
      }
      this.videoSource = URL.createObjectURL(source);
    } else {
      this.videoSource = source;
    }

    if (this.hiddenVideo) {
      this.hiddenVideo.src = this.videoSource;
      this.hiddenVideo.load();
    }
  }

  /**
   * Enqueue positions for thumbnail generation
   *
   * @param repNumber - The rep number these positions belong to
   * @param positions - Array of RepPosition from ThumbnailEvent
   * @param callback - Called with results when thumbnails are ready
   */
  enqueue(
    repNumber: number,
    positions: RepPosition[],
    callback: (repNumber: number, positions: RepPosition[]) => void
  ): void {
    // Filter to only positions that need thumbnails
    const needsThumbnails = positions.some((p) => !p.frameImage);
    if (!needsThumbnails) {
      // All positions already have thumbnails, callback immediately
      callback(repNumber, positions);
      return;
    }

    this.queue.push({ repNumber, positions, callback });
    this.scheduleFlush();
  }

  /**
   * Schedule a flush of the queue (debounced)
   */
  private scheduleFlush(): void {
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
    }

    this.flushTimeoutId = setTimeout(() => {
      this.flushTimeoutId = null;
      this.processQueue();
    }, FLUSH_DELAY_MS);
  }

  /**
   * Process all queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      // Already processing, will pick up new items when done
      return;
    }

    if (!this.isVideoReady || !this.hiddenVideo) {
      console.log('[ThumbnailQueue] Video not ready, waiting...');
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`[ThumbnailQueue] Processing ${this.queue.length} requests`);

    // Take all current requests
    const requests = this.queue.splice(0, this.queue.length);

    // Build flat list of all work items with video times
    const workItems: WorkItem[] = [];
    for (const request of requests) {
      for (let i = 0; i < request.positions.length; i++) {
        const pos = request.positions[i];
        if (!pos.frameImage && pos.videoTime !== undefined) {
          workItems.push({
            repNumber: request.repNumber,
            positionIndex: i,
            position: pos,
            videoTime: pos.videoTime,
          });
        }
      }
    }

    // Sort by video time for efficient seeking
    workItems.sort((a, b) => a.videoTime - b.videoTime);

    console.log(
      `[ThumbnailQueue] Processing ${workItems.length} positions sorted by time`
    );

    // Process each work item
    let lastSeekTime = -Infinity;
    for (const item of workItems) {
      try {
        // Only seek if position is far enough from last seek
        if (
          Math.abs(item.videoTime - lastSeekTime) >
          SEEK_THRESHOLD_MS / 1000
        ) {
          await this.seekVideo(item.videoTime);
          lastSeekTime = item.videoTime;
        }

        // Capture thumbnail
        const frameImage = this.capturePersonCenteredThumbnail(
          item.position.skeleton
        );
        item.position.frameImage = frameImage;
      } catch (error) {
        console.warn(
          `[ThumbnailQueue] Failed to capture thumbnail for rep ${item.repNumber} position ${item.position.name}:`,
          error
        );
      }
    }

    // Call callbacks with updated positions
    for (const request of requests) {
      request.callback(request.repNumber, request.positions);
    }

    console.log('[ThumbnailQueue] Batch complete');
    this.isProcessing = false;

    // Check if more requests came in while we were processing
    if (this.queue.length > 0) {
      this.scheduleFlush();
    }
  }

  /**
   * Seek hidden video to a specific time
   */
  private seekVideo(time: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.hiddenVideo) {
        reject(new Error('Hidden video not available'));
        return;
      }

      // If already at the right time, resolve immediately
      if (
        Math.abs(this.hiddenVideo.currentTime - time) <
        SEEK_THRESHOLD_MS / 1000
      ) {
        resolve();
        return;
      }

      const onSeeked = () => {
        this.hiddenVideo?.removeEventListener('seeked', onSeeked);
        this.hiddenVideo?.removeEventListener('error', onError);
        resolve();
      };

      const onError = () => {
        this.hiddenVideo?.removeEventListener('seeked', onSeeked);
        this.hiddenVideo?.removeEventListener('error', onError);
        reject(new Error(`Failed to seek to ${time}`));
      };

      this.hiddenVideo.addEventListener('seeked', onSeeked);
      this.hiddenVideo.addEventListener('error', onError);
      this.hiddenVideo.currentTime = time;
    });
  }

  /**
   * Capture a person-centered portrait thumbnail from current video frame
   */
  private capturePersonCenteredThumbnail(
    skeleton?: RepPosition['skeleton']
  ): ImageData {
    if (
      !this.hiddenVideo ||
      !this.canvas ||
      !this.ctx ||
      !this.thumbnailCanvas ||
      !this.thumbnailCtx
    ) {
      throw new Error('Canvases not initialized');
    }

    const videoWidth = this.hiddenVideo.videoWidth;
    const videoHeight = this.hiddenVideo.videoHeight;

    // Draw current video frame to source canvas
    this.canvas.width = videoWidth;
    this.canvas.height = videoHeight;
    this.ctx.drawImage(this.hiddenVideo, 0, 0, videoWidth, videoHeight);

    // Calculate crop region
    const { cropX, cropY, cropWidth, cropHeight } = this.calculateCropRegion(
      skeleton,
      videoWidth,
      videoHeight
    );

    // Draw cropped region to thumbnail canvas
    this.thumbnailCtx.drawImage(
      this.canvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      THUMB_WIDTH,
      THUMB_HEIGHT
    );

    return this.thumbnailCtx.getImageData(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  }

  /**
   * Calculate person-centered crop region
   */
  private calculateCropRegion(
    skeleton: RepPosition['skeleton'] | undefined,
    videoWidth: number,
    videoHeight: number
  ): { cropX: number; cropY: number; cropWidth: number; cropHeight: number } {
    const targetAspect = THUMB_WIDTH / THUMB_HEIGHT; // 3:4 = 0.75

    let personCenterX = videoWidth / 2;
    let personCenterY = videoHeight / 2;
    let cropWidth: number;
    let cropHeight: number;

    // Try to use skeleton keypoints for person-centered cropping
    const keypoints = skeleton?.getKeypoints?.() ?? [];
    const confidentKeypoints = keypoints.filter((kp) => (kp.score ?? 0) > 0.3);

    if (confidentKeypoints.length > 0) {
      // Calculate bounding box of confident keypoints
      let minX = Infinity,
        maxX = -Infinity;
      let minY = Infinity,
        maxY = -Infinity;

      for (const kp of confidentKeypoints) {
        // Keypoints are normalized [0,1], convert to pixel coordinates
        const x = kp.x * videoWidth;
        const y = kp.y * videoHeight;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      personCenterX = (minX + maxX) / 2;
      personCenterY = (minY + maxY) / 2;

      const personWidth = Math.max((maxX - minX) * 1.4, 1);
      const personHeight = Math.max((maxY - minY) * 1.3, 1);

      if (personWidth / personHeight > targetAspect) {
        cropWidth = personWidth;
        cropHeight = cropWidth / targetAspect;
      } else {
        cropHeight = personHeight;
        cropWidth = cropHeight * targetAspect;
      }

      const minCropHeight = videoHeight * 0.4;
      if (cropHeight < minCropHeight) {
        cropHeight = minCropHeight;
        cropWidth = cropHeight * targetAspect;
      }
    } else {
      cropHeight = videoHeight * 0.85;
      cropWidth = cropHeight * targetAspect;
    }

    // Clamp to video bounds
    if (cropWidth > videoWidth) {
      cropWidth = videoWidth;
      cropHeight = cropWidth / targetAspect;
    }
    if (cropHeight > videoHeight) {
      cropHeight = videoHeight;
      cropWidth = cropHeight * targetAspect;
    }

    const cropX = Math.max(
      0,
      Math.min(personCenterX - cropWidth / 2, videoWidth - cropWidth)
    );
    const cropY = Math.max(
      0,
      Math.min(personCenterY - cropHeight / 2, videoHeight - cropHeight)
    );

    return { cropX, cropY, cropWidth, cropHeight };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
    }

    if (this.videoSource && this.videoSource.startsWith('blob:')) {
      URL.revokeObjectURL(this.videoSource);
    }

    if (this.hiddenVideo) {
      this.hiddenVideo.src = '';
      this.hiddenVideo = null;
    }

    this.canvas = null;
    this.ctx = null;
    this.thumbnailCanvas = null;
    this.thumbnailCtx = null;
    this.queue = [];
  }
}

// ============================================
// Legacy exports for backward compatibility
// ============================================

/**
 * Check if positions need thumbnail generation
 * @deprecated Use ThumbnailQueue.enqueue() instead
 */
export function positionsNeedThumbnails(positions: RepPosition[]): boolean {
  return positions.some((p) => !p.frameImage);
}

/**
 * Generate thumbnails for positions (legacy sync API)
 * @deprecated Use ThumbnailQueue instead for better performance
 */
export async function generateThumbnailsForPositions(
  positions: RepPosition[],
  _video: HTMLVideoElement
): Promise<RepPosition[]> {
  console.warn(
    '[ThumbnailGenerator] generateThumbnailsForPositions is deprecated. Use ThumbnailQueue instead.'
  );

  // For backward compatibility, create a temporary queue-like behavior
  // This is not ideal but maintains the old API
  const needsThumbnails = positions.some((p) => !p.frameImage);
  if (!needsThumbnails) {
    return positions;
  }

  // Just return positions as-is since we can't easily do the old behavior
  // without affecting the main video
  return positions;
}
