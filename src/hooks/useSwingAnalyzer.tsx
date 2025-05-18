import { useCallback, useEffect, useRef, useState } from 'react';
import type { Skeleton } from '../models/Skeleton';
import type { Pipeline, PipelineResult } from '../pipeline/Pipeline';
import { type AppState } from '../types';
import { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';
import { createFrameAcquisition, createPipeline } from '../pipeline/PipelineFactory';
import type { VideoFrameAcquisition } from '../pipeline/VideoFrameAcquisition';
import type { SkeletonEvent } from '../pipeline/PipelineInterfaces';

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
      isHinge: false,
      lastHingeState: false,
      hingeThreshold: 45,
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
  }, []);

  // Setup persistent subscriptions to pipeline events and start it once
  useEffect(() => {
    if (!pipelineRef.current) return;
    
    const pipeline = pipelineRef.current;
    
    // Subscribe to skeleton events to render every detected skeleton
    const skeletonSubscription = pipeline.getSkeletonEvents().subscribe({
      next: (skeletonEvent: SkeletonEvent) => {
        if (skeletonEvent.skeleton) {
          setSpineAngle(Math.round(skeletonEvent.skeleton.getSpineAngle() || 0));
          setArmToSpineAngle(Math.round(skeletonEvent.skeleton.getArmToSpineAngle() || 0));
          renderSkeleton(skeletonEvent.skeleton);
        }
      },
      error: (err) => {
        console.error('Skeleton event error:', err);
      }
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
      }
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
  }, []);

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
      // When video ends completely, we should reset the pipeline
      reset();
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

  // Reset state
  const reset = useCallback(() => {
    if (pipelineRef.current) {
      pipelineRef.current.reset();
    }

    // Reset UI state
    setAppState((prev) => ({
      ...prev,
      repCounter: {
        ...prev.repCounter,
        count: 0, 
        isHinge: false,
        lastHingeState: false
      },
      currentRepIndex: 0
    }));
    
    setRepCount(0);
    setSpineAngle(0);
  }, []);

  // Render skeleton on canvas
  const renderSkeleton = useCallback((skeleton: Skeleton) => {
    if (skeleton && skeletonRendererRef.current) {
      skeletonRendererRef.current.renderSkeleton(skeleton, performance.now());
    }
  }, []);

  // Set body part display options
  const setBodyPartDisplay = useCallback((show: boolean, displaySeconds: number) => {
    if (skeletonRendererRef.current) {
      skeletonRendererRef.current.setBodyPartDisplay(show, displaySeconds);
    }
    
    setAppState((prev) => ({
      ...prev, 
      showBodyParts: show, 
      bodyPartDisplayTime: displaySeconds
    }));
  }, []);

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
          videoRef.current?.play().catch(err => {
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

    const newMode = appState.cameraMode === 'environment' ? 'user' : 'environment';

    try {
      // Stop pipeline while switching cameras
      if (pipelineRef.current && appState.isProcessing) {
        stopProcessing();
      }
      
      await frameAcquisitionRef.current.stopCamera();
      await frameAcquisitionRef.current.startCamera(newMode);
      
      // Video play event will restart the pipeline
      if (videoRef.current) {
        videoRef.current.play().catch(err => {
          console.error('Error restarting video after camera switch:', err);
        });
      }
      
      setAppState((prev) => ({ ...prev, cameraMode: newMode }));
    } catch (error) {
      console.error('Error switching camera:', error);
      setStatus('Error: Could not switch camera.');
    }
  }, [appState.cameraMode, appState.usingCamera, appState.isProcessing, stopProcessing]);

  // Stop video and reset state
  const resetVideoAndState = useCallback(() => {
    if (!videoRef.current || !pipelineRef.current) return;
    
    // Stop current video playback
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
    
    // Reset pipeline state - don't stop it, just reset its internal state
    if (pipelineRef.current) {
      pipelineRef.current.reset();
    }
    
    // Reset UI state
    setVideoStartTime(null);
    setRepCount(0);
    setSpineAngle(0);
    
    // Reset display mode to ensure overlay is visible
    setDisplayMode(appState.displayMode);
  }, [appState.displayMode]);

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
        videoRef.current.play().catch(err => {
          console.error('Error playing hardcoded video:', err);
        });
      } else if (videoRef.current) {
        videoRef.current.addEventListener('loadeddata', () => {
          // Reset display mode again just to be safe
          setDisplayMode(appState.displayMode);
          
          videoRef.current?.play().catch(err => {
            console.error('Error playing hardcoded video after load:', err);
          });
        }, { once: true });
      }
    } catch (error) {
      console.error('[DEBUG] loadHardcodedVideo: Error loading video:', error);
      setStatus('Error: Could not load hardcoded video.');
    }
  }, [resetVideoAndState]);

  // Handle video upload
  const handleVideoUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0] || !frameAcquisitionRef.current || !videoRef.current) return;

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
          videoRef.current.play().catch(err => {
            console.error('Error playing uploaded video:', err);
          });
        } else if (videoRef.current) {
          videoRef.current.addEventListener('loadeddata', () => {
            videoRef.current?.play().catch(err => {
              console.error('Error playing uploaded video after load:', err);
            });
          }, { once: true });
        }
      })
      .catch((error) => {
        console.error('Error loading video:', error);
        setStatus('Error: Could not load video.');
      });
  }, [resetVideoAndState]);

  // Stop video
  const stopVideo = useCallback(() => {
    resetVideoAndState();
  }, [resetVideoAndState]);

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
    reset,
    setBodyPartDisplay,
    setDisplayMode,
    setDebugMode,
    navigateToPreviousRep,
    navigateToNextRep,
    getVideoContainerClass
  };
} 