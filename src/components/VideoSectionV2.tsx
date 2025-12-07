/**
 * VideoSectionV2 - Simplified video section using InputSession
 *
 * This version removes the usePoseTrack hook and complex effect chains.
 * All extraction/caching is handled internally by InputSession via
 * the useSwingAnalyzerV2 hook.
 */

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';
import { RepGalleryModal } from './RepGalleryModal';

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
    // Rep gallery
    setCurrentRepIndex,
  } = useSwingAnalyzerContext();

  // Ref for the filmstrip container
  const filmstripRef = useRef<HTMLDivElement>(null);

  // Mobile source picker state - show when no video OR when user taps header camera button
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  // Rep gallery modal state
  const [showGallery, setShowGallery] = useState(false);

  const handleGallerySeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.pause();
    }
  }, [videoRef]);

  // Listen for header camera button click via custom event
  useEffect(() => {
    const handleShowSourcePicker = () => setShowSourcePicker(true);
    window.addEventListener('show-source-picker', handleShowSourcePicker);
    return () => window.removeEventListener('show-source-picker', handleShowSourcePicker);
  }, []);

  // Hide source picker when video loads
  useEffect(() => {
    if (currentVideoFile) {
      setShowSourcePicker(false);
    }
  }, [currentVideoFile]);

  // Double-tap zone state for touch devices
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const [tapOverlay, setTapOverlay] = useState<{
    type: 'play' | 'pause' | 'prev' | 'next';
    position: 'left' | 'center' | 'right';
  } | null>(null);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if device supports touch
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Cleanup overlay timeout on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  // Double-tap handler for video container with zone detection (touch only)
  const handleVideoDoubleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only handle on touch devices
    if (!isTouchDevice) return;

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300; // ms
    const currentX = e.clientX;

    if (now - lastTapRef.current.time < DOUBLE_TAP_DELAY) {
      // Double tap detected - determine zone based on first tap position
      const container = e.currentTarget;
      const rect = container.getBoundingClientRect();
      const relativeX = lastTapRef.current.x - rect.left;
      const containerWidth = rect.width;
      const tapPosition = relativeX / containerWidth;

      // Zone thresholds: left 25%, middle 50%, right 25%
      const LEFT_ZONE = 0.25;
      const RIGHT_ZONE = 0.75;

      let action: 'play' | 'pause' | 'prev' | 'next';
      let position: 'left' | 'center' | 'right';

      if (tapPosition < LEFT_ZONE) {
        // Left zone - previous checkpoint
        navigateToPreviousCheckpoint();
        action = 'prev';
        position = 'left';
      } else if (tapPosition > RIGHT_ZONE) {
        // Right zone - next checkpoint
        navigateToNextCheckpoint();
        action = 'next';
        position = 'right';
      } else {
        // Middle zone - play/pause
        // Read video state directly to avoid stale closure on isPlaying
        const video = videoRef.current;
        const wasPlaying = video ? !video.paused : false;
        clearPositionLabel();
        togglePlayPause();
        // Show the action that was taken: if video was playing, we paused it
        action = wasPlaying ? 'pause' : 'play';
        position = 'center';
      }

      // Show visual feedback
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
      setTapOverlay({ type: action, position });
      overlayTimeoutRef.current = setTimeout(() => setTapOverlay(null), 500);
      lastTapRef.current = { time: 0, x: 0 }; // Reset to prevent triple-tap
    } else {
      lastTapRef.current = { time: now, x: currentX };
    }
  }, [isTouchDevice, clearPositionLabel, togglePlayPause, videoRef, navigateToPreviousCheckpoint, navigateToNextCheckpoint]);

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
      {/* Hidden file input - triggered by labels elsewhere */}
      <input
        type="file"
        id="video-upload"
        accept="video/*"
        ref={fileInputRef}
        onChange={handleVideoUpload}
        className="sr-only"
      />

      {/* Rep navigation strip - shown when reps are detected */}
      {repCount > 0 && currentVideoFile && (
        <div className="rep-nav-strip">
          {/* Left buttons: previous rep, previous checkpoint */}
          <div className="rep-nav-left">
            <button
              type="button"
              className="rep-nav-btn rep-nav-btn-double"
              onClick={navigateToPreviousRep}
              disabled={appState.currentRepIndex <= 0}
              aria-label="Previous rep"
              title="Previous rep"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.41 7.41L17 6l-6 6 6 6 1.41-1.41L13.83 12z" />
                <path d="M12.41 7.41L11 6l-6 6 6 6 1.41-1.41L7.83 12z" />
              </svg>
            </button>
            <button
              type="button"
              className="rep-nav-btn"
              onClick={navigateToPreviousCheckpoint}
              aria-label="Previous checkpoint"
              title="Previous checkpoint"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
          </div>

          {/* Center: Rep and checkpoint display */}
          <span className="rep-nav-display">
            <span className="rep-nav-label">Rep {appState.currentRepIndex + 1}/{repCount}</span>
            <span className="rep-nav-dot">•</span>
            <span className="rep-nav-position">
              {currentPosition ? (POSITION_LABELS[currentPosition] || currentPosition) : '—'}
            </span>
          </span>

          {/* Right buttons: next checkpoint, next rep */}
          <div className="rep-nav-right">
            <button
              type="button"
              className="rep-nav-btn"
              onClick={navigateToNextCheckpoint}
              aria-label="Next checkpoint"
              title="Next checkpoint"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
            <button
              type="button"
              className="rep-nav-btn rep-nav-btn-double"
              onClick={navigateToNextRep}
              disabled={appState.currentRepIndex >= repCount - 1}
              aria-label="Next rep"
              title="Next rep"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M5.59 7.41L7 6l6 6-6 6-1.41-1.41L10.17 12z" />
                <path d="M11.59 7.41L13 6l6 6-6 6-1.41-1.41L16.17 12z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* biome-ignore lint/a11y/useKeyboardEquivalent: Double-tap is supplementary to existing button controls */}
      <div
        className={`video-container ${getVideoContainerClass()}`}
        onClick={handleVideoDoubleTap}
      >
        {/* Source picker overlay - shown when no video OR when user taps header camera button */}
        {(!currentVideoFile || showSourcePicker) && (
          <div className="source-picker-overlay" onClick={() => setShowSourcePicker(false)}>
            <div className="source-picker-buttons" onClick={(e) => e.stopPropagation()}>
              <label htmlFor="video-upload" className="source-picker-btn camera-roll-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                <span>Camera Roll</span>
              </label>
              <button
                type="button"
                id="load-hardcoded-btn"
                className="source-picker-btn sample-btn"
                onClick={loadHardcodedVideo}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                </svg>
                <span>Sample</span>
              </button>
            </div>
          </div>
        )}

        {/* biome-ignore lint/a11y/useMediaCaption: This is a video analysis app, not media playback - no audio captions needed */}
        <video id="video" ref={videoRef} playsInline />
        <canvas id="output-canvas" ref={canvasRef} />

        {/* Double-tap zone feedback overlay */}
        {tapOverlay && (
          <div className={`video-tap-overlay video-tap-overlay--${tapOverlay.position}`}>
            <div className="video-tap-icon">
              {tapOverlay.type === 'pause' && (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
              {tapOverlay.type === 'play' && (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
              {tapOverlay.type === 'prev' && (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
              )}
              {tapOverlay.type === 'next' && (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              )}
            </div>
          </div>
        )}

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
                  {currentPosition && (
                    <div className="hud-overlay-angle hud-overlay-position">
                      <span className="hud-overlay-angle-label">POS</span>
                      <span className="hud-overlay-angle-value">
                        {POSITION_LABELS[currentPosition] || currentPosition}
                      </span>
                    </div>
                  )}
                </div>
              </div>
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

      {/* Checkpoint Filmstrip - thumbnails only, no nav (nav is in strip above) */}
      <div className="filmstrip-section">
        <div className="filmstrip-container" ref={filmstripRef} onClick={handleFilmstripClick} />
        {/* Gallery button - show when there are reps */}
        {repCount > 0 && repThumbnails.size > 0 && (
          <button
            type="button"
            className="filmstrip-gallery-btn"
            onClick={() => setShowGallery(true)}
            aria-label="View all reps"
            title="View all reps"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>
        )}
      </div>

      {/* Rep Gallery Modal */}
      <RepGalleryModal
        isOpen={showGallery}
        onClose={() => setShowGallery(false)}
        repThumbnails={repThumbnails}
        currentRepIndex={appState.currentRepIndex}
        onSeek={handleGallerySeek}
        onRepSelect={setCurrentRepIndex}
      />
    </section>
  );
};

export default VideoSectionV2;
