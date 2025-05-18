import React from 'react';
import { AppState } from '../types';

interface VideoSectionProps {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  appState: AppState;
  isPlaying: boolean;
  startCamera: () => void;
  switchCamera: () => void;
  handleVideoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  loadHardcodedVideo: () => void;
  togglePlayPause: () => void;
  stopVideo: () => void;
  getVideoContainerClass: () => string;
}

const VideoSection: React.FC<VideoSectionProps> = ({
  videoRef,
  canvasRef,
  fileInputRef,
  appState,
  isPlaying,
  startCamera,
  switchCamera,
  handleVideoUpload,
  loadHardcodedVideo,
  togglePlayPause,
  stopVideo,
  getVideoContainerClass
}) => {
  return (
    <>
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
    </>
  );
};

export default VideoSection; 