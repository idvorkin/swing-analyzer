/**
 * useSwingAnalyzerV2 - Refactored swing analyzer hook using InputSession
 *
 * This is a rewrite of useSwingAnalyzer that uses the unified InputSession
 * state machine for managing video input. Key improvements:
 *
 * 1. Single source of truth for input state (InputSession)
 * 2. Cache lookup for frame stepping (no redundant ML inference)
 * 3. Streaming during extraction (reps update live)
 * 4. Cleaner state management (explicit state machine)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import {
  DEFAULT_SAMPLE_VIDEO,
  LOCAL_SAMPLE_VIDEO,
} from '../config/sampleVideos';
import { InputSession, type InputSessionState } from '../pipeline/InputSession';
import type { Skeleton } from '../models/Skeleton';
import type { Pipeline, ThumbnailEvent } from '../pipeline/Pipeline';
import { createPipeline } from '../pipeline/PipelineFactory';
import type { SkeletonEvent } from '../pipeline/PipelineInterfaces';
import type { ExtractionProgress } from '../pipeline/SkeletonSource';
import {
  recordExtractionStart,
  recordExtractionComplete,
  recordVideoLoad,
  recordPlaybackStart,
  recordPlaybackPause,
  sessionRecorder,
} from '../services/SessionRecorder';
import type { PositionCandidate } from '../types/exercise';
import type { CropRegion } from '../types/posetrack';
import { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';
import { useKeyboardNavigation } from './useKeyboardNavigation';

export function useSwingAnalyzerV2(initialState?: Partial<AppState>) {
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
  const [repThumbnails, setRepThumbnails] = useState<Map<number, Map<string, PositionCandidate>>>(new Map());
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [inputState, setInputState] = useState<InputSessionState>({ type: 'idle' });
  const [hasPosesForCurrentFrame, setHasPosesForCurrentFrame] = useState<boolean>(false);
  const [currentPosition, setCurrentPosition] = useState<string | null>(null);

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
  // Track if we're in the middle of loading a video (to abort on switch)
  const videoLoadAbortControllerRef = useRef<AbortController | null>(null);

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
    const videoOffsetX = containerRect ? videoRect.left - containerRect.left : 0;
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

    console.log(`[Canvas] Synced: ${canvas.width}x${canvas.height}, CSS: ${renderedWidth.toFixed(0)}x${renderedHeight.toFixed(0)} at (${finalX.toFixed(0)},${finalY.toFixed(0)}) [video offset: ${videoOffsetX.toFixed(0)},${videoOffsetY.toFixed(0)}]`);
  }, []);

  // Re-sync canvas on window resize
  useEffect(() => {
    const handleResize = () => {
      requestAnimationFrame(() => syncCanvasToVideo());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [syncCanvasToVideo]);

  // ========================================
  // Safe Video Loading Helper
  // ========================================
  // Handles all cleanup and race conditions when switching videos
  const loadVideoSafely = useCallback(async (
    videoElement: HTMLVideoElement,
    url: string,
    signal: AbortSignal
  ): Promise<void> => {
    // 1. Pause any current playback
    videoElement.pause();
    videoElement.currentTime = 0;

    // 2. Clean up previous object URL if it was a blob URL
    if (currentVideoUrlRef.current && currentVideoUrlRef.current.startsWith('blob:')) {
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
        videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
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
      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
      videoElement.addEventListener('error', handleError, { once: true });
      signal.addEventListener('abort', handleAbort, { once: true });
    });
  }, [syncCanvasToVideo]);

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
        setRepThumbnails(prev => {
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
  // Skeleton Event Handler
  // ========================================
  // Use a ref to hold the handler so video events can access it stably
  const skeletonHandlerRef = useRef<((event: SkeletonEvent) => void) | null>(null);

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
                skeletonRendererRef.current.renderSkeleton(skeletonEvent.skeleton, performance.now());
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
        }
      } else if (state.type === 'error') {
        setStatus(`Error: ${state.message}`);
      } else {
        setStatus('Ready');
      }

      // Mark model as loaded once we have an active source
      if (state.type === 'video-file' && state.sourceState.type === 'active') {
        setAppState(prev => ({ ...prev, isModelLoaded: true }));
      }
    });

    // Subscribe to skeleton events - use processSkeletonEvent via ref for stable access
    skeletonHandlerRef.current = processSkeletonEvent;
    let skeletonEventCount = 0;
    const skeletonSubscription = session.skeletons$.subscribe((event) => {
      skeletonEventCount++;
      // Use the ref to access the latest handler (avoids stale closure)
      skeletonHandlerRef.current?.(event);
    });

    // Subscribe to extraction progress
    const progressSubscription = session.extractionProgress$.subscribe((progress) => {
      setExtractionProgress(progress);
    });

    // Mark as ready
    setAppState(prev => ({ ...prev, isModelLoaded: true }));
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

    return () => {
      stateSubscription.unsubscribe();
      skeletonSubscription.unsubscribe();
      progressSubscription.unsubscribe();
      session.dispose();
      inputSessionRef.current = null;
    };
  }, [initializePipeline, processSkeletonEvent]);

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
  // Video Playback Handlers
  // ========================================
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      isPlayingRef.current = true;
      setIsPlaying(true);
      setAppState(prev => ({ ...prev, isProcessing: true }));
      recordPlaybackStart({ videoTime: video.currentTime });
    };

    const handlePause = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setAppState(prev => ({ ...prev, isProcessing: false }));
      recordPlaybackPause({ videoTime: video.currentTime });
    };

    const handleEnded = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setAppState(prev => ({ ...prev, isProcessing: false }));
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
            skeletonRendererRef.current.renderSkeleton(skeletonEvent.skeleton, now);
          }
          // Update HUD with current frame's data
          updateHudFromSkeleton(skeletonEvent.skeleton);
        }
      }

      // Request next frame callback if still playing
      if (isPlayingRef.current) {
        videoFrameCallbackId = video.requestVideoFrameCallback(renderVideoFrame);
      }
    };

    const startVideoFrameCallback = () => {
      if (videoFrameCallbackId === null && 'requestVideoFrameCallback' in video) {
        videoFrameCallbackId = video.requestVideoFrameCallback(renderVideoFrame);
      }
    };

    const stopVideoFrameCallback = () => {
      if (videoFrameCallbackId !== null && 'cancelVideoFrameCallback' in video) {
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
          skeletonRendererRef.current.renderSkeleton(skeletonEvent.skeleton, performance.now());
        }
        // Update HUD with current frame's data
        updateHudFromSkeleton(skeletonEvent.skeleton);
      }
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
  }, [updateHudFromSkeleton]); // updateHudFromSkeleton is stable (useCallback with no deps)

  // ========================================
  // Video File Controls
  // ========================================
  const handleVideoUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const session = inputSessionRef.current;
    const video = videoRef.current;
    if (!session || !video) {
      console.error('handleVideoUpload: session or video element not initialized', {
        hasSession: !!session,
        hasVideo: !!video,
      });
      setStatus('Error: App not initialized. Please refresh.');
      return;
    }

    // Abort any in-progress video load
    videoLoadAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    videoLoadAbortControllerRef.current = abortController;

    // Reset state
    setRepCount(0);
    setRepThumbnails(new Map());
    pipelineRef.current?.reset();
    hasRecordedExtractionStartRef.current = false; // Reset for new video

    // Load video safely (handles cleanup, pausing, and race conditions)
    const url = URL.createObjectURL(file);
    try {
      await loadVideoSafely(video, url, abortController.signal);
    } catch (error) {
      // AbortError means user switched videos - silently ignore
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to load video:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Failed to load video'}`);
      return;
    }

    setCurrentVideoFile(file);

    // Start extraction/cache lookup
    try {
      await session.startVideoFile(file);
    } catch (error) {
      console.error('Failed to process video:', error);
      let userMessage = 'Could not process video';
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        userMessage = 'Storage full. Clear browser data and try again.';
      } else if (error instanceof Error) {
        if (error.message.includes('model')) {
          userMessage = 'Failed to load pose detection. Check network and refresh.';
        } else if (error.message.includes('format')) {
          userMessage = 'Invalid video format. Try a different file.';
        }
      }
      setStatus(`Error: ${userMessage}`);
    }
  }, [loadVideoSafely]);

  const loadHardcodedVideo = useCallback(async () => {
    const session = inputSessionRef.current;
    const video = videoRef.current;
    if (!session || !video) {
      console.error('loadHardcodedVideo: session or video element not initialized', {
        hasSession: !!session,
        hasVideo: !!video,
      });
      setStatus('Error: App not initialized. Please refresh.');
      return;
    }

    // Abort any in-progress video load
    videoLoadAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    videoLoadAbortControllerRef.current = abortController;

    setStatus('Loading sample video...');

    try {
      // Reset state
      setRepCount(0);
      setRepThumbnails(new Map());
      pipelineRef.current?.reset();
      hasRecordedExtractionStartRef.current = false; // Reset for new video

      // Try remote URL first, fall back to local
      let videoURL = DEFAULT_SAMPLE_VIDEO;
      let response = await fetch(videoURL);

      if (!response.ok) {
        console.log('Remote sample failed, falling back to local:', response.status);
        videoURL = LOCAL_SAMPLE_VIDEO;
        response = await fetch(videoURL);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`);
      }

      // Fetch the video as a File for pose extraction
      const blob = await response.blob();
      const videoFile = new File([blob], 'swing-sample.webm', {
        type: 'video/webm',
      });

      // Load video safely (handles cleanup, pausing, and race conditions)
      const blobUrl = URL.createObjectURL(blob);
      await loadVideoSafely(video, blobUrl, abortController.signal);

      setCurrentVideoFile(videoFile);
      recordVideoLoad({ source: 'hardcoded', fileName: 'swing-sample.webm' });

      // Start extraction/cache lookup
      await session.startVideoFile(videoFile);

      setStatus('Video loaded. Press Play to start.');
    } catch (error) {
      // AbortError means user switched videos - silently ignore
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Error loading hardcoded video:', error);
      setStatus('Error: Could not load sample video');
    }
  }, [loadVideoSafely]);

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
        if (err.name !== 'AbortError') {
          console.error('Error playing video:', err);
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
    if (!isFinite(video.duration) || !isFinite(video.currentTime)) return;

    video.pause();
    video.currentTime = Math.min(video.duration, video.currentTime + frameStep);
    // Skeleton will be rendered via 'seeked' event handler
  }, [frameStep]);

  const previousFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Guard against NaN when video metadata isn't loaded
    if (!isFinite(video.currentTime)) return;

    video.pause();
    video.currentTime = Math.max(0, video.currentTime - frameStep);
    // Skeleton will be rendered via 'seeked' event handler
  }, [frameStep]);

  // ========================================
  // Rep Navigation - seeks to first checkpoint of target rep and pauses
  // ========================================
  const navigateToPreviousRep = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const newRepIndex = Math.max(0, appState.currentRepIndex - 1);
    if (newRepIndex === appState.currentRepIndex) return; // Already at first rep

    // Find first checkpoint of the target rep - track actual position found
    const targetRepNum = newRepIndex + 1; // repNum is 1-indexed
    const positions = repThumbnails.get(targetRepNum);
    const topCheckpoint = positions?.get('top');
    const firstCheckpoint = topCheckpoint || positions?.values().next().value;
    // Determine actual position name - 'top' if found, otherwise first available
    const actualPosition = topCheckpoint ? 'top' : (positions?.keys().next().value ?? null);

    video.pause(); // Pause when seeking to rep
    if (firstCheckpoint?.videoTime !== undefined) {
      video.currentTime = firstCheckpoint.videoTime;
      if (actualPosition) {
        setCurrentPosition(actualPosition);
      }
    }
    setAppState(prev => ({
      ...prev,
      currentRepIndex: newRepIndex,
    }));
  }, [appState.currentRepIndex, repThumbnails]);

  const navigateToNextRep = useCallback(() => {
    const video = videoRef.current;
    if (!video || repCount <= 0) return;

    const newRepIndex = Math.min(repCount - 1, appState.currentRepIndex + 1);
    if (newRepIndex === appState.currentRepIndex) return; // Already at last rep

    // Find first checkpoint of the target rep - track actual position found
    const targetRepNum = newRepIndex + 1; // repNum is 1-indexed
    const positions = repThumbnails.get(targetRepNum);
    const topCheckpoint = positions?.get('top');
    const firstCheckpoint = topCheckpoint || positions?.values().next().value;
    // Determine actual position name - 'top' if found, otherwise first available
    const actualPosition = topCheckpoint ? 'top' : (positions?.keys().next().value ?? null);

    video.pause(); // Pause when seeking to rep
    if (firstCheckpoint?.videoTime !== undefined) {
      video.currentTime = firstCheckpoint.videoTime;
      if (actualPosition) {
        setCurrentPosition(actualPosition);
      }
    }
    setAppState(prev => ({
      ...prev,
      currentRepIndex: newRepIndex,
    }));
  }, [repCount, appState.currentRepIndex, repThumbnails]);

  // ========================================
  // Checkpoint Navigation
  // ========================================
  const POSITION_ORDER = ['top', 'connect', 'bottom', 'release'] as const;

  // Build flat list of all checkpoints sorted by time
  const getAllCheckpoints = useCallback(() => {
    const checkpoints: Array<{ repNum: number; position: string; videoTime: number }> = [];

    for (const [repNum, positions] of repThumbnails.entries()) {
      for (const posName of POSITION_ORDER) {
        const candidate = positions.get(posName);
        if (candidate?.videoTime !== undefined) {
          checkpoints.push({
            repNum,
            position: posName,
            videoTime: candidate.videoTime,
          });
        }
      }
    }

    // Sort by video time
    checkpoints.sort((a, b) => a.videoTime - b.videoTime);
    return checkpoints;
  }, [repThumbnails]);

  const navigateToNextCheckpoint = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const checkpoints = getAllCheckpoints();
    if (checkpoints.length === 0) return;

    const currentTime = video.currentTime;

    // Find the next checkpoint after current time
    const nextCheckpoint = checkpoints.find(cp => cp.videoTime > currentTime + 0.01);

    if (nextCheckpoint) {
      video.pause(); // Pause when seeking to checkpoint
      video.currentTime = nextCheckpoint.videoTime;
      setCurrentPosition(nextCheckpoint.position);
      // Update rep index if needed
      setAppState(prev => ({
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

    const currentTime = video.currentTime;

    // Find the previous checkpoint before current time
    const prevCheckpoints = checkpoints.filter(cp => cp.videoTime < currentTime - 0.01);
    const prevCheckpoint = prevCheckpoints[prevCheckpoints.length - 1];

    if (prevCheckpoint) {
      video.pause(); // Pause when seeking to checkpoint
      video.currentTime = prevCheckpoint.videoTime;
      setCurrentPosition(prevCheckpoint.position);
      // Update rep index if needed
      setAppState(prev => ({
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
    setAppState(prev => ({ ...prev, displayMode: mode }));

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
    setAppState(prev => ({
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
  // Helper Functions
  // ========================================
  const getVideoContainerClass = useCallback(() => {
    if (!videoRef.current) return '';
    const { videoWidth, videoHeight } = videoRef.current;
    return videoWidth > videoHeight ? 'video-landscape' : 'video-portrait';
  }, []);

  // Derived state
  const isExtracting = inputState.type === 'video-file' &&
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
    clearPositionLabel,
    getVideoContainerClass,
    reinitializeWithCachedPoses: async () => {}, // No-op in V2
    reinitializeWithLiveCache: async () => {}, // No-op in V2

    // V2-specific
    getSkeletonAtTime: (time: number) => inputSessionRef.current?.getSkeletonAtTime(time) ?? null,

    // Crop controls
    cropRegion,
    isCropEnabled,
    toggleCrop,
    hasCropRegion: cropRegion !== null,

    // HUD visibility (based on pose availability, not extraction state)
    hasPosesForCurrentFrame,

    // Current position (shown when navigating by checkpoint)
    currentPosition,
  };
}
