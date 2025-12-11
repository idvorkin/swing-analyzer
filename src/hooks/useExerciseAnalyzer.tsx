/**
 * useExerciseAnalyzer - Main hook for exercise form analysis
 *
 * Supports multiple exercise types (kettlebell swings, pistol squats, etc.)
 * using the unified InputSession state machine for managing video input.
 *
 * Key features:
 * 1. Single source of truth for input state (InputSession)
 * 2. Cache lookup for frame stepping (no redundant ML inference)
 * 3. Streaming during extraction (reps update live)
 * 4. Cleaner state management (explicit state machine)
 * 5. Auto-detection of exercise type from movement patterns
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectedExercise } from '../analyzers';
import { PHASE_ORDER } from '../components/repGalleryConstants';
import {
  DEFAULT_SAMPLE_VIDEO,
  LOCAL_PISTOL_SQUAT_VIDEO,
  LOCAL_SAMPLE_VIDEO,
  PISTOL_SQUAT_SAMPLE_VIDEO,
} from '../config/sampleVideos';
import type { Skeleton } from '../models/Skeleton';
import { InputSession, type InputSessionState } from '../pipeline/InputSession';
import type { Pipeline, ThumbnailEvent } from '../pipeline/Pipeline';
import { createPipeline } from '../pipeline/PipelineFactory';
import type { SkeletonEvent } from '../pipeline/PipelineInterfaces';
import type { ExtractionProgress } from '../pipeline/SkeletonSource';
import {
  recordExtractionComplete,
  recordExtractionStart,
  recordPlaybackPause,
  recordPlaybackStart,
  recordRepDetected,
  recordSkeletonProcessingComplete,
  recordVideoLoad,
  sessionRecorder,
} from '../services/SessionRecorder';
import type { AppState } from '../types';
import type { PositionCandidate } from '../types/exercise';
import type { CropRegion } from '../types/posetrack';
import {
  buildCheckpointList,
  findNextCheckpoint,
  findPreviousCheckpoint,
} from '../utils/checkpointUtils';
import { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';
import { useKeyboardNavigation } from './useKeyboardNavigation';

// Throttle interval for rep/position sync during playback (see ARCHITECTURE.md "Throttled Playback Sync")
const REP_SYNC_INTERVAL_MS = 1000; // 1 second

// Default phases (swing) - used when resetting before exercise detection runs
const DEFAULT_PHASES = [...PHASE_ORDER];

// Sample video configuration for DRY loading
interface SampleVideoConfig {
  name: string; // Display name for UI (e.g., "Kettlebell Swing")
  fileName: string; // File name for the File object (e.g., "swing-sample.webm")
  remoteUrl: string; // Primary remote URL
  localFallback: string; // Local fallback URL
}

const SAMPLE_VIDEOS: Record<string, SampleVideoConfig> = {
  swing: {
    name: 'Kettlebell Swing',
    fileName: 'swing-sample.webm',
    remoteUrl: DEFAULT_SAMPLE_VIDEO,
    localFallback: LOCAL_SAMPLE_VIDEO,
  },
  pistol: {
    name: 'Pistol Squat',
    fileName: 'pistol-squat-sample.webm',
    remoteUrl: PISTOL_SQUAT_SAMPLE_VIDEO,
    localFallback: LOCAL_PISTOL_SQUAT_VIDEO,
  },
};

/**
 * Convert error to user-friendly message for video loading failures.
 */
function getVideoLoadErrorMessage(error: unknown, context: string): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'Storage full. Clear browser data and try again.';
  }
  if (error instanceof Error) {
    if (error.message.includes('Timeout')) {
      return 'Video load timed out. Check your network and try again.';
    }
    if (error.message.includes('fetch') || error.message.includes('Network')) {
      return 'Network error loading video. Check your connection.';
    }
    if (error.message.includes('model')) {
      return 'Failed to load pose detection. Check network and refresh.';
    }
    if (
      error.message.includes('format') ||
      error.message.includes('supported')
    ) {
      return 'Video format not supported by your browser.';
    }
  }
  return `Could not load ${context}`;
}

// Helper for consistent position display (e.g., "top" → "Top")
const formatPositionForDisplay = (position: string): string =>
  position.charAt(0).toUpperCase() + position.slice(1).toLowerCase();

/**
 * Fetch a video with download progress reporting.
 * Returns the blob and reports progress via callback.
 */
async function fetchWithProgress(
  url: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  const contentLength = response.headers.get('content-length');
  if (!contentLength || !response.body) {
    // No content-length header or no body - fall back to regular blob()
    return response.blob();
  }

  const total = parseInt(contentLength, 10);
  let loaded = 0;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    loaded += value.length;
    onProgress(Math.round((loaded / total) * 100));
  }

  return new Blob(chunks as BlobPart[], {
    type: response.headers.get('content-type') || 'video/webm',
  });
}

export function useExerciseAnalyzer(initialState?: Partial<AppState>) {
  // ========================================
  // Core State
  // ========================================
  const [appState, setAppState] = useState<AppState>({
    displayMode: 'both',
    isModelLoaded: false,
    isProcessing: false,
    repCounter: {
      count: 0,
      isConnect: false,
      lastConnectState: false,
      connectThreshold: 45,
    },
    showBodyParts: true,
    bodyPartDisplayTime: 0.5,
    currentRepIndex: 0,
    ...initialState,
  });

  // UI state
  const [status, setStatus] = useState<string>('Loading...');
  const [repCount, setRepCount] = useState<number>(0);
  const [spineAngle, setSpineAngle] = useState<number>(0);
  const [armToSpineAngle, setArmToSpineAngle] = useState<number>(0);
  const [repThumbnails, setRepThumbnails] = useState<
    Map<number, Map<string, PositionCandidate>>
  >(new Map());
  const [extractionProgress, setExtractionProgress] =
    useState<ExtractionProgress | null>(null);
  const [inputState, setInputState] = useState<InputSessionState>({
    type: 'idle',
  });
  const [hasPosesForCurrentFrame, setHasPosesForCurrentFrame] =
    useState<boolean>(false);
  const [currentPosition, setCurrentPosition] = useState<string | null>(null);

  // Exercise detection state
  const [detectedExercise, setDetectedExercise] =
    useState<DetectedExercise>('unknown');
  const [detectionConfidence, setDetectionConfidence] = useState<number>(0);
  const [isDetectionLocked, setIsDetectionLocked] = useState<boolean>(false);
  const [currentPhases, setCurrentPhases] = useState<string[]>(DEFAULT_PHASES);
  const [workingLeg, setWorkingLeg] = useState<'left' | 'right' | null>(null);

  // Track if we've recorded extraction start for current session (to avoid spam)
  const hasRecordedExtractionStartRef = useRef<boolean>(false);

  // Refs for elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core refs
  const inputSessionRef = useRef<InputSession | null>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const skeletonRendererRef = useRef<SkeletonRenderer | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);

  // Track current video's object URL for cleanup on video switch
  const currentVideoUrlRef = useRef<string | null>(null);

  // Media dialog loading state
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(false);
  const [videoLoadProgress, setVideoLoadProgress] = useState<
    number | undefined
  >(undefined);
  const [videoLoadMessage, setVideoLoadMessage] = useState<string>('');
  // Track if we're in the middle of loading a video (to abort on switch)
  const videoLoadAbortControllerRef = useRef<AbortController | null>(null);

  // Track if cache is being processed (between 'active' state and 'batchComplete')
  const [isCacheProcessing, setIsCacheProcessing] = useState<boolean>(false);

  // Throttle for rep/position sync during playback (see ARCHITECTURE.md "Throttled Playback Sync")
  const lastRepSyncTimeRef = useRef<number>(0);
  // Ref to hold the rep sync handler (enables stable reference from event handlers)
  const repSyncHandlerRef = useRef<((videoTime: number) => void) | null>(null);

  // Crop state for auto-centering on person in landscape videos
  const [cropRegion, setCropRegionState] = useState<CropRegion | null>(null);
  const [isCropEnabled, setIsCropEnabled] = useState<boolean>(false); // Default to off - doesn't work well

  // ========================================
  // Canvas Sync (for skeleton alignment)
  // ========================================
  // Syncs canvas position/size to match video's rendered area
  // Required because canvas doesn't support object-fit: contain
  const syncCanvasToVideo = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;

    // Set canvas internal dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Get video and container positions
    const videoRect = video.getBoundingClientRect();
    const container = canvas.parentElement;
    const containerRect = container?.getBoundingClientRect();

    // Calculate video element's position relative to container
    // (needed when flexbox centers video within container)
    const videoOffsetX = containerRect
      ? videoRect.left - containerRect.left
      : 0;
    const videoOffsetY = containerRect ? videoRect.top - containerRect.top : 0;

    // Calculate video content's rendered dimensions within video element
    // (object-fit: contain causes letterboxing)
    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = videoRect.width / videoRect.height;

    let renderedWidth: number;
    let renderedHeight: number;
    let letterboxX: number;
    let letterboxY: number;

    if (videoAspect > containerAspect) {
      // Video is wider - letterbox top/bottom
      renderedWidth = videoRect.width;
      renderedHeight = videoRect.width / videoAspect;
      letterboxX = 0;
      letterboxY = (videoRect.height - renderedHeight) / 2;
    } else {
      // Video is taller - letterbox left/right
      renderedHeight = videoRect.height;
      renderedWidth = videoRect.height * videoAspect;
      letterboxX = (videoRect.width - renderedWidth) / 2;
      letterboxY = 0;
    }

    // Position canvas: video's position in container + letterbox offset
    const finalX = videoOffsetX + letterboxX;
    const finalY = videoOffsetY + letterboxY;

    canvas.style.width = `${renderedWidth}px`;
    canvas.style.height = `${renderedHeight}px`;
    canvas.style.left = `${finalX}px`;
    canvas.style.top = `${finalY}px`;

    console.log(
      `[Canvas] Synced: ${canvas.width}x${canvas.height}, CSS: ${renderedWidth.toFixed(0)}x${renderedHeight.toFixed(0)} at (${finalX.toFixed(0)},${finalY.toFixed(0)}) [video offset: ${videoOffsetX.toFixed(0)},${videoOffsetY.toFixed(0)}]`
    );
  }, []);

  // Re-sync canvas on window resize
  useEffect(() => {
    const handleResize = () => {
      requestAnimationFrame(() => syncCanvasToVideo());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [syncCanvasToVideo]);

  // Cleanup Object URL and abort controller on unmount
  useEffect(() => {
    return () => {
      // Revoke any remaining blob URL to prevent memory leak
      if (currentVideoUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(currentVideoUrlRef.current);
      }
      // Abort any in-flight video load
      videoLoadAbortControllerRef.current?.abort();
    };
  }, []);

  // ========================================
  // Safe Video Loading Helper
  // ========================================
  // Handles all cleanup and race conditions when switching videos
  const loadVideoSafely = useCallback(
    async (
      videoElement: HTMLVideoElement,
      url: string,
      signal: AbortSignal
    ): Promise<void> => {
      // 1. Pause any current playback
      videoElement.pause();
      videoElement.currentTime = 0;

      // 2. Clean up previous object URL if it was a blob URL
      if (currentVideoUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(currentVideoUrlRef.current);
      }

      // 3. Set new source and track it
      currentVideoUrlRef.current = url;
      videoElement.src = url;

      // 4. Wait for metadata with proper event handling (no property assignment)
      await new Promise<void>((resolve, reject) => {
        // Check if aborted before we even start
        if (signal.aborted) {
          reject(new DOMException('Video load aborted', 'AbortError'));
          return;
        }

        const timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Timeout loading video metadata'));
        }, 10000);

        const cleanup = () => {
          clearTimeout(timeoutId);
          videoElement.removeEventListener(
            'loadedmetadata',
            handleLoadedMetadata
          );
          videoElement.removeEventListener('error', handleError);
          signal.removeEventListener('abort', handleAbort);
        };

        const handleLoadedMetadata = () => {
          cleanup();
          // Sync canvas to video after a small delay (wait for layout)
          requestAnimationFrame(() => syncCanvasToVideo());
          resolve();
        };

        const handleError = () => {
          cleanup();
          const mediaError = videoElement.error;
          let message = 'Failed to load video';
          if (mediaError) {
            switch (mediaError.code) {
              case MediaError.MEDIA_ERR_ABORTED:
                message = 'Video load was aborted';
                break;
              case MediaError.MEDIA_ERR_NETWORK:
                message = 'Network error loading video';
                break;
              case MediaError.MEDIA_ERR_DECODE:
                message = 'Video format could not be decoded';
                break;
              case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                message = 'Video format not supported';
                break;
            }
          }
          reject(new Error(message));
        };

        const handleAbort = () => {
          cleanup();
          reject(new DOMException('Video load aborted', 'AbortError'));
        };

        // Use addEventListener (not property assignment) to avoid race conditions
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata, {
          once: true,
        });
        videoElement.addEventListener('error', handleError, { once: true });
        signal.addEventListener('abort', handleAbort, { once: true });
      });
    },
    [syncCanvasToVideo]
  );

  // ========================================
  // Pipeline Setup
  // ========================================
  const initializePipeline = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;

    const pipeline = createPipeline(videoRef.current, canvasRef.current);

    // Subscribe to thumbnail events
    // Convert RepPosition[] to Map<string, PositionCandidate> for UI compatibility
    pipeline.getThumbnailEvents().subscribe({
      next: (event: ThumbnailEvent) => {
        setRepThumbnails((prev) => {
          const updated = new Map(prev);
          // Convert RepPosition[] to Map<string, PositionCandidate>
          const positionMap = new Map<string, PositionCandidate>();
          for (const pos of event.positions) {
            positionMap.set(pos.name, {
              position: pos.name,
              timestamp: pos.timestamp,
              videoTime: pos.videoTime,
              angles: pos.angles,
              score: pos.score,
              frameImage: pos.frameImage,
            });
          }
          updated.set(event.repNumber, positionMap);
          return updated;
        });
      },
      error: (error) => {
        console.error('Error in thumbnail subscription:', error);
      },
    });

    return pipeline;
  }, []);

  // Initialize skeleton renderer
  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new SkeletonRenderer(canvasRef.current);
    skeletonRendererRef.current = renderer;

    return () => {
      // Cleanup renderer if needed
    };
  }, []);

  // ========================================
  // HUD Update Helper
  // ========================================
  // Updates HUD display from a skeleton (called during playback and seek)
  const updateHudFromSkeleton = useCallback((skeleton: Skeleton) => {
    setSpineAngle(Math.round(skeleton.getSpineAngle() || 0));
    setArmToSpineAngle(Math.round(skeleton.getArmToVerticalAngle() || 0));

    // Estimate position from spine angle (stateless, for HUD display during seek)
    // Position thresholds based on spine angle:
    //   top: ~10° (upright), connect: ~45°, release: ~37°, bottom: ~75° (hinged)
    const spine = skeleton.getSpineAngle() || 0;
    let position: string | null = null;

    if (spine < 25) {
      position = 'Top';
    } else if (spine >= 25 && spine < 41) {
      position = 'Release'; // ~37° ideal
    } else if (spine >= 41 && spine < 60) {
      position = 'Connect'; // ~45° ideal
    } else if (spine >= 60) {
      position = 'Bottom'; // ~75° ideal
    }

    if (position) {
      setStatus(position);
    }
  }, []);

  // ========================================
  // Skeleton Event Handler
  // ========================================
  // Use a ref to hold the handler so video events can access it stably
  const skeletonHandlerRef = useRef<((event: SkeletonEvent) => void) | null>(
    null
  );

  // Track previous rep count for detecting new reps
  const prevRepCountRef = useRef<number>(0);
  // Track frame index for debugging
  const frameIndexRef = useRef<number>(0);

  // Process a skeleton event through the pipeline and update UI
  const processSkeletonEvent = useCallback((event: SkeletonEvent) => {
    if (!event.skeleton) {
      return;
    }

    const pipeline = pipelineRef.current;
    if (!pipeline) {
      return;
    }

    // Process through pipeline (updates rep count, form state, etc.)
    const result = pipeline.processSkeletonEvent(event);

    // Increment frame counter
    frameIndexRef.current++;
    const frameIndex = frameIndexRef.current;

    // Record rep detection event when rep count increases
    if (result > prevRepCountRef.current) {
      const skeleton = event.skeleton;
      const formAnalyzer = pipeline.getFormAnalyzer();
      // Algorithm always uses right arm - for left-handed users, mirror input data
      recordRepDetected(result, {
        frameIndex,
        videoTime: event.poseEvent.frameEvent.videoTime,
        angles: {
          spine: skeleton.getSpineAngle(),
          arm: skeleton.getArmToSpineAngle(),
          armToVertical: skeleton.getArmToVerticalAngle('right'),
          hip: skeleton.getHipAngle(),
        },
        phase: formAnalyzer.getPhase(),
      });
      prevRepCountRef.current = result;
    }

    // Debug: log every 100 frames and on rep changes
    if (
      event.poseEvent.frameEvent.videoTime !== undefined &&
      Math.floor(event.poseEvent.frameEvent.videoTime * 30) % 100 === 0
    ) {
      console.log(
        `[processSkeletonEvent] videoTime=${event.poseEvent.frameEvent.videoTime?.toFixed(2)}, repCount=${result}`
      );
    }

    // Update rep count (cumulative across all extracted frames)
    setRepCount(result);

    // NOTE: Do NOT update spineAngle/armToSpineAngle here!
    // This is called for every extraction frame, but the visible video isn't synced
    // to extraction. HUD angles should only reflect video.currentTime, updated via
    // updateHudFromSkeleton() during playback/seek.
  }, []);

  // ========================================
  // InputSession Setup
  // ========================================
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    // Initialize pipeline
    const pipeline = initializePipeline();
    if (!pipeline) return;
    pipelineRef.current = pipeline;

    // Create input session
    const session = new InputSession({
      videoElement: videoRef.current,
      canvasElement: canvasRef.current,
    });
    inputSessionRef.current = session;

    // Subscribe to session state
    const stateSubscription = session.state$.subscribe((state) => {
      setInputState(state);

      // Update app state based on session state
      if (state.type === 'video-file') {
        if (state.sourceState.type === 'extracting') {
          setStatus('Extracting poses...');
          // Cache wasn't found, clear the cache processing state
          setIsCacheProcessing(false);
          // Record extraction start only once per extraction session
          if (!hasRecordedExtractionStartRef.current) {
            hasRecordedExtractionStartRef.current = true;
            recordExtractionStart({ fileName: state.fileName });
          }
        } else if (state.sourceState.type === 'active') {
          setStatus('Ready');
          // Record extraction complete (only if we recorded start)
          if (hasRecordedExtractionStartRef.current) {
            recordExtractionComplete({ fileName: state.fileName });
          }
          // Record skeleton processing complete (for both extraction and cache load)
          const sourceState = state.sourceState as {
            batchComplete?: boolean;
            framesProcessed?: number;
            processingTimeMs?: number;
          };
          if (sourceState.batchComplete) {
            recordSkeletonProcessingComplete({
              framesProcessed: sourceState.framesProcessed ?? 0,
              finalRepCount: pipelineRef.current?.getRepCount() ?? 0,
              processingTimeMs: sourceState.processingTimeMs,
              totalFramesProcessed: frameIndexRef.current,
            });
            // Reset counters for next video
            prevRepCountRef.current = 0;
            frameIndexRef.current = 0;
            // Cache processing complete - clear the loading state
            setIsCacheProcessing(false);
          }
          // Check if poses exist for current frame (for HUD visibility)
          const video = videoRef.current;
          if (video) {
            const skeletonEvent = session.getSkeletonAtTime(video.currentTime);
            const hasPoses = !!skeletonEvent?.skeleton;
            setHasPosesForCurrentFrame(hasPoses);
            if (skeletonEvent?.skeleton) {
              updateHudFromSkeleton(skeletonEvent.skeleton);
              // Also render skeleton on canvas
              if (skeletonRendererRef.current) {
                skeletonRendererRef.current.renderSkeleton(
                  skeletonEvent.skeleton,
                  performance.now()
                );
              }
            }
          }
          // Check for crop region in posetrack metadata
          const videoSource = session.getVideoFileSource();
          const poseTrack = videoSource?.getPoseTrack();
          const crop = poseTrack?.metadata.cropRegion ?? null;
          setCropRegionState(crop);
          // Apply crop region to pipeline (but don't enable - user must toggle)
          if (crop && pipelineRef.current) {
            pipelineRef.current.setCropRegion(crop);
            // Don't auto-enable: pipelineRef.current.setCropEnabled(true);
          }
        } else if (state.sourceState.type === 'checking-cache') {
          setStatus('Checking cache...');
          // Mark cache processing as in progress (will be cleared when batchComplete arrives)
          setIsCacheProcessing(true);
        }
      } else if (state.type === 'error') {
        setStatus(`Error: ${state.message}`);
        setIsCacheProcessing(false); // Clear loading state on error
      } else {
        setStatus('Ready');
      }

      // Mark model as loaded once we have an active source
      if (state.type === 'video-file' && state.sourceState.type === 'active') {
        setAppState((prev) => ({ ...prev, isModelLoaded: true }));
      }
    });

    // Subscribe to skeleton events - use processSkeletonEvent via ref for stable access
    skeletonHandlerRef.current = processSkeletonEvent;
    let _skeletonEventCount = 0;
    const skeletonSubscription = session.skeletons$.subscribe((event) => {
      _skeletonEventCount++;
      // Use the ref to access the latest handler (avoids stale closure)
      skeletonHandlerRef.current?.(event);
    });

    // Subscribe to extraction progress
    const progressSubscription = session.extractionProgress$.subscribe(
      (progress) => {
        setExtractionProgress(progress);
      }
    );

    // Subscribe to exercise detection events
    const detectionSubscription = pipeline
      .getExerciseDetectionEvents()
      .subscribe({
        next: (detection) => {
          // Batch related state updates to prevent multiple re-renders
          const formAnalyzer = pipeline.getFormAnalyzer();
          const newPhases = formAnalyzer.getPhases();
          const newWorkingLeg = formAnalyzer.getWorkingLeg?.() ?? null;
          const newIsLocked = pipeline.isExerciseDetectionLocked();

          // Update all detection-related state together
          setDetectedExercise(detection.exercise);
          setDetectionConfidence(detection.confidence);
          setIsDetectionLocked(newIsLocked);
          setCurrentPhases(newPhases);
          setWorkingLeg(newWorkingLeg);
        },
        error: (error) => {
          console.error('Error in exercise detection subscription:', error);
          // Provide user feedback and set a sensible default
          setStatus('Detection error - defaulting to kettlebell swing');
          setDetectedExercise('kettlebell-swing');
          setIsDetectionLocked(true);
          setCurrentPhases(['top', 'connect', 'bottom', 'release']);
        },
      });

    // Mark as ready
    setAppState((prev) => ({ ...prev, isModelLoaded: true }));
    setStatus('Ready');

    // Set up session recorder pipeline state getter for debugging
    const video = videoRef.current;
    sessionRecorder.setPipelineStateGetter(() => {
      // Cache skeleton to avoid multiple calls that could return different results
      const skeleton = pipelineRef.current?.getLatestSkeleton();
      return {
        repCount: pipelineRef.current?.getRepCount() ?? 0,
        isPlaying: video ? !video.paused : false,
        videoTime: video?.currentTime ?? 0,
        skeletonAngles: skeleton
          ? {
              spine: skeleton.getSpineAngle(),
              arm: skeleton.getArmToSpineAngle(),
              hip: skeleton.getHipAngle(),
              knee: skeleton.getKneeAngle(),
            }
          : undefined,
      };
    });

    // Set up pose track provider for debug downloads
    sessionRecorder.setPoseTrackProvider(() => {
      const videoSource = inputSessionRef.current?.getVideoFileSource();
      return videoSource?.getPoseTrack() ?? null;
    });

    return () => {
      stateSubscription.unsubscribe();
      skeletonSubscription.unsubscribe();
      progressSubscription.unsubscribe();
      detectionSubscription.unsubscribe();
      session.dispose();
      inputSessionRef.current = null;
    };
  }, [initializePipeline, processSkeletonEvent, updateHudFromSkeleton]);

  // ========================================
  // Video Playback Handlers
  // ========================================
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      isPlayingRef.current = true;
      setIsPlaying(true);
      setAppState((prev) => ({ ...prev, isProcessing: true }));
      recordPlaybackStart({ videoTime: video.currentTime });
    };

    const handlePause = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setAppState((prev) => ({ ...prev, isProcessing: false }));
      recordPlaybackPause({ videoTime: video.currentTime });
    };

    const handleEnded = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setAppState((prev) => ({ ...prev, isProcessing: false }));
      // Don't reset rep count when video ends - just stop processing
    };

    // Per-frame skeleton rendering using requestVideoFrameCallback
    // This fires once per actual video frame, perfectly synced with display
    let videoFrameCallbackId: number | null = null;

    const renderVideoFrame: VideoFrameRequestCallback = (now, metadata) => {
      // Look up skeleton at the exact video frame time
      const session = inputSessionRef.current;
      if (session && isPlayingRef.current) {
        const skeletonEvent = session.getSkeletonAtTime(metadata.mediaTime);
        const hasPoses = !!skeletonEvent?.skeleton;
        setHasPosesForCurrentFrame(hasPoses);
        if (skeletonEvent?.skeleton) {
          // Render the skeleton
          if (skeletonRendererRef.current) {
            skeletonRendererRef.current.renderSkeleton(
              skeletonEvent.skeleton,
              now
            );
          }
          // Update HUD with current frame's data
          updateHudFromSkeleton(skeletonEvent.skeleton);
        }

        // Throttled rep/position sync (every REP_SYNC_INTERVAL_MS)
        // This updates the rep counter and position display as video plays.
        // See ARCHITECTURE.md "Throttled Playback Sync" for rationale.
        if (now - lastRepSyncTimeRef.current >= REP_SYNC_INTERVAL_MS) {
          lastRepSyncTimeRef.current = now;
          repSyncHandlerRef.current?.(metadata.mediaTime);
        }
      }

      // Request next frame callback if still playing
      if (isPlayingRef.current) {
        videoFrameCallbackId =
          video.requestVideoFrameCallback(renderVideoFrame);
      }
    };

    const startVideoFrameCallback = () => {
      if (
        videoFrameCallbackId === null &&
        'requestVideoFrameCallback' in video
      ) {
        videoFrameCallbackId =
          video.requestVideoFrameCallback(renderVideoFrame);
      }
    };

    const stopVideoFrameCallback = () => {
      if (
        videoFrameCallbackId !== null &&
        'cancelVideoFrameCallback' in video
      ) {
        video.cancelVideoFrameCallback(videoFrameCallbackId);
        videoFrameCallbackId = null;
      }
    };

    // Start/stop video frame callback on play/pause
    const handlePlayWithCallback = () => {
      handlePlay();
      startVideoFrameCallback();
    };

    const handlePauseWithCallback = () => {
      stopVideoFrameCallback();
      handlePause();
    };

    const handleEndedWithCallback = () => {
      stopVideoFrameCallback();
      handleEnded();
    };

    const handleSeeked = () => {
      // On seek, render skeleton at current position (works when paused too)
      const session = inputSessionRef.current;
      if (!session) return;

      const skeletonEvent = session.getSkeletonAtTime(video.currentTime);
      const hasPoses = !!skeletonEvent?.skeleton;
      setHasPosesForCurrentFrame(hasPoses);
      if (skeletonEvent?.skeleton) {
        // Render the skeleton
        if (skeletonRendererRef.current) {
          skeletonRendererRef.current.renderSkeleton(
            skeletonEvent.skeleton,
            performance.now()
          );
        }
        // Update HUD with current frame's data
        updateHudFromSkeleton(skeletonEvent.skeleton);
      }

      // Sync rep counter and position to seek location (immediate, not throttled)
      repSyncHandlerRef.current?.(video.currentTime);
    };

    video.addEventListener('play', handlePlayWithCallback);
    video.addEventListener('pause', handlePauseWithCallback);
    video.addEventListener('ended', handleEndedWithCallback);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      video.removeEventListener('play', handlePlayWithCallback);
      video.removeEventListener('pause', handlePauseWithCallback);
      video.removeEventListener('ended', handleEndedWithCallback);
      video.removeEventListener('seeked', handleSeeked);
      stopVideoFrameCallback();
    };
  }, [updateHudFromSkeleton]); // repSyncHandlerRef is stable (ref), updateHudFromSkeleton is stable (useCallback)

  // ========================================
  // Video File Controls
  // ========================================

  // Helper: Reset all video-related state for a new video
  const resetVideoState = useCallback(() => {
    setRepCount(0);
    setRepThumbnails(new Map());
    pipelineRef.current?.reset();
    hasRecordedExtractionStartRef.current = false;
    setDetectedExercise('unknown');
    setDetectionConfidence(0);
    setIsDetectionLocked(false);
    setCurrentPhases(DEFAULT_PHASES);
    setWorkingLeg(null);
  }, []);

  // Helper: Clear loading UI state (used on abort or completion)
  const clearLoadingState = useCallback(() => {
    setIsVideoLoading(false);
    setVideoLoadProgress(undefined);
    setVideoLoadMessage('');
  }, []);

  // Helper: Prepare for video loading (abort previous, create new controller)
  const prepareVideoLoad = useCallback(() => {
    videoLoadAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    videoLoadAbortControllerRef.current = abortController;
    return abortController;
  }, []);

  // Core video loading function - handles both user uploads and sample videos
  const loadVideo = useCallback(
    async (
      videoFile: File,
      blobUrl: string,
      abortController: AbortController,
      context: string // For error messages (e.g., "video" or "sample video")
    ) => {
      const session = inputSessionRef.current;
      const video = videoRef.current;
      if (!session || !video) {
        console.error(`loadVideo: session or video element not initialized`);
        setStatus('Error: App not initialized. Please refresh.');
        return false;
      }

      try {
        // Load video into DOM
        await loadVideoSafely(video, blobUrl, abortController.signal);

        setCurrentVideoFile(videoFile);
        recordVideoLoad({
          source: context === 'video' ? 'upload' : 'hardcoded',
          fileName: videoFile.name,
        });

        // Start extraction/cache lookup - pass signal to allow cancellation
        setVideoLoadMessage('Processing video...');
        await session.startVideoFile(videoFile, abortController.signal);

        setStatus('Video loaded. Press Play to start.');
        clearLoadingState();
        return true;
      } catch (error) {
        // AbortError means user switched videos - silently return
        if (error instanceof DOMException && error.name === 'AbortError') {
          return false;
        }
        console.error(`Error loading ${context}:`, error);
        setStatus(`Error: ${getVideoLoadErrorMessage(error, context)}`);
        clearLoadingState();
        return false;
      }
    },
    [loadVideoSafely, clearLoadingState]
  );

  // Handle user-uploaded video files
  const handleVideoUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!inputSessionRef.current || !videoRef.current) {
        console.error(
          'handleVideoUpload: session or video element not initialized'
        );
        setStatus('Error: App not initialized. Please refresh.');
        return;
      }

      const abortController = prepareVideoLoad();
      setIsVideoLoading(true);
      setVideoLoadProgress(undefined);
      setVideoLoadMessage(`Loading ${file.name}...`);
      resetVideoState();

      const url = URL.createObjectURL(file);
      await loadVideo(file, url, abortController, 'video');
    },
    [prepareVideoLoad, resetVideoState, loadVideo]
  );

  // Load a sample video by key (shared implementation for all samples)
  const loadSampleVideo = useCallback(
    async (sampleKey: keyof typeof SAMPLE_VIDEOS) => {
      const config = SAMPLE_VIDEOS[sampleKey];
      if (!config) {
        console.error(`Unknown sample video: ${sampleKey}`);
        return;
      }

      if (!inputSessionRef.current || !videoRef.current) {
        console.error(
          `loadSampleVideo: session or video element not initialized`
        );
        setStatus('Error: App not initialized. Please refresh.');
        return;
      }

      const abortController = prepareVideoLoad();
      setStatus(`Loading ${config.name.toLowerCase()} sample...`);
      setIsVideoLoading(true);
      setVideoLoadProgress(undefined);
      setVideoLoadMessage(`Downloading ${config.name}...`);
      resetVideoState();

      try {
        // Try remote URL first, fall back to local
        let blob: Blob;
        try {
          blob = await fetchWithProgress(config.remoteUrl, (percent) => {
            setStatus(
              `Downloading ${config.name.toLowerCase()}... ${percent}%`
            );
            setVideoLoadProgress(percent);
          });
        } catch {
          console.log(`Remote ${config.name} failed, falling back to local`);
          setStatus(`Loading ${config.name.toLowerCase()} (local)...`);
          setVideoLoadMessage('Loading from local cache...');
          setVideoLoadProgress(undefined);
          const response = await fetch(config.localFallback);
          if (!response.ok) {
            throw new Error(`Failed to fetch video: ${response.status}`);
          }
          blob = await response.blob();
        }

        const videoFile = new File([blob], config.fileName, {
          type: 'video/webm',
        });
        const blobUrl = URL.createObjectURL(blob);
        await loadVideo(videoFile, blobUrl, abortController, 'sample video');
      } catch (error) {
        // AbortError means user switched videos - silently reset
        if (error instanceof DOMException && error.name === 'AbortError') {
          clearLoadingState();
          return;
        }
        console.error(`Error loading ${config.name}:`, error);
        setStatus(`Error: ${getVideoLoadErrorMessage(error, 'sample video')}`);
        clearLoadingState();
      }
    },
    [prepareVideoLoad, resetVideoState, loadVideo, clearLoadingState]
  );

  // Convenience wrappers for specific samples (maintain existing API)
  const loadHardcodedVideo = useCallback(
    () => loadSampleVideo('swing'),
    [loadSampleVideo]
  );
  const loadPistolSquatSample = useCallback(
    () => loadSampleVideo('pistol'),
    [loadSampleVideo]
  );

  // ========================================
  // Playback Controls
  // ========================================
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      // Handle the play promise to avoid AbortError when pause() is called before play() resolves
      video.play().catch((err) => {
        // AbortError is expected when play() is interrupted by pause() - ignore it
        if (err.name === 'AbortError') {
          return;
        }
        console.error('Error playing video:', err);
        // Provide user feedback for play failures
        if (err.name === 'NotAllowedError') {
          setStatus('Playback blocked by browser. Click Play again to start.');
        } else if (err.name === 'NotSupportedError') {
          setStatus('Error: Video format not supported.');
        } else {
          setStatus('Error: Could not play video. Try reloading.');
        }
      });
    } else {
      video.pause();
    }
  }, []);

  const stopVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = 0;
  }, []);

  // ========================================
  // Frame Navigation (Cache-Based)
  // ========================================
  const frameStep = 1 / 30; // Assuming 30fps

  const nextFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Guard against NaN when video metadata isn't loaded
    if (!Number.isFinite(video.duration) || !Number.isFinite(video.currentTime))
      return;

    video.pause();
    video.currentTime = Math.min(video.duration, video.currentTime + frameStep);
    // Skeleton will be rendered via 'seeked' event handler
  }, []);

  const previousFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Guard against NaN when video metadata isn't loaded
    if (!Number.isFinite(video.currentTime)) return;

    video.pause();
    video.currentTime = Math.max(0, video.currentTime - frameStep);
    // Skeleton will be rendered via 'seeked' event handler
  }, []);

  // ========================================
  // Rep Navigation - seeks to same phase in target rep (or first available) and pauses
  // ========================================
  const navigateToPreviousRep = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const newRepIndex = Math.max(0, appState.currentRepIndex - 1);
    if (newRepIndex === appState.currentRepIndex) return; // Already at first rep

    // Find checkpoint in target rep - prefer same phase as current, fallback to first available
    const targetRepNum = newRepIndex + 1; // repNum is 1-indexed
    const positions = repThumbnails.get(targetRepNum);

    // Try to preserve current phase (convert "Top" -> "top" for lookup)
    const currentPhaseKey = currentPosition?.toLowerCase() ?? null;
    const samePhaseCheckpoint = currentPhaseKey
      ? positions?.get(currentPhaseKey)
      : null;
    const targetCheckpoint =
      samePhaseCheckpoint || positions?.values().next().value;
    const actualPosition = samePhaseCheckpoint
      ? currentPhaseKey
      : (positions?.keys().next().value ?? null);

    video.pause(); // Pause when seeking to rep
    if (targetCheckpoint?.videoTime !== undefined) {
      video.currentTime = targetCheckpoint.videoTime;
      if (actualPosition) {
        setCurrentPosition(formatPositionForDisplay(actualPosition));
      }
    }
    setAppState((prev) => ({
      ...prev,
      currentRepIndex: newRepIndex,
    }));
  }, [appState.currentRepIndex, repThumbnails, currentPosition]);

  const navigateToNextRep = useCallback(() => {
    const video = videoRef.current;
    if (!video || repCount <= 0) return;

    const newRepIndex = Math.min(repCount - 1, appState.currentRepIndex + 1);
    if (newRepIndex === appState.currentRepIndex) return; // Already at last rep

    // Find checkpoint in target rep - prefer same phase as current, fallback to first available
    const targetRepNum = newRepIndex + 1; // repNum is 1-indexed
    const positions = repThumbnails.get(targetRepNum);

    // Try to preserve current phase (convert "Top" -> "top" for lookup)
    const currentPhaseKey = currentPosition?.toLowerCase() ?? null;
    const samePhaseCheckpoint = currentPhaseKey
      ? positions?.get(currentPhaseKey)
      : null;
    const targetCheckpoint =
      samePhaseCheckpoint || positions?.values().next().value;
    const actualPosition = samePhaseCheckpoint
      ? currentPhaseKey
      : (positions?.keys().next().value ?? null);

    video.pause(); // Pause when seeking to rep
    if (targetCheckpoint?.videoTime !== undefined) {
      video.currentTime = targetCheckpoint.videoTime;
      if (actualPosition) {
        setCurrentPosition(formatPositionForDisplay(actualPosition));
      }
    }
    setAppState((prev) => ({
      ...prev,
      currentRepIndex: newRepIndex,
    }));
  }, [repCount, appState.currentRepIndex, repThumbnails, currentPosition]);

  // Set current rep index directly (used by gallery modal)
  const setCurrentRepIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= repCount) return;
      setAppState((prev) => ({
        ...prev,
        currentRepIndex: index,
      }));
    },
    [repCount]
  );

  // ========================================
  // Checkpoint Navigation
  // ========================================

  // Build flat list of all checkpoints sorted by time
  // Uses currentPhases to support both swing and pistol squat exercises
  const getAllCheckpoints = useCallback(() => {
    return buildCheckpointList(repThumbnails, currentPhases);
  }, [repThumbnails, currentPhases]);

  // ========================================
  // Auto-Sync Rep & Position During Playback
  // ========================================
  // Updates currentRepIndex and currentPosition based on video time.
  // Called from throttled playback loop and on seek events.
  // See ARCHITECTURE.md "Throttled Playback Sync" for design rationale.
  const updateRepAndPositionFromTime = useCallback(
    (videoTime: number) => {
      const checkpoints = getAllCheckpoints();
      if (checkpoints.length === 0) return;

      // Find which rep/position we're in: last checkpoint where time >= checkpoint.videoTime
      // Default to rep 1 before first checkpoint (per spec: show rep 1 before first rep)
      let foundRepNum = 1;
      let foundPosition: string | null = null;

      for (const cp of checkpoints) {
        if (videoTime >= cp.videoTime - 0.05) {
          // Small tolerance for frame timing
          foundRepNum = cp.repNum;
          foundPosition = cp.position;
        } else {
          break; // Checkpoints are sorted, so we've passed current time
        }
      }

      // Update rep index if changed (repNum is 1-indexed, currentRepIndex is 0-indexed)
      // Use functional update to avoid stale closure on appState.currentRepIndex
      const newRepIndex = foundRepNum - 1;
      setAppState((prev) => {
        if (newRepIndex !== prev.currentRepIndex) {
          return { ...prev, currentRepIndex: newRepIndex };
        }
        return prev; // Return same reference to avoid unnecessary re-render
      });

      // Update position if found
      if (foundPosition) {
        setCurrentPosition(formatPositionForDisplay(foundPosition));
      }
    },
    [getAllCheckpoints]
  ); // No appState dependency needed with functional update

  // Keep ref up to date for use in event handlers (avoids stale closure)
  repSyncHandlerRef.current = updateRepAndPositionFromTime;

  const navigateToNextCheckpoint = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const checkpoints = getAllCheckpoints();
    if (checkpoints.length === 0) return;

    const nextCheckpoint = findNextCheckpoint(checkpoints, video.currentTime);

    if (nextCheckpoint) {
      video.pause(); // Pause when seeking to checkpoint
      video.currentTime = nextCheckpoint.videoTime;
      setCurrentPosition(formatPositionForDisplay(nextCheckpoint.position));
      // Update rep index if needed
      setAppState((prev) => ({
        ...prev,
        currentRepIndex: nextCheckpoint.repNum - 1, // repNum is 1-indexed
      }));
    }
    // If no next checkpoint, don't wrap around
  }, [getAllCheckpoints]);

  const navigateToPreviousCheckpoint = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const checkpoints = getAllCheckpoints();
    if (checkpoints.length === 0) return;

    const prevCheckpoint = findPreviousCheckpoint(
      checkpoints,
      video.currentTime
    );

    if (prevCheckpoint) {
      video.pause(); // Pause when seeking to checkpoint
      video.currentTime = prevCheckpoint.videoTime;
      setCurrentPosition(formatPositionForDisplay(prevCheckpoint.position));
      // Update rep index if needed
      setAppState((prev) => ({
        ...prev,
        currentRepIndex: prevCheckpoint.repNum - 1, // repNum is 1-indexed
      }));
    }
    // If no previous checkpoint, don't wrap around
  }, [getAllCheckpoints]);

  // Clear position label when playing or using frame navigation
  const clearPositionLabel = useCallback(() => {
    setCurrentPosition(null);
  }, []);

  // ========================================
  // Keyboard Navigation
  // ========================================
  const { isFullscreen } = useKeyboardNavigation({
    currentRepIndex: appState.currentRepIndex,
    repCount,
    onNavigateToPreviousRep: navigateToPreviousRep,
    onNavigateToNextRep: navigateToNextRep,
    togglePlayPause,
    nextFrame,
    previousFrame,
  });

  // ========================================
  // Display Mode
  // ========================================
  const setDisplayMode = useCallback((mode: 'both' | 'video' | 'overlay') => {
    setAppState((prev) => ({ ...prev, displayMode: mode }));

    switch (mode) {
      case 'both':
        if (videoRef.current) videoRef.current.style.opacity = '1';
        if (canvasRef.current) canvasRef.current.style.display = 'block';
        break;
      case 'video':
        if (videoRef.current) videoRef.current.style.opacity = '1';
        if (canvasRef.current) canvasRef.current.style.display = 'none';
        break;
      case 'overlay':
        if (videoRef.current) videoRef.current.style.opacity = '0.1';
        if (canvasRef.current) canvasRef.current.style.display = 'block';
        break;
    }
  }, []);

  // ========================================
  // Crop Toggle
  // ========================================
  const toggleCrop = useCallback(() => {
    const pipeline = pipelineRef.current;
    if (!pipeline || !cropRegion) return;

    const newEnabled = !isCropEnabled;
    setIsCropEnabled(newEnabled);
    pipeline.setCropEnabled(newEnabled);
  }, [cropRegion, isCropEnabled]);

  // ========================================
  // Reset
  // ========================================
  const reset = useCallback(() => {
    pipelineRef.current?.reset();
    setRepCount(0);
    setSpineAngle(0);
    setArmToSpineAngle(0);
    setRepThumbnails(new Map());
    // Reset exercise detection state
    setDetectedExercise('unknown');
    setDetectionConfidence(0);
    setIsDetectionLocked(false);
    setCurrentPhases(DEFAULT_PHASES);
    setWorkingLeg(null);
    setAppState((prev) => ({
      ...prev,
      currentRepIndex: 0,
      repCounter: {
        ...prev.repCounter,
        count: 0,
        isConnect: false,
        lastConnectState: false,
      },
    }));
  }, []);

  // ========================================
  // Exercise Type Override
  // ========================================
  const setExerciseType = useCallback((exercise: DetectedExercise) => {
    pipelineRef.current?.setExerciseType(exercise);
    setDetectedExercise(exercise);
    setIsDetectionLocked(true);
    // Update phases when exercise type is manually changed
    const formAnalyzer = pipelineRef.current?.getFormAnalyzer();
    if (formAnalyzer) {
      setCurrentPhases(formAnalyzer.getPhases());
    }
  }, []);

  // ========================================
  // Helper Functions
  // ========================================
  const getVideoContainerClass = useCallback(() => {
    if (!videoRef.current) return '';
    const { videoWidth, videoHeight } = videoRef.current;
    return videoWidth > videoHeight ? 'video-landscape' : 'video-portrait';
  }, []);

  // Derived state
  const isExtracting =
    inputState.type === 'video-file' &&
    inputState.sourceState.type === 'extracting';

  // ========================================
  // Return Public API (compatible with V1)
  // ========================================
  return {
    // State
    appState,
    status,
    repCount,
    spineAngle,
    armToSpineAngle,
    isPlaying,
    videoStartTime: null, // Not tracked in V2
    isFullscreen,
    currentVideoFile,
    usingCachedPoses: inputState.type === 'video-file',
    repThumbnails,
    extractionProgress,
    isExtracting,
    inputState,

    // Refs
    videoRef,
    canvasRef,
    fileInputRef,
    checkpointGridRef: useRef<HTMLDivElement>(null),
    pipelineRef,

    // Actions
    handleVideoUpload,
    loadHardcodedVideo,
    loadPistolSquatSample,
    togglePlayPause,
    stopVideo,
    startProcessing: () => {}, // No-op in V2 (handled by InputSession)
    stopProcessing: () => {}, // No-op in V2
    reset,
    resetPipelineOnly: reset,
    nextFrame,
    previousFrame,
    setBodyPartDisplay: () => {}, // TODO: Implement
    setDisplayMode,
    setDebugMode: () => {}, // TODO: Implement
    navigateToPreviousRep,
    navigateToNextRep,
    navigateToPreviousCheckpoint,
    navigateToNextCheckpoint,
    setCurrentRepIndex,
    clearPositionLabel,
    getVideoContainerClass,
    reinitializeWithCachedPoses: async () => {}, // No-op in V2
    reinitializeWithLiveCache: async () => {}, // No-op in V2

    // V2-specific
    getSkeletonAtTime: (time: number) =>
      inputSessionRef.current?.getSkeletonAtTime(time) ?? null,

    // Crop controls
    cropRegion,
    isCropEnabled,
    toggleCrop,
    hasCropRegion: cropRegion !== null,

    // HUD visibility (based on pose availability, not extraction state)
    hasPosesForCurrentFrame,

    // Current position (shown when navigating by checkpoint)
    currentPosition,

    // Exercise detection
    detectedExercise,
    detectionConfidence,
    isDetectionLocked,
    setExerciseType,

    // Current phases for this exercise (for rep gallery)
    currentPhases,

    // Working leg (for exercises that support it, e.g., pistol squat)
    workingLeg,

    // Cache processing state (true while loading from cache)
    isCacheProcessing,

    // Media dialog loading state
    isVideoLoading,
    videoLoadProgress,
    videoLoadMessage,
  };
}
