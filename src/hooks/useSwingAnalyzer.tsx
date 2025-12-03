import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSavedBlazePoseVariant,
  getSavedModelPreference,
} from '../components/settings/AnalysisTab';
import {
  BLAZEPOSE_FULL_CONFIG,
  BLAZEPOSE_HEAVY_CONFIG,
  BLAZEPOSE_LITE_CONFIG,
  DEFAULT_MODEL_CONFIG,
} from '../config/modelConfig';
import {
  DEFAULT_SAMPLE_VIDEO,
  LOCAL_SAMPLE_VIDEO,
} from '../config/sampleVideos';
import type { LivePoseCache } from '../pipeline/LivePoseCache';
import type { Pipeline, PipelineResult } from '../pipeline/Pipeline';
import {
  createFrameAcquisition,
  createPipeline,
} from '../pipeline/PipelineFactory';
import type {
  SkeletonEvent,
  SkeletonTransformer,
} from '../pipeline/PipelineInterfaces';
import type { VideoFrameAcquisition } from '../pipeline/VideoFrameAcquisition';
import {
  sessionRecorder,
  recordPipelineInit,
  recordPlaybackStart,
  recordPlaybackPause,
  recordPlaybackStop,
  recordVideoLoad,
} from '../services/SessionRecorder';
import type { AppState } from '../types';
import type { PoseTrackFile } from '../types/posetrack';
import { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';

export function useSwingAnalyzer(initialState?: Partial<AppState>) {
  // State
  const [appState, setAppState] = useState<AppState>({
    usingCamera: false,
    cameraMode: 'environment',
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
  const [status, setStatus] = useState<string>('Loading model...');
  const [repCount, setRepCount] = useState<number>(0);
  const [spineAngle, setSpineAngle] = useState<number>(0);
  const [armToSpineAngle, setArmToSpineAngle] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [videoStartTime, setVideoStartTime] = useState<number | null>(null);
  const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);
  const [usingCachedPoses, setUsingCachedPoses] = useState<boolean>(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const checkpointGridRef = useRef<HTMLDivElement>(null);

  // Pipeline references
  const pipelineRef = useRef<Pipeline | null>(null);
  const frameAcquisitionRef = useRef<VideoFrameAcquisition | null>(null);
  const skeletonRendererRef = useRef<SkeletonRenderer | null>(null);
  const pipelineSubscriptionsRef = useRef<{ unsubscribe: () => void }[]>([]);

  // Initialize pipeline and models - runs once on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs only once on mount
  useEffect(() => {
    const initializePipeline = async () => {
      try {
        if (videoRef.current && canvasRef.current) {
          // Get model config based on saved preferences
          const savedModel = getSavedModelPreference();
          const blazePoseVariant = getSavedBlazePoseVariant();
          let modelConfig = DEFAULT_MODEL_CONFIG;
          if (savedModel === 'blazepose') {
            switch (blazePoseVariant) {
              case 'full':
                modelConfig = BLAZEPOSE_FULL_CONFIG;
                break;
              case 'heavy':
                modelConfig = BLAZEPOSE_HEAVY_CONFIG;
                break;
              default:
                modelConfig = BLAZEPOSE_LITE_CONFIG;
            }
          }
          console.log(
            `Using pose model: ${savedModel}${savedModel === 'blazepose' ? ` (${blazePoseVariant})` : ''}`
          );

          // Create pipeline components
          const pipeline = createPipeline(videoRef.current, canvasRef.current, {
            modelConfig,
          });
          pipelineRef.current = pipeline;

          // Get frame acquisition for direct media control
          frameAcquisitionRef.current = createFrameAcquisition(
            videoRef.current,
            canvasRef.current
          ) as VideoFrameAcquisition;

          // Initialize the skeleton renderer
          skeletonRendererRef.current = new SkeletonRenderer(canvasRef.current);
          skeletonRendererRef.current.setBodyPartDisplay(
            appState.showBodyParts,
            appState.bodyPartDisplayTime
          );

          // Initialize the pipeline
          await pipeline.initialize();

          setAppState((prev) => ({ ...prev, isModelLoaded: true }));
          setStatus('Ready. Upload a video or start camera.');
          recordPipelineInit({ model: savedModel });
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
        setStatus('Error: Failed to initialize model.');
      }
    };

    initializePipeline();

    // Set up session recorder pipeline state getter
    // This runs at 4 FPS to capture pipeline state for debugging
    sessionRecorder.setPipelineStateGetter(() => ({
      repCount: pipelineRef.current?.getRepCount() ?? 0,
      isPlaying: videoRef.current ? !videoRef.current.paused : false,
      videoTime: videoRef.current?.currentTime ?? 0,
      skeletonAngles: pipelineRef.current?.getLatestSkeleton()
        ? {
            spine: pipelineRef.current.getLatestSkeleton()?.getSpineAngle() ?? 0,
            arm: pipelineRef.current.getLatestSkeleton()?.getArmToSpineAngle() ?? 0,
            hip: pipelineRef.current.getLatestSkeleton()?.getHipAngle() ?? 0,
            knee: pipelineRef.current.getLatestSkeleton()?.getKneeAngle() ?? 0,
          }
        : undefined,
    }));

    // Cleanup on unmount
    return () => {
      if (pipelineRef.current) {
        stopProcessing();
        pipelineRef.current = null;
      }

      if (frameAcquisitionRef.current) {
        try {
          frameAcquisitionRef.current.stopCamera();
        } catch (err) {
          console.error('Error stopping camera:', err);
        }
        frameAcquisitionRef.current = null;
      }
    };
  }, []);

  // Helper function to set up pipeline subscriptions
  const setupPipelineSubscriptions = useCallback((pipeline: Pipeline) => {
    // Clean up existing subscriptions
    for (const sub of pipelineSubscriptionsRef.current) {
      sub.unsubscribe();
    }
    pipelineSubscriptionsRef.current = [];

    // Subscribe to skeleton events to render every detected skeleton
    const skeletonSubscription = pipeline.getSkeletonEvents().subscribe({
      next: (skeletonEvent: SkeletonEvent) => {
        if (skeletonEvent.skeleton) {
          setSpineAngle(
            Math.round(skeletonEvent.skeleton.getSpineAngle() || 0)
          );
          setArmToSpineAngle(
            Math.round(skeletonEvent.skeleton.getArmToVerticalAngle() || 0)
          );
          if (skeletonRendererRef.current) {
            skeletonRendererRef.current.renderSkeleton(
              skeletonEvent.skeleton,
              performance.now()
            );
          }
        }
      },
      error: (err) => {
        console.error('Skeleton event error:', err);
      },
    });

    // Subscribe to pipeline results for rep counting and other state
    const pipelineObservable = pipeline.start();
    const pipelineSubscription = pipelineObservable.subscribe({
      next: (result: PipelineResult) => {
        // Update rep count
        setRepCount(result.repCount);
      },
      error: (err) => {
        console.error('Pipeline error:', err);
        setStatus('Error in processing pipeline');
      },
      complete: () => {
        console.log('Pipeline processing completed');
        setAppState((prev) => ({ ...prev, isProcessing: false }));
      },
    });

    // Store subscriptions for cleanup
    pipelineSubscriptionsRef.current = [
      skeletonSubscription,
      pipelineSubscription,
    ];

    // Mark pipeline as processing now
    setAppState((prev) => ({ ...prev, isProcessing: true }));
  }, []);

  // Setup persistent subscriptions to pipeline events and start it once
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs only once on mount
  useEffect(() => {
    if (!pipelineRef.current) return;

    setupPipelineSubscriptions(pipelineRef.current);

    // Clean up subscriptions on unmount
    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }
      for (const sub of pipelineSubscriptionsRef.current) {
        sub.unsubscribe();
      }
      pipelineSubscriptionsRef.current = [];
    };
  }, []);

  // Add video event listeners to manage UI state only (not pipeline)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      // Only set videoStartTime on first play, not on resume after pause
      // This ensures checkpoint timestamps remain valid for seeking
      setVideoStartTime((prev) => prev ?? performance.now());
      recordPlaybackStart({ videoTime: video.currentTime });
      // Don't manage pipeline here - VideoFrameAcquisition handles this internally
    };

    const handlePause = () => {
      setIsPlaying(false);
      recordPlaybackPause({ videoTime: video.currentTime });
      // Don't manage pipeline here - VideoFrameAcquisition handles this internally
    };

    const handleEnded = () => {
      setIsPlaying(false);
      recordPlaybackStop({ videoTime: video.currentTime, reason: 'ended' });
      // Don't reset rep count when video ends - just stop processing
      // Pipeline will automatically pause with video
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Manual control of pipeline - rarely needed now
  const startProcessing = useCallback(() => {
    if (!pipelineRef.current) return;

    // Pipeline will automatically respond to video play/pause
    pipelineRef.current.start();
    setAppState((prev) => ({ ...prev, isProcessing: true }));
  }, []);

  // Manual control of pipeline - rarely needed now
  const stopProcessing = useCallback(() => {
    if (!pipelineRef.current) return;

    pipelineRef.current.stop();
    setAppState((prev) => ({ ...prev, isProcessing: false }));
  }, []);

  // Reset state and rep count - explicit action
  const reset = useCallback(() => {
    if (pipelineRef.current) {
      pipelineRef.current.reset();
    }

    // Reset UI state including rep counter
    setAppState((prev) => ({
      ...prev,
      repCounter: {
        ...prev.repCounter,
        count: 0,
        isConnect: false,
        lastConnectState: false,
      },
      currentRepIndex: 0,
    }));

    setRepCount(0);
    setSpineAngle(0);
  }, []);

  // Reset pipeline state without clearing rep count
  const resetPipelineOnly = useCallback(() => {
    if (pipelineRef.current) {
      // Reset pipeline state but preserve rep count
      pipelineRef.current.reset();
    }

    // Reset spine angle but keep rep count
    setSpineAngle(0);
  }, []);

  // Set body part display options
  const setBodyPartDisplay = useCallback(
    (show: boolean, displaySeconds: number) => {
      if (skeletonRendererRef.current) {
        skeletonRendererRef.current.setBodyPartDisplay(show, displaySeconds);
      }

      setAppState((prev) => ({
        ...prev,
        showBodyParts: show,
        bodyPartDisplayTime: displaySeconds,
      }));
    },
    []
  );

  // Set debug mode
  const setDebugMode = useCallback((enabled: boolean) => {
    if (skeletonRendererRef.current) {
      skeletonRendererRef.current.setDebugMode(enabled);
    }
  }, []);

  // Set display mode
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

  // Toggle play/pause - only controls video, not pipeline
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => {
          // UI events are handled by event listeners
          // Pipeline automatically responds to play/pause via VideoFrameAcquisition
        })
        .catch((err) => {
          console.error('Error playing video:', err);
          setStatus('Error: Could not play video.');
        });
    } else {
      videoRef.current.pause();
      // Pipeline automatically responds to play/pause via VideoFrameAcquisition
    }
  }, []);

  // Frame-by-frame controls
  const frameStep = 1 / 30; // Assuming 30fps video

  // Create a separate skeleton transformer for direct frame processing
  const directSkeletonTransformerRef = useRef<SkeletonTransformer | null>(null);

  // Initialize the direct skeleton transformer
  useEffect(() => {
    // Import required modules dynamically to prevent bundle bloat
    const initDirectTransformer = async () => {
      try {
        // Import the skeleton transformer factory
        const { createSkeletonTransformer } = await import(
          '../pipeline/PipelineFactory'
        );
        // Use saved model preference for consistency with main pipeline
        const savedModel = getSavedModelPreference();
        const blazePoseVariant = getSavedBlazePoseVariant();
        let modelConfig = DEFAULT_MODEL_CONFIG;
        if (savedModel === 'blazepose') {
          switch (blazePoseVariant) {
            case 'full':
              modelConfig = BLAZEPOSE_FULL_CONFIG;
              break;
            case 'heavy':
              modelConfig = BLAZEPOSE_HEAVY_CONFIG;
              break;
            default:
              modelConfig = BLAZEPOSE_LITE_CONFIG;
          }
        }
        directSkeletonTransformerRef.current =
          createSkeletonTransformer(modelConfig);

        // Initialize it
        await directSkeletonTransformerRef.current.initialize();
        console.log('Direct skeleton transformer initialized');
      } catch (error) {
        console.error(
          'Failed to initialize direct skeleton transformer:',
          error
        );
      }
    };

    initDirectTransformer();

    // Cleanup
    return () => {
      directSkeletonTransformerRef.current = null;
    };
  }, []);

  // Process current frame directly - bypassing the pipeline
  const processCurrentFrame = useCallback(() => {
    if (
      !videoRef.current ||
      !skeletonRendererRef.current ||
      !directSkeletonTransformerRef.current
    )
      return;

    // Create a frame event directly
    const frameEvent = {
      frame: videoRef.current,
      timestamp: performance.now(),
    };

    // Use the direct transformer to process the frame
    directSkeletonTransformerRef.current
      .transformToSkeleton(frameEvent)
      .subscribe({
        next: (skeletonEvent: SkeletonEvent) => {
          if (skeletonEvent?.skeleton) {
            // Update UI with angles
            setSpineAngle(
              Math.round(skeletonEvent.skeleton.getSpineAngle() || 0)
            );
            setArmToSpineAngle(
              Math.round(skeletonEvent.skeleton.getArmToVerticalAngle() || 0)
            );

            // Render the skeleton directly
            if (skeletonRendererRef.current) {
              skeletonRendererRef.current.renderSkeleton(
                skeletonEvent.skeleton,
                performance.now()
              );
            }
          }
        },
        error: (err: unknown) => {
          console.error('Error in direct frame processing:', err);
        },
      });
  }, []);

  // Move forward one frame with direct frame processing
  const nextFrame = useCallback(() => {
    if (!videoRef.current) return;

    // Ensure video is paused
    videoRef.current.pause();
    setIsPlaying(false);

    // Move forward by one frame duration
    videoRef.current.currentTime = Math.min(
      videoRef.current.duration,
      videoRef.current.currentTime + frameStep
    );

    // Wait for the video to update to the new time using the seeked event
    const handleSeeked = () => {
      // Process the frame directly without pipeline
      processCurrentFrame();
    };

    // Add event listener for when seeking is complete
    // Use { once: true } to automatically remove the listener after it's called
    videoRef.current.addEventListener('seeked', handleSeeked, { once: true });
  }, [processCurrentFrame]);

  // Move backward one frame with direct frame processing
  const previousFrame = useCallback(() => {
    if (!videoRef.current) return;

    // Ensure video is paused
    videoRef.current.pause();
    setIsPlaying(false);

    // Move backward by one frame duration
    videoRef.current.currentTime = Math.max(
      0,
      videoRef.current.currentTime - frameStep
    );

    // Wait for the video to update to the new time using the seeked event
    const handleSeeked = () => {
      // Process the frame directly without pipeline
      processCurrentFrame();
    };

    // Add event listener for when seeking is complete
    // Use { once: true } to automatically remove the listener after it's called
    videoRef.current.addEventListener('seeked', handleSeeked, { once: true });
  }, [processCurrentFrame]);

  // Start camera
  const startCamera = useCallback(async () => {
    if (!frameAcquisitionRef.current) return;

    setStatus('Starting camera...');
    try {
      await frameAcquisitionRef.current.stopCamera();
      if (pipelineRef.current && appState.isProcessing) {
        stopProcessing();
      }
      await frameAcquisitionRef.current.startCamera(appState.cameraMode);

      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          // Video play event will start the pipeline
          videoRef.current?.play().catch((err) => {
            console.error('Error starting camera video playback:', err);
          });
        };
      }

      setAppState((prev) => ({ ...prev, usingCamera: true }));
    } catch (error) {
      console.error('Error accessing camera:', error);
      setStatus('Error: Could not access camera.');
    }
  }, [appState.cameraMode, appState.isProcessing, stopProcessing]);

  // Switch camera
  const switchCamera = useCallback(async () => {
    if (!frameAcquisitionRef.current || !appState.usingCamera) return;

    const newMode =
      appState.cameraMode === 'environment' ? 'user' : 'environment';

    try {
      // Stop pipeline while switching cameras
      if (pipelineRef.current && appState.isProcessing) {
        stopProcessing();
      }

      await frameAcquisitionRef.current.stopCamera();
      await frameAcquisitionRef.current.startCamera(newMode);

      // Video play event will restart the pipeline
      if (videoRef.current) {
        videoRef.current.play().catch((err) => {
          console.error('Error restarting video after camera switch:', err);
        });
      }

      setAppState((prev) => ({ ...prev, cameraMode: newMode }));
    } catch (error) {
      console.error('Error switching camera:', error);
      setStatus('Error: Could not switch camera.');
    }
  }, [
    appState.cameraMode,
    appState.usingCamera,
    appState.isProcessing,
    stopProcessing,
  ]);

  // Stop video and reset state while preserving rep count
  const resetVideoAndState = useCallback(() => {
    if (!videoRef.current || !pipelineRef.current) return;

    // Stop current video playback
    videoRef.current.pause();
    videoRef.current.currentTime = 0;

    // Reset pipeline state without stopping it
    if (pipelineRef.current) {
      pipelineRef.current.reset();
    }

    // Reset video state but preserve rep count
    setVideoStartTime(null);
    // Do NOT reset rep count: setRepCount(0);
    setSpineAngle(0);
    setCurrentVideoFile(null);

    // Reset display mode to ensure overlay is visible
    setDisplayMode(appState.displayMode);
  }, [appState.displayMode, setDisplayMode]);

  // Load hardcoded video
  const loadHardcodedVideo = useCallback(async () => {
    if (!frameAcquisitionRef.current || !videoRef.current) return;

    console.log('[DEBUG] loadHardcodedVideo: Function called');
    setStatus('Loading sample video...');
    try {
      // Reset state and stop current video
      resetVideoAndState();

      // Try remote URL first, fall back to local
      let videoURL = DEFAULT_SAMPLE_VIDEO;
      let response = await fetch(videoURL);

      if (!response.ok) {
        console.log(
          '[DEBUG] Remote sample failed, falling back to local:',
          response.status
        );
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
      setCurrentVideoFile(videoFile);

      // Use blob URL to avoid double-fetching the video
      const blobUrl = URL.createObjectURL(blob);
      await frameAcquisitionRef.current.loadVideoFromURL(blobUrl);
      setAppState((prev) => ({ ...prev, usingCamera: false }));
      setStatus('Video loaded. Press Play to start.');
      recordVideoLoad({ source: 'hardcoded', fileName: 'sample-video.mp4' });

      // Make sure the canvas is visible
      if (canvasRef.current) {
        canvasRef.current.style.display = 'block';
      }

      // Force pipeline reset
      if (pipelineRef.current) {
        pipelineRef.current.reset();
      }

      // Don't auto-play - let user press Play button manually.
      // This ensures React effects have time to run and reinitialize
      // the pipeline with the live pose cache before playback starts.
    } catch (error) {
      console.error('[DEBUG] loadHardcodedVideo: Error loading video:', error);
      setStatus('Error: Could not load hardcoded video.');
    }
  }, [resetVideoAndState]);

  // Handle video upload
  const handleVideoUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (
        !event.target.files ||
        !event.target.files[0] ||
        !frameAcquisitionRef.current ||
        !videoRef.current
      )
        return;

      // Reset state and stop current video
      resetVideoAndState();

      const file = event.target.files[0];
      const fileURL = URL.createObjectURL(file);

      // Store the video file for pose extraction
      setCurrentVideoFile(file);

      frameAcquisitionRef.current
        .loadVideoFromURL(fileURL)
        .then(() => {
          setStatus(`Loaded: ${file.name}. Press Play to start.`);
          setAppState((prev) => ({ ...prev, usingCamera: false }));

          // Don't auto-play - let user press Play button manually.
          // This ensures React effects have time to run and reinitialize
          // the pipeline with the live pose cache before playback starts.
        })
        .catch((error) => {
          console.error('Error loading video:', error);
          setStatus('Error: Could not load video.');
        });
    },
    [resetVideoAndState]
  );

  // Stop video but preserve rep count and videoStartTime (for filmstrip seeking)
  const stopVideo = useCallback(() => {
    if (!videoRef.current) return;

    // Pause video and rewind
    videoRef.current.pause();
    videoRef.current.currentTime = 0;

    // Preserve videoStartTime so filmstrip thumbnails can still seek to checkpoints
    // videoStartTime will be reset when a new video is loaded via resetVideoAndState
    setIsPlaying(false);

    // Reset just the pipeline state, not the rep count
    if (pipelineRef.current) {
      // Don't fully reset - just prepare for next video without losing rep count
      // pipelineRef.current.reset();
    }

    // Reset display mode to ensure overlay is visible
    setDisplayMode(appState.displayMode);
  }, [appState.displayMode, setDisplayMode]);

  // Rep navigation
  const navigateToPreviousRep = useCallback(() => {
    if (appState.currentRepIndex > 0) {
      setAppState((prev) => ({
        ...prev,
        currentRepIndex: prev.currentRepIndex - 1,
      }));
    }
  }, [appState.currentRepIndex]);

  const navigateToNextRep = useCallback(() => {
    if (appState.currentRepIndex < repCount - 1) {
      setAppState((prev) => ({
        ...prev,
        currentRepIndex: prev.currentRepIndex + 1,
      }));
    }
  }, [appState.currentRepIndex, repCount]);

  // Track fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Setup fullscreen detection and keyboard navigation
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Fullscreen mode only controls
      if (document.fullscreenElement) {
        if (event.key === 'ArrowLeft') {
          navigateToPreviousRep();
        } else if (event.key === 'ArrowRight') {
          navigateToNextRep();
        }
      }

      // Global video controls (work in any view)
      if (event.key === ' ' || event.key === 'Space') {
        // Space bar toggles play/pause
        event.preventDefault(); // Prevent page scrolling
        togglePlayPause();
      } else if (event.key === '.') {
        // Period key steps forward one frame
        event.preventDefault();
        nextFrame();
      } else if (event.key === ',') {
        // Comma key steps backward one frame
        event.preventDefault();
        previousFrame();
      }
    };

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Clean up event listeners on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [
    navigateToPreviousRep,
    navigateToNextRep,
    togglePlayPause,
    nextFrame,
    previousFrame,
  ]);

  // Helper for video container class
  const getVideoContainerClass = useCallback(() => {
    if (!videoRef.current) return '';

    const { videoWidth, videoHeight } = videoRef.current;
    return videoWidth > videoHeight ? 'video-landscape' : 'video-portrait';
  }, []);

  /**
   * Reinitialize the pipeline with cached pose data.
   * Call this when cached pose data becomes available to switch from ML inference
   * to using pre-extracted poses.
   */
  const reinitializeWithCachedPoses = useCallback(
    async (cachedPoseTrack: PoseTrackFile) => {
      if (!videoRef.current || !canvasRef.current) {
        console.warn('Cannot reinitialize: video or canvas not ready');
        return;
      }

      console.log('Reinitializing pipeline with cached pose data...');

      // Stop current pipeline
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }

      // Clean up existing subscriptions
      for (const sub of pipelineSubscriptionsRef.current) {
        sub.unsubscribe();
      }
      pipelineSubscriptionsRef.current = [];

      try {
        // Create new pipeline with cached data
        const pipeline = createPipeline(videoRef.current, canvasRef.current, {
          cachedPoseTrack,
        });
        pipelineRef.current = pipeline;

        // Initialize the new pipeline (no-op for cached transformer)
        await pipeline.initialize();

        // Set up subscriptions for the new pipeline
        setupPipelineSubscriptions(pipeline);

        // Update state to indicate we're using cached poses
        setUsingCachedPoses(true);
        setAppState((prev) => ({ ...prev, isModelLoaded: true }));
        setStatus('Ready (using cached poses)');

        console.log('Pipeline reinitialized with cached pose data');
      } catch (error) {
        console.error('Failed to reinitialize with cached poses:', error);
        setStatus('Error: Failed to load cached poses');
      }
    },
    [setupPipelineSubscriptions]
  );

  /**
   * Reinitialize the pipeline with a live pose cache for streaming mode.
   * Call this when extraction starts to enable playback using progressively
   * extracted frames instead of ML inference.
   */
  const reinitializeWithLiveCache = useCallback(
    async (liveCache: LivePoseCache) => {
      if (!videoRef.current || !canvasRef.current) {
        console.warn('Cannot reinitialize: video or canvas not ready');
        return;
      }

      console.log('Reinitializing pipeline with live pose cache...');

      // Stop current pipeline
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }

      // Clean up existing subscriptions
      for (const sub of pipelineSubscriptionsRef.current) {
        sub.unsubscribe();
      }
      pipelineSubscriptionsRef.current = [];

      try {
        // Create new pipeline with live cache for streaming
        const pipeline = createPipeline(videoRef.current, canvasRef.current, {
          livePoseCache: liveCache,
        });
        pipelineRef.current = pipeline;

        // Initialize the new pipeline (no-op for cached transformer)
        await pipeline.initialize();

        // Set up subscriptions for the new pipeline
        setupPipelineSubscriptions(pipeline);

        // Update state to indicate we're using cached poses (streaming)
        setUsingCachedPoses(true);
        setAppState((prev) => ({ ...prev, isModelLoaded: true }));
        setStatus('Ready (streaming poses)');

        console.log('Pipeline reinitialized with live pose cache');
      } catch (error) {
        console.error('Failed to reinitialize with live cache:', error);
        setStatus('Error: Failed to initialize streaming');
      }
    },
    [setupPipelineSubscriptions]
  );

  return {
    // State
    appState,
    status,
    repCount,
    spineAngle,
    armToSpineAngle,
    isPlaying,
    videoStartTime,
    isFullscreen,
    currentVideoFile,
    usingCachedPoses,

    // Refs
    videoRef,
    canvasRef,
    fileInputRef,
    checkpointGridRef,
    pipelineRef,

    // Actions
    startCamera,
    switchCamera,
    handleVideoUpload,
    loadHardcodedVideo,
    togglePlayPause,
    stopVideo,
    startProcessing,
    stopProcessing,
    reset, // Full reset including rep count
    resetPipelineOnly, // Reset pipeline without rep count
    nextFrame, // Move forward one frame
    previousFrame, // Move backward one frame
    setBodyPartDisplay,
    setDisplayMode,
    setDebugMode,
    navigateToPreviousRep,
    navigateToNextRep,
    getVideoContainerClass,
    reinitializeWithCachedPoses, // Switch to cached poses when available
    reinitializeWithLiveCache, // Switch to streaming poses during extraction
  };
}
