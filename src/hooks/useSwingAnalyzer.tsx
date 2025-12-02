import { useCallback, useEffect, useRef, useState } from 'react';
import type { Skeleton } from '../models/Skeleton';
import type { Pipeline, PipelineResult } from '../pipeline/Pipeline';
import {
  createFrameAcquisition,
  createPipeline,
} from '../pipeline/PipelineFactory';
import type { SkeletonEvent } from '../pipeline/PipelineInterfaces';
import type { VideoFrameAcquisition } from '../pipeline/VideoFrameAcquisition';
import type { AppState } from '../types';
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
  const [fps, setFps] = useState<number>(0);
  const [modelType, setModelType] = useState<string>('Loading...');
  const [analysisTime, setAnalysisTime] = useState<number>(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const checkpointGridRef = useRef<HTMLDivElement>(null);

  // Pipeline references
  const pipelineRef = useRef<Pipeline | null>(null);
  const frameAcquisitionRef = useRef<VideoFrameAcquisition | null>(null);
  const skeletonRendererRef = useRef<SkeletonRenderer | null>(null);

  // Initialize pipeline and models
  useEffect(() => {
    const initializePipeline = async () => {
      try {
        if (videoRef.current && canvasRef.current) {
          // Create pipeline components
          const pipeline = createPipeline(videoRef.current, canvasRef.current);
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

          // Set the model type
          const initialModelType = pipeline.getModelType();
          setModelType(initialModelType);

          // Set initial model type on skeleton renderer
          // Detect from model type string whether it's BlazePose or MoveNet
          if (skeletonRendererRef.current) {
            const modelName = initialModelType.includes('BlazePose')
              ? 'BlazePose'
              : 'MoveNet';
            skeletonRendererRef.current.setModelType(modelName);
          }

          setAppState((prev) => ({ ...prev, isModelLoaded: true }));
          setStatus('Ready. Upload a video or start camera.');
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
        setStatus('Error: Failed to initialize model.');
      }
    };

    initializePipeline();

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
  }, [appState.bodyPartDisplayTime, appState.showBodyParts]);

  // Render skeleton on canvas
  const renderSkeleton = useCallback((skeleton: Skeleton) => {
    if (skeleton && skeletonRendererRef.current) {
      skeletonRendererRef.current.renderSkeleton(skeleton, performance.now());
    }
  }, []);

  // Manual control of pipeline - rarely needed now
  const stopProcessing = useCallback(() => {
    if (!pipelineRef.current) return;

    pipelineRef.current.stop();
    setAppState((prev) => ({ ...prev, isProcessing: false }));
  }, []);

  // Setup persistent subscriptions to pipeline events and start it once
  useEffect(() => {
    if (!pipelineRef.current) return;

    const pipeline = pipelineRef.current;

    // FPS tracking
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    // Analysis time tracking (smoothed over 3 seconds)
    const analysisTimes: number[] = [];
    let lastAnalysisUpdate = performance.now();

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
          renderSkeleton(skeletonEvent.skeleton);

          // Calculate FPS
          frameCount++;
          const now = performance.now();
          const elapsed = now - lastFpsUpdate;
          if (elapsed >= 1000) {
            // Update FPS every second
            const currentFps = Math.round((frameCount * 1000) / elapsed);
            setFps(currentFps);
            frameCount = 0;
            lastFpsUpdate = now;
          }

          // Calculate analysis time (time from frame event to skeleton event)
          const frameTimestamp = skeletonEvent.poseEvent.frameEvent.timestamp;
          const analysisTimeMs = now - frameTimestamp;
          analysisTimes.push(analysisTimeMs);

          // Update analysis time every 3 seconds with smoothed average
          const analysisElapsed = now - lastAnalysisUpdate;
          if (analysisElapsed >= 3000) {
            if (analysisTimes.length > 0) {
              const avgTime =
                analysisTimes.reduce((sum, t) => sum + t, 0) /
                analysisTimes.length;
              setAnalysisTime(Math.round(avgTime));
              analysisTimes.length = 0; // Clear the array
              lastAnalysisUpdate = now;
            }
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

    // Mark pipeline as processing now - it will automatically respond to video play/pause
    setAppState((prev) => ({ ...prev, isProcessing: true }));

    // Clean up subscriptions on unmount
    return () => {
      // Make sure pipeline is stopped before unsubscribing
      pipeline.stop();
      skeletonSubscription.unsubscribe();
      pipelineSubscription.unsubscribe();
    };
  }, [renderSkeleton]);

  // Add video event listeners to manage UI state only (not pipeline)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      setVideoStartTime(performance.now());
      // Don't manage pipeline here - VideoFrameAcquisition handles this internally
    };

    const handlePause = () => {
      setIsPlaying(false);
      // Don't manage pipeline here - VideoFrameAcquisition handles this internally
    };

    const handleEnded = () => {
      setIsPlaying(false);
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

  // Switch pose detection model
  const switchModel = useCallback(
    async (modelType: 'BlazePose' | 'MoveNet') => {
      if (!pipelineRef.current) return;

      setStatus(`Switching to ${modelType}...`);
      try {
        await pipelineRef.current.switchModel(modelType);
        setModelType(pipelineRef.current.getModelType());

        // Update skeleton renderer to use correct keypoint indices
        if (skeletonRendererRef.current) {
          skeletonRendererRef.current.setModelType(modelType);
        }

        setStatus('Ready. Upload a video or start camera.');
      } catch (error) {
        console.error('Failed to switch model:', error);
        setStatus('Error: Failed to switch model.');
      }
    },
    []
  );

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
  const directSkeletonTransformerRef = useRef<any>(null);

  // Initialize the direct skeleton transformer
  useEffect(() => {
    // Import required modules dynamically to prevent bundle bloat
    const initDirectTransformer = async () => {
      try {
        // Import the skeleton transformer factory
        const { createSkeletonTransformer } = await import(
          '../pipeline/PipelineFactory'
        );
        directSkeletonTransformerRef.current = createSkeletonTransformer();

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
        next: (skeletonEvent: any) => {
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
        error: (err: any) => {
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

    // Reset display mode to ensure overlay is visible
    setDisplayMode(appState.displayMode);
  }, [
    appState.displayMode, // Reset display mode to ensure overlay is visible
    setDisplayMode,
  ]);

  // Load hardcoded video
  const loadHardcodedVideo = useCallback(async () => {
    if (!frameAcquisitionRef.current || !videoRef.current) return;

    console.log('[DEBUG] loadHardcodedVideo: Function called');
    setStatus('Loading hardcoded video...');
    try {
      // Reset state and stop current video
      resetVideoAndState();

      const videoURL = '/videos/swing-sample.mp4';

      if (!videoURL) {
        throw new Error('Video URL is empty');
      }

      await frameAcquisitionRef.current.loadVideoFromURL(videoURL);
      setAppState((prev) => ({ ...prev, usingCamera: false }));
      setStatus('Hardcoded video loaded.');

      // Make sure the canvas is visible before playing
      if (canvasRef.current) {
        canvasRef.current.style.display = 'block';
      }

      // Force pipeline reset before playing
      if (pipelineRef.current) {
        pipelineRef.current.reset();
      }

      // Video element event handlers will handle pipeline start
      if (videoRef.current && videoRef.current.readyState >= 2) {
        videoRef.current.play().catch((err) => {
          console.error('Error playing hardcoded video:', err);
        });
      } else if (videoRef.current) {
        videoRef.current.addEventListener(
          'loadeddata',
          () => {
            // Reset display mode again just to be safe
            setDisplayMode(appState.displayMode);

            videoRef.current?.play().catch((err) => {
              console.error('Error playing hardcoded video after load:', err);
            });
          },
          { once: true }
        );
      }
    } catch (error) {
      console.error('[DEBUG] loadHardcodedVideo: Error loading video:', error);
      setStatus('Error: Could not load hardcoded video.');
    }
  }, [
    resetVideoAndState,
    appState.displayMode, // Reset display mode again just to be safe
    setDisplayMode,
  ]);

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

      frameAcquisitionRef.current
        .loadVideoFromURL(fileURL)
        .then(() => {
          setStatus(`Loaded video: ${file.name}`);
          setAppState((prev) => ({ ...prev, usingCamera: false }));

          // Video element event handlers will handle pipeline start
          if (videoRef.current && videoRef.current.readyState >= 2) {
            videoRef.current.play().catch((err) => {
              console.error('Error playing uploaded video:', err);
            });
          } else if (videoRef.current) {
            videoRef.current.addEventListener(
              'loadeddata',
              () => {
                videoRef.current?.play().catch((err) => {
                  console.error(
                    'Error playing uploaded video after load:',
                    err
                  );
                });
              },
              { once: true }
            );
          }
        })
        .catch((error) => {
          console.error('Error loading video:', error);
          setStatus('Error: Could not load video.');
        });
    },
    [resetVideoAndState]
  );

  // Stop video but preserve rep count
  const stopVideo = useCallback(() => {
    if (!videoRef.current) return;

    // Pause video and rewind
    videoRef.current.pause();
    videoRef.current.currentTime = 0;

    // Reset video start time but preserve rep count
    setVideoStartTime(null);
    setIsPlaying(false);

    // Reset just the pipeline state, not the rep count
    if (pipelineRef.current) {
      // Don't fully reset - just prepare for next video without losing rep count
      // pipelineRef.current.reset();
    }

    // Reset display mode to ensure overlay is visible
    setDisplayMode(appState.displayMode);
  }, [
    appState.displayMode, // Reset display mode to ensure overlay is visible
    setDisplayMode,
  ]);

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
    fps,
    modelType,
    analysisTime,

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
    switchModel,
    navigateToPreviousRep,
    navigateToNextRep,
    getVideoContainerClass,
  };
}
