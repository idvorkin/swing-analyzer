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
      console.log('[DEBUG] processSkeletonEvent: no skeleton in event', event);
      return;
    }

    const pipeline = pipelineRef.current;
    if (!pipeline) {
      console.log('[DEBUG] processSkeletonEvent: no pipeline');
      return;
    }

    // Process through pipeline
    const result = pipeline.processSkeletonEvent(event);

    // Update UI state
    setRepCount(result);
    const spineAngle = Math.round(event.skeleton.getSpineAngle() || 0);
    setSpineAngle(spineAngle);
    setArmToSpineAngle(Math.round(event.skeleton.getArmToVerticalAngle() || 0));

    // Note: Skeleton rendering happens during playback via requestVideoFrameCallback,
    // not during extraction. The visible video isn't synced to the extraction frame,
    // so rendering here would show skeleton in wrong position.
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
            console.log('[DEBUG] Extraction started for:', state.fileName);
          }
        } else if (state.sourceState.type === 'active') {
          setStatus('Ready');
          // Record extraction complete for debugging (only if we recorded start)
          if (hasRecordedExtractionStartRef.current) {
            recordExtractionComplete({ fileName: state.fileName });
            console.log('[DEBUG] Extraction complete for:', state.fileName);
            // Log cache state for debugging
            const videoSource = session.getVideoFileSource();
            const cache = videoSource?.getLiveCache();
            console.log('[DEBUG] Cache state:', {
              frameCount: cache?.getFrameCount() ?? 0,
              isComplete: cache?.isExtractionComplete() ?? false,
            });
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
      // Log first 5 events and then every 100th
      if (skeletonEventCount <= 5 || skeletonEventCount % 100 === 0) {
        console.log('[DEBUG] Received skeleton event from extraction:', skeletonEventCount, 'hasSkeleton:', !!event.skeleton);
      }
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
    sessionRecorder.setPipelineStateGetter(() => ({
      repCount: pipelineRef.current?.getRepCount() ?? 0,
      isPlaying: video ? !video.paused : false,
      videoTime: video?.currentTime ?? 0,
      skeletonAngles: pipelineRef.current?.getLatestSkeleton()
        ? {
            spine: pipelineRef.current.getLatestSkeleton()?.getSpineAngle() ?? 0,
            arm: pipelineRef.current.getLatestSkeleton()?.getArmToSpineAngle() ?? 0,
            hip: pipelineRef.current.getLatestSkeleton()?.getHipAngle() ?? 0,
            knee: pipelineRef.current.getLatestSkeleton()?.getKneeAngle() ?? 0,
          }
        : undefined,
    }));

    return () => {
      stateSubscription.unsubscribe();
      skeletonSubscription.unsubscribe();
      progressSubscription.unsubscribe();
      session.dispose();
      inputSessionRef.current = null;
    };
  }, [initializePipeline, processSkeletonEvent]);

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
        if (skeletonEvent?.skeleton && skeletonRendererRef.current) {
          skeletonRendererRef.current.renderSkeleton(skeletonEvent.skeleton, now);
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
      if (skeletonEvent?.skeleton && skeletonRendererRef.current) {
        skeletonRendererRef.current.renderSkeleton(skeletonEvent.skeleton, performance.now());
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
  }, []); // No dependencies needed - uses refs for stable access

  // ========================================
  // Video File Controls
  // ========================================
  const handleVideoUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const session = inputSessionRef.current;
    const video = videoRef.current;
    if (!session || !video) return;

    // Reset state
    setRepCount(0);
    setRepThumbnails(new Map());
    pipelineRef.current?.reset();
    hasRecordedExtractionStartRef.current = false; // Reset for new video

    // Load video into element
    const url = URL.createObjectURL(file);
    video.src = url;

    // Wait for video metadata with timeout
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout loading video metadata'));
      }, 10000);

      video.onloadedmetadata = () => {
        clearTimeout(timeoutId);
        // Sync canvas to video after a small delay (wait for layout)
        requestAnimationFrame(() => syncCanvasToVideo());
        resolve();
      };

      video.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error('Failed to load video file'));
      };
    });

    setCurrentVideoFile(file);

    // Start extraction/cache lookup
    try {
      await session.startVideoFile(file);
    } catch (error) {
      console.error('Failed to process video:', error);
      setStatus('Error: Could not process video');
    }
  }, [syncCanvasToVideo]);

  const loadHardcodedVideo = useCallback(async () => {
    const session = inputSessionRef.current;
    const video = videoRef.current;
    if (!session || !video) return;

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

      // Load video into element
      const blobUrl = URL.createObjectURL(blob);
      video.src = blobUrl;

      // Wait for video metadata with timeout
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timeout loading video metadata'));
        }, 10000);

        video.onloadedmetadata = () => {
          clearTimeout(timeoutId);
          // Sync canvas to video after a small delay (wait for layout)
          requestAnimationFrame(() => syncCanvasToVideo());
          resolve();
        };

        video.onerror = () => {
          clearTimeout(timeoutId);
          reject(new Error('Failed to load sample video'));
        };
      });

      setCurrentVideoFile(videoFile);
      recordVideoLoad({ source: 'hardcoded', fileName: 'swing-sample.webm' });

      // Start extraction/cache lookup
      await session.startVideoFile(videoFile);

      setStatus('Video loaded. Press Play to start.');
    } catch (error) {
      console.error('Error loading hardcoded video:', error);
      setStatus('Error: Could not load sample video');
    }
  }, [syncCanvasToVideo]);

  // ========================================
  // Playback Controls
  // ========================================
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
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
  // Rep Navigation
  // ========================================
  const navigateToPreviousRep = useCallback(() => {
    setAppState(prev => ({
      ...prev,
      currentRepIndex: Math.max(0, prev.currentRepIndex - 1),
    }));
  }, []);

  const navigateToNextRep = useCallback(() => {
    if (repCount <= 0) return;
    setAppState(prev => ({
      ...prev,
      currentRepIndex: Math.min(repCount - 1, prev.currentRepIndex + 1),
    }));
  }, [repCount]);

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
  };
}
