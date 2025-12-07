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
    nextFrame,
    previousFrame,
    getVideoContainerClass,
    navigateToPreviousRep,
    navigateToNextRep,
    navigateToPreviousCheckpoint,
    navigateToNextCheckpoint,
    clearPositionLabel,
    repThumbnails,
    extractionProgress,
    isExtracting,
    currentVideoFile,
    // Crop controls
    hasCropRegion,
    isCropEnabled,
    toggleCrop,
    // HUD data
    spineAngle,
    armToSpineAngle,
    // HUD visibility (based on pose availability, not extraction state)
    hasPosesForCurrentFrame,
    currentPosition,
  } = useSwingAnalyzerContext();

  // Ref for the filmstrip container
  const filmstripRef = useRef<HTMLDivElement>(null);

  // Event delegation handler for filmstrip clicks (avoids individual event listeners)
  const handleFilmstripClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'CANVAS' && target.dataset.seekTime) {
      const seekTime = parseFloat(target.dataset.seekTime);
      if (!isNaN(seekTime) && videoRef.current) {
        videoRef.current.currentTime = seekTime;
      }
    }
  }, [videoRef]);

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

      // Store seek time as data attribute (click handled by event delegation)
      if (candidate.videoTime !== undefined) {
        canvas.style.cursor = 'pointer';
        canvas.dataset.seekTime = candidate.videoTime.toString();
      }

      // Add position label
      const label = document.createElement('span');
      label.className = 'filmstrip-label';
      label.textContent = POSITION_LABELS[positionName] || positionName;

      wrapper.appendChild(canvas);
      wrapper.appendChild(label);
      container.appendChild(wrapper);
    }
  }, [repCount, repThumbnails, appState.currentRepIndex]);

  // Re-render filmstrip when rep changes or thumbnails update
  useEffect(() => {
    renderFilmstrip();
  }, [renderFilmstrip]);

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

        {/* HUD Overlay - visibility based on TWO INDEPENDENT conditions:
            1. Extraction % visible when extraction is running
            2. Skeleton/HUD visible when poses exist for current frame
            Both can be true simultaneously (progressive playback) */}
        {currentVideoFile && (
          <div className="hud-overlay">
            {/* Extraction progress (top-right) - visible when extraction running */}
            {isExtracting && extractionProgress && (
              <div className="hud-overlay-top-right">
                <div className="hud-overlay-extraction">
                  <span className="hud-overlay-extraction-value">
                    {Math.round(extractionProgress.percentage)}%
                  </span>
                  <span className="hud-overlay-extraction-label">EXTRACTING</span>
                </div>
              </div>
            )}
            {/* Status overlay - visible when poses exist for current frame */}
            {hasPosesForCurrentFrame && (
              <>
                <div className="hud-overlay-top">
                  <div className="hud-overlay-reps">
                    <span id="rep-counter" className="hud-overlay-reps-value">
                      {repCount > 0 ? `${appState.currentRepIndex + 1}/${repCount}` : '0'}
                    </span>
                    <span className="hud-overlay-reps-label">REP</span>
                  </div>
                  <div className="hud-overlay-angles">
                    <div className="hud-overlay-angle">
                      <span className="hud-overlay-angle-label">SPINE</span>
                      <span id="spine-angle" className="hud-overlay-angle-value">{spineAngle}°</span>
                    </div>
                    <div className="hud-overlay-angle">
                      <span className="hud-overlay-angle-label">ARM</span>
                      <span id="arm-angle" className="hud-overlay-angle-value">{armToSpineAngle}°</span>
                    </div>
                  </div>
                </div>
                {/* Position label - only shown during checkpoint navigation */}
                {currentPosition && (
                  <div className="hud-overlay-bottom">
                    <div className="hud-overlay-status">
                      <span className="hud-overlay-status-dot" />
                      <span className="hud-overlay-status-text">
                        {POSITION_LABELS[currentPosition] || currentPosition}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="video-controls">
          {/* 1. Play/Pause */}
          <button
            id="play-pause-btn"
            className="toggle-button"
            disabled={!appState.isModelLoaded || !currentVideoFile}
            onClick={() => { clearPositionLabel(); togglePlayPause(); }}
            type="button"
          >
            <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {isPlaying ? (
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              ) : (
                <path d="M8 5v14l11-7z" />
              )}
            </svg>
            <span className="button-text">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          {/* 2. Prev Frame */}
          <button
            id="prev-frame-btn"
            disabled={!appState.isModelLoaded || !currentVideoFile}
            onClick={() => { clearPositionLabel(); previousFrame(); }}
            title="Previous Frame (Shortcut: ,)"
            type="button"
          >
            <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>

          {/* 3. Next Frame */}
          <button
            id="next-frame-btn"
            disabled={!appState.isModelLoaded || !currentVideoFile}
            onClick={() => { clearPositionLabel(); nextFrame(); }}
            title="Next Frame (Shortcut: .)"
            type="button"
          >
            <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>

          {/* 4. Prev Checkpoint */}
          <button
            id="prev-checkpoint-btn"
            disabled={!appState.isModelLoaded || !currentVideoFile || repCount === 0}
            onClick={navigateToPreviousCheckpoint}
            title="Previous Checkpoint"
            type="button"
          >
            <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6 1.41-1.41zM6 6h2v12H6V6z" />
            </svg>
          </button>

          {/* 5. Next Checkpoint */}
          <button
            id="next-checkpoint-btn"
            disabled={!appState.isModelLoaded || !currentVideoFile || repCount === 0}
            onClick={navigateToNextCheckpoint}
            title="Next Checkpoint"
            type="button"
          >
            <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6-1.41 1.41zM16 6h2v12h-2V6z" />
            </svg>
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
              <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                {isCropEnabled ? (
                  <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z" />
                ) : (
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-8-2h2v-4h4v-2h-4V7h-2v4H7v2h4z" />
                )}
              </svg>
              <span className="button-text">{isCropEnabled ? 'Full' : 'Crop'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Checkpoint Filmstrip */}
      <div className="filmstrip-section">
        <div className="filmstrip-container" ref={filmstripRef} onClick={handleFilmstripClick} />
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
