import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import type { Pipeline, PipelineResult } from '../pipeline/Pipeline';
import {
  createFrameAcquisition,
  createPipeline,
} from '../pipeline/PipelineFactory';
import type { VideoFrameAcquisition } from '../pipeline/VideoFrameAcquisition';
import type { AppState } from '../types';
import { SwingAnalyzerViewModel } from '../viewmodels/SwingAnalyzerViewModel';
import AnalysisSection from './AnalysisSection';
import VideoSection from './VideoSection';
import './App.css';
import DebugModelLoaderPage from './DebugModelLoaderPage';

// Placeholder for the new debug page component (will be created in a separate file)
// const DebugModelLoaderPagePlaceholder: React.FC = () => { // This is no longer needed
// ... placeholder code ...
// };

// Component for the main application layout and functionality
const MainApplication: React.FC = () => {
  console.log('MainApplication: Component rendering started.');
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
  });

  const [status, setStatus] = useState<string>('Loading model...');
  const [repCount, setRepCount] = useState<number>(0);
  const [spineAngle, setSpineAngle] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const checkpointGridRef = useRef<HTMLDivElement>(null);

  // Pipeline references
  const pipelineRef = useRef<Pipeline | null>(null);
  const frameAcquisitionRef = useRef<VideoFrameAcquisition | null>(null);
  const viewModelRef = useRef<SwingAnalyzerViewModel | null>(null);

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

          // Create the view model for skeleton rendering
          const repCounterElement =
            document.getElementById('rep-counter') ||
            document.createElement('div');
          const spineAngleElement =
            document.getElementById('spine-angle') ||
            document.createElement('div');

          // Initialize the pipeline first
          await pipeline.initialize();

          // Create ViewModel after pipeline is initialized so it has the correct state
          viewModelRef.current = new SwingAnalyzerViewModel(
            pipeline,
            videoRef.current,
            canvasRef.current,
            repCounterElement,
            spineAngleElement,
            {
              ...appState,
              isModelLoaded: true, // Explicitly set model as loaded
            }
          );

          // Make sure the ViewModel knows the model is loaded
          await viewModelRef.current.initialize();

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
        pipelineRef.current.stop();
      }
    };
  }, [appState]);

  // Start camera
  const startCamera = async () => {
    if (!frameAcquisitionRef.current) return;

    setStatus('Starting camera...');
    try {
      await frameAcquisitionRef.current.startCamera(appState.cameraMode);

      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          startProcessing();
        };
      }

      setAppState((prev) => ({ ...prev, usingCamera: true }));
    } catch (error) {
      console.error('Error accessing camera:', error);
      setStatus('Error: Could not access camera.');
    }
  };

  // Switch camera
  const switchCamera = async () => {
    if (!frameAcquisitionRef.current || !appState.usingCamera) return;

    const newMode =
      appState.cameraMode === 'environment' ? 'user' : 'environment';

    try {
      await frameAcquisitionRef.current.stopCamera();
      await frameAcquisitionRef.current.startCamera(newMode);

      setAppState((prev) => ({ ...prev, cameraMode: newMode }));
    } catch (error) {
      console.error('Error switching camera:', error);
      setStatus('Error: Could not switch camera.');
    }
  };

  // Handle video upload
  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (
      !event.target.files ||
      !event.target.files[0] ||
      !frameAcquisitionRef.current ||
      !videoRef.current
    )
      return;

    const file = event.target.files[0];
    const fileURL = URL.createObjectURL(file);

    frameAcquisitionRef.current
      .loadVideoFromURL(fileURL)
      .then(() => {
        setStatus(`Loaded video: ${file.name}`);
        setAppState((prev) => ({ ...prev, usingCamera: false }));

        // Check readyState to determine if metadata is loaded
        if (videoRef.current && videoRef.current.readyState >= 2) {
          // Metadata is already loaded, call play directly
          console.log(
            '[DEBUG] handleVideoUpload: Metadata already loaded (readyState >= 2), playing directly'
          );
          play();
        } else if (videoRef.current) {
          // Metadata not yet loaded, set up a one-time event listener
          console.log(
            '[DEBUG] handleVideoUpload: Metadata not loaded yet, setting loadeddata listener'
          );
          videoRef.current.addEventListener(
            'loadeddata',
            () => {
              console.log(
                '[DEBUG] handleVideoUpload: loadeddata event fired, now playing'
              );
              play();
            },
            { once: true }
          ); // Use once: true to automatically remove the listener after it fires
        }
      })
      .catch((error) => {
        console.error('Error loading video:', error);
        setStatus('Error: Could not load video.');
      });
  };

  // Load hardcoded video
  const loadHardcodedVideo = async () => {
    if (!frameAcquisitionRef.current || !videoRef.current) return;

    console.log('[DEBUG] loadHardcodedVideo: Function called');
    setStatus('Loading hardcoded video...');
    try {
      // Load the hardcoded video from public directory
      // Make sure the path is correct - it needs to be relative to the public directory
      const videoURL = '/videos/swing-sample.mp4';

      if (!videoURL) {
        throw new Error('Video URL is empty');
      }

      console.log(
        `[DEBUG] loadHardcodedVideo: Attempting to load video from ${videoURL}`
      );
      await frameAcquisitionRef.current.loadVideoFromURL(videoURL);

      console.log('[DEBUG] loadHardcodedVideo: Video URL loaded successfully');
      setAppState((prev) => ({ ...prev, usingCamera: false }));
      setStatus('Hardcoded video loaded.');

      // Check readyState to determine if metadata is loaded
      if (videoRef.current && videoRef.current.readyState >= 2) {
        // Metadata is already loaded, call play directly
        console.log(
          '[DEBUG] loadHardcodedVideo: Metadata already loaded (readyState >= 2), playing directly'
        );
        play();
      } else if (videoRef.current) {
        // Metadata not yet loaded, set up a one-time event listener
        console.log(
          '[DEBUG] loadHardcodedVideo: Metadata not loaded yet, setting loadeddata listener'
        );
        videoRef.current.addEventListener(
          'loadeddata',
          () => {
            console.log(
              '[DEBUG] loadHardcodedVideo: loadeddata event fired, now playing'
            );
            play();
          },
          { once: true }
        ); // Use once: true to automatically remove the listener after it fires
      }
    } catch (error) {
      console.error('[DEBUG] loadHardcodedVideo: Error loading video:', error);
      setStatus('Error: Could not load hardcoded video.');
    }
  };

  // Play/Pause toggle
  const togglePlayPause = () => {
    console.log('[DEBUG] togglePlayPause: Function called');
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      console.log(
        '[DEBUG] togglePlayPause: Video is paused, attempting to play'
      );
      videoRef.current
        .play()
        .then(() => {
          console.log('[DEBUG] togglePlayPause: Video play() promise resolved');
          setIsPlaying(true);
          startProcessing();
        })
        .catch((err) =>
          console.error('[DEBUG] togglePlayPause: Error playing video:', err)
        );
    } else {
      console.log('[DEBUG] togglePlayPause: Video is playing, pausing now');
      videoRef.current.pause();
      setIsPlaying(false);
      stopProcessing();
    }
  };

  // Stop video
  const stopVideo = () => {
    if (!videoRef.current || !pipelineRef.current) return;

    videoRef.current.pause();
    videoRef.current.currentTime = 0;
    setIsPlaying(false);

    stopProcessing();

    if (viewModelRef.current) {
      console.log('[DEBUG] stopVideo: Using ViewModel to reset pipeline state');
      viewModelRef.current.reset();
    } else {
      console.log(
        '[DEBUG] stopVideo: ViewModel not available, resetting pipeline directly'
      );
      pipelineRef.current.reset();
    }

    setRepCount(0);
    setSpineAngle(0);
  };

  // Play video explicitly (without toggling)
  const play = () => {
    console.log('[DEBUG] play: Function called, conditions:', {
      videoRef: Boolean(videoRef.current),
      isModelLoaded: appState.isModelLoaded,
      isPaused: videoRef.current?.paused,
    });

    if (!videoRef.current || !appState.isModelLoaded) return;

    if (videoRef.current.paused) {
      console.log('[DEBUG] play: Video is paused, attempting to play');
      videoRef.current
        .play()
        .then(() => {
          console.log('[DEBUG] play: Video play() promise resolved');
          setIsPlaying(true);
          console.log('[DEBUG] play: Calling startProcessing()');
          startProcessing();
        })
        .catch((err) =>
          console.error('[DEBUG] play: Error playing video:', err)
        );
    } else {
      console.log('[DEBUG] play: Video is already playing');
    }
  };

  // Start processing pipeline
  const startProcessing = () => {
    console.log('[DEBUG] startProcessing: Function called, conditions:', {
      pipelineExists: Boolean(pipelineRef.current),
      isProcessing: appState.isProcessing,
      viewModelExists: Boolean(viewModelRef.current),
    });

    if (!pipelineRef.current || appState.isProcessing) return;

    if (viewModelRef.current) {
      console.log(
        '[DEBUG] startProcessing: Using ViewModel for pipeline processing'
      );
      viewModelRef.current.startProcessing();
      setAppState((prev) => ({ ...prev, isProcessing: true }));
    } else {
      console.log(
        '[DEBUG] startProcessing: ViewModel not available, falling back to direct pipeline'
      );
      const pipelineObservable = pipelineRef.current.start();

      setAppState((prev) => ({ ...prev, isProcessing: true }));

      console.log(
        '[DEBUG] startProcessing: Subscribing to pipeline observable'
      );
      pipelineObservable.subscribe({
        next: (result: PipelineResult) => {
          console.log('[DEBUG] Pipeline update received:', result);
          setRepCount(result.repCount);
          if (result.skeleton) {
            setSpineAngle(Math.round(result.skeleton.getSpineAngle() || 0));
          }
        },
        error: (err) => {
          console.error('[DEBUG] Pipeline error:', err);
          setStatus('Error in processing pipeline');
        },
      });
    }
  };

  // Stop processing pipeline
  const stopProcessing = () => {
    if (!pipelineRef.current || !appState.isProcessing) return;

    if (viewModelRef.current) {
      console.log('[DEBUG] stopProcessing: Using ViewModel to stop pipeline');
      viewModelRef.current.stopProcessing();
    } else {
      console.log(
        '[DEBUG] stopProcessing: ViewModel not available, stopping pipeline directly'
      );
      pipelineRef.current.stop();
    }

    setAppState((prev) => ({ ...prev, isProcessing: false }));
  };

  // Set display mode
  const setDisplayMode = (mode: 'both' | 'video' | 'overlay') => {
    setAppState((prev) => ({ ...prev, displayMode: mode }));

    if (viewModelRef.current) {
      console.log(
        '[DEBUG] setDisplayMode: Using ViewModel for display mode:',
        mode
      );

      // This is a workaround since we don't have a direct method in ViewModel
      const updatedState = {
        ...viewModelRef.current.getAppState(),
        displayMode: mode,
      };

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
    }
  };

  // Rep navigation
  const navigateToPreviousRep = () => {
    if (appState.currentRepIndex > 0) {
      setAppState((prev) => ({
        ...prev,
        currentRepIndex: prev.currentRepIndex - 1,
      }));
    }
  };

  const navigateToNextRep = () => {
    if (appState.currentRepIndex < repCount - 1) {
      setAppState((prev) => ({
        ...prev,
        currentRepIndex: prev.currentRepIndex + 1,
      }));
    }
  };

  // Calculate canvas styles based on video dimensions
  const getVideoContainerClass = () => {
    if (!videoRef.current) return '';

    const { videoWidth, videoHeight } = videoRef.current;
    return videoWidth > videoHeight ? 'video-landscape' : 'video-portrait';
  };

  // Make sure the canvas is properly sized to match the video
  useEffect(() => {
    const updateCanvasDimensions = () => {
      if (videoRef.current && canvasRef.current) {
        if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
          console.log(
            '[DEBUG] Updating canvas dimensions to match video:',
            videoRef.current.videoWidth,
            'x',
            videoRef.current.videoHeight
          );

          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
        }
      }
    };

    // Update dimensions initially
    updateCanvasDimensions();

    // Add event listeners
    const handleLoadedMetadata = () => updateCanvasDimensions();
    const handleResize = () => updateCanvasDimensions();

    if (videoRef.current) {
      videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
      window.addEventListener('resize', handleResize);
    }

    // Cleanup
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener(
          'loadedmetadata',
          handleLoadedMetadata
        );
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <>
      <header>
        <h2>Swing Coach 3</h2>
      </header>

      <main>
        <VideoSection
          videoRef={videoRef}
          canvasRef={canvasRef}
          fileInputRef={fileInputRef}
          appState={appState}
          isPlaying={isPlaying}
          startCamera={startCamera}
          switchCamera={switchCamera}
          handleVideoUpload={handleVideoUpload}
          loadHardcodedVideo={loadHardcodedVideo}
          togglePlayPause={togglePlayPause}
          stopVideo={stopVideo}
          getVideoContainerClass={getVideoContainerClass}
        />

        <AnalysisSection
          appState={appState}
          status={status}
          repCount={repCount}
          spineAngle={spineAngle}
          checkpointGridRef={checkpointGridRef}
          navigateToPreviousRep={navigateToPreviousRep}
          navigateToNextRep={navigateToNextRep}
          setDisplayMode={setDisplayMode}
        />
      </main>
    </>
  );
};

// Main App component that sets up routing
export const App: React.FC = () => {
  console.log('App: Component rendering started, setting up routes.');
  console.log('App: Hello');
  return (
    <>
      <Routes>
        <Route path="/" element={<MainApplication />} />
        <Route path="/debug" element={<DebugModelLoaderPage />} />
      </Routes>
      <footer>
        <nav>
          <Link to="/">Home</Link> | <Link to="/debug">Debug Model Loader</Link>
        </nav>
      </footer>
    </>
  );
};

// If you want to keep the existing export default, you can alias it or change it.
// For simplicity, if App is the main export, we can do:
export default App;
