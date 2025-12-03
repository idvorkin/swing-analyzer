/**
 * LivePoseCache
 *
 * A streaming cache for pose data that supports:
 * - Progressive filling during extraction (producer)
 * - Blocking reads during playback (consumer)
 *
 * This enables the pattern where:
 * - Extraction runs at full speed in the background
 * - Playback uses cached frames, waiting if extraction hasn't caught up
 */

import { Subject, firstValueFrom } from 'rxjs';
import { filter, first, timeout } from 'rxjs/operators';
import type {
  PoseTrackFile,
  PoseTrackFrame,
  PoseTrackMetadata,
} from '../types/posetrack';

/**
 * Event emitted when a new frame is added to the cache
 */
export interface FrameCachedEvent {
  frameIndex: number;
  videoTime: number;
}

/**
 * Options for waiting on a frame
 */
export interface WaitForFrameOptions {
  /** Timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
}

/**
 * A live, streaming cache for pose frames
 */
export class LivePoseCache {
  private frames: Map<number, PoseTrackFrame> = new Map();
  private sortedVideoTimes: number[] = [];
  private metadata: Partial<PoseTrackMetadata> = {};
  private frameAdded$ = new Subject<FrameCachedEvent>();
  private isComplete = false;
  private videoHash: string | null = null;

  constructor(videoHash?: string) {
    this.videoHash = videoHash ?? null;
  }

  /**
   * Add a frame to the cache (called by extraction)
   */
  addFrame(frame: PoseTrackFrame): void {
    // Round video time for consistent lookup
    const roundedTime = Math.round(frame.videoTime * 1000) / 1000;

    // Store the frame
    this.frames.set(roundedTime, frame);

    // Maintain sorted times for binary search
    this.insertSorted(roundedTime);

    // Emit event for any waiters
    this.frameAdded$.next({
      frameIndex: frame.frameIndex,
      videoTime: roundedTime,
    });
  }

  /**
   * Mark extraction as complete
   */
  markComplete(metadata?: Partial<PoseTrackMetadata>): void {
    this.isComplete = true;
    if (metadata) {
      this.metadata = { ...this.metadata, ...metadata };
    }
    // Complete the Subject to allow any waiters to clean up
    this.frameAdded$.complete();
  }

  /**
   * Check if extraction is complete
   */
  isExtractionComplete(): boolean {
    return this.isComplete;
  }

  /**
   * Get a frame by video time (non-blocking)
   * Returns null if frame not available or outside tolerance
   *
   * @param videoTime - The video time to look up
   * @param tolerance - Optional max time difference in seconds (default: unlimited)
   */
  getFrame(videoTime: number, tolerance?: number): PoseTrackFrame | null {
    const roundedTime = Math.round(videoTime * 1000) / 1000;

    // Try exact match first
    const exactMatch = this.frames.get(roundedTime);
    if (exactMatch) {
      return exactMatch;
    }

    // Find closest frame
    const closestTime = this.findClosestTime(roundedTime);
    if (closestTime !== null) {
      // Check if within tolerance
      if (
        tolerance !== undefined &&
        Math.abs(closestTime - roundedTime) > tolerance
      ) {
        return null; // Closest frame is too far away
      }
      return this.frames.get(closestTime) ?? null;
    }

    return null;
  }

  /**
   * Wait for a frame to become available (blocking)
   * Returns the frame once available, or throws on timeout
   */
  async waitForFrame(
    videoTime: number,
    options: WaitForFrameOptions = {}
  ): Promise<PoseTrackFrame> {
    const { timeoutMs = 5000 } = options;
    const roundedTime = Math.round(videoTime * 1000) / 1000;

    // Check if already available
    const existing = this.getFrame(roundedTime);
    if (existing) {
      return existing;
    }

    // If extraction is complete and frame not found, it doesn't exist
    if (this.isComplete) {
      throw new Error(
        `Frame at ${videoTime}s not found and extraction is complete`
      );
    }

    // Wait for a frame close to the requested time
    try {
      await firstValueFrom(
        this.frameAdded$.pipe(
          filter((event) => {
            // Accept frame if it's close enough to requested time
            const diff = Math.abs(event.videoTime - roundedTime);
            return diff < 0.05; // Within 50ms
          }),
          first(),
          timeout(timeoutMs)
        )
      );

      // Frame should now be available
      const frame = this.getFrame(roundedTime);
      if (frame) {
        return frame;
      }

      throw new Error(`Frame at ${videoTime}s still not available after wait`);
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') {
        throw new Error(
          `Timeout waiting for frame at ${videoTime}s (extraction may be slow)`
        );
      }
      throw error;
    }
  }

  /**
   * Check if a frame exists for the given video time
   */
  hasFrame(videoTime: number): boolean {
    return this.getFrame(videoTime) !== null;
  }

  /**
   * Get the number of cached frames
   */
  getFrameCount(): number {
    return this.frames.size;
  }

  /**
   * Get all cached frames sorted by frame index
   * Useful for batch analysis during extraction
   */
  getAllFrames(): PoseTrackFrame[] {
    return Array.from(this.frames.values()).sort(
      (a, b) => a.frameIndex - b.frameIndex
    );
  }

  /**
   * Get the video hash this cache is for
   */
  getVideoHash(): string | null {
    return this.videoHash;
  }

  /**
   * Set metadata (called during/after extraction)
   */
  setMetadata(metadata: Partial<PoseTrackMetadata>): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  /**
   * Get current metadata
   */
  getMetadata(): Partial<PoseTrackMetadata> {
    return this.metadata;
  }

  /**
   * Convert to static PoseTrackFile (for saving to IndexedDB)
   */
  toPoseTrackFile(): PoseTrackFile | null {
    if (this.frames.size === 0) {
      return null;
    }

    // Sort frames by frame index
    const sortedFrames = Array.from(this.frames.values()).sort(
      (a, b) => a.frameIndex - b.frameIndex
    );

    return {
      metadata: {
        version: '1.0',
        model: this.metadata.model ?? 'movenet-lightning',
        modelVersion: this.metadata.modelVersion ?? '1.0.0',
        sourceVideoHash: this.videoHash ?? '',
        sourceVideoName: this.metadata.sourceVideoName,
        sourceVideoDuration: this.metadata.sourceVideoDuration ?? 0,
        extractedAt: this.metadata.extractedAt ?? new Date().toISOString(),
        frameCount: sortedFrames.length,
        fps: this.metadata.fps ?? 30,
        videoWidth: this.metadata.videoWidth ?? 0,
        videoHeight: this.metadata.videoHeight ?? 0,
      },
      frames: sortedFrames,
    };
  }

  /**
   * Load from a static PoseTrackFile (for pre-seeded data)
   */
  static fromPoseTrackFile(poseTrack: PoseTrackFile): LivePoseCache {
    const cache = new LivePoseCache(poseTrack.metadata.sourceVideoHash);
    cache.setMetadata(poseTrack.metadata);

    for (const frame of poseTrack.frames) {
      cache.addFrame(frame);
    }

    cache.markComplete(poseTrack.metadata);
    return cache;
  }

  /**
   * Clear all cached frames
   */
  clear(): void {
    this.frames.clear();
    this.sortedVideoTimes = [];
    this.isComplete = false;
  }

  /**
   * Subscribe to frame additions
   */
  onFrameAdded(callback: (event: FrameCachedEvent) => void): () => void {
    const subscription = this.frameAdded$.subscribe(callback);
    return () => subscription.unsubscribe();
  }

  /**
   * Insert time into sorted array maintaining order
   */
  private insertSorted(time: number): void {
    // Binary search for insertion point
    let left = 0;
    let right = this.sortedVideoTimes.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.sortedVideoTimes[mid] < time) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Insert at found position (avoid duplicates)
    if (this.sortedVideoTimes[left] !== time) {
      this.sortedVideoTimes.splice(left, 0, time);
    }
  }

  /**
   * Find the closest cached video time using binary search
   */
  private findClosestTime(targetTime: number): number | null {
    const times = this.sortedVideoTimes;
    if (times.length === 0) return null;

    // Handle edge cases
    if (targetTime <= times[0]) return times[0];
    if (targetTime >= times[times.length - 1]) return times[times.length - 1];

    // Binary search
    let left = 0;
    let right = times.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      if (times[mid] === targetTime) {
        return times[mid];
      }

      if (times[mid] < targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Return the closest of the two candidates
    const leftDiff = Math.abs(times[left] - targetTime);
    const rightDiff = Math.abs(times[right] - targetTime);

    return leftDiff < rightDiff ? times[left] : times[right];
  }
}
