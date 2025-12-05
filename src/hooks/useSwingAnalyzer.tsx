/**
 * useSwingAnalyzer - Main hook for swing analysis app
 *
 * Composes smaller, focused hooks to provide the full swing analyzer functionality.
 * This is the main entry point for components that need swing analysis capabilities.
 */

import { useCallback, useRef, useState } from 'react';
import type { AppState } from '../types';
import type { LivePoseCache } from '../pipeline/LivePoseCache';
import type { PoseTrackFile } from '../types/posetrack';
import { usePipelineLifecycle } from './usePipelineLifecycle';
import { useVideoControls } from './useVideoControls';
import { useCameraControls } from './useCameraControls';
import { useSkeletonRendering } from './useSkeletonRendering';
import { useKeyboardNavigation } from './useKeyboardNavigation';

export function useSwingAnalyzer(initialState?: Partial<AppState>) {
  // ========================================
  // Core State
  // ========================================
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
  const [usingCachedPoses, setUsingCachedPoses] = useState<boolean>(false);

  // Refs for elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const checkpointGridRef = useRef<HTMLDivElement>(null);

  // ========================================
  // Pipeline Lifecycle Hook
  // ========================================
  const {
    pipelineRef,
    frameAcquisitionRef,
    skeletonRendererRef,
    livePoseCacheRef,
    startProcessing,
    stopProcessing,
    reset: resetPipeline,
    resetPipelineOnly,
    reinitializeWithCachedPoses: pipelineReinitializeWithCached,
    reinitializeWithLiveCache: pipelineReinitializeWithLive,
  } = usePipelineLifecycle({
    videoRef,
    canvasRef,
    showBodyParts: appState.showBodyParts,
    bodyPartDisplayTime: appState.bodyPartDisplayTime,
    onModelLoaded: () => setAppState((prev) => ({ ...prev, isModelLoaded: true })),
    onStatusChange: setStatus,
    onProcessingChange: (isProcessing) =>
      setAppState((prev) => ({ ...prev, isProcessing })),
    onRepCountUpdate: setRepCount,
    onSpineAngleUpdate: setSpineAngle,
    onArmToSpineAngleUpdate: setArmToSpineAngle,
    onUsingCachedPosesChange: setUsingCachedPoses,
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
  // Skeleton Processing (Direct Call, No Subscriptions)
  // ========================================
  // Handle skeleton updates from cached pose playback.
  // This replaces Observable subscriptions with direct processFrame() calls.
  const handleSkeletonUpdated = useCallback(
    (skeleton: import('../models/Skeleton').Skeleton, videoTime: number) => {
      const pipeline = pipelineRef.current;
      if (!pipeline) return;

      // Process through SwingAnalyzer directly (no Observable subscription)
      const result = pipeline.getSwingAnalyzer().processFrame(
        skeleton,
        performance.now(),
        videoTime
      );

      // Update state directly
      setSpineAngle(Math.round(skeleton.getSpineAngle() || 0));
      setArmToSpineAngle(Math.round(skeleton.getArmToVerticalAngle() || 0));
      setRepCount(result.repCount);
    },
    [pipelineRef]
  );

  // ========================================
  // Skeleton Rendering Hook
  // ========================================
  const { setBodyPartDisplay, setDebugMode } =
    useSkeletonRendering({
      videoRef,
      canvasRef,
      livePoseCacheRef,
      showBodyParts: appState.showBodyParts,
      bodyPartDisplayTime: appState.bodyPartDisplayTime,
      onSkeletonUpdated: handleSkeletonUpdated,
    });

  // Wrap setBodyPartDisplay to also update appState
  const handleSetBodyPartDisplay = useCallback(
    (show: boolean, displaySeconds: number) => {
      setBodyPartDisplay(show, displaySeconds);
      setAppState((prev) => ({
        ...prev,
        showBodyParts: show,
        bodyPartDisplayTime: displaySeconds,
      }));
    },
    [setBodyPartDisplay]
  );

  // ========================================
  // Video Controls Hook
  // ========================================
  const {
    isPlaying,
    videoStartTime,
    currentVideoFile,
    togglePlayPause,
    nextFrame,
    previousFrame,
    loadHardcodedVideo,
    handleVideoUpload,
    stopVideo,
  } = useVideoControls({
    videoRef,
    canvasRef,
    frameAcquisitionRef,
    skeletonRendererRef,
    appState,
    setStatus,
    setSpineAngle,
    setArmToSpineAngle,
    setAppState,
    setDisplayMode,
    resetPipeline: () => pipelineRef.current?.reset(),
  });

  // ========================================
  // Camera Controls Hook
  // ========================================
  const { startCamera, switchCamera } = useCameraControls({
    frameAcquisitionRef,
    videoRef,
    pipelineRef,
    cameraMode: appState.cameraMode,
    isProcessing: appState.isProcessing,
    onCameraModeChange: (mode) =>
      setAppState((prev) => ({ ...prev, cameraMode: mode })),
    onUsingCameraChange: (usingCamera) =>
      setAppState((prev) => ({ ...prev, usingCamera })),
    onStatusChange: setStatus,
    stopProcessing,
  });

  // ========================================
  // Reset Functions
  // ========================================
  const reset = useCallback(() => {
    resetPipeline();
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
  }, [resetPipeline]);

  // ========================================
  // Rep Navigation
  // ========================================
  const navigateToPreviousRep = useCallback(() => {
    setAppState((prev) => ({
      ...prev,
      currentRepIndex: Math.max(0, prev.currentRepIndex - 1),
    }));
  }, []);

  const navigateToNextRep = useCallback(() => {
    if (repCount <= 0) return; // No reps to navigate
    setAppState((prev) => ({
      ...prev,
      currentRepIndex: Math.min(repCount - 1, prev.currentRepIndex + 1),
    }));
  }, [repCount]);

  // ========================================
  // Keyboard Navigation Hook
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
  // Cache Reinitialization Wrappers
  // ========================================
  const reinitializeWithCachedPoses = useCallback(
    async (cachedPoseTrack: PoseTrackFile) => {
      await pipelineReinitializeWithCached(cachedPoseTrack);
      setUsingCachedPoses(true);
    },
    [pipelineReinitializeWithCached]
  );

  const reinitializeWithLiveCache = useCallback(
    async (liveCache: LivePoseCache) => {
      await pipelineReinitializeWithLive(liveCache);
      setUsingCachedPoses(true);
    },
    [pipelineReinitializeWithLive]
  );

  // ========================================
  // Helper Functions
  // ========================================
  const getVideoContainerClass = useCallback(() => {
    if (!videoRef.current) return '';
    const { videoWidth, videoHeight } = videoRef.current;
    return videoWidth > videoHeight ? 'video-landscape' : 'video-portrait';
  }, []);

  // ========================================
  // Return Public API
  // ========================================
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
    reset,
    resetPipelineOnly,
    nextFrame,
    previousFrame,
    setBodyPartDisplay: handleSetBodyPartDisplay,
    setDisplayMode,
    setDebugMode,
    navigateToPreviousRep,
    navigateToNextRep,
    getVideoContainerClass,
    reinitializeWithCachedPoses,
    reinitializeWithLiveCache,
  };
}
