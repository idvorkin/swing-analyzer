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
    // Crop controls
    hasCropRegion,
    isCropEnabled,
    toggleCrop,
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

          {/* Crop toggle button - only show when crop region is available */}
          {hasCropRegion && (
            <button
              id="crop-btn"
              className={`toggle-button ${isCropEnabled ? 'active' : ''}`}
              onClick={toggleCrop}
              type="button"
              title={isCropEnabled ? 'Show full frame' : 'Zoom to person'}
            >
              <svg
                className="icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                {isCropEnabled ? (
                  // Zoom out icon (show full frame)
                  <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z" />
                ) : (
                  // Zoom in / crop icon (zoom to person)
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-8-2h2v-4h4v-2h-4V7h-2v4H7v2h4z" />
                )}
              </svg>
              <span className="button-text">{isCropEnabled ? 'Full' : 'Crop'}</span>
            </button>
          )}
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
