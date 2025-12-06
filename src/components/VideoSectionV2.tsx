/**
 * VideoSectionV2 - Simplified video section using InputSession
 *
 * This version removes the usePoseTrack hook and complex effect chains.
 * All extraction/caching is handled internally by InputSession via
 * the useSwingAnalyzerV2 hook.
 */

import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';

// Position display order for swing positions
const POSITION_ORDER = ['top', 'connect', 'bottom', 'release'] as const;
const POSITION_LABELS: Record<string, string> = {
  top: 'Top',
  connect: 'Connect',
  bottom: 'Bottom',
  release: 'Release',
};

const VideoSectionV2: React.FC = () => {
  const {
    videoRef,
    canvasRef,
    fileInputRef,
    appState,
    isPlaying,
    repCount,
    startCamera,
    switchCamera,
    handleVideoUpload,
    loadHardcodedVideo,
    togglePlayPause,
    stopVideo,
    nextFrame,
    previousFrame,
    getVideoContainerClass,
    navigateToPreviousRep,
    navigateToNextRep,
    repThumbnails,
    extractionProgress,
    isExtracting,
    inputState,
    currentVideoFile,
  } = useSwingAnalyzerContext();

  // Ref for the filmstrip container
  const filmstripRef = useRef<HTMLDivElement>(null);

  // Render the filmstrip with actual thumbnails
  const renderFilmstrip = useCallback(() => {
    const container = filmstripRef.current;
    if (!container) return;

    container.innerHTML = '';

    if (repCount === 0 || repThumbnails.size === 0) {
      container.innerHTML =
        '<div class="filmstrip-empty">Complete a rep to see checkpoints</div>';
      return;
    }

    // Get the current rep's thumbnails (using appState.currentRepIndex + 1 since repNumber is 1-indexed)
    const currentRepNum = appState.currentRepIndex + 1;
    const positions = repThumbnails.get(currentRepNum);

    if (!positions || positions.size === 0) {
      container.innerHTML = `<div class="filmstrip-empty">Rep ${currentRepNum} - no thumbnails</div>`;
      return;
    }

    // Render thumbnails for each position in order
    for (const positionName of POSITION_ORDER) {
      const candidate = positions.get(positionName);
      if (!candidate?.frameImage) continue;

      const wrapper = document.createElement('div');
      wrapper.className = 'filmstrip-thumbnail';
      wrapper.title = `${POSITION_LABELS[positionName] || positionName} at ${candidate.videoTime?.toFixed(2)}s`;

      // Create canvas and draw the thumbnail
      const canvas = document.createElement('canvas');
      canvas.width = candidate.frameImage.width;
      canvas.height = candidate.frameImage.height;
      canvas.className = 'filmstrip-canvas';

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(candidate.frameImage, 0, 0);
      }

      // Add click handler to seek video to this position
      if (candidate.videoTime !== undefined && videoRef.current) {
        canvas.style.cursor = 'pointer';
        const seekTime = candidate.videoTime;
        canvas.addEventListener('click', () => {
          if (videoRef.current) {
            videoRef.current.currentTime = seekTime;
          }
        });
      }

      // Add position label
      const label = document.createElement('span');
      label.className = 'filmstrip-label';
      label.textContent = POSITION_LABELS[positionName] || positionName;

      wrapper.appendChild(canvas);
      wrapper.appendChild(label);
      container.appendChild(wrapper);
    }
  }, [repCount, repThumbnails, appState.currentRepIndex, videoRef]);

  // Re-render filmstrip when rep changes or thumbnails update
  useEffect(() => {
    renderFilmstrip();
  }, [renderFilmstrip]);

  // Get extraction status for display
  const getExtractionStatus = () => {
    if (!isExtracting || !extractionProgress) return null;

    const { currentFrame, totalFrames, percentage } = extractionProgress;
    return (
      <div className="extraction-status pose-status-bar">
        <div className="extraction-progress-bar">
          <div
            className="extraction-progress-fill"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="extraction-text">
          Extracting: {currentFrame}/{totalFrames} ({Math.round(percentage)}%)
        </span>
      </div>
    );
  };

  // Get ready status
  const isReady = inputState.type === 'video-file' &&
    inputState.sourceState.type === 'active';

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
                aria-hidden="true"
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
              aria-hidden="true"
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
              aria-hidden="true"
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
              aria-hidden="true"
            >
              <path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z" />
            </svg>
            Swap
          </button>
        </div>
      </div>

      <div className={`video-container ${getVideoContainerClass()}`}>
        {/* biome-ignore lint/a11y/useMediaCaption: This is a video analysis app, not media playback - no audio captions needed */}
        <video id="video" ref={videoRef} playsInline />
        <canvas id="output-canvas" ref={canvasRef} />
        <div className="video-controls">
          <button
            id="prev-frame-btn"
            disabled={!appState.isModelLoaded || !currentVideoFile}
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
              aria-hidden="true"
            >
              <path d="M7 6c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1s-1-.45-1-1V7c0-.55.45-1 1-1zm3.66 6.82l5.77 4.07c.66.47 1.58-.01 1.58-.82V7.93c0-.81-.91-1.28-1.58-.82l-5.77 4.07c-.57.4-.57 1.24 0 1.64z" />
            </svg>
            <span className="button-text">Prev</span>
          </button>

          <button
            id="play-pause-btn"
            className="toggle-button"
            disabled={!appState.isModelLoaded || !currentVideoFile}
            onClick={togglePlayPause}
            type="button"
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
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
            disabled={!appState.isModelLoaded || !currentVideoFile}
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
              aria-hidden="true"
            >
              <path d="M7.58 16.89l5.77-4.07c.56-.4.56-1.24 0-1.63L7.58 7.11C6.91 6.65 6 7.12 6 7.93v8.14c0 .81.91 1.28 1.58.82zM16 7v10c0 .55.45 1 1 1s1-.45 1-1V7c0-.55-.45-1-1-1s-1 .45-1 1z" />
            </svg>
            <span className="button-text">Next</span>
          </button>

          <button
            id="stop-btn"
            disabled={!appState.isModelLoaded || !currentVideoFile}
            onClick={stopVideo}
            type="button"
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6 6h12v12H6z" />
            </svg>
            <span className="button-text">Stop</span>
          </button>
        </div>
      </div>

      {/* Extraction Progress (replaces PoseTrackStatusBar) */}
      {getExtractionStatus()}

      {/* Ready indicator */}
      {isReady && !isExtracting && currentVideoFile && (
        <div className="ready-status">
          Ready - {repCount} reps detected
        </div>
      )}

      {/* Checkpoint Filmstrip */}
      <div className="filmstrip-section">
        <div className="filmstrip-container" ref={filmstripRef} />
        {repCount > 0 && (
          <div className="filmstrip-nav">
            <button
              type="button"
              className="filmstrip-nav-btn"
              disabled={appState.currentRepIndex <= 0}
              onClick={navigateToPreviousRep}
              aria-label="Previous rep"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <span className="filmstrip-rep-indicator">
              Rep {appState.currentRepIndex + 1}/{repCount}
            </span>
            <button
              type="button"
              className="filmstrip-nav-btn"
              disabled={appState.currentRepIndex >= repCount - 1}
              onClick={navigateToNextRep}
              aria-label="Next rep"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default VideoSectionV2;
