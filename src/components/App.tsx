import React, { useEffect, useState, useRef } from 'react';
import { PipelineFactory } from '../pipeline/PipelineFactory';
import { Pipeline, PipelineResult } from '../pipeline/Pipeline';
import { AppState } from '../types';
import { FrameStage } from '../pipeline/FrameStage';
import VideoSection from './VideoSection';
import AnalysisSection from './AnalysisSection';
import './App.css';

export const App: React.FC = () => {
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
      hingeThreshold: 45
    },
    showBodyParts: true,
    bodyPartDisplayTime: 0.5,
    currentRepIndex: 0
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
  const frameAcquisitionRef = useRef<FrameStage | null>(null);
  
  // Initialize pipeline and models
  useEffect(() => {
    const initializePipeline = async () => {
      try {
        if (videoRef.current && canvasRef.current) {
          // Create pipeline components
          const pipeline = PipelineFactory.createPipeline(
            videoRef.current,
            canvasRef.current
          );
          
          pipelineRef.current = pipeline;
          
          // Get frame acquisition for direct media control
          frameAcquisitionRef.current = PipelineFactory.createFrameAcquisition(
            videoRef.current,
            canvasRef.current
          ) as FrameStage;
          
          // Initialize the pipeline
          await pipeline.initialize();
          
          setAppState(prev => ({ ...prev, isModelLoaded: true }));
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
  }, []);
  
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
      
      setAppState(prev => ({ ...prev, usingCamera: true }));
    } catch (error) {
      console.error('Error accessing camera:', error);
      setStatus('Error: Could not access camera.');
    }
  };
  
  // Switch camera
  const switchCamera = async () => {
    if (!frameAcquisitionRef.current || !appState.usingCamera) return;
    
    const newMode = appState.cameraMode === 'environment' ? 'user' : 'environment';
    
    try {
      await frameAcquisitionRef.current.stopCamera();
      await frameAcquisitionRef.current.startCamera(newMode);
      
      setAppState(prev => ({ ...prev, cameraMode: newMode }));
    } catch (error) {
      console.error('Error switching camera:', error);
      setStatus('Error: Could not switch camera.');
    }
  };
  
  // Handle video upload
  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0] || !frameAcquisitionRef.current || !videoRef.current) return;
    
    const file = event.target.files[0];
    const fileURL = URL.createObjectURL(file);
    
    frameAcquisitionRef.current.loadVideoFromURL(fileURL)
      .then(() => {
        setStatus(`Loaded video: ${file.name}`);
        setAppState(prev => ({ ...prev, usingCamera: false }));
        
        // Check readyState to determine if metadata is loaded
        if (videoRef.current && videoRef.current.readyState >= 2) {
          // Metadata is already loaded, call play directly
          console.log('[DEBUG] handleVideoUpload: Metadata already loaded (readyState >= 2), playing directly');
          play();
        } else if (videoRef.current) {
          // Metadata not yet loaded, set up a one-time event listener
          console.log('[DEBUG] handleVideoUpload: Metadata not loaded yet, setting loadeddata listener');
          videoRef.current.addEventListener('loadeddata', () => {
            console.log('[DEBUG] handleVideoUpload: loadeddata event fired, now playing');
            play();
          }, { once: true }); // Use once: true to automatically remove the listener after it fires
        }
      })
      .catch(error => {
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
      const videoURL = '/videos/swing-sample.mp4';
      console.log(`[DEBUG] loadHardcodedVideo: Attempting to load video from ${videoURL}`);
      await frameAcquisitionRef.current.loadVideoFromURL(videoURL);
      
      console.log('[DEBUG] loadHardcodedVideo: Video URL loaded successfully');
      setAppState(prev => ({ ...prev, usingCamera: false }));
      setStatus('Hardcoded video loaded.');
      
      // Check readyState to determine if metadata is loaded
      if (videoRef.current && videoRef.current.readyState >= 2) {
        // Metadata is already loaded, call play directly
        console.log('[DEBUG] loadHardcodedVideo: Metadata already loaded (readyState >= 2), playing directly');
        play();
      } else if (videoRef.current) {
        // Metadata not yet loaded, set up a one-time event listener
        console.log('[DEBUG] loadHardcodedVideo: Metadata not loaded yet, setting loadeddata listener');
        videoRef.current.addEventListener('loadeddata', () => {
          console.log('[DEBUG] loadHardcodedVideo: loadeddata event fired, now playing');
          play();
        }, { once: true }); // Use once: true to automatically remove the listener after it fires
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
      console.log('[DEBUG] togglePlayPause: Video is paused, attempting to play');
      videoRef.current.play().then(() => {
        console.log('[DEBUG] togglePlayPause: Video play() promise resolved');
        setIsPlaying(true);
        startProcessing();
      }).catch(err => console.error('[DEBUG] togglePlayPause: Error playing video:', err));
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
    pipelineRef.current.reset();
    setRepCount(0);
    setSpineAngle(0);
  };
  
  // Play video explicitly (without toggling)
  const play = () => {
    console.log('[DEBUG] play: Function called, conditions:', {
      videoRef: Boolean(videoRef.current),
      isModelLoaded: appState.isModelLoaded,
      isPaused: videoRef.current?.paused
    });
    
    if (!videoRef.current || !appState.isModelLoaded) return;
    
    if (videoRef.current.paused) {
      console.log('[DEBUG] play: Video is paused, attempting to play');
      videoRef.current.play().then(() => {
        console.log('[DEBUG] play: Video play() promise resolved');
        setIsPlaying(true);
        console.log('[DEBUG] play: Calling startProcessing()');
        startProcessing();
      }).catch(err => console.error('[DEBUG] play: Error playing video:', err));
    } else {
      console.log('[DEBUG] play: Video is already playing');
    }
  };
  
  // Start processing pipeline
  const startProcessing = () => {
    console.log('[DEBUG] startProcessing: Function called, conditions:', {
      pipelineExists: Boolean(pipelineRef.current),
      isProcessing: appState.isProcessing
    });
    
    if (!pipelineRef.current || appState.isProcessing) return;
    
    console.log('[DEBUG] startProcessing: Starting pipeline');
    const pipelineObservable = pipelineRef.current.start();
    
    setAppState(prev => ({ ...prev, isProcessing: true }));
    
    console.log('[DEBUG] startProcessing: Subscribing to pipeline observable');
    pipelineObservable.subscribe({
      next: (result: PipelineResult) => {
        console.log('[DEBUG] Pipeline update received:', result);
        setRepCount(result.repCount);
        if (result.skeleton) {
          setSpineAngle(Math.round(result.skeleton.getSpineAngle() || 0));
          
          // Render the skeleton on canvas
          console.log('[DEBUG] Rendering skeleton with', result.skeleton.getKeypoints().length, 'keypoints');
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx && canvasRef.current) {
            // Clear previous drawing
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            
            // Draw keypoints
            const keypoints = result.skeleton.getKeypoints();
            keypoints.forEach(point => {
              if (point && point.visibility && point.visibility > 0.5) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
                ctx.fillStyle = '#00ff00';
                ctx.fill();
              }
            });
            
            // Draw connections
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            // Define basic connections (you could expand this)
            const connections = [
              [5, 6], // shoulders
              [5, 7], // left shoulder to elbow
              [7, 9], // left elbow to wrist
              [6, 8], // right shoulder to elbow
              [8, 10], // right elbow to wrist
              [5, 11], // left shoulder to hip
              [6, 12], // right shoulder to hip
              [11, 12], // hips
              [11, 13], // left hip to knee
              [13, 15], // left knee to ankle
              [12, 14], // right hip to knee
              [14, 16]  // right knee to ankle
            ];
            
            for (const [i, j] of connections) {
              const pointA = keypoints[i];
              const pointB = keypoints[j];
              
              if (
                pointA && pointB && 
                pointA.visibility && pointB.visibility && 
                pointA.visibility > 0.5 && pointB.visibility > 0.5
              ) {
                ctx.moveTo(pointA.x, pointA.y);
                ctx.lineTo(pointB.x, pointB.y);
              }
            }
            
            ctx.stroke();
          } else {
            console.error('[DEBUG] Could not get canvas context for rendering');
          }
        }
      },
      error: (err) => {
        console.error('[DEBUG] Pipeline error:', err);
        setStatus('Error in processing pipeline');
      }
    });
  };
  
  // Stop processing pipeline
  const stopProcessing = () => {
    if (!pipelineRef.current || !appState.isProcessing) return;
    
    pipelineRef.current.stop();
    setAppState(prev => ({ ...prev, isProcessing: false }));
  };
  
  // Set display mode
  const setDisplayMode = (mode: 'both' | 'video' | 'overlay') => {
    setAppState(prev => ({ ...prev, displayMode: mode }));
  };
  
  // Rep navigation
  const navigateToPreviousRep = () => {
    if (appState.currentRepIndex > 0) {
      setAppState(prev => ({ ...prev, currentRepIndex: prev.currentRepIndex - 1 }));
    }
  };
  
  const navigateToNextRep = () => {
    if (appState.currentRepIndex < repCount - 1) {
      setAppState(prev => ({ ...prev, currentRepIndex: prev.currentRepIndex + 1 }));
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
          console.log('[DEBUG] Updating canvas dimensions to match video:', 
            videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
          
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
        videoRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [videoRef, canvasRef]);
  
  return (
    <>
      <header>
        <h1>Swing Analyzer</h1>
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