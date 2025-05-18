import React, { useEffect, useState, useRef } from 'react';
import { PipelineFactory } from '../pipeline/PipelineFactory';
import { Pipeline, PipelineResult } from '../pipeline/Pipeline';
import { AppState } from '../types';
import { FrameStage } from '../pipeline/FrameStage';
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
    if (!event.target.files || !event.target.files[0] || !frameAcquisitionRef.current) return;
    
    const file = event.target.files[0];
    const fileURL = URL.createObjectURL(file);
    
    frameAcquisitionRef.current.loadVideoFromURL(fileURL);
    
    setStatus(`Loaded video: ${file.name}`);
    setAppState(prev => ({ ...prev, usingCamera: false }));
    
    if (videoRef.current) {
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          videoRef.current.play().catch(err => console.error('Error playing video:', err));
        }
      };
    }
  };
  
  // Load hardcoded video
  const loadHardcodedVideo = async () => {
    if (!frameAcquisitionRef.current) return;
    
    setStatus('Loading hardcoded video...');
    try {
      // Load the hardcoded video from public directory
      const videoURL = '/videos/swing-sample.mp4';
      await frameAcquisitionRef.current.loadVideoFromURL(videoURL);
      
      setAppState(prev => ({ ...prev, usingCamera: false }));
      setStatus('Hardcoded video loaded.');
      
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(err => console.error('Error playing video:', err));
          }
        };
      }
    } catch (error) {
      console.error('Error loading hardcoded video:', error);
      setStatus('Error: Could not load hardcoded video.');
    }
  };
  
  // Play/Pause toggle
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        startProcessing();
      }).catch(err => console.error('Error playing video:', err));
    } else {
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
  
  // Start processing pipeline
  const startProcessing = () => {
    if (!pipelineRef.current || appState.isProcessing) return;
    
    const pipelineObservable = pipelineRef.current.start();
    
    setAppState(prev => ({ ...prev, isProcessing: true }));
    
    pipelineObservable.subscribe({
      next: (result: PipelineResult) => {
        setRepCount(result.repCount);
        if (result.skeleton) {
          setSpineAngle(Math.round(result.skeleton.getSpineAngle() || 0));
        }
      },
      error: (err) => {
        console.error('Pipeline error:', err);
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
  
  return (
    <>
      <header>
        <h1>Swing Analyzer</h1>
      </header>
      
      <main>
        <div className="top-controls">
          <div className="file-input">
            <input 
              type="file" 
              id="video-upload" 
              accept="video/*"
              ref={fileInputRef}
              onChange={handleVideoUpload}
            />
            <label htmlFor="video-upload" className="file-label">Choose File</label>
          </div>
          <button 
            id="load-hardcoded-btn" 
            className="hardcoded-btn"
            onClick={loadHardcodedVideo}
          >
            Load Hardcoded
          </button>
          <button 
            id="camera-btn"
            onClick={startCamera}
          >
            Start Camera
          </button>
          <button 
            id="switch-camera-btn"
            onClick={switchCamera}
            disabled={!appState.usingCamera}
          >
            Swap Camera
          </button>
        </div>
        
        <div className={`video-container ${getVideoContainerClass()}`}>
          <video 
            id="video" 
            ref={videoRef} 
            playsInline
          ></video>
          <canvas 
            id="output-canvas" 
            ref={canvasRef}
          ></canvas>
          <div className="video-controls">
            <button 
              id="play-pause-btn" 
              className="toggle-button"
              disabled={!appState.isModelLoaded}
              onClick={togglePlayPause}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button 
              id="stop-btn"
              disabled={!appState.isModelLoaded}
              onClick={stopVideo}
            >
              Stop
            </button>
          </div>
        </div>
        
        <div className="metrics">
          <h2>Swing Analysis</h2>
          <div>
            <p>Reps: <span id="rep-counter">{repCount}</span></p>
            <p>Spine Angle: <span id="spine-angle">{spineAngle}°</span></p>
          </div>
          <div id="status">{status}</div>
          
          <div className="form-checkpoints">
            <div className="checkpoint-header">
              <h3>Checkpoints</h3>
              <div className="rep-navigation">
                <button 
                  id="prev-rep-btn" 
                  className="nav-btn"
                  disabled={appState.currentRepIndex <= 0}
                  onClick={navigateToPreviousRep}
                >
                  ◀ Previous
                </button>
                <span id="current-rep">
                  Rep {appState.currentRepIndex + 1}/{repCount || 0}
                </span>
                <button 
                  id="next-rep-btn" 
                  className="nav-btn"
                  disabled={appState.currentRepIndex >= repCount - 1}
                  onClick={navigateToNextRep}
                >
                  Next ▶
                </button>
              </div>
            </div>
            <div 
              id="checkpoint-grid-container" 
              className="checkpoint-grid-container"
              ref={checkpointGridRef}
            ></div>
          </div>
        </div>
        
        <div className="debug-controls">
          <h3>Debug Options</h3>
          <div className="debug-options">
            <label>
              <input 
                type="radio" 
                name="display-mode" 
                value="both"
                checked={appState.displayMode === 'both'}
                onChange={() => setDisplayMode('both')}
              /> 
              Show Video + Overlay
            </label>
            <label>
              <input 
                type="radio" 
                name="display-mode" 
                value="video"
                checked={appState.displayMode === 'video'}
                onChange={() => setDisplayMode('video')}
              /> 
              Video Only
            </label>
            <label>
              <input 
                type="radio" 
                name="display-mode" 
                value="overlay"
                checked={appState.displayMode === 'overlay'}
                onChange={() => setDisplayMode('overlay')}
              /> 
              Overlay Only
            </label>
          </div>
        </div>
      </main>
    </>
  );
}; 