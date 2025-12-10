/**
 * ThumbnailCanvas - Shared component for rendering frame thumbnails
 *
 * Used by both RepGalleryWidget and RepGalleryModal to render
 * ImageData frames to canvas with seek-on-click and double-tap-to-focus.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { PositionCandidate } from '../types/exercise';
import { PHASE_LABELS } from './repGalleryConstants';

export interface ThumbnailCanvasProps {
  /** The position candidate containing the frame image */
  candidate: PositionCandidate;
  /** Phase name for title/label */
  phase: string;
  /** Visual size variant */
  size: 'small' | 'large' | 'mini';
  /** Whether this phase column is focused (expanded) */
  isFocused?: boolean;
  /** Whether this phase column is minimized (collapsed) */
  isMinimized?: boolean;
  /** Click handler (typically seeks video) */
  onClick: () => void;
  /** Double-tap handler (typically focuses phase) */
  onDoubleTap?: () => void;
  /** Whether to show timestamp badge overlay */
  showTimestamp?: boolean;
  /** CSS class name for the container */
  className?: string;
}

const DOUBLE_TAP_DELAY = 300;

export function ThumbnailCanvas({
  candidate,
  phase,
  size,
  isFocused = false,
  isMinimized = false,
  onClick,
  onDoubleTap,
  showTimestamp = false,
  className,
}: ThumbnailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastTapRef = useRef<number>(0);

  // Render the image data to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candidate.frameImage) return;

    // Update canvas dimensions if needed
    if (canvas.width !== candidate.frameImage.width || canvas.height !== candidate.frameImage.height) {
      canvas.width = candidate.frameImage.width;
      canvas.height = candidate.frameImage.height;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      try {
        ctx.putImageData(candidate.frameImage, 0, 0);
      } catch (error) {
        console.error('Failed to render thumbnail:', error);
        // Canvas will show empty - graceful degradation
      }
    }
  }, [candidate.frameImage]);

  // Handle click with double-tap detection
  const handleClick = useCallback(() => {
    const now = Date.now();

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY && onDoubleTap) {
      // Double-tap detected - focus the phase
      onDoubleTap();
    } else {
      // Single tap - seek to timestamp
      onClick();
    }
    lastTapRef.current = now;
  }, [onClick, onDoubleTap]);

  const timestamp =
    candidate.videoTime !== undefined
      ? `${candidate.videoTime.toFixed(2)}s`
      : undefined;

  const title = timestamp
    ? `${PHASE_LABELS[phase] || phase} at ${timestamp}`
    : PHASE_LABELS[phase] || phase;

  // Build class names based on variant
  const containerClasses = [
    className || 'thumbnail-canvas',
    `thumbnail-canvas--${size}`,
    isFocused && 'thumbnail-canvas--focused',
    isMinimized && 'thumbnail-canvas--minimized',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses} title={title}>
      <canvas
        ref={canvasRef}
        className="thumbnail-canvas__canvas"
        style={{ cursor: candidate.videoTime !== undefined ? 'pointer' : 'default' }}
        onClick={handleClick}
      />
      {showTimestamp && timestamp && (
        <span className="thumbnail-canvas__time">{timestamp}</span>
      )}
    </div>
  );
}
