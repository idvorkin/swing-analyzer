/**
 * Pose Studio Page
 *
 * Debug/power-user page for extracting, managing, and testing pose tracks.
 * Accessible at /poses route.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePoseTrack } from '../hooks/usePoseTrack';
import { analyzePoseTrack } from '../pipeline/PoseTrackPipeline';
import { getModelDisplayName } from '../services/PoseExtractor';
import {
  deletePoseTrackFromStorage,
  downloadPoseTrack,
  formatFileSize,
  listSavedPoseTracks,
  loadPoseTrackFromStorage,
} from '../services/PoseTrackService';
import type { SavedPoseTrackInfo } from '../types/posetrack';
import { PoseModelSelector } from './PoseTrackStatusBar';
import './PoseStudioPage.css';

export function PoseStudioPage() {
  // Pose track hook
  const {
    status,
    model,
    setModel,
    startExtraction,
    cancelExtraction,
    savePoseTrack,
    downloadPoseTrack: downloadCurrentPoseTrack,
  } = usePoseTrack({ autoExtract: false });

  // Local state
  const [savedTracks, setSavedTracks] = useState<SavedPoseTrackInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Error state for user feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Clear messages after timeout
  const showError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage(null);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Load saved tracks on mount
  useEffect(() => {
    loadSavedTracks();
  }, []);

  const loadSavedTracks = async () => {
    try {
      const tracks = await listSavedPoseTracks();
      setSavedTracks(tracks);
    } catch (error) {
      console.error('Failed to load saved tracks:', error);
      showError('Failed to load saved pose tracks');
    }
  };

  // Handle video file selection
  const handleVideoSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        setSelectedFile(file);
      }
    },
    []
  );

  // Handle extraction start
  const handleExtract = useCallback(async () => {
    if (!selectedFile) return;
    await startExtraction(selectedFile);
  }, [selectedFile, startExtraction]);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      await savePoseTrack();
      await loadSavedTracks();
      showSuccess('Pose track saved successfully');
    } catch (error) {
      console.error('Failed to save pose track:', error);
      showError('Failed to save pose track');
    }
  }, [savePoseTrack]);

  // Handle delete
  const handleDelete = useCallback(async (videoHash: string) => {
    if (!confirm('Delete this pose track?')) return;

    try {
      await deletePoseTrackFromStorage(videoHash);
      await loadSavedTracks();
      showSuccess('Pose track deleted');
    } catch (error) {
      console.error('Failed to delete pose track:', error);
      showError('Failed to delete pose track');
    }
  }, []);

  // Handle download saved track
  const handleDownloadSaved = useCallback(async (videoHash: string) => {
    try {
      const poseTrack = await loadPoseTrackFromStorage(videoHash);
      if (poseTrack) {
        downloadPoseTrack(poseTrack);
      } else {
        showError('Pose track not found');
      }
    } catch (error) {
      console.error('Failed to download pose track:', error);
      showError('Failed to download pose track');
    }
  }, []);

  // Handle test (analyze) saved track
  const handleTestSaved = useCallback(async (videoHash: string) => {
    try {
      const poseTrack = await loadPoseTrackFromStorage(videoHash);
      if (poseTrack) {
        const analysis = analyzePoseTrack(poseTrack);
        alert(
          `Analysis Results:\n\n` +
            `Total Frames: ${analysis.totalFrames}\n` +
            `Frames with Pose: ${analysis.framesWithPose}\n` +
            `Detection Rate: ${(analysis.detectionRate * 100).toFixed(1)}%\n` +
            `Avg Confidence: ${(analysis.averageConfidence * 100).toFixed(1)}%\n` +
            `Rep Count: ${analysis.repCount}\n` +
            `Duration: ${analysis.duration.toFixed(1)}s`
        );
      } else {
        showError('Pose track not found');
      }
    } catch (error) {
      console.error('Failed to test pose track:', error);
      showError('Failed to analyze pose track');
    }
  }, []);

  // Clear selected file
  const clearSelectedFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Get file info display
  const getFileInfo = (file: File) => {
    return formatFileSize(file.size);
  };

  return (
    <div className="pose-studio">
      {/* Header */}
      <header className="pose-studio-header">
        <div className="pose-studio-header-inner">
          <div className="pose-studio-logo">
            <div className="pose-studio-logo-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="5" r="2" />
                <line x1="12" y1="7" x2="12" y2="14" />
                <line x1="12" y1="10" x2="8" y2="7" />
                <line x1="12" y1="10" x2="16" y2="7" />
                <line x1="12" y1="14" x2="9" y2="20" />
                <line x1="12" y1="14" x2="15" y2="20" />
              </svg>
            </div>
            <div className="pose-studio-logo-text">
              Pose<span>Studio</span>
            </div>
          </div>
          <nav className="pose-studio-nav">
            <a href="/" className="pose-studio-nav-link">
              Analyzer
            </a>
            <a href="/poses" className="pose-studio-nav-link active">
              Pose Studio
            </a>
            <a href="/debug" className="pose-studio-nav-link">
              Debug
            </a>
          </nav>
        </div>
      </header>

      {/* Toast notifications */}
      {errorMessage && (
        <div className="toast toast-error">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="20"
            height="20"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="toast toast-success">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="20"
            height="20"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {successMessage}
        </div>
      )}

      {/* Main content */}
      <main className="pose-studio-main">
        <div className="pose-studio-page-header">
          <h1 className="pose-studio-page-title">Pose Studio</h1>
          <p className="pose-studio-page-subtitle">
            Extract, manage, and test pose data from your swing videos
          </p>
        </div>

        <div className="pose-studio-grid">
          {/* Left panel: Extraction controls */}
          <div className="pose-studio-card">
            <div className="pose-studio-card-header">
              <div className="pose-studio-card-title">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Extract Poses
              </div>
            </div>
            <div className="pose-studio-card-body">
              <div className="extraction-panel">
                {/* File input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoSelect}
                  style={{ display: 'none' }}
                />

                {/* Drop zone or selected file */}
                {!selectedFile ? (
                  <button
                    type="button"
                    className="drop-zone"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg
                      className="drop-zone-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="2" y="2" width="20" height="20" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <p className="drop-zone-text">
                      Click to select video or <strong>browse</strong>
                    </p>
                    <p className="drop-zone-hint">MP4, MOV, WebM</p>
                  </button>
                ) : (
                  <div className="video-loaded">
                    <div className="video-thumbnail">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        width="24"
                        height="24"
                      >
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                    <div className="video-info">
                      <div className="video-name">{selectedFile.name}</div>
                      <div className="video-meta">
                        {getFileInfo(selectedFile)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="video-remove"
                      onClick={clearSelectedFile}
                      title="Remove video"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        width="16"
                        height="16"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Model selector */}
                <PoseModelSelector
                  value={model}
                  onChange={setModel}
                  disabled={status.type === 'extracting'}
                />

                {/* Extract button */}
                <button
                  type="button"
                  className="btn btn-primary btn-full"
                  onClick={handleExtract}
                  disabled={!selectedFile || status.type === 'extracting'}
                >
                  {status.type === 'extracting' ? (
                    <>
                      <svg
                        className="spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Extracting... {status.progress.percentage}%
                    </>
                  ) : (
                    <>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                      Extract Poses
                    </>
                  )}
                </button>

                {/* Cancel button during extraction */}
                {status.type === 'extracting' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-full"
                    onClick={cancelExtraction}
                  >
                    Cancel
                  </button>
                )}

                {/* Save/Download when ready */}
                {status.type === 'ready' && (
                  <div className="extraction-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSave}
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
                      Save to Storage
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={downloadCurrentPoseTrack}
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
                      Download
                    </button>
                  </div>
                )}

                {/* Error state */}
                {status.type === 'error' && (
                  <div className="extraction-error">
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
                    {status.error}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right panel: Progress/Preview */}
          <div className="pose-studio-card">
            <div className="pose-studio-card-header">
              <div className="pose-studio-card-title">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {status.type === 'extracting'
                  ? 'Extraction Progress'
                  : 'Preview'}
              </div>
              {status.type === 'extracting' && (
                <span className="status-badge extracting">
                  <svg
                    className="spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Extracting...
                </span>
              )}
              {status.type === 'ready' && (
                <span className="status-badge complete">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Complete
                </span>
              )}
            </div>
            <div className="pose-studio-card-body">
              {status.type === 'extracting' ? (
                <div className="progress-panel">
                  <div className="progress-stats">
                    <div className="progress-stat">
                      <div className="progress-stat-value">
                        {status.progress.currentFrame}
                      </div>
                      <div className="progress-stat-label">Frames</div>
                    </div>
                    <div className="progress-stat">
                      <div className="progress-stat-value">
                        {status.progress.currentTime.toFixed(1)}s
                      </div>
                      <div className="progress-stat-label">Time</div>
                    </div>
                    <div className="progress-stat">
                      <div className="progress-stat-value">
                        {status.progress.estimatedTimeRemaining
                          ? `${status.progress.estimatedTimeRemaining.toFixed(0)}s`
                          : '—'}
                      </div>
                      <div className="progress-stat-label">Remaining</div>
                    </div>
                  </div>
                  <div className="progress-bar-container">
                    <div className="progress-bar-header">
                      <span className="progress-bar-label">
                        Frame {status.progress.currentFrame} of{' '}
                        {status.progress.totalFrames}
                      </span>
                      <span className="progress-bar-value">
                        {status.progress.percentage}%
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${status.progress.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : status.type === 'ready' ? (
                <div className="ready-panel">
                  <div className="ready-stats">
                    <div className="ready-stat">
                      <span className="ready-stat-label">Frames:</span>
                      <span className="ready-stat-value">
                        {status.poseTrack.metadata.frameCount}
                      </span>
                    </div>
                    <div className="ready-stat">
                      <span className="ready-stat-label">Duration:</span>
                      <span className="ready-stat-value">
                        {status.poseTrack.metadata.sourceVideoDuration.toFixed(
                          1
                        )}
                        s
                      </span>
                    </div>
                    <div className="ready-stat">
                      <span className="ready-stat-label">Model:</span>
                      <span className="ready-stat-value">
                        {getModelDisplayName(status.poseTrack.metadata.model)}
                      </span>
                    </div>
                    <div className="ready-stat">
                      <span className="ready-stat-label">FPS:</span>
                      <span className="ready-stat-value">
                        {status.poseTrack.metadata.fps}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <svg
                    className="empty-state-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="12" cy="5" r="2" />
                    <line x1="12" y1="7" x2="12" y2="14" />
                    <line x1="12" y1="10" x2="8" y2="7" />
                    <line x1="12" y1="10" x2="16" y2="7" />
                    <line x1="12" y1="14" x2="9" y2="20" />
                    <line x1="12" y1="14" x2="15" y2="20" />
                  </svg>
                  <div className="empty-state-title">No pose track</div>
                  <div className="empty-state-text">
                    Select a video and extract poses to see preview
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Saved pose tracks */}
        <section className="files-section">
          <div className="files-header">
            <h2 className="files-title">Saved Pose Tracks</h2>
            <span className="files-count">{savedTracks.length} files</span>
          </div>

          {savedTracks.length === 0 ? (
            <div className="files-empty">
              <p>
                No saved pose tracks yet. Extract and save a pose track to see
                it here.
              </p>
            </div>
          ) : (
            <div className="files-grid">
              {savedTracks.map((track) => (
                <div key={track.videoHash} className="file-card">
                  <div className="file-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div className="file-info">
                    <div className="file-name">
                      {track.videoName || 'Unknown video'}
                    </div>
                    <div className="file-meta">
                      <span className="model-badge">
                        {track.model === 'movenet-thunder'
                          ? 'Thunder'
                          : 'Lightning'}
                      </span>
                      <span className="file-meta-item">
                        {track.frameCount} frames
                      </span>
                      <span className="file-meta-item">
                        {track.duration.toFixed(1)}s
                      </span>
                      <span className="file-meta-item">
                        {formatFileSize(track.fileSize)}
                      </span>
                    </div>
                  </div>
                  <div className="file-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleTestSaved(track.videoHash)}
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDownloadSaved(track.videoHash)}
                      title="Download"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        width="16"
                        height="16"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger"
                      onClick={() => handleDelete(track.videoHash)}
                      title="Delete"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        width="16"
                        height="16"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
