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
import type { VideoFrameAcquisition } from '../pipeline/VideoFrameAcquisition';
import type {
  SkeletonEvent,
  SkeletonTransformer,
} from '../pipeline/PipelineInterfaces';
import {
  recordPlaybackPause,
  recordPlaybackStart,
  recordPlaybackStop,
  recordVideoLoad,
} from '../services/SessionRecorder';
import type { AppState } from '../types';
import type { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';

export interface UseVideoControlsParams {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  frameAcquisitionRef: React.RefObject<VideoFrameAcquisition | null>;
  skeletonRendererRef: React.RefObject<SkeletonRenderer | null>;
  appState: AppState;
  setStatus: (status: string) => void;
  setSpineAngle: (angle: number) => void;
  setArmToSpineAngle: (angle: number) => void;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  setDisplayMode: (mode: 'both' | 'video' | 'overlay') => void;
  resetPipeline?: () => void;
}

export interface UseVideoControlsReturn {
  isPlaying: boolean;
  videoStartTime: number | null;
  currentVideoFile: File | null;
  togglePlayPause: () => void;
  nextFrame: () => void;
  previousFrame: () => void;
  resetVideoAndState: () => void;
  loadHardcodedVideo: () => Promise<void>;
  handleVideoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  stopVideo: () => void;
}

export function useVideoControls({
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
  resetPipeline,
}: UseVideoControlsParams): UseVideoControlsReturn {
  // State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [videoStartTime, setVideoStartTime] = useState<number | null>(null);
  const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);

  // Frame-by-frame controls
  const frameStep = 1 / 30; // Assuming 30fps video

  // Create a separate skeleton transformer for direct frame processing
  const directSkeletonTransformerRef = useRef<SkeletonTransformer | null>(null);

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
  }, [videoRef]);

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
  }, [videoRef, setStatus]);

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
  }, [videoRef, skeletonRendererRef, setSpineAngle, setArmToSpineAngle]);

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
  }, [videoRef, processCurrentFrame]);

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
  }, [videoRef, processCurrentFrame]);

  // Stop video and reset state while preserving rep count
  const resetVideoAndState = useCallback(() => {
    if (!videoRef.current) return;

    // Stop current video playback
    videoRef.current.pause();
    videoRef.current.currentTime = 0;

    // Reset pipeline state without stopping it
    if (resetPipeline) {
      resetPipeline();
    }

    // Reset video state but preserve rep count
    setVideoStartTime(null);
    // Do NOT reset rep count: setRepCount(0);
    setSpineAngle(0);
    setCurrentVideoFile(null);

    // Reset display mode to ensure overlay is visible
    setDisplayMode(appState.displayMode);
  }, [
    videoRef,
    resetPipeline,
    setSpineAngle,
    appState.displayMode,
    setDisplayMode,
  ]);

  // Load hardcoded video
  const loadHardcodedVideo = useCallback(async () => {
    if (!frameAcquisitionRef.current || !videoRef.current) return;

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
      if (resetPipeline) {
        resetPipeline();
      }

      // Don't auto-play - let user press Play button manually.
      // This ensures React effects have time to run and reinitialize
      // the pipeline with the live pose cache before playback starts.
    } catch (error) {
      console.error('Error loading hardcoded video:', error);
      setStatus('Error: Could not load hardcoded video.');
    }
  }, [
    frameAcquisitionRef,
    videoRef,
    canvasRef,
    resetVideoAndState,
    resetPipeline,
    setStatus,
    setAppState,
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
    [frameAcquisitionRef, videoRef, resetVideoAndState, setStatus, setAppState]
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
    if (resetPipeline) {
      // Don't fully reset - just prepare for next video without losing rep count
      // resetPipeline();
    }

    // Reset display mode to ensure overlay is visible
    setDisplayMode(appState.displayMode);
  }, [videoRef, resetPipeline, appState.displayMode, setDisplayMode]);

  return {
    isPlaying,
    videoStartTime,
    currentVideoFile,
    togglePlayPause,
    nextFrame,
    previousFrame,
    resetVideoAndState,
    loadHardcodedVideo,
    handleVideoUpload,
    stopVideo,
  };
}
