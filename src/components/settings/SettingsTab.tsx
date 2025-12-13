import { useCallback, useEffect, useState } from 'react';
import type { BlazePoseVariant } from '../../config/modelConfig';
import { useSwingAnalyzerContext } from '../../contexts/ExerciseAnalyzerContext';
import {
  clearAllPoseTracks,
  getPoseTrackStorageMode,
  setPoseTrackStorageMode,
} from '../../services/PoseTrackService';
import { sessionRecorder } from '../../services/SessionRecorder';
import type { DisplayMode } from '../../types';
import { DatabaseIcon, DownloadIcon, MonitorIcon, SparklesIcon } from './Icons';
import { SegmentedControl } from './SegmentedControl';
import { Toggle } from './Toggle';

// Storage key for BlazePose variant
const BLAZEPOSE_VARIANT_KEY = 'swing-analyzer-blazepose-variant';

// Get saved BlazePose variant (with error handling for private browsing/quota issues)
export function getSavedBlazePoseVariant(): BlazePoseVariant {
  try {
    const saved = localStorage.getItem(BLAZEPOSE_VARIANT_KEY);
    if (saved === 'full' || saved === 'heavy') return saved;
    return 'lite';
  } catch (error) {
    console.warn('Failed to read BlazePose variant from localStorage:', error);
    return 'lite';
  }
}

// Save BlazePose variant (with error handling for private browsing/quota issues)
function saveBlazePoseVariant(variant: BlazePoseVariant): void {
  try {
    localStorage.setItem(BLAZEPOSE_VARIANT_KEY, variant);
  } catch (error) {
    console.error('Failed to save BlazePose variant:', error);
  }
}

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'video', label: 'Video' },
  { value: 'overlay', label: 'Skeleton' },
];

const BLAZEPOSE_OPTIONS: { value: BlazePoseVariant; label: string }[] = [
  { value: 'lite', label: 'Lite' },
  { value: 'full', label: 'Full' },
  { value: 'heavy', label: 'Heavy' },
];

export function SettingsTab() {
  const { appState, setDisplayMode } = useSwingAnalyzerContext();
  const [blazePoseVariant, setBlazePoseVariant] = useState<BlazePoseVariant>(
    getSavedBlazePoseVariant()
  );
  const [poseCacheEnabled, setPoseCacheEnabled] = useState(
    () => getPoseTrackStorageMode() === 'indexeddb'
  );
  const [needsReload, setNeedsReload] = useState(false);

  // Developer section state
  const [recordingStats, setRecordingStats] = useState(
    sessionRecorder.getStats()
  );
  const [hasPoseTrack, setHasPoseTrack] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRecordingStats(sessionRecorder.getStats());
      setHasPoseTrack(sessionRecorder.getPoseTrack() !== null);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  const handleDownloadPoseTrack = useCallback(async () => {
    const swingDebug = (
      window as unknown as {
        swingDebug?: { downloadPoseTrack: () => Promise<string | null> };
      }
    ).swingDebug;
    if (swingDebug?.downloadPoseTrack) {
      setIsDownloading(true);
      try {
        await swingDebug.downloadPoseTrack();
      } finally {
        setIsDownloading(false);
      }
    }
  }, []);

  const handleVariantChange = (variant: BlazePoseVariant) => {
    const previousVariant = getSavedBlazePoseVariant();
    setBlazePoseVariant(variant);
    saveBlazePoseVariant(variant);
    if (variant !== previousVariant) {
      setNeedsReload(true);
    }
  };

  const handlePoseCacheToggle = () => {
    const newEnabled = !poseCacheEnabled;
    setPoseCacheEnabled(newEnabled);
    setPoseTrackStorageMode(newEnabled ? 'indexeddb' : 'memory');
  };

  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);
  const [clearError, setClearError] = useState(false);

  const handleClearCache = async () => {
    setIsClearing(true);
    setClearSuccess(false);
    setClearError(false);
    try {
      await clearAllPoseTracks();
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 2000);
    } catch (error) {
      console.error('[SettingsTab] Failed to clear pose cache:', error);
      setClearError(true);
      setTimeout(() => setClearError(false), 3000);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="settings-section settings-section--compact">
      {/* Display Mode */}
      <div className="settings-compact-row">
        <div className="settings-compact-label">
          <div className="settings-compact-icon settings-compact-icon--blue">
            <MonitorIcon />
          </div>
          <span>Display</span>
        </div>
        <SegmentedControl
          options={DISPLAY_MODE_OPTIONS}
          value={appState.displayMode}
          onChange={setDisplayMode}
          name="display-mode"
        />
      </div>

      {/* BlazePose Variant */}
      <div className="settings-compact-row">
        <div className="settings-compact-label">
          <div className="settings-compact-icon settings-compact-icon--orange">
            <SparklesIcon />
          </div>
          <span>Model</span>
        </div>
        <SegmentedControl
          options={BLAZEPOSE_OPTIONS}
          value={blazePoseVariant}
          onChange={handleVariantChange}
          name="blazepose-variant"
        />
      </div>

      {/* Pose Cache */}
      <div className="settings-compact-row">
        <div className="settings-compact-label">
          <div className="settings-compact-icon settings-compact-icon--green">
            <DatabaseIcon />
          </div>
          <span>Cache Poses</span>
        </div>
        <Toggle
          checked={poseCacheEnabled}
          onChange={handlePoseCacheToggle}
          aria-label="Toggle pose caching"
        />
      </div>

      {/* Clear Cache */}
      <div className="settings-compact-row">
        <div className="settings-compact-label">
          <span className="settings-compact-label-indent">Clear Cache</span>
        </div>
        <button
          type="button"
          className="settings-clear-btn"
          onClick={handleClearCache}
          disabled={isClearing}
        >
          {isClearing
            ? 'Clearing...'
            : clearSuccess
              ? 'Cleared!'
              : clearError
                ? 'Failed!'
                : 'Clear'}
        </button>
      </div>

      {/* Reload Banner */}
      {needsReload && (
        <div className="settings-reload-banner settings-reload-banner--compact">
          <span className="settings-reload-text">Reload to apply</span>
          <button
            type="button"
            className="settings-reload-btn settings-reload-btn--compact"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )}

      {/* Developer Section */}
      <div className="settings-divider" />

      {/* Action buttons row */}
      <div className="settings-actions-row">
        <button
          type="button"
          className="settings-action-btn settings-action-btn--green"
          onClick={() => sessionRecorder.downloadRecording()}
        >
          <DownloadIcon /> Download Log
        </button>
        <button
          type="button"
          className="settings-action-btn settings-action-btn--blue"
          onClick={handleDownloadPoseTrack}
          disabled={!hasPoseTrack || isDownloading}
          title={
            hasPoseTrack ? 'Download extracted pose data' : 'Load a video first'
          }
        >
          <DownloadIcon /> {isDownloading ? 'Compressing...' : 'Download Poses'}
        </button>
      </div>

      {/* Session stats inline */}
      <div className="settings-stats-row">
        <span className="settings-stat">
          {formatDuration(recordingStats.duration)}
        </span>
        <span className="settings-stat">
          {recordingStats.interactions} clicks
        </span>
        <span className="settings-stat">{recordingStats.snapshots} snaps</span>
        {recordingStats.errors > 0 && (
          <span className="settings-stat settings-stat--error">
            {recordingStats.errors} errors
          </span>
        )}
      </div>
    </div>
  );
}
