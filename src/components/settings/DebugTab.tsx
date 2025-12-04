import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { PoseModel } from '../../config/modelConfig';
import { useSwingAnalyzerContext } from '../../contexts/SwingAnalyzerContext';
import { sessionRecorder } from '../../services/SessionRecorder';
import { SettingsRow } from './SettingsRow';

// Storage key for model preference
const MODEL_STORAGE_KEY = 'swing-analyzer-pose-model';

// Get saved model preference
export function getSavedModelPreference(): PoseModel {
  const saved = localStorage.getItem(MODEL_STORAGE_KEY);
  return saved === 'blazepose' ? 'blazepose' : 'movenet';
}

// Save model preference
function saveModelPreference(model: PoseModel): void {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
}

// Wrench icon for debug tools
const WrenchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

interface DebugTabProps {
  onClose?: () => void;
}

// Download icon
const DownloadIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export function DebugTab({ onClose }: DebugTabProps) {
  const { appState, setDisplayMode } = useSwingAnalyzerContext();
  const [selectedModel, setSelectedModel] = useState<PoseModel>(
    getSavedModelPreference()
  );
  const [needsReload, setNeedsReload] = useState(false);
  const [recordingStats, setRecordingStats] = useState(sessionRecorder.getStats());

  // Update stats every second
  useEffect(() => {
    const interval = setInterval(() => {
      setRecordingStats(sessionRecorder.getStats());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleModelChange = (model: PoseModel) => {
    const previousModel = getSavedModelPreference();
    setSelectedModel(model);
    saveModelPreference(model);
    // Only show reload prompt if model actually changed
    setNeedsReload(model !== previousModel);
  };

  const handleDownloadSession = () => {
    sessionRecorder.downloadRecording();
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="settings-section">
      <SettingsRow
        icon="🖥️"
        iconVariant="blue"
        title="Display Mode"
        subtitle="Choose what to show on the video"
      />

      <div className="settings-radio-group">
        <label className="settings-radio-option">
          <input
            type="radio"
            name="display-mode"
            value="both"
            checked={appState.displayMode === 'both'}
            onChange={() => setDisplayMode('both')}
          />
          <span className="settings-radio-label">Both</span>
          <span className="settings-radio-desc">Video + skeleton overlay</span>
        </label>

        <label className="settings-radio-option">
          <input
            type="radio"
            name="display-mode"
            value="video"
            checked={appState.displayMode === 'video'}
            onChange={() => setDisplayMode('video')}
          />
          <span className="settings-radio-label">Video Only</span>
          <span className="settings-radio-desc">Hide skeleton overlay</span>
        </label>

        <label className="settings-radio-option">
          <input
            type="radio"
            name="display-mode"
            value="overlay"
            checked={appState.displayMode === 'overlay'}
            onChange={() => setDisplayMode('overlay')}
          />
          <span className="settings-radio-label">Overlay Only</span>
          <span className="settings-radio-desc">Show only skeleton</span>
        </label>
      </div>

      {/* Pose Model Selection */}
      <SettingsRow
        icon="🤖"
        iconVariant="purple"
        title="Pose Detection Model"
        subtitle="Choose ML model for pose estimation"
      />

      <div className="settings-radio-group">
        <label className="settings-radio-option">
          <input
            type="radio"
            name="pose-model"
            value="movenet"
            checked={selectedModel === 'movenet'}
            onChange={() => handleModelChange('movenet')}
          />
          <span className="settings-radio-label">MoveNet Lightning</span>
          <span className="settings-radio-desc">
            Fast, 17 keypoints (default)
          </span>
        </label>

        <label className="settings-radio-option">
          <input
            type="radio"
            name="pose-model"
            value="blazepose"
            checked={selectedModel === 'blazepose'}
            onChange={() => handleModelChange('blazepose')}
          />
          <span className="settings-radio-label">BlazePose Lite</span>
          <span className="settings-radio-desc">
            33 keypoints, more detailed
          </span>
        </label>
      </div>

      {needsReload && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem',
            background: '#2a2a3e',
            borderRadius: '8px',
          }}
        >
          <p
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '0.875rem',
              color: '#fbbf24',
            }}
          >
            Reload required to apply model change
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Reload Now
          </button>
        </div>
      )}

      {/* Debug Tools Link */}
      <div style={{ marginTop: '0.5rem' }}>
        <Link
          to="/debug"
          className="settings-link"
          onClick={onClose}
          style={{ width: '100%' }}
        >
          <WrenchIcon />
          Debug Model Loader
        </Link>
      </div>

      {/* Session Recording */}
      <SettingsRow
        icon="📹"
        iconVariant="blue"
        title="Session Recording"
        subtitle="Download debug data for troubleshooting"
      />

      <div
        style={{
          padding: '0.75rem',
          background: '#1a1a2e',
          borderRadius: '8px',
          marginTop: '0.5rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.5rem',
            marginBottom: '0.75rem',
            fontSize: '0.8rem',
            color: '#9ca3af',
          }}
        >
          <div>
            <span style={{ color: '#6b7280' }}>Duration: </span>
            <span style={{ color: '#e5e7eb' }}>{formatDuration(recordingStats.duration)}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>Clicks: </span>
            <span style={{ color: '#e5e7eb' }}>{recordingStats.interactions}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>Snapshots: </span>
            <span style={{ color: '#e5e7eb' }}>{recordingStats.snapshots}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>Events: </span>
            <span style={{ color: '#e5e7eb' }}>{recordingStats.stateChanges}</span>
          </div>
          {recordingStats.errors > 0 && (
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#ef4444' }}>Errors: {recordingStats.errors}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleDownloadSession}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.625rem 1rem',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <DownloadIcon />
          Download Session Recording
        </button>

        <p
          style={{
            marginTop: '0.5rem',
            fontSize: '0.75rem',
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          Includes clicks, pipeline state, and events for debugging
        </p>
      </div>
    </div>
  );
}
