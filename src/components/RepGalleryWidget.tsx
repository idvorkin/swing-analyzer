/**
 * RepGalleryWidget - Inline rep gallery showing all reps as scrollable rows
 *
 * Pure React component replacing the DOM manipulation approach.
 * Displays a header row with phase names and one row per rep with thumbnails.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PositionCandidate } from '../types/exercise';
import { PHASE_LABELS } from './repGalleryConstants';
import { ThumbnailCanvas } from './ThumbnailCanvas';

interface RepGalleryWidgetProps {
  repCount: number;
  repThumbnails: Map<number, Map<string, PositionCandidate>>;
  currentRepIndex: number;
  currentPhases: string[];
  focusedPhase: string | null;
  onPhaseClick: (phase: string) => void;
  onThumbnailClick: (videoTime: number, repNum: number) => void;
}

export function RepGalleryWidget({
  repCount,
  repThumbnails,
  currentRepIndex,
  currentPhases,
  focusedPhase,
  onPhaseClick,
  onThumbnailClick,
}: RepGalleryWidgetProps) {
  // Ref for the current row (for auto-scrolling)
  const currentRowRef = useRef<HTMLDivElement>(null);

  // Track previous rep index to only scroll when it changes
  const prevRepIndexRef = useRef<number>(-1);

  // Get sorted rep numbers
  const repNumbers = useMemo(
    () => Array.from(repThumbnails.keys()).sort((a, b) => a - b),
    [repThumbnails]
  );

  // Auto-scroll to current row when rep index changes
  useEffect(() => {
    if (prevRepIndexRef.current !== currentRepIndex && currentRowRef.current) {
      prevRepIndexRef.current = currentRepIndex;
      currentRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentRepIndex]);

  // Empty state: no reps detected
  if (repCount === 0) {
    return (
      <div className="rep-gallery-empty">Complete a rep to see checkpoints</div>
    );
  }

  // Loading state: reps detected but no thumbnail data yet
  if (repThumbnails.size === 0) {
    return <div className="rep-gallery-empty">Loading rep data...</div>;
  }

  const currentRepNum = currentRepIndex + 1;

  return (
    <>
      {/* Header row with phase names */}
      <div
        className={`rep-gallery-header${focusedPhase ? ' rep-gallery-header--focused' : ''}`}
      >
        <div className="rep-gallery-header-rep" />
        {currentPhases.map((phase) => {
          const isFocused = focusedPhase === phase;
          const isMinimized = focusedPhase && !isFocused;
          return (
            <button
              key={phase}
              type="button"
              className={`rep-gallery-header-phase${isFocused ? ' rep-gallery-header-phase--focused' : ''}${isMinimized ? ' rep-gallery-header-phase--minimized' : ''}`}
              data-phase={phase}
              title={
                isFocused
                  ? 'Click to show all phases'
                  : `Click to focus on ${PHASE_LABELS[phase] || phase}`
              }
              onClick={() => onPhaseClick(phase)}
            >
              {PHASE_LABELS[phase] || phase}
            </button>
          );
        })}
      </div>

      {/* Rows container */}
      <div className="rep-gallery-rows">
        {repNumbers.map((repNum) => {
          const positions = repThumbnails.get(repNum);
          if (!positions || positions.size === 0) return null;

          const isCurrent = repNum === currentRepNum;

          return (
            <div
              key={repNum}
              ref={isCurrent ? currentRowRef : undefined}
              className={`rep-gallery-row${focusedPhase ? ' rep-gallery-row--has-focus' : ''}${isCurrent ? ' rep-gallery-row--current' : ''}`}
              data-rep-num={repNum}
            >
              {/* Rep number label */}
              <div className="rep-gallery-row-rep">{repNum}</div>

              {/* Phase cells */}
              {currentPhases.map((phase) => {
                const candidate = positions.get(phase);
                const isFocused = focusedPhase === phase;
                const isMinimized = Boolean(focusedPhase && !isFocused);

                return (
                  <RepGalleryCell
                    key={phase}
                    phase={phase}
                    repNum={repNum}
                    candidate={candidate}
                    isFocused={isFocused}
                    isMinimized={isMinimized}
                    onThumbnailClick={onThumbnailClick}
                    onPhaseClick={onPhaseClick}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Individual cell in the rep gallery grid
 */
interface RepGalleryCellProps {
  phase: string;
  repNum: number;
  candidate: PositionCandidate | undefined;
  isFocused: boolean;
  isMinimized: boolean;
  onThumbnailClick: (videoTime: number, repNum: number) => void;
  onPhaseClick: (phase: string) => void;
}

function RepGalleryCell({
  phase,
  repNum,
  candidate,
  isFocused,
  isMinimized,
  onThumbnailClick,
  onPhaseClick,
}: RepGalleryCellProps) {
  const handleClick = useCallback(() => {
    if (candidate?.videoTime !== undefined) {
      onThumbnailClick(candidate.videoTime, repNum);
    }
  }, [candidate?.videoTime, repNum, onThumbnailClick]);

  const handleDoubleTap = useCallback(() => {
    onPhaseClick(phase);
  }, [onPhaseClick, phase]);

  // Determine size based on focus state
  const size = isFocused ? 'large' : isMinimized ? 'mini' : 'small';

  return (
    <div
      className={`rep-gallery-cell${isFocused ? ' rep-gallery-cell--focused' : ''}${isMinimized ? ' rep-gallery-cell--minimized' : ''}`}
      data-phase={phase}
    >
      {candidate?.frameImage ? (
        <ThumbnailCanvas
          candidate={candidate}
          phase={phase}
          size={size}
          isFocused={isFocused}
          isMinimized={isMinimized}
          onClick={handleClick}
          onDoubleTap={handleDoubleTap}
          className="rep-gallery-thumbnail"
        />
      ) : (
        <span className="rep-gallery-cell-empty">—</span>
      )}
    </div>
  );
}
