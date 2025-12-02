import type React from 'react';
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';

const VideoSection: React.FC = () => {
  const {
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
    nextFrame,
    previousFrame,
    getVideoContainerClass,
  } = useSwingAnalyzerContext();

  return (
    <section className="video-section">
      <div className="top-controls">
        <div className="control-row">
          <div className="file-input">
            <input
              type="file"
              id="video-upload"
              accept="video/*"
              ref={fileInputRef}
              onChange={handleVideoUpload}
            />
            <label htmlFor="video-upload" className="file-label">
              <svg
                className="icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              File
            </label>
          </div>
          <button
            id="load-hardcoded-btn"
            className="hardcoded-btn"
            onClick={loadHardcodedVideo}
            type="button"
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
            </svg>
            Sample
          </button>
          <button id="camera-btn" onClick={startCamera} type="button">
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9.4 10.5l4.77-8.26C13.47 2.09 12.75 2 12 2c-2.4 0-4.6.85-6.32 2.25l3.66 6.35.06-.1zM21.54 9c-.92-2.92-3.15-5.26-6-6.34L11.88 9h9.66zm.26 1h-7.49l.29.5 4.76 8.25C21 16.97 22 14.61 22 12c0-.69-.07-1.35-.2-2zM8.54 12l-3.9-6.75C3.01 7.03 2 9.39 2 12c0 .69.07 1.35.2 2h7.49l-1.15-2zm-6.08 3c.92 2.92 3.15 5.26 6 6.34L12.12 15H2.46zm11.27 0l-3.9 6.76c.7.15 1.42.24 2.17.24 2.4 0 4.6-.85 6.32-2.25l-3.66-6.35-.93 1.6z" />
            </svg>
            Camera
          </button>
          <button
            id="switch-camera-btn"
            onClick={switchCamera}
            disabled={!appState.usingCamera}
            type="button"
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z" />
            </svg>
            Swap
          </button>
        </div>
      </div>

      <div className={`video-container ${getVideoContainerClass()}`}>
        <video id="video" ref={videoRef} playsInline>
          {/* Remove the track element with empty src that causes browser errors */}
        </video>
        <canvas id="output-canvas" ref={canvasRef} />
        <div className="video-controls">
          <button
            id="prev-frame-btn"
            disabled={!appState.isModelLoaded}
            onClick={previousFrame}
            title="Previous Frame (Shortcut: ,)"
            type="button"
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M7 6c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1s-1-.45-1-1V7c0-.55.45-1 1-1zm3.66 6.82l5.77 4.07c.66.47 1.58-.01 1.58-.82V7.93c0-.81-.91-1.28-1.58-.82l-5.77 4.07c-.57.4-.57 1.24 0 1.64z" />
            </svg>
            <span className="button-text">Prev</span>
          </button>

          <button
            id="play-pause-btn"
            className="toggle-button"
            disabled={!appState.isModelLoaded}
            onClick={togglePlayPause}
            type="button"
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              {isPlaying ? (
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              ) : (
                <path d="M8 5v14l11-7z" />
              )}
            </svg>
            <span className="button-text">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            id="next-frame-btn"
            disabled={!appState.isModelLoaded}
            onClick={nextFrame}
            title="Next Frame (Shortcut: .)"
            type="button"
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M7.58 16.89l5.77-4.07c.56-.4.56-1.24 0-1.63L7.58 7.11C6.91 6.65 6 7.12 6 7.93v8.14c0 .81.91 1.28 1.58.82zM16 7v10c0 .55.45 1 1 1s1-.45 1-1V7c0-.55-.45-1-1-1s-1 .45-1 1z" />
            </svg>
            <span className="button-text">Next</span>
          </button>

          <button
            id="stop-btn"
            disabled={!appState.isModelLoaded}
            onClick={stopVideo}
            type="button"
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M6 6h12v12H6z" />
            </svg>
            <span className="button-text">Stop</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default VideoSection;
