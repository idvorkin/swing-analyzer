import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PositionCandidate } from '../types/exercise';
import './RepGalleryModal.css';

/** Labels for phase names (exercise-agnostic, can be extended) */
const PHASE_LABELS: Record<string, string> = {
  top: 'Top',
  connect: 'Connect',
  bottom: 'Bottom',
  release: 'Release',
  // Add more as needed for other exercises
};

interface RepGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  repThumbnails: Map<number, Map<string, PositionCandidate>>;
  currentRepIndex: number;
  onSeek: (time: number) => void;
  onRepSelect: (repIndex: number) => void;
}

type ViewMode = 'grid' | 'compare';

export function RepGalleryModal({
  isOpen,
  onClose,
  repThumbnails,
  currentRepIndex,
  onSeek,
  onRepSelect,
}: RepGalleryModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedReps, setSelectedReps] = useState<Set<number>>(new Set());
  const [focusedPhase, setFocusedPhase] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Get phase names dynamically from the data (exercise-agnostic)
  const phaseNames = useMemo(() => {
    const phases = new Set<string>();
    for (const positions of repThumbnails.values()) {
      for (const posName of positions.keys()) {
        phases.add(posName);
      }
    }
    // Sort by known order if possible, otherwise alphabetical
    const knownOrder = ['top', 'connect', 'bottom', 'release'];
    return Array.from(phases).sort((a, b) => {
      const aIdx = knownOrder.indexOf(a);
      const bIdx = knownOrder.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [repThumbnails]);

  // Get sorted rep numbers
  const repNumbers = useMemo(() => {
    return Array.from(repThumbnails.keys()).sort((a, b) => a - b);
  }, [repThumbnails]);

  // Reset selection when closing
  useEffect(() => {
    if (!isOpen) {
      setSelectedReps(new Set());
      setViewMode('grid');
      setFocusedPhase(null);
    }
  }, [isOpen]);

  // Toggle focused phase (click again to unfocus)
  const handlePhaseClick = useCallback((phase: string) => {
    setFocusedPhase((prev) => (prev === phase ? null : phase));
  }, []);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleThumbnailClick = useCallback(
    (repNum: number, position: PositionCandidate) => {
      if (position.videoTime !== undefined) {
        onSeek(position.videoTime);
        onRepSelect(repNum - 1); // Convert to 0-indexed
      }
    },
    [onSeek, onRepSelect]
  );

  const handleRepSelectionToggle = useCallback((repNum: number) => {
    setSelectedReps((prev) => {
      const next = new Set(prev);
      if (next.has(repNum)) {
        next.delete(repNum);
      } else if (next.size < 4) {
        // Max 4 reps for comparison
        next.add(repNum);
      }
      return next;
    });
  }, []);

  const handleCompareClick = useCallback(() => {
    if (selectedReps.size >= 2) {
      setViewMode('compare');
    }
  }, [selectedReps.size]);

  const handleBackToGrid = useCallback(() => {
    setViewMode('grid');
  }, []);

  if (!isOpen) return null;

  const selectedRepsArray = Array.from(selectedReps).sort((a, b) => a - b);

  return (
    <div
      className="gallery-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-title"
    >
      <div
        className="gallery-modal"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className="gallery-header">
          <div className="gallery-header-left">
            {viewMode === 'compare' && (
              <button
                type="button"
                className="gallery-back-btn"
                onClick={handleBackToGrid}
                aria-label="Back to grid"
              >
                <BackIcon />
              </button>
            )}
            <div className="gallery-header-icon">
              <GridIcon />
            </div>
            <h2 id="gallery-title" className="gallery-title">
              {viewMode === 'grid' ? 'Rep Gallery' : 'Compare Reps'}
            </h2>
          </div>
          <div className="gallery-header-right">
            {viewMode === 'grid' && selectedReps.size >= 2 && (
              <button
                type="button"
                className="gallery-compare-btn"
                onClick={handleCompareClick}
              >
                Compare ({selectedReps.size})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="gallery-close-btn"
              aria-label="Close gallery"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="gallery-content">
          {repNumbers.length === 0 ? (
            <div className="gallery-empty">
              No reps recorded yet. Complete some reps to see them here.
            </div>
          ) : viewMode === 'grid' ? (
            <div className={`gallery-grid ${focusedPhase ? 'gallery-grid--focused' : ''}`} ref={gridRef}>
              {/* Header row with phase names */}
              <div className="gallery-grid-header">
                <div className="gallery-grid-cell gallery-grid-cell--header gallery-grid-cell--rep">
                  Rep
                </div>
                {phaseNames.map((phase) => (
                  <button
                    type="button"
                    key={phase}
                    className={`gallery-grid-cell gallery-grid-cell--header gallery-phase-btn ${focusedPhase === phase ? 'gallery-phase-btn--active' : ''}`}
                    onClick={() => handlePhaseClick(phase)}
                    title={focusedPhase === phase ? 'Click to show all phases' : `Focus on ${PHASE_LABELS[phase] || phase}`}
                  >
                    {PHASE_LABELS[phase] || phase}
                  </button>
                ))}
              </div>

              {/* Rep rows */}
              {repNumbers.map((repNum) => {
                const positions = repThumbnails.get(repNum);
                const isCurrentRep = repNum - 1 === currentRepIndex;
                const isSelected = selectedReps.has(repNum);

                return (
                  <div
                    key={repNum}
                    className={`gallery-grid-row ${isCurrentRep ? 'gallery-grid-row--current' : ''} ${isSelected ? 'gallery-grid-row--selected' : ''}`}
                  >
                    {/* Rep number cell with checkbox */}
                    <div className="gallery-grid-cell gallery-grid-cell--rep">
                      <label className="gallery-rep-label">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleRepSelectionToggle(repNum)}
                          className="gallery-checkbox"
                        />
                        <span className="gallery-rep-number">{repNum}</span>
                      </label>
                    </div>

                    {/* Phase cells */}
                    {phaseNames.map((phase) => {
                      const position = positions?.get(phase);
                      const isFocused = focusedPhase === phase;
                      const isMinimized = focusedPhase && !isFocused;
                      return (
                        <div
                          key={phase}
                          className={`gallery-grid-cell ${isFocused ? 'gallery-grid-cell--focused' : ''} ${isMinimized ? 'gallery-grid-cell--minimized' : ''}`}
                        >
                          {position?.frameImage ? (
                            <ThumbnailCanvas
                              position={position}
                              onClick={() =>
                                handleThumbnailClick(repNum, position)
                              }
                              onDoubleTap={() => handlePhaseClick(phase)}
                              size={isFocused ? 'large' : isMinimized ? 'mini' : 'small'}
                            />
                          ) : (
                            <div className={`gallery-thumbnail-empty ${isMinimized ? 'gallery-thumbnail-empty--mini' : ''}`}>—</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Compare view */
            <div className="gallery-compare">
              {/* Phase headers */}
              <div className="gallery-compare-header">
                <div className="gallery-compare-cell gallery-compare-cell--label" />
                {phaseNames.map((phase) => (
                  <div key={phase} className="gallery-compare-cell">
                    {PHASE_LABELS[phase] || phase}
                  </div>
                ))}
              </div>

              {/* Selected rep rows */}
              {selectedRepsArray.map((repNum) => {
                const positions = repThumbnails.get(repNum);
                return (
                  <div key={repNum} className="gallery-compare-row">
                    <div className="gallery-compare-cell gallery-compare-cell--label">
                      Rep {repNum}
                    </div>
                    {phaseNames.map((phase) => {
                      const position = positions?.get(phase);
                      return (
                        <div key={phase} className="gallery-compare-cell">
                          {position?.frameImage ? (
                            <ThumbnailCanvas
                              position={position}
                              onClick={() =>
                                handleThumbnailClick(repNum, position)
                              }
                              size="large"
                            />
                          ) : (
                            <div className="gallery-thumbnail-empty">—</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="gallery-footer">
          {viewMode === 'grid' ? (
            <span className="gallery-hint">
              Double-tap thumbnail to focus phase. Tap to seek. Select reps to compare.
            </span>
          ) : (
            <span className="gallery-hint">
              Tap thumbnails to seek video.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Renders a thumbnail canvas from ImageData */
function ThumbnailCanvas({
  position,
  onClick,
  onDoubleTap,
  size,
}: {
  position: PositionCandidate;
  onClick: () => void;
  onDoubleTap?: () => void;
  size: 'small' | 'large' | 'mini';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !position.frameImage) return;

    canvas.width = position.frameImage.width;
    canvas.height = position.frameImage.height;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(position.frameImage, 0, 0);
    }
  }, [position.frameImage]);

  const timestamp =
    position.videoTime !== undefined
      ? `${position.videoTime.toFixed(2)}s`
      : undefined;

  const handleClick = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY && onDoubleTap) {
      // Double-tap detected - focus the phase
      onDoubleTap();
    } else {
      // Single tap - seek to timestamp
      onClick();
    }
    lastTapRef.current = now;
  }, [onClick, onDoubleTap]);

  return (
    <button
      type="button"
      className={`gallery-thumbnail gallery-thumbnail--${size}`}
      onClick={handleClick}
      title={timestamp ? `Seek to ${timestamp}` : undefined}
    >
      <canvas ref={canvasRef} className="gallery-thumbnail-canvas" />
      {timestamp && <span className="gallery-thumbnail-time">{timestamp}</span>}
    </button>
  );
}

// Icons
function GridIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
