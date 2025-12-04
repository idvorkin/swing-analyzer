import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sessionRecorder } from '../../services/SessionRecorder';
import { SettingsRow } from './SettingsRow';
import { VideoIcon, WrenchIcon, DownloadIcon } from './Icons';

interface DebugTabProps {
  onClose?: () => void;
}

export function DebugTab({ onClose }: DebugTabProps) {
  const [recordingStats, setRecordingStats] = useState(sessionRecorder.getStats());

  // Update stats every second
  useEffect(() => {
    const interval = setInterval(() => {
      setRecordingStats(sessionRecorder.getStats());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
      {/* Debug Tools Link */}
      <Link
        to="/debug"
        className="settings-link"
        onClick={onClose}
      >
        <WrenchIcon />
        Debug Model Loader
      </Link>

      {/* Session Recording */}
      <SettingsRow
        icon={<VideoIcon />}
        iconVariant="blue"
        title="Session Recording"
        subtitle="Download debug data for troubleshooting"
      />

      <div className="settings-session-card">
        <div className="settings-session-stats">
          <div className="settings-session-stat">
            Duration:{' '}
            <span className="settings-session-stat-value">
              {formatDuration(recordingStats.duration)}
            </span>
          </div>
          <div className="settings-session-stat">
            Clicks:{' '}
            <span className="settings-session-stat-value">
              {recordingStats.interactions}
            </span>
          </div>
          <div className="settings-session-stat">
            Snapshots:{' '}
            <span className="settings-session-stat-value">
              {recordingStats.snapshots}
            </span>
          </div>
          <div className="settings-session-stat">
            Events:{' '}
            <span className="settings-session-stat-value">
              {recordingStats.stateChanges}
            </span>
          </div>
          {recordingStats.errors > 0 && (
            <div className="settings-session-stat--error">
              Errors: {recordingStats.errors}
            </div>
          )}
        </div>

        <button
          type="button"
          className="settings-btn settings-btn--green"
          onClick={handleDownloadSession}
          style={{ width: '100%' }}
        >
          <DownloadIcon />
          Download Session Recording
        </button>

        <p className="settings-session-hint">
          Includes clicks, pipeline state, and events for debugging
        </p>
      </div>
    </div>
  );
}
