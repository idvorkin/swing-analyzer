/**
 * VideoFileSkeletonSource - Skeleton detection from video files
 *
 * Handles the complete video file workflow:
 * 1. Check cache for existing pose data
 * 2. If not cached, extract poses (streaming each frame as it's ready)
 * 3. Provide fast cache lookup for playback/seeking
 *
 * The key insight is that extraction and playback use different paths:
 * - Extraction: ML inference → cache + stream to subscribers
 * - Playback: cache lookup → instant skeleton (no ML)
 */

import { BehaviorSubject, type Observable, Subject } from 'rxjs';
import { extractPosesFromVideo } from '../services/PoseExtractor';
import {
  loadPoseTrackFromStorage,
  savePoseTrackToStorage,
} from '../services/PoseTrackService';
import { recordCacheLoad } from '../services/SessionRecorder';
import type {
  PoseModel,
  PoseTrackFile,
  PoseTrackFrame,
} from '../types/posetrack';
import { computeQuickVideoHash } from '../utils/videoHash';
import { LivePoseCache } from './LivePoseCache';
import { buildSkeletonEventFromFrame } from './PipelineFactory';
import type { SkeletonEvent } from './PipelineInterfaces';
import type {
  SkeletonSource,
  SkeletonSourceState,
  VideoFileSourceConfig,
} from './SkeletonSource';

/**
 * Skeleton source for video files with caching support
 */
export class VideoFileSkeletonSource implements SkeletonSource {
  readonly type = 'video-file' as const;

  private readonly stateSubject: BehaviorSubject<SkeletonSourceState>;
  private readonly skeletonSubject = new Subject<SkeletonEvent>();
  private readonly stop$ = new Subject<void>();

  private liveCache: LivePoseCache | null = null;
  private poseTrack: PoseTrackFile | null = null;
  private videoHash: string | null = null;
  private abortController: AbortController | null = null;

  private readonly videoFile: File;
  private readonly autoExtract: boolean;
  private readonly model: PoseModel;

  constructor(config: VideoFileSourceConfig) {
    this.videoFile = config.videoFile;
    // Note: videoElement and canvasElement from config are not used here
    // because extraction creates its own hidden video element.
    // They're kept in the config interface for API consistency with CameraSkeletonSource.
    this.autoExtract = config.autoExtract ?? true;
    this.model = config.model ?? 'blazepose';
    this.stateSubject = new BehaviorSubject<SkeletonSourceState>({
      type: 'idle',
    });
  }

  get state(): SkeletonSourceState {
    return this.stateSubject.getValue();
  }

  get state$(): Observable<SkeletonSourceState> {
    return this.stateSubject.asObservable();
  }

  get skeletons$(): Observable<SkeletonEvent> {
    return this.skeletonSubject.asObservable();
  }

  /**
   * Get the live cache (for pipeline integration during extraction)
   */
  getLiveCache(): LivePoseCache | null {
    return this.liveCache;
  }

  /**
   * Get the final pose track (after extraction or from cache)
   */
  getPoseTrack(): PoseTrackFile | null {
    return this.poseTrack;
  }

  /**
   * Get the video hash
   */
  getVideoHash(): string | null {
    return this.videoHash;
  }

  /**
   * Start the source - check cache, then extract if needed
   * @param signal - Optional AbortSignal to cancel the operation
   */
  async start(signal?: AbortSignal): Promise<void> {
    // Clean up any previous session
    this.stop();

    // Check if already aborted
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    this.stateSubject.next({ type: 'starting' });

    try {
      // Compute video hash
      this.videoHash = await computeQuickVideoHash(this.videoFile);

      // Check if aborted after hash computation
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Check cache first
      this.stateSubject.next({ type: 'checking-cache' });
      const cached = await loadPoseTrackFromStorage(this.videoHash);

      // Check if aborted after cache lookup
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (cached) {
        // Use cached data
        this.poseTrack = cached;
        this.liveCache = LivePoseCache.fromPoseTrackFile(cached);
        this.stateSubject.next({ type: 'active' });

        // Record cache load for session debugging
        recordCacheLoad({
          frameCount: cached.frames.length,
          videoHash: this.videoHash!,
          videoDuration: cached.metadata.sourceVideoDuration,
        });

        // Emit all cached skeletons for initial pipeline processing
        // This allows the pipeline to count reps from cached data
        // Use setTimeout(0) to ensure all subscribers are set up before we emit
        console.log(
          '[VideoFileSkeletonSource] Scheduling emission of',
          cached.frames.length,
          'cached skeleton events'
        );
        setTimeout(() => {
          const startTime = performance.now();
          console.log(
            '[VideoFileSkeletonSource] Emitting',
            cached.frames.length,
            'cached skeleton events'
          );
          let emitCount = 0;
          for (const frame of cached.frames) {
            const skeletonEvent = buildSkeletonEventFromFrame(frame);
            this.skeletonSubject.next(skeletonEvent);
            emitCount++;
          }
          const processingTime = performance.now() - startTime;
          console.log(
            '[VideoFileSkeletonSource] Done emitting',
            emitCount,
            'cached skeleton events in',
            processingTime.toFixed(0),
            'ms'
          );

          // Emit completion event after all skeletons processed
          // This is a signal that batch processing is done
          this.stateSubject.next({
            type: 'active',
            batchComplete: true,
            framesProcessed: emitCount,
            processingTimeMs: processingTime,
          } as SkeletonSourceState);
        }, 0);

        return;
      }

      // No cache - extract if auto-extract enabled
      if (!this.autoExtract) {
        this.stateSubject.next({ type: 'idle' });
        return;
      }

      // Start extraction (pass signal to allow cancellation)
      await this.extract(signal);
    } catch (error) {
      // Re-throw abort errors without logging as error
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.stateSubject.next({ type: 'idle' });
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to process video';
      this.stateSubject.next({ type: 'error', message });
      throw error;
    }
  }

  /**
   * Stop extraction if in progress
   */
  stop(): void {
    // Signal stop
    this.stop$.next();

    // Abort extraction
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Clear live cache if extraction was in progress
    if (this.liveCache && !this.liveCache.isExtractionComplete()) {
      this.liveCache.abort();
      this.liveCache = null;
    }

    this.stateSubject.next({ type: 'idle' });
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.stop();

    if (this.liveCache) {
      this.liveCache.clear();
      this.liveCache = null;
    }

    this.poseTrack = null;
    this.videoHash = null;

    this.stateSubject.complete();
    this.skeletonSubject.complete();
    this.stop$.complete();
  }

  /**
   * Get skeleton at a specific video time (for seeking/stepping)
   * Returns cached skeleton if available, null otherwise
   */
  getSkeletonAtTime(videoTime: number): SkeletonEvent | null {
    if (!this.liveCache) {
      return null;
    }

    const frame = this.liveCache.getFrame(videoTime);
    if (!frame) {
      return null;
    }

    return buildSkeletonEventFromFrame(frame);
  }

  /**
   * Check if skeleton is available at time
   */
  hasSkeletonAtTime(videoTime: number): boolean {
    return this.liveCache?.hasFrame(videoTime) ?? false;
  }

  /**
   * Save the current pose track to storage
   */
  async save(): Promise<void> {
    if (!this.poseTrack) {
      throw new Error('No pose track to save');
    }
    await savePoseTrackToStorage(this.poseTrack);
  }

  /**
   * Run extraction, streaming frames as they're processed
   * @param externalSignal - Optional external AbortSignal to link to
   */
  private async extract(externalSignal?: AbortSignal): Promise<void> {
    if (!this.videoHash) {
      throw new Error('Video hash not computed');
    }

    // Create abort controller for cancellation
    this.abortController = new AbortController();

    // Link external signal to our internal abort controller
    if (externalSignal) {
      if (externalSignal.aborted) {
        this.abortController.abort();
      } else {
        // Use { once: true } to auto-remove listener after first invocation
        // This prevents memory leaks if extraction completes before signal aborts
        externalSignal.addEventListener(
          'abort',
          () => {
            this.abortController?.abort();
          },
          { once: true }
        );
      }
    }

    // Create live cache for streaming
    this.liveCache = new LivePoseCache(this.videoHash);

    // Initial progress state
    this.stateSubject.next({
      type: 'extracting',
      progress: {
        currentFrame: 0,
        totalFrames: 0,
        percentage: 0,
        currentTime: 0,
        totalDuration: 0,
      },
    });

    try {
      const result = await extractPosesFromVideo(this.videoFile, {
        model: this.model,
        precomputeAngles: true,
        signal: this.abortController.signal,
        onProgress: (progress) => {
          this.stateSubject.next({
            type: 'extracting',
            progress: {
              currentFrame: progress.currentFrame,
              totalFrames: progress.totalFrames,
              percentage: progress.percentage,
              currentTime: progress.currentTime,
              totalDuration: progress.totalDuration,
            },
          });
        },
        onFrameExtracted: (frame: PoseTrackFrame) => {
          // Add to cache
          this.liveCache?.addFrame(frame);

          // Stream to subscribers immediately
          const skeletonEvent = buildSkeletonEventFromFrame(frame);
          this.skeletonSubject.next(skeletonEvent);
        },
      });

      // Mark cache complete
      this.liveCache.markComplete(result.poseTrack.metadata);

      // Store final pose track
      this.poseTrack = result.poseTrack;

      // Auto-save to storage
      await savePoseTrackToStorage(result.poseTrack);

      this.stateSubject.next({ type: 'active' });
    } catch (error) {
      // Clean up on error
      if (this.liveCache) {
        this.liveCache.abort();
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        // Cancelled - not an error
        this.stateSubject.next({ type: 'idle' });
      } else {
        throw error;
      }
    } finally {
      this.abortController = null;
    }
  }
}
