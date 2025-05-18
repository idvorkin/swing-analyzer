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

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const checkpointGridRef = useRef<HTMLDivElement>(null);

  // Pipeline references
  const pipelineRef = useRef<Pipeline | null>(null);
  const frameAcquisitionRef = useRef<VideoFrameAcquisition | null>(null);
  const skeletonRendererRef = useRef<SkeletonRenderer | null>(null);
  const pipelineSubscriptionRef = useRef<any>(null);
  const skeletonSubscriptionRef = useRef<any>(null);

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
      stopProcessing();
    };
  }, []);

  // Start processing pipeline
  const startProcessing = useCallback(() => {
    console.log('[DEBUG] startProcessing: Function called');
    
    if (!pipelineRef.current || appState.isProcessing) return;

    const pipeline = pipelineRef.current;
    
    // Subscribe to pipeline results
    const pipelineObservable = pipeline.start();
    
    // Subscribe to skeleton events to render every detected skeleton
    skeletonSubscriptionRef.current = pipeline.getSkeletonEvents().subscribe({
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
    pipelineSubscriptionRef.current = pipelineObservable.subscribe({
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

    setAppState((prev) => ({ ...prev, isProcessing: true }));
  }, [appState.isProcessing]);

  // Stop processing pipeline
  const stopProcessing = useCallback(() => {
    if (!pipelineRef.current || !appState.isProcessing) return;

    if (pipelineSubscriptionRef.current) {
      pipelineSubscriptionRef.current.unsubscribe();
      pipelineSubscriptionRef.current = null;
    }

    if (skeletonSubscriptionRef.current) {
      skeletonSubscriptionRef.current.unsubscribe();
      skeletonSubscriptionRef.current = null;
    }

    pipelineRef.current.stop();
    setAppState((prev) => ({ ...prev, isProcessing: false }));
  }, [appState.isProcessing]);

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

  // Play video explicitly
  const play = useCallback(() => {
    if (!videoRef.current || !appState.isModelLoaded) return;

    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          // Start pipeline only if not already processing
          if (pipelineRef.current && !appState.isProcessing) {
            startProcessing();
          }
        })
        .catch((err) => console.error('[DEBUG] play: Error playing video:', err));
    }
  }, [appState.isModelLoaded, appState.isProcessing, startProcessing]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          // Pipeline will automatically start processing frames due to reactive stream
        })
        .catch((err) => console.error('[DEBUG] togglePlayPause: Error playing video:', err));
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      // Pipeline will automatically stop processing frames due to reactive stream
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
          // Start the pipeline once the camera is ready
          startProcessing();
        };
      }

      setAppState((prev) => ({ ...prev, usingCamera: true }));
    } catch (error) {
      console.error('Error accessing camera:', error);
      setStatus('Error: Could not access camera.');
    }
  }, [appState.cameraMode, appState.isProcessing, startProcessing, stopProcessing]);

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
      
      // Restart pipeline with new camera
      startProcessing();
      
      setAppState((prev) => ({ ...prev, cameraMode: newMode }));
    } catch (error) {
      console.error('Error switching camera:', error);
      setStatus('Error: Could not switch camera.');
    }
  }, [appState.cameraMode, appState.usingCamera, appState.isProcessing, startProcessing, stopProcessing]);

  // Load hardcoded video
  const loadHardcodedVideo = useCallback(async () => {
    if (!frameAcquisitionRef.current || !videoRef.current) return;

    console.log('[DEBUG] loadHardcodedVideo: Function called');
    setStatus('Loading hardcoded video...');
    try {
      // Stop pipeline if it's running
      if (pipelineRef.current && appState.isProcessing) {
        stopProcessing();
      }
      
      const videoURL = '/videos/swing-sample.mp4';

      if (!videoURL) {
        throw new Error('Video URL is empty');
      }

      await frameAcquisitionRef.current.loadVideoFromURL(videoURL);
      setAppState((prev) => ({ ...prev, usingCamera: false }));
      setStatus('Hardcoded video loaded.');

      if (videoRef.current && videoRef.current.readyState >= 2) {
        play();
      } else if (videoRef.current) {
        videoRef.current.addEventListener('loadeddata', () => play(), { once: true });
      }
    } catch (error) {
      console.error('[DEBUG] loadHardcodedVideo: Error loading video:', error);
      setStatus('Error: Could not load hardcoded video.');
    }
  }, [appState.isProcessing, play, stopProcessing]);

  // Handle video upload
  const handleVideoUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0] || !frameAcquisitionRef.current || !videoRef.current) return;

    // Stop pipeline if it's running
    if (pipelineRef.current && appState.isProcessing) {
      stopProcessing();
    }
    
    const file = event.target.files[0];
    const fileURL = URL.createObjectURL(file);

    frameAcquisitionRef.current
      .loadVideoFromURL(fileURL)
      .then(() => {
        setStatus(`Loaded video: ${file.name}`);
        setAppState((prev) => ({ ...prev, usingCamera: false }));

        if (videoRef.current && videoRef.current.readyState >= 2) {
          play();
        } else if (videoRef.current) {
          videoRef.current.addEventListener('loadeddata', () => play(), { once: true });
        }
      })
      .catch((error) => {
        console.error('Error loading video:', error);
        setStatus('Error: Could not load video.');
      });
  }, [appState.isProcessing, play, stopProcessing]);

  // Stop video
  const stopVideo = useCallback(() => {
    if (!videoRef.current || !pipelineRef.current) return;

    videoRef.current.pause();
    videoRef.current.currentTime = 0;
    setIsPlaying(false);
    
    // Just reset the pipeline state, don't stop it
    if (pipelineRef.current) {
      pipelineRef.current.reset();
    }
    
    // Reset UI state
    setRepCount(0);
    setSpineAngle(0);
  }, []);

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
    play,
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