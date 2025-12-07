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
import { ExerciseDetectionBadge } from './ExerciseDetectionBadge';
import { RepGalleryModal } from './RepGalleryModal';
import { PHASE_ORDER, PHASE_LABELS } from './repGalleryConstants';

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
    // Exercise detection
    detectedExercise,
    detectionConfidence,
    isDetectionLocked,
    setExerciseType,
  } = useSwingAnalyzerContext();

  // Ref for the rep-gallery container
  const repGalleryRef = useRef<HTMLDivElement>(null);

  // Mobile source picker state - show when no video OR when user taps header camera button
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  // Rep gallery modal state
  const [showGallery, setShowGallery] = useState(false);

  // Focused phase state for dynamic zoom
  const [focusedPhase, setFocusedPhase] = useState<string | null>(null);

  // Track previous rep index to only scroll when it actually changes
  const prevRepIndexRef = useRef<number>(-1);

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

  // Cleanup overlay timeout on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  // Double-tap/double-click handler for video container with zone detection
  // Works on both touch devices (double-tap) and desktop (double-click)
  const handleVideoDoubleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
  }, [clearPositionLabel, togglePlayPause, videoRef, navigateToPreviousCheckpoint, navigateToNextCheckpoint]);

  // Handle phase header click for dynamic zoom (toggle focus on a phase column)
  const handlePhaseClick = useCallback((phase: string) => {
    setFocusedPhase((prev) => (prev === phase ? null : phase));
  }, []);

  // Event delegation handler for rep-gallery clicks (avoids individual event listeners)
  const handleRepGalleryClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Handle phase header button clicks for dynamic zoom
    if (target.tagName === 'BUTTON' && target.dataset.phase) {
      handlePhaseClick(target.dataset.phase);
      return;
    }

    // Handle thumbnail canvas clicks for seeking
    if (target.tagName === 'CANVAS' && target.dataset.seekTime) {
      const seekTime = parseFloat(target.dataset.seekTime);
      const repNum = target.dataset.repNum ? parseInt(target.dataset.repNum, 10) : null;
      if (!isNaN(seekTime) && videoRef.current) {
        videoRef.current.currentTime = seekTime;
        // Also set the current rep index when clicking a thumbnail
        if (repNum !== null && !isNaN(repNum)) {
          setCurrentRepIndex(repNum - 1); // Convert to 0-indexed
        }
      }
    }
  }, [videoRef, setCurrentRepIndex, handlePhaseClick]);

  // Double-click handler for rep-gallery - toggles phase focus
  const handleRepGalleryDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Find the phase from the canvas or its parent cell
    let phase: string | undefined;
    if (target.tagName === 'CANVAS') {
      // Look for phase in parent cell
      const cell = target.closest('.rep-gallery-cell');
      phase = (cell as HTMLElement)?.dataset.phase;
    } else if (target.classList.contains('rep-gallery-cell')) {
      phase = target.dataset.phase;
    } else if (target.classList.contains('rep-gallery-thumbnail')) {
      const cell = target.closest('.rep-gallery-cell');
      phase = (cell as HTMLElement)?.dataset.phase;
    }

    if (phase) {
      handlePhaseClick(phase);
    }
  }, [handlePhaseClick]);

  // Render the multi-rep rep-gallery with all reps as scrollable rows
  // Uses in-place DOM updates to preserve scroll position
  const renderRepGallery = useCallback(() => {
    const container = repGalleryRef.current;
    if (!container) return;

    // Handle empty state
    if (repCount === 0 || repThumbnails.size === 0) {
      container.innerHTML =
        '<div class="rep-gallery-empty">Complete a rep to see checkpoints</div>';
      return;
    }

    // Get sorted rep numbers
    const repNumbers = Array.from(repThumbnails.keys()).sort((a, b) => a - b);
    const currentRepNum = appState.currentRepIndex + 1;

    // Get or create header
    let headerRow = container.querySelector('.rep-gallery-header') as HTMLElement;
    if (!headerRow) {
      headerRow = document.createElement('div');
      headerRow.className = 'rep-gallery-header';

      // Empty spacer to align with row rep numbers
      const repSpacer = document.createElement('div');
      repSpacer.className = 'rep-gallery-header-rep';
      headerRow.appendChild(repSpacer);

      for (const positionName of PHASE_ORDER) {
        const phaseBtn = document.createElement('button');
        phaseBtn.type = 'button';
        phaseBtn.className = 'rep-gallery-header-phase';
        phaseBtn.textContent = PHASE_LABELS[positionName] || positionName;
        phaseBtn.dataset.phase = positionName;
        headerRow.appendChild(phaseBtn);
      }
      container.insertBefore(headerRow, container.firstChild);
    }

    // Update header classes for focus state
    headerRow.className = `rep-gallery-header${focusedPhase ? ' rep-gallery-header--focused' : ''}`;
    const headerPhases = headerRow.querySelectorAll('.rep-gallery-header-phase');
    headerPhases.forEach((btn) => {
      const phase = (btn as HTMLElement).dataset.phase;
      const isFocused = focusedPhase === phase;
      const isMinimized = focusedPhase && !isFocused;
      btn.className = `rep-gallery-header-phase${isFocused ? ' rep-gallery-header-phase--focused' : ''}${isMinimized ? ' rep-gallery-header-phase--minimized' : ''}`;
      (btn as HTMLElement).title = isFocused ? 'Click to show all phases' : `Click to focus on ${PHASE_LABELS[phase || ''] || phase}`;
    });

    // Get or create rows container
    let rowsContainer = container.querySelector('.rep-gallery-rows') as HTMLElement;
    if (!rowsContainer) {
      rowsContainer = document.createElement('div');
      rowsContainer.className = 'rep-gallery-rows';
      container.appendChild(rowsContainer);
    }

    // Track existing rows by rep number
    const existingRows = new Map<number, HTMLElement>();
    rowsContainer.querySelectorAll('.rep-gallery-row').forEach((row) => {
      const repNum = parseInt((row as HTMLElement).dataset.repNum || '0', 10);
      if (repNum > 0) {
        existingRows.set(repNum, row as HTMLElement);
      }
    });

    // Update or create rows for each rep
    let lastRow: HTMLElement | null = null;
    for (const repNum of repNumbers) {
      const positions = repThumbnails.get(repNum);
      if (!positions || positions.size === 0) continue;

      let row: HTMLElement = existingRows.get(repNum) || document.createElement('div');
      const isNewRow = !existingRows.has(repNum);

      if (isNewRow) {
        // Initialize new row
        row.className = 'rep-gallery-row';
        row.dataset.repNum = repNum.toString();

        // Rep number label
        const repNumLabel = document.createElement('div');
        repNumLabel.className = 'rep-gallery-row-rep';
        repNumLabel.textContent = repNum.toString();
        row.appendChild(repNumLabel);

        // Create cells for each position
        for (const positionName of PHASE_ORDER) {
          const cell = document.createElement('div');
          cell.className = 'rep-gallery-cell';
          cell.dataset.phase = positionName;
          cell.innerHTML = '<span class="rep-gallery-cell-empty">—</span>';
          row.appendChild(cell);
        }

        // Insert in correct position (after last row or at start)
        if (lastRow) {
          lastRow.after(row);
        } else {
          rowsContainer.insertBefore(row, rowsContainer.firstChild);
        }
      }

      // Update row classes
      row.className = `rep-gallery-row${focusedPhase ? ' rep-gallery-row--has-focus' : ''}${repNum === currentRepNum ? ' rep-gallery-row--current' : ''}`;

      // Update cells
      const cells = row.querySelectorAll('.rep-gallery-cell');
      cells.forEach((cell, idx) => {
        const positionName = PHASE_ORDER[idx];
        const candidate = positions.get(positionName);
        const isFocused = focusedPhase === positionName;
        const isMinimized = focusedPhase && !isFocused;

        // Update cell classes
        cell.className = `rep-gallery-cell${isFocused ? ' rep-gallery-cell--focused' : ''}${isMinimized ? ' rep-gallery-cell--minimized' : ''}`;

        if (candidate?.frameImage) {
          // Check if we need to update the canvas
          let wrapper = cell.querySelector('.rep-gallery-thumbnail') as HTMLElement;
          let canvas = cell.querySelector('.rep-gallery-canvas') as HTMLCanvasElement;

          if (!wrapper) {
            // Create wrapper and canvas
            cell.innerHTML = '';
            wrapper = document.createElement('div');
            wrapper.className = 'rep-gallery-thumbnail';
            canvas = document.createElement('canvas');
            canvas.className = 'rep-gallery-canvas';
            wrapper.appendChild(canvas);
            cell.appendChild(wrapper);
          }

          // Update wrapper classes
          wrapper.className = `rep-gallery-thumbnail${isFocused ? ' rep-gallery-thumbnail--focused' : ''}${isMinimized ? ' rep-gallery-thumbnail--minimized' : ''}`;
          wrapper.title = `${PHASE_LABELS[positionName] || positionName} at ${candidate.videoTime?.toFixed(2)}s`;

          // Update canvas if dimensions changed or first render
          if (canvas.width !== candidate.frameImage.width || canvas.height !== candidate.frameImage.height) {
            canvas.width = candidate.frameImage.width;
            canvas.height = candidate.frameImage.height;
          }

          // Always update the image data (thumbnails can improve during extraction)
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.putImageData(candidate.frameImage, 0, 0);
          }

          // Update data attributes
          if (candidate.videoTime !== undefined) {
            canvas.style.cursor = 'pointer';
            canvas.dataset.seekTime = candidate.videoTime.toString();
            canvas.dataset.repNum = repNum.toString();
          }
        } else if (!cell.querySelector('.rep-gallery-cell-empty')) {
          // Show empty placeholder if no thumbnail
          cell.innerHTML = '<span class="rep-gallery-cell-empty">—</span>';
        }
      });

      lastRow = row;
      existingRows.delete(repNum); // Mark as processed
    }

    // Remove rows that no longer exist
    existingRows.forEach((row) => row.remove());

    // Only auto-scroll when the current rep index actually changes
    const currentRepIndex = appState.currentRepIndex;
    if (prevRepIndexRef.current !== currentRepIndex) {
      prevRepIndexRef.current = currentRepIndex;
      requestAnimationFrame(() => {
        const currentRow = rowsContainer.querySelector('.rep-gallery-row--current');
        if (currentRow) {
          currentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  }, [repCount, repThumbnails, appState.currentRepIndex, focusedPhase]);

  // Re-render rep-gallery when rep changes or thumbnails update
  useEffect(() => {
    renderRepGallery();
  }, [renderRepGallery]);

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
              {currentPosition ? (PHASE_LABELS[currentPosition] || currentPosition) : '—'}
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
                        {PHASE_LABELS[currentPosition] || currentPosition}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Exercise detection badge - bottom left */}
            <div className="hud-overlay-bottom-left">
              <ExerciseDetectionBadge
                detectedExercise={detectedExercise}
                confidence={detectionConfidence}
                isLocked={isDetectionLocked}
                onOverride={setExerciseType}
              />
            </div>
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

      {/* Rep Gallery Widget - inline multi-rep viewer with dynamic zoom */}
      <div className="rep-gallery-section">
        <div className="rep-gallery-container" ref={repGalleryRef} onClick={handleRepGalleryClick} onDoubleClick={handleRepGalleryDoubleClick} />
        {/* Gallery button - show when there are reps */}
        {repCount > 0 && repThumbnails.size > 0 && (
          <button
            type="button"
            className="rep-gallery-gallery-btn"
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
