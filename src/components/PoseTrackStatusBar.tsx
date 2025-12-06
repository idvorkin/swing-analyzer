/**
 * PoseTrackStatusBar Component
 *
 * A subtle status bar showing pose track extraction progress and actions.
 * Appears below the video player when a video is loaded.
 */

import { getModelDisplayName } from '../services/PoseExtractor';
import {
  estimatePoseTrackSize,
  formatFileSize,
} from '../services/PoseTrackService';
import type { PoseModel, PoseTrackStatus } from '../types/posetrack';
import './PoseTrackStatusBar.css';

interface PoseTrackStatusBarProps {
  /** Current pose track status */
  status: PoseTrackStatus;
  /** Callback to cancel extraction */
  onCancel?: () => void;
  /** Callback to save pose track */
  onSave?: () => void;
  /** Callback to download pose track */
  onDownload?: () => void;
  /** Whether to show the save button */
  showSaveButton?: boolean;
}

export function PoseTrackStatusBar({
  status,
  onCancel,
  onSave,
  onDownload,
  showSaveButton = true,
}: PoseTrackStatusBarProps) {
  // Don't render if no status
  if (status.type === 'none') {
    return null;
  }

  return (
    <div className="pose-status-bar">
      <div className="pose-status-left">
        {/* Extracting state */}
        {status.type === 'extracting' && (
          <>
            <div className="pose-status-indicator extracting">
              <svg
                className="spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>Extracting poses...</span>
            </div>
            <div className="mini-progress">
              <div
                className="mini-progress-fill"
                style={{ width: `${status.progress.percentage}%` }}
              />
            </div>
            <span className="progress-text">
              {status.progress.percentage}% • {status.progress.currentFrame}/{status.progress.totalFrames} frames
              {status.progress.elapsedTime != null && (
                <> • {status.progress.elapsedTime.toFixed(1)}s</>
              )}
              {status.progress.fps != null && (
                <> @ {status.progress.fps.toFixed(1)} fps</>
              )}
            </span>
          </>
        )}

        {/* Ready state */}
        {status.type === 'ready' && (
          <div
            className={`pose-status-indicator ${status.fromCache ? 'loaded' : 'ready'}`}
          >
            {status.fromCache ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <polyline points="16 13 12 17 8 13" />
                  <line x1="12" y1="17" x2="12" y2="9" />
                </svg>
                <span>
                  Pose track loaded{' '}
                  <span className="subtle">
                    ({getModelDisplayName(status.poseTrack.metadata.model)})
                  </span>
                </span>
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>
                  Pose track ready{' '}
                  <span className="subtle">
                    ({status.poseTrack.frames.length} frames •{' '}
                    {formatFileSize(
                      estimatePoseTrackSize(status.poseTrack.frames.length)
                    )}
                    )
                  </span>
                </span>
              </>
            )}
          </div>
        )}

        {/* Error state */}
        {status.type === 'error' && (
          <div className="pose-status-indicator error">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>Extraction failed: {status.error}</span>
          </div>
        )}
      </div>

      <div className="pose-status-right">
        {/* Cancel link during extraction */}
        {status.type === 'extracting' && onCancel && (
          <button type="button" className="cancel-link" onClick={onCancel}>
            Cancel
          </button>
        )}

        {/* Save button when ready */}
        {status.type === 'ready' && showSaveButton && !status.fromCache && (
          <button
            type="button"
            className="save-pose-btn visible"
            onClick={onSave}
            title="Save pose track for faster loading next time"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save Pose Track
          </button>
        )}

        {/* Download button when ready */}
        {status.type === 'ready' && onDownload && (
          <button
            type="button"
            className="download-pose-btn"
            onClick={onDownload}
            title="Download pose track file"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Model selector dropdown
 */
interface ModelSelectorProps {
  value: PoseModel;
  onChange: (model: PoseModel) => void;
  disabled?: boolean;
}

export function PoseModelSelector({
  value,
  onChange,
  disabled,
}: ModelSelectorProps) {
  return (
    <div className="model-selector">
      <label className="model-selector-label" htmlFor="pose-model-select">
        Model:
      </label>
      <select
        id="pose-model-select"
        className="model-selector-select"
        value={value}
        onChange={(e) => onChange(e.target.value as PoseModel)}
        disabled={disabled}
      >
        <option value="blazepose">BlazePose (33 keypoints)</option>
      </select>
    </div>
  );
}
